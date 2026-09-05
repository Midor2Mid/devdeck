import { describe, it, expect } from "vitest"
import { execFileSync } from "child_process"
import { join } from "path"

/**
 * Every commit must be authored by an identity this project intends to publish.
 *
 * The history carried an employer's email address on 654 commits until
 * 2026-09-05 — the author and committer fields had never been rewritten, only
 * file contents and commit messages, so a public flip would have published the
 * affiliation permanently. Repo-local git config fixes that going forward, but
 * config lives in `.git/` and does not survive a clone: anyone cloning this
 * repository inherits their own global identity, and the first commit
 * reintroduces whatever that is.
 *
 * So the guard is a test rather than a setting, because a test is cloned.
 *
 * **Deliberately an allowlist, not a denylist.** A denylist would have to spell
 * out the very strings the scrub removed, putting them straight back into the
 * tree — the same trap the step-4 runbook fell into by quoting the identifiers
 * it existed to remove. An allowlist also catches identities nobody has thought
 * of yet, which a denylist cannot.
 */

const REPO = join(__dirname, "..")

/** Domains whose addresses are safe to publish: GitHub's own no-reply forms. */
const ALLOWED_SUFFIXES = ["users.noreply.github.com", "@github.com"]

/**
 * Commits predating the scrub whose authorship is deliberately untouched: two
 * GitHub-UI merges under a personal account. They are not an employer or client
 * identifier, and rewriting a person's attribution is the owner's decision, not
 * an automated one. Pinned as a COUNT so this file need not repeat the address.
 */
const KNOWN_EXCEPTIONS = 2

function identities(): string[] {
    const out = execFileSync("git", ["log", "--format=%ae%n%ce", "--all"], {
        cwd: REPO,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
    })
    return out.split("\n").map((l) => l.trim()).filter(Boolean)
}

const allowed = (email: string): boolean =>
    ALLOWED_SUFFIXES.some((s) => email.toLowerCase().endsWith(s))

describe("the identities in this repository's history", () => {
    it("reads the log at all", () => {
        // A shallow clone (`actions/checkout` defaults to depth 1) would make
        // every assertion below vacuous, so prove there is a history to check.
        expect(identities().length).toBeGreaterThan(100)
    })

    it("publishes no address outside the allowed no-reply domains", () => {
        const offenders = [...new Set(identities().filter((e) => !allowed(e)))]
        // The message names the count, never the address: printing it would
        // leak into CI logs the thing this test exists to keep out.
        expect(
            offenders.length,
            `${offenders.length} distinct non-allowlisted identities. To see them: ` +
                `git log --format='%ae %ce' --all | sort -u`
        ).toBeLessThanOrEqual(1)
    })

    it("has exactly the known number of pre-scrub exception commits", () => {
        // Grows only if someone commits under an unintended identity.
        const bad = identities().filter((e) => !allowed(e))
        expect(bad.length).toBe(KNOWN_EXCEPTIONS)
    })
})
