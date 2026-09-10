/**
 * The repository-visibility decision. Pure: no network, no credential, no
 * `process.exit`.
 *
 * Split out of `scripts/check-repo-visibility.mjs` so it can be imported by a
 * test without the CLI's top-level `process.exit` taking the test runner with
 * it - and, more importantly, so the branch that matters can be exercised at
 * all. The branch that matters is the one where the API answer is
 * **unreadable**, and there is no way to make the live API produce that on
 * demand.
 *
 * Read the header of `scripts/check-repo-visibility.mjs` for what this guards
 * and why it is not a workflow. Neither file names the repository it watches.
 */

/**
 * Three states, not two: private, not private, and "I could not tell".
 *
 * Collapsing the third into the first is how a check reports clean for as long
 * as it stays broken. It must also never throw - a `TypeError` out of a guard
 * is not a refusal, it is an unhandled failure whose meaning is decided by
 * whatever called the guard, and that exact bug shipped here once out of
 * `path.resolve`.
 *
 * @param {unknown} answer the parsed body of `GET /repos/{owner}/{repo}`
 * @returns {{ ok: boolean, code: 0 | 1 | 2, message: string }}
 */
export function judge(answer) {
    if (answer === null || typeof answer !== "object") {
        return { ok: false, code: 2, message: "the API answer was not an object - the check did not run" }
    }
    const a = /** @type {Record<string, unknown>} */ (answer)
    // `private` and `visibility` are two fields describing one fact, and they
    // can disagree: `visibility` grew an "internal" value for organisations, so
    // a repository transferred into an org can answer `private: true` with
    // `visibility: "internal"` - visible to every member of the enterprise,
    // which for an archive of pre-scrub objects is not private. Both must say
    // private. A missing or non-boolean field is unreadable, not false.
    if (typeof a.private !== "boolean") {
        return {
            ok: false,
            code: 2,
            message: "the API answer had no boolean `private` field - the check did not run"
        }
    }
    if (typeof a.visibility !== "string") {
        return {
            ok: false,
            code: 2,
            message: "the API answer had no `visibility` string - the check did not run"
        }
    }
    if (a.private === true && a.visibility === "private") {
        return { ok: true, code: 0, message: "private" }
    }
    return {
        ok: false,
        code: 1,
        message:
            `NOT PRIVATE: private=${a.private}, visibility=${a.visibility}. ` +
            "Set it back to private now, and then treat the window it was open for as long " +
            "enough: rotate whatever those objects contain rather than deciding they were " +
            "probably not fetched."
    }
}

/**
 * The `owner/repo` to check, from argv or the environment, or `null`.
 *
 * Strict on purpose. A loose parse lets a typo become a query against some
 * other account, which answers 404 and reads as "the check did not run" - the
 * right exit code for the wrong reason, and the kind of thing discovered years
 * later.
 *
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 */
export function repoFrom(argv, env) {
    const raw = argv[0] ?? env.VISIBILITY_CHECK_REPO ?? ""
    return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(raw) ? raw : null
}
