/**
 * The dependency-advisory decision. Pure: no network, no clock, no argv, no
 * filesystem except the allowlist it is handed a path to.
 *
 * Split out of `scripts/audit-gate.mjs` so the verdict can be unit-tested
 * against recorded `npm audit --json` output rather than against the registry.
 * A gate whose only test is "it was green on CI once" is not tested.
 *
 * WHY THIS IS NOT `npm audit --audit-level=high`. That flag fails on any
 * advisory at or above a severity, including the ones a single maintainer
 * cannot do anything about, and there is exactly one outcome: a red `main`
 * nobody can clear, and a maintainer who learns that red means nothing. This
 * project has already paid for one lying security control (four "Copied"
 * toasts that never copied); a gate that cannot be satisfied is the same
 * defect wearing a CI badge.
 *
 * So the gate is **actionable by construction**. An advisory fails the build
 * only when all of these hold:
 *
 *   1. it is in the tree being audited (`--tree prod` omits devDependencies),
 *   2. its severity is at or above the level,
 *   3. **npm reports a fix is available**, and
 *   4. it is not acknowledged in the allowlist, or its acknowledgement has
 *      expired.
 *
 * Everything else is *reported* - printed and counted - and does not fail. An
 * advisory with no fix available is the case that makes naive gating useless:
 * blocking on it stops all work and changes nothing about the risk, because
 * there is no version to move to. It is loud, and it is not a gate.
 *
 * THE ALLOWLIST EXPIRES. An acknowledgement past its `until` date **fails**
 * rather than quietly continuing, because the failure mode of every
 * suppression file ever written is that it becomes permanent. Re-dating an
 * entry is a deliberate, reviewable edit; forgetting one is not an option the
 * file offers.
 */

import { readFileSync } from "fs"

/** npm's severity ladder, low to high. Anything unrecognised sorts lowest. */
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }

/** @param {string} s */
export function rankOf(s) {
    return RANK[String(s).toLowerCase()] ?? 0
}

/**
 * Every advisory in an `npm audit --json` report, flattened to one row per
 * (package, GHSA) pair.
 *
 * `via` is the awkward part of the format and the reason this is a function
 * rather than an expression: an entry is either an advisory *object* or a bare
 * *string* naming another package that drags this one in. Treating a string as
 * an object yields `undefined` for every field and a report that looks empty,
 * which is the shape of a guard that passes because it broke.
 *
 * @param {any} report parsed `npm audit --json` output
 */
export function advisoriesOf(report) {
    const vulns = report?.vulnerabilities
    if (!vulns || typeof vulns !== "object") {
        // Refusal, not an empty result. `npm audit` answers a registry failure
        // with JSON that has an `error` key and no `vulnerabilities`, and
        // reading that as "no advisories" is how a broken check reports clean.
        throw new Error("audit report has no `vulnerabilities` object")
    }
    /** @type {{ pkg: string, ghsa: string, severity: string, title: string, fixAvailable: boolean, direct: boolean }[]} */
    const rows = []
    for (const [pkg, v] of Object.entries(vulns)) {
        const via = Array.isArray(v?.via) ? v.via : []
        const objects = via.filter((x) => x && typeof x === "object")
        // A package whose `via` is only strings is affected purely through a
        // dependent, and the advisory itself is listed under that dependent. It
        // is still recorded here, with the GHSA it does not carry marked as
        // absent rather than invented - a row that silently vanishes is how a
        // transitive chain drops out of a report.
        const list = objects.length > 0 ? objects : [null]
        for (const a of list) {
            const m = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(String(a?.url ?? ""))
            const chain = via.filter((x) => typeof x === "string").join(", ")
            rows.push({
                pkg,
                ghsa: m ? m[0].toUpperCase() : `(no GHSA: via ${chain || "unknown"})`,
                severity: String(a?.severity ?? v?.severity ?? "unknown").toLowerCase(),
                title: String(a?.title ?? "(no title in report)"),
                // `fixAvailable` is `true`, `false`, or an object describing a
                // semver-major bump. An object is still a fix and still
                // actionable - it just costs more to take, which is a judgement
                // for the allowlist to record, not for this line to pre-empt.
                fixAvailable: v?.fixAvailable !== false && v?.fixAvailable != null,
                direct: v?.isDirect === true
            })
        }
    }
    return rows
}

/**
 * Read the allowlist.
 *
 * A missing file is an empty allowlist - the strict reading. A *malformed* one
 * throws: treating an unparseable suppression file as "nothing is suppressed"
 * is the friendly direction and the wrong one, because it turns a typo into a
 * wall of unexplained red and teaches whoever hits it to delete the file. An
 * entry with no reason and no expiry throws for the same reason - that is a
 * suppression, not an acknowledgement.
 *
 * @param {string} file
 */
export function readAllowlist(file) {
    let text
    try {
        text = readFileSync(file, "utf8")
    } catch (e) {
        if (e && e.code === "ENOENT") return []
        throw e
    }
    const parsed = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : parsed?.allow
    if (!Array.isArray(list)) {
        throw new Error("allowlist must be an array, or an object with an `allow` array")
    }
    for (const e of list) {
        if (!e?.ghsa || !e?.until || !e?.why) {
            throw new Error(
                "every allowlist entry needs `ghsa`, `until` (YYYY-MM-DD) and `why`" +
                    " - an acknowledgement with no reason and no expiry is a suppression"
            )
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.until))) {
            throw new Error(`allowlist entry ${e.ghsa}: \`until\` must be YYYY-MM-DD`)
        }
    }
    return list
}

/**
 * The verdict.
 *
 * @param {any} report parsed `npm audit --json` output
 * @param {{ level: string, allow: any[], now: Date, gate: boolean }} opts
 */
export function decide(report, { level, allow, now, gate }) {
    const floor = rankOf(level)
    const byGhsa = new Map()
    for (const e of allow) byGhsa.set(String(e.ghsa).toUpperCase(), e)

    const rows = advisoriesOf(report)
    // Compared as YYYY-MM-DD strings, which sort lexicographically. UTC on
    // purpose: a runner in one timezone and a maintainer in another must reach
    // the same verdict on the same commit, and a gate that flips at midnight
    // local is a gate that cannot be reproduced.
    const today = now.toISOString().slice(0, 10)

    /** @type {{ row: any, verdict: string, note: string }[]} */
    const judged = []
    for (const row of rows) {
        const ack = byGhsa.get(row.ghsa)
        if (rankOf(row.severity) < floor) {
            judged.push({ row, verdict: "below", note: `below ${level}` })
        } else if (ack && String(ack.until) < today) {
            judged.push({
                row,
                verdict: "expired",
                note: `acknowledged until ${ack.until}, which has passed - re-review or fix`
            })
        } else if (ack) {
            judged.push({ row, verdict: "acknowledged", note: `until ${ack.until}: ${ack.why}` })
        } else if (!row.fixAvailable) {
            judged.push({ row, verdict: "unactionable", note: "no fix published - reported, not gated" })
        } else {
            judged.push({ row, verdict: "blocking", note: "a fix is available" })
        }
    }

    const stale = [...byGhsa.keys()].filter((g) => !rows.some((r) => r.ghsa === g))
    const blocking = judged.filter((j) => j.verdict === "blocking" || j.verdict === "expired")
    // Stale entries warn and do not fail: an allowlist row outliving its
    // advisory is untidiness, not exposure, and failing on it would turn every
    // successful dependency bump into a red build.
    return { judged, stale, fail: gate && blocking.length > 0 }
}
