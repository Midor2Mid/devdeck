#!/usr/bin/env node
/**
 * Run `npm audit` and apply the gate in `scripts/lib/audit-decide.mjs`.
 *
 * This file is the impure half: argv, a child process, a clock and printing.
 * The verdict itself lives next door and is unit-tested; nothing here decides
 * anything, so nothing here needs a test it cannot honestly have.
 *
 * FAIL CLOSED, AND SAY WHICH KIND OF FAILURE IT IS. `npm audit` talks to the
 * registry, so it can fail for reasons that have nothing to do with this
 * repository. An unreadable answer is not a pass: it exits **2**, with a
 * message that says the audit did not run - a different sentence from "an
 * advisory was found", which is exit **1**. A guard whose input is unreadable
 * has to refuse, and it has to be possible to tell the refusal apart from a
 * finding; otherwise a fortnight of registry 500s reads as a fortnight of
 * clean audits.
 *
 * RUNNER ASSUMPTIONS, DELIBERATELY MINIMAL. The first-ever CI run on this
 * repository failed three times for reasons that could not occur on the
 * author's machine (a shallow clone, and two specs comparing an 8.3 short path
 * such as `RUNNER~1` to a resolved long one). This script therefore:
 *   - spawns `npm` itself rather than being piped into by the workflow, so it
 *     behaves identically whether the step runs under `cmd`, `pwsh` or `bash`
 *     and needs no `shell:` key and no `|` in the YAML;
 *   - never compares, resolves or prints a filesystem path;
 *   - needs no `node_modules` - verified: `npm audit` answers from
 *     `package-lock.json` alone - so it cannot be broken by an install, and the
 *     CI job that runs it skips `npm ci` entirely;
 *   - needs no git history, so it needs no `fetch-depth`.
 *
 * Usage:
 *   node scripts/audit-gate.mjs --tree prod --level high            # the gate
 *   node scripts/audit-gate.mjs --tree all  --level low  --report   # report only
 */

import { execFile } from "child_process"
import { decide, readAllowlist } from "./lib/audit-decide.mjs"

/** @param {string[]} argv */
function parseArgs(argv) {
    const get = (name, fallback) => {
        const i = argv.indexOf(`--${name}`)
        return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback
    }
    return {
        tree: get("tree", "prod"),
        level: get("level", "high"),
        allowFile: get("allow", ".github/audit-allow.json"),
        gate: !argv.includes("--report")
    }
}

/**
 * Run `npm audit --json` and parse it.
 *
 * npm exits **1** whenever it finds anything, so a non-zero status is not an
 * error here - unreadable stdout is. Three attempts, because a registry hiccup
 * is the most likely reason this ever fails and it is not worth a human's
 * attention; after that it refuses rather than guessing.
 *
 * @param {string} tree "prod" | "all"
 */
async function runAudit(tree) {
    // `shell: true` is required and not incidental. Since the CVE-2024-27980
    // mitigation, Node on Windows refuses to spawn a `.cmd` without a shell -
    // `execFile("npm.cmd", ...)` fails with a bare `spawn EINVAL`, which is
    // exactly the class of runner-versus-this-machine failure that broke the
    // first three CI runs, except that here it fails on both. It is safe
    // because every argument below is a literal in this file: nothing from
    // argv, the environment or the report reaches the command line.
    const args = ["audit", "--json"]
    if (tree === "prod") args.push("--omit=dev")
    let last = ""
    for (let attempt = 1; attempt <= 3; attempt++) {
        const stdout = await new Promise((resolve) => {
            execFile(
                "npm",
                args,
                { maxBuffer: 64 * 1024 * 1024, windowsHide: true, shell: true },
                (_err, out) => resolve(String(out ?? ""))
            )
        })
        try {
            const parsed = JSON.parse(stdout)
            // npm reports a registry failure as JSON too, with an `error` key
            // and no `vulnerabilities`. That is "the audit did not run", not
            // "clean", and it must not reach `decide`.
            if (parsed?.error) {
                last = `npm audit reported an error: ${parsed.error.summary ?? parsed.error.code ?? "unknown"}`
            } else {
                return parsed
            }
        } catch {
            last = stdout.trim().slice(0, 400) || "npm audit produced no output"
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000))
    }
    throw new Error(last)
}

/**
 * `blocking` and `expired` print as `FAIL` only when a gate is actually being
 * applied. In `--report` mode nothing fails, and a line reading FAIL next to an
 * exit code of 0 is the sort of small dishonesty that trains a reader to stop
 * believing the output.
 */
function tagFor(v, gating) {
    if (v === "blocking" || v === "expired") return gating ? "FAIL" : "note"
    if (v === "unactionable") return "warn"
    if (v === "acknowledged") return " ack"
    return "    "
}

/** Keep the log readable; the full reason lives in the allowlist. */
const brief = (s) => (s.length > 200 ? `${s.slice(0, 197)}...` : s)

const { tree, level, allowFile, gate } = parseArgs(process.argv.slice(2))
const label = `${tree === "prod" ? "production" : "all"} dependencies, ${level} and above`

let allow
try {
    allow = readAllowlist(allowFile)
} catch (e) {
    // An unreadable guard input is a refusal, and the exit code says which
    // kind: 2 is "this check did not run", never "this check passed".
    console.error(`audit gate: the allowlist could not be read - ${e.message}`)
    process.exit(2)
}

let report
try {
    report = await runAudit(tree)
} catch (e) {
    console.error(
        `audit gate: THE AUDIT DID NOT RUN (${label}). This is not a clean result.\n  ${e.message}`
    )
    process.exit(2)
}

let verdict
try {
    verdict = decide(report, { level, allow, now: new Date(), gate })
} catch (e) {
    console.error(`audit gate: the audit output could not be read - ${e.message}`)
    process.exit(2)
}

console.log(`audit gate: ${label} - ${gate ? "GATE" : "report only"}`)
const counts = report?.metadata?.vulnerabilities
if (counts) {
    console.log(
        `  npm counts: critical ${counts.critical ?? 0}, high ${counts.high ?? 0}, ` +
            `moderate ${counts.moderate ?? 0}, low ${counts.low ?? 0}`
    )
}
const shown = verdict.judged.filter((j) => j.verdict !== "below")
if (shown.length === 0) console.log(`  nothing at or above ${level}.`)
for (const j of shown) {
    console.log(
        `  [${tagFor(j.verdict, gate)}] ${j.row.severity.padEnd(8)} ${j.row.pkg}` +
            `${j.row.direct ? " (direct)" : ""} ${j.row.ghsa}\n` +
            `         ${j.row.title}\n         ${brief(j.note)}`
    )
}
for (const g of verdict.stale) {
    console.log(`  [warn] allowlist entry ${g} matches no current advisory - delete it`)
}

if (verdict.fail) {
    console.error(
        "\naudit gate: FAILED. Every advisory marked FAIL above has a published fix, or an\n" +
            "acknowledgement that has expired. Take one of three actions - do not widen the gate:\n" +
            "  1. `npm audit fix` (or an `overrides` entry) and commit the lockfile;\n" +
            "  2. if the fix cannot be taken yet, add a dated entry to .github/audit-allow.json\n" +
            "     with a reason and a review date - it will fail again on that date;\n" +
            "  3. drop the dependency.\n"
    )
    process.exit(1)
}
console.log(gate ? "\naudit gate: passed." : "\naudit report: no gate applied.")
