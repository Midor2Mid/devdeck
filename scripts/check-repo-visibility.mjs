#!/usr/bin/env node
/**
 * Assert that a named GitHub repository is still **private**.
 *
 * Deliberately generic, and deliberately naming nothing. The repository to
 * check is supplied at the call site - `node scripts/check-repo-visibility.mjs
 * <owner>/<repo>`, or `$VISIBILITY_CHECK_REPO` - and is **not written down
 * anywhere in this repository**. That is the whole design constraint; see
 * "WHY THIS IS NOT A WORKFLOW" below. The verdict itself lives in
 * `scripts/lib/repo-visibility.mjs` and is unit-tested there.
 *
 * Exit codes:
 *   0  the repository is private
 *   1  the repository is NOT private   <- act now
 *   2  the check did not run (no argument, no `gh`, not authenticated, an
 *      answer that could not be read, or a repository that no longer exists)
 *
 * **2 is not 0.** An unreadable answer is a refusal, not a pass: "I could not
 * tell" and "it is fine" are different sentences, and a check that conflates
 * them reports clean for as long as it stays broken.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A WORKFLOW, AND CANNOT SAFELY BE ONE IN *THIS* REPOSITORY
 * ---------------------------------------------------------------------------
 *
 * The invariant is that a particular private repository never becomes public,
 * because it holds the only remaining pre-scrub objects. The obvious
 * implementation is a scheduled workflow. It cannot live here, for three
 * reasons, and none of them is fixable by writing a vaguer failure message:
 *
 * 1. **The check is itself the disclosure.** This repository is public, and so
 *    is everything in `.github/`: the workflow file, its `name:`, its step
 *    titles, its cron, and every line of every run's log. A workflow that
 *    watches another repository must identify it - in YAML, in a secret's
 *    *name*, or in a step title - and even a perfectly redacted one announces
 *    that somewhere there is a private repository whose becoming public matters
 *    enough to be watched hourly. That is a signpost reading "the unscrubbed
 *    history is over here", published to everyone, permanently, in exchange for
 *    catching an event that has never happened. The signpost is worth more to
 *    an attacker than the tripwire is worth to the maintainer.
 *
 * 2. **It needs a credential worse than the thing it guards.**
 *    `secrets.GITHUB_TOKEN` is scoped to the repository it runs in and cannot
 *    read another one, so a real workflow needs a PAT with read access to the
 *    private repository, stored in the *public* repository's secrets. Any
 *    compromise of Actions here - a mutable third-party action tag, a
 *    postinstall script in a transitive dev dependency, a workflow edit on a
 *    branch - yields a token that can clone the unscrubbed history directly.
 *    The tripwire would become the shortest path to the objects it exists to
 *    protect.
 *
 * 3. **A red run announces the leak to the attacker and the maintainer at the
 *    same instant.** Run history on a public repository is public. On the day
 *    the invariant breaks, a public failing job at a published cron is a
 *    broadcast, not an alert, and it arrives while the window is still open. A
 *    green run is not free either: it confirms, on a schedule, that the private
 *    repository still exists.
 *
 * So: this check must not be automated **from here**. It is automatable safely
 * elsewhere, and any of these is fine - none of them can be built from inside
 * this repository, which is why the deliverable is a script and not a workflow:
 *   - a scheduled workflow in a *private* repository (the archive itself, or
 *     the private workspace repo), where neither the file, the schedule nor the
 *     log is public;
 *   - a Windows Scheduled Task running this script weekly against the
 *     maintainer's already-authenticated `gh`, which needs no stored credential
 *     at all - `schtasks /create /tn repo-visibility /sc weekly
 *     /tr "node <path>\scripts\check-repo-visibility.mjs <owner>/<repo>"`;
 *   - GitHub's own signal: a visibility change is written to the account audit
 *     log and emailed to the owner. That is not a tripwire this repository
 *     controls, but it is the one that already exists.
 *
 * The cheapest thing certainly in place today is the manual one, which is why
 * this script exists: one command, an exit code a scheduler understands, and no
 * secret anywhere. Run it whenever a release goes out and whenever repository
 * settings are touched. `tests/repoVisibility.test.ts` asserts that neither
 * this file nor the workflows ever acquires the repository's name.
 */

import { execFile } from "child_process"
import { judge, repoFrom } from "./lib/repo-visibility.mjs"

/** @param {string} repo */
function ghApi(repo) {
    return new Promise((resolve, reject) => {
        // No `--jq` and no `shell: true`, both learned the annoying way. `gh` is
        // a real executable on every platform, so `execFile` reaches it without
        // a shell - and a shell is what broke the first version of this: under
        // `cmd`, `--jq "{private: .private, visibility: .visibility}"`
        // word-split into four arguments and `gh` refused with "accepts 1
        // arg(s), received 4". The script correctly called that "THE CHECK DID
        // NOT RUN" rather than a pass, so the fail-closed path is not theory -
        // but a guard that always refuses guards nothing. The field selection
        // happens in `judge`, in this process, where no quoting rules apply.
        execFile(
            "gh",
            ["api", `repos/${repo}`],
            { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
            (err, stdout, stderr) => {
                if (err) return reject(new Error(String(stderr || err.message).trim().slice(0, 300)))
                try {
                    resolve(JSON.parse(String(stdout)))
                } catch {
                    reject(new Error("gh returned output that was not JSON"))
                }
            }
        )
    })
}

const repo = repoFrom(process.argv.slice(2), process.env)
if (!repo) {
    console.error(
        "check-repo-visibility: give the repository to check as `owner/repo`, or set\n" +
            "  $VISIBILITY_CHECK_REPO. It is not stored in this repository on purpose - read the\n" +
            "  header of scripts/check-repo-visibility.mjs for why.\n" +
            "  usage: node scripts/check-repo-visibility.mjs <owner>/<repo>"
    )
    process.exit(2)
}

let answer
try {
    answer = await ghApi(repo)
} catch (e) {
    console.error(
        `check-repo-visibility: THE CHECK DID NOT RUN for ${repo}. This is not a pass.\n  ${e.message}`
    )
    process.exit(2)
}

const verdict = judge(answer)
console.log(`check-repo-visibility: ${repo} -> ${verdict.message}`)
process.exit(verdict.code)
