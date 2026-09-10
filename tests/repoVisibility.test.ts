import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { judge, repoFrom } from "../scripts/lib/repo-visibility.mjs"

/**
 * The repository-visibility tripwire's decision.
 *
 * No network and no credential: `judge` is handed the body GitHub would have
 * returned. That is the whole reason the API call and the decision are separate
 * functions - the branch that matters most is the one where the answer is
 * *unreadable*, and there is no way to make the live API produce that on demand.
 *
 * **Three states, not two.** A visibility check has to distinguish "private",
 * "not private" and "I could not tell". Collapsing the third into the first is
 * how a check reports clean for as long as it stays broken, and this repository
 * has already been caught by that shape twice: a loader that turned an
 * unreadable file into an empty value, and a guard that answered with a
 * `TypeError` instead of a decision.
 *
 * This file does NOT name the repository being watched, and neither does the
 * script. See the header of `scripts/check-repo-visibility.mjs` for why a
 * scheduled workflow in this public repository would be the disclosure it is
 * meant to prevent.
 */

describe("the visibility verdict", () => {
    it("passes only when both fields say private", () => {
        expect(judge({ private: true, visibility: "private" })).toMatchObject({ ok: true, code: 0 })
    })

    it("fails a public repository with the alarm, not a shrug", () => {
        const v = judge({ private: false, visibility: "public" })
        expect(v.ok).toBe(false)
        expect(v.code).toBe(1)
        // The message has to tell the reader that closing it again is only half
        // the job. A window that was open for an unknown length of time is a
        // window that was long enough.
        expect(v.message).toMatch(/rotate/)
    })

    it("fails `internal`, which reads as private and is not", () => {
        // `private` and `visibility` are two fields describing one fact and they
        // can disagree: a repository transferred into an organisation can answer
        // `private: true` with `visibility: "internal"`, which means visible to
        // every member of the enterprise. For an archive holding pre-scrub
        // objects that is not private, and a check reading only `private` would
        // have said it was. One instance of a class is not the class.
        const v = judge({ private: true, visibility: "internal" })
        expect(v.ok).toBe(false)
        expect(v.code).toBe(1)
    })

    it("REFUSES an unreadable answer instead of passing it", () => {
        // Exit 2 is "the check did not run", and it is deliberately not 0.
        for (const answer of [
            null,
            undefined,
            "private",
            42,
            {},
            { visibility: "private" },
            { private: true },
            { private: "true", visibility: "private" },
            { private: true, visibility: null }
        ]) {
            const v = judge(answer)
            expect(v.ok, `${JSON.stringify(answer)} must not pass`).toBe(false)
            expect(v.code, `${JSON.stringify(answer)} must refuse, not alarm`).toBe(2)
            expect(v.message).toMatch(/did not run/)
        }
    })

    it("does not throw on any of those - a guard must answer, not raise", () => {
        // A `TypeError` out of a guard is not a refusal; it is an unhandled
        // failure that whatever called the guard decides the meaning of. That
        // exact bug shipped here once, out of `path.resolve`.
        expect(() => judge(Object.create(null))).not.toThrow()
        expect(() => judge([])).not.toThrow()
    })
})

describe("the repository argument", () => {
    it("accepts owner/repo from argv, and from the environment", () => {
        expect(repoFrom(["acme/thing"], {})).toBe("acme/thing")
        expect(repoFrom([], { VISIBILITY_CHECK_REPO: "acme/thing" })).toBe("acme/thing")
        expect(repoFrom(["acme/thing"], { VISIBILITY_CHECK_REPO: "other/repo" })).toBe("acme/thing")
    })

    it("refuses anything that is not exactly owner/repo", () => {
        // A loose parse lets a typo become a query against some other account,
        // which answers 404 and reads as "the check did not run" - the right
        // exit code for the wrong reason, and the kind of thing that is
        // discovered years later.
        for (const bad of [
            [],
            [""],
            ["thing"],
            ["acme/thing/extra"],
            ["/thing"],
            ["acme/"],
            ["https://github.com/acme/thing"],
            ["acme/thing "],
            ["../../etc/passwd"],
            ["acme/thing;whoami"],
            ["acme/thing?visibility=private"]
        ]) {
            expect(repoFrom(bad as string[], {}), `${JSON.stringify(bad)} must be refused`).toBeNull()
        }
    })
})

describe("the tripwire discloses nothing about what it watches", () => {
    /**
     * The constraint that shaped this whole item: a check living in a **public**
     * repository must not reveal that a particular private repository exists,
     * including by the shape of its failure. The two scripts are generic and
     * take their target at the call site; these assertions are what keeps them
     * that way, because the obvious future "improvement" is to hard-code the
     * name so nobody has to remember it.
     *
     * Only the scripts are scanned. This test file is allowed to spell out the
     * shapes it forbids - that is what a denylist has to do - and scanning
     * itself would make every pattern below self-defeating. `owner` and `repo`
     * are assembled from fragments for the same reason.
     */
    const SCRIPTS = [
        join(__dirname, "..", "scripts", "check-repo-visibility.mjs"),
        join(__dirname, "..", "scripts", "lib", "repo-visibility.mjs")
    ]

    /** A repository slug ending in `-private`: the shape being protected. */
    const PRIVATE_SLUG = new RegExp(["[A-Za-z0-9_-]*", "archive", "[A-Za-z0-9_-]*", "-priv", "ate"].join(""))
    /** `owner/repo` written out on a `gh api repos/...` line, rather than interpolated. */
    const HARDCODED_TARGET = new RegExp(["repos/", "[A-Za-z0-9._-]+", "/", "[A-Za-z0-9._-]+"].join(""))

    it("hard-codes no repository slug", () => {
        for (const f of SCRIPTS) {
            const text = readFileSync(f, "utf8")
            expect(text, `${f} names a repository`).not.toMatch(PRIVATE_SLUG)
        }
    })

    it("builds its API path from the argument and never from a literal", () => {
        // `repos/${repo}` is fine. `repos/someone/something` would be the whole
        // disclosure, sitting in a public file forever.
        for (const f of SCRIPTS) {
            const text = readFileSync(f, "utf8")
            expect(text, `${f} carries a hard-coded API target`).not.toMatch(HARDCODED_TARGET)
        }
    })

    it("has no workflow in this public repository watching another one", () => {
        // If a future change automates this from here, this fails and whoever
        // wrote it has to read the three reasons in the script header first. A
        // call to the script and a cross-repository PAT secret are the two
        // shapes to catch; `${{ github.repository }}` is this repository and is
        // fine.
        const dir = join(__dirname, "..", ".github", "workflows")
        for (const name of ["check.yml", "release.yml"]) {
            const text = readFileSync(join(dir, name), "utf8")
            expect(text, `${name} calls the visibility check`).not.toContain("check-repo-visibility")
            expect(text, `${name} carries a cross-repository PAT`).not.toMatch(
                new RegExp(["secrets\.", "[A-Z_]*", "ARCH", "IVE", "[A-Z_]*"].join(""))
            )
        }
    })
})
