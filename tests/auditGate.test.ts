import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { advisoriesOf, decide, rankOf, readAllowlist } from "../scripts/lib/audit-decide.mjs"

/**
 * The dependency-advisory gate's verdict.
 *
 * Everything here runs against **recorded** `npm audit --json` output. The gate
 * exists to be believed on a runner nobody is watching, so its decision has to
 * be reproducible without the registry: a check whose only evidence is "it was
 * green on CI once" is not tested, it is merely unrefuted.
 *
 * The recorded reports below are the real shapes this repository produces,
 * observed on 2026-09-10 after production dependencies dropped from nine to
 * five (`pg`, `mysql2`, `mssql` and `node-sqlite3-wasm` were deleted with
 * `db.ts`): one high advisory in the production tree (`js-yaml`, via
 * `electron-updater`) and two more in the dev tree (`browserslist`,
 * `baseline-browser-mapping`).
 *
 * The properties that matter, and why each one is here:
 *
 * - **A no-fix advisory does not fail the gate.** This is the case that makes
 *   naive `--audit-level` gating useless: there is no version to move to, so
 *   blocking on it stops all work and changes nothing. It must be loud and it
 *   must not be a gate.
 * - **An expired acknowledgement fails.** Every suppression file ever written
 *   becomes permanent. This one cannot.
 * - **An unreadable input refuses.** A registry error arrives as JSON with an
 *   `error` key and no `vulnerabilities`; reading that as "no advisories" is
 *   precisely how a broken check reports clean. Same family as the loaders that
 *   turned an unreadable file into an empty value and then saved the emptiness
 *   over real data.
 * - **`via` entries that are strings do not silently drop a row.** npm's format
 *   puts either an advisory object or a bare package name in that array, and
 *   treating a string as an object yields `undefined` for every field - a
 *   report that looks empty because the parser broke, not because the tree is
 *   clean.
 */

/** One high advisory with a published fix - the production tree as of 2026-09-10. */
const PROD_REPORT = {
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 } },
    vulnerabilities: {
        "js-yaml": {
            name: "js-yaml",
            severity: "high",
            isDirect: false,
            via: [
                {
                    source: 1193727,
                    name: "js-yaml",
                    title: "js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources",
                    url: "https://github.com/advisories/GHSA-2883-xcg3-v3hh",
                    severity: "high",
                    range: ">=4.0.0 <4.3.2"
                }
            ],
            effects: [],
            range: "4.0.0 - 4.3.1",
            nodes: ["node_modules/js-yaml"],
            fixAvailable: true
        }
    }
}

const ACK = [
    {
        ghsa: "GHSA-2883-XCG3-V3HH",
        until: "2026-09-24",
        why: "reachable only by whoever controls the update feed; the fix is a lockfile bump"
    }
]

const at = (day: string): Date => new Date(`${day}T12:00:00Z`)

describe("severity ranking", () => {
    it("orders npm's ladder and sorts an unknown severity lowest", () => {
        expect(rankOf("critical")).toBeGreaterThan(rankOf("high"))
        expect(rankOf("high")).toBeGreaterThan(rankOf("moderate"))
        expect(rankOf("moderate")).toBeGreaterThan(rankOf("low"))
        // Not `high`. A severity npm invents tomorrow must not be treated as
        // blocking by accident, and must not silently become the floor either -
        // it lands below every real level and shows up in the report.
        expect(rankOf("apocalyptic")).toBe(0)
        expect(rankOf("HIGH")).toBe(rankOf("high"))
    })
})

describe("reading an npm audit report", () => {
    it("flattens one row per package and GHSA", () => {
        const rows = advisoriesOf(PROD_REPORT)
        expect(rows).toHaveLength(1)
        expect(rows[0].pkg).toBe("js-yaml")
        expect(rows[0].ghsa).toBe("GHSA-2883-XCG3-V3HH")
        expect(rows[0].severity).toBe("high")
        expect(rows[0].fixAvailable).toBe(true)
    })

    it("splits a package carrying two advisories into two rows", () => {
        // browserslist really does carry two, and a gate that collapsed them
        // would let one GHSA in the allowlist acknowledge the other.
        const rows = advisoriesOf({
            vulnerabilities: {
                browserslist: {
                    severity: "high",
                    isDirect: false,
                    fixAvailable: true,
                    via: [
                        { severity: "high", title: "OOM", url: "https://github.com/advisories/GHSA-c83g-rgw3-j3cx" },
                        { severity: "high", title: "crash", url: "https://github.com/advisories/GHSA-73wf-gq98-2v4g" }
                    ]
                }
            }
        })
        expect(rows.map((r) => r.ghsa)).toEqual(["GHSA-C83G-RGW3-J3CX", "GHSA-73WF-GQ98-2V4G"])
    })

    it("keeps a row whose `via` holds only package names, and does not invent a GHSA", () => {
        // The shape that makes a naive parser report clean: `via: ["other-pkg"]`
        // read as an object gives severity `undefined`, which ranks below every
        // level and vanishes from the output.
        const rows = advisoriesOf({
            vulnerabilities: {
                "app-builder-lib": { severity: "high", isDirect: false, fixAvailable: false, via: ["js-yaml"] }
            }
        })
        expect(rows).toHaveLength(1)
        expect(rows[0].severity).toBe("high")
        expect(rows[0].ghsa).toContain("no GHSA")
        expect(rows[0].ghsa).toContain("js-yaml")
    })

    it("treats `fixAvailable` as an object as a fix, because it is one", () => {
        // npm answers with an object when the fix is a semver-major bump. It is
        // still actionable; that it costs more is a judgement for the allowlist
        // to record, not for the parser to pre-empt into "unactionable".
        const rows = advisoriesOf({
            vulnerabilities: {
                thing: {
                    severity: "critical",
                    fixAvailable: { name: "thing", version: "9.0.0", isSemVerMajor: true },
                    via: [{ severity: "critical", title: "t", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }]
                }
            }
        })
        expect(rows[0].fixAvailable).toBe(true)
    })

    it("REFUSES a report with no `vulnerabilities` object rather than calling it clean", () => {
        // This is what a registry failure looks like. An unreadable input is a
        // refusal; an exception here is caught by the CLI and turned into exit
        // 2, which is a different sentence from exit 0.
        expect(() => advisoriesOf({ error: { code: "E503", summary: "registry unavailable" } })).toThrow(
            /vulnerabilities/
        )
        expect(() => advisoriesOf(null)).toThrow(/vulnerabilities/)
        expect(() => advisoriesOf({ vulnerabilities: "none" })).toThrow(/vulnerabilities/)
    })
})

describe("the gate's verdict", () => {
    it("fails on a high production advisory with a fix and no acknowledgement", () => {
        const v = decide(PROD_REPORT, { level: "high", allow: [], now: at("2026-09-10"), gate: true })
        expect(v.fail).toBe(true)
        expect(v.judged.map((j) => j.verdict)).toEqual(["blocking"])
    })

    it("passes while the acknowledgement is live", () => {
        const v = decide(PROD_REPORT, { level: "high", allow: ACK, now: at("2026-09-10"), gate: true })
        expect(v.fail).toBe(false)
        expect(v.judged[0].verdict).toBe("acknowledged")
    })

    it("passes on the acknowledgement's last day and FAILS the day after", () => {
        // The boundary, both sides, because an off-by-one here is a suppression
        // that lives one day longer than a human agreed to - or a red build a
        // day early, which is the same lesson learned the annoying way.
        expect(decide(PROD_REPORT, { level: "high", allow: ACK, now: at("2026-09-24"), gate: true }).fail).toBe(
            false
        )
        const after = decide(PROD_REPORT, { level: "high", allow: ACK, now: at("2026-09-25"), gate: true })
        expect(after.fail).toBe(true)
        expect(after.judged[0].verdict).toBe("expired")
        expect(after.judged[0].note).toMatch(/has passed/)
    })

    it("does NOT fail on an advisory with no fix published, and still reports it", () => {
        // The whole reason this gate is not `npm audit --audit-level=high`.
        const noFix = {
            vulnerabilities: {
                stuck: {
                    severity: "critical",
                    isDirect: true,
                    fixAvailable: false,
                    via: [
                        {
                            severity: "critical",
                            title: "no patch exists",
                            url: "https://github.com/advisories/GHSA-dddd-eeee-ffff"
                        }
                    ]
                }
            }
        }
        const v = decide(noFix, { level: "high", allow: [], now: at("2026-09-10"), gate: true })
        expect(v.fail).toBe(false)
        expect(v.judged[0].verdict).toBe("unactionable")
        // Reported, not swallowed: it is above the level, so it prints.
        expect(v.judged[0].row.severity).toBe("critical")
    })

    it("ignores an advisory below the level, and gates it once the level drops", () => {
        const moderate = {
            vulnerabilities: {
                "baseline-browser-mapping": {
                    severity: "moderate",
                    fixAvailable: true,
                    via: [
                        {
                            severity: "moderate",
                            title: "DoS on invalid input",
                            url: "https://github.com/advisories/GHSA-w5vr-8v7q-w6rv"
                        }
                    ]
                }
            }
        }
        expect(decide(moderate, { level: "high", allow: [], now: at("2026-09-10"), gate: true }).fail).toBe(false)
        expect(decide(moderate, { level: "moderate", allow: [], now: at("2026-09-10"), gate: true }).fail).toBe(
            true
        )
    })

    it("never fails in report mode, however bad the report is", () => {
        const v = decide(PROD_REPORT, { level: "low", allow: [], now: at("2027-01-01"), gate: false })
        expect(v.fail).toBe(false)
        expect(v.judged[0].verdict).toBe("blocking")
    })

    it("matches an allowlist entry case-insensitively", () => {
        // The gate prints GHSA ids upper-cased and GitHub writes them lower;
        // a copy-paste from the advisory URL must acknowledge the same thing as
        // a copy-paste from the log.
        const lower = [{ ghsa: "ghsa-2883-xcg3-v3hh", until: "2026-09-24", why: "same entry, typed from the URL" }]
        expect(decide(PROD_REPORT, { level: "high", allow: lower, now: at("2026-09-10"), gate: true }).fail).toBe(
            false
        )
    })

    it("warns about an allowlist entry that matches nothing, without failing", () => {
        // Untidiness, not exposure. Failing here would turn every successful
        // dependency bump into a red build, which is the behaviour that teaches
        // a maintainer to ignore red.
        const stale = [{ ghsa: "GHSA-0000-0000-0000", until: "2027-01-01", why: "the dependency is long gone" }]
        const v = decide(PROD_REPORT, { level: "high", allow: stale, now: at("2026-09-10"), gate: true })
        expect(v.stale).toEqual(["GHSA-0000-0000-0000"])
        // The js-yaml row is unacknowledged now, so it blocks - but on its own
        // merits, not because of the stale entry.
        expect(v.judged.map((j) => j.verdict)).toEqual(["blocking"])
    })
})

describe("reading the allowlist", () => {
    const withFile = (body: string | null, fn: (path: string) => void): void => {
        const dir = mkdtempSync(join(tmpdir(), "devdeck-audit-allow-"))
        const path = join(dir, "audit-allow.json")
        if (body !== null) writeFileSync(path, body, "utf8")
        try {
            fn(path)
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    }

    it("treats a missing file as an empty allowlist", () => {
        withFile(null, (path) => expect(readAllowlist(path)).toEqual([]))
    })

    it("REFUSES a malformed file rather than treating it as empty", () => {
        // Deliberately the strict direction. "Nothing is suppressed" would be
        // the friendly reading of a typo, and it turns one bad character into a
        // wall of unexplained red that teaches whoever hits it to delete the
        // file. Same family as a loader answering an unreadable file with an
        // empty value.
        withFile("{ not json", (path) => expect(() => readAllowlist(path)).toThrow())
        withFile('{"allow": "nope"}', (path) => expect(() => readAllowlist(path)).toThrow(/array/))
    })

    it("REFUSES an entry with no reason or no expiry", () => {
        withFile('{"allow":[{"ghsa":"GHSA-aaaa-bbbb-cccc"}]}', (path) =>
            expect(() => readAllowlist(path)).toThrow(/suppression/)
        )
        withFile('{"allow":[{"ghsa":"GHSA-aaaa-bbbb-cccc","why":"because"}]}', (path) =>
            expect(() => readAllowlist(path)).toThrow(/suppression/)
        )
    })

    it("REFUSES an `until` that is not a plain YYYY-MM-DD date", () => {
        // Dates are compared as strings, so anything else compares wrongly and
        // silently - "next quarter" sorts before every real date and expires
        // instantly, "2026/09/24" sorts after every real date and never does.
        withFile('{"allow":[{"ghsa":"G","until":"next quarter","why":"w"}]}', (path) =>
            expect(() => readAllowlist(path)).toThrow(/YYYY-MM-DD/)
        )
        withFile('{"allow":[{"ghsa":"G","until":"2026/09/24","why":"w"}]}', (path) =>
            expect(() => readAllowlist(path)).toThrow(/YYYY-MM-DD/)
        )
    })

    it("accepts a bare array as well as an object with `allow`", () => {
        withFile('[{"ghsa":"GHSA-aaaa-bbbb-cccc","until":"2026-12-31","why":"w"}]', (path) =>
            expect(readAllowlist(path)).toHaveLength(1)
        )
    })
})

describe("this repository's own allowlist", () => {
    it("parses, and every entry still has a reason and a date", () => {
        // The file the gate actually reads. A malformed one exits 2 on every
        // push, and the point of catching it here is that the failure names the
        // problem instead of arriving as a red build with a stack trace.
        const entries = readAllowlist(join(__dirname, "..", ".github", "audit-allow.json"))
        expect(Array.isArray(entries)).toBe(true)
        for (const e of entries) {
            expect(String(e.why).length).toBeGreaterThan(40)
            expect(String(e.until)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
    })
})
