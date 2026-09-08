import { describe, it, expect } from "vitest"
import { execFileSync } from "child_process"
import { createHash } from "crypto"
import { readFileSync } from "fs"
import { join } from "path"

/**
 * No tracked file may publish an employer or client identifier.
 *
 * `tests/gitIdentity.test.ts` guards the author and committer *emails* of every
 * commit. It does not look at file *content*, and that gap was not theoretical:
 * on 2026-09-07 `ROADMAP.md:38` typed an employer domain and three client names
 * into the very sentence claiming "0 commits touch [them] by pickaxe over all
 * refs". It sat on the public repository for a day and was found by a human
 * audit, not by a test. A prose record of a redaction is itself a redaction
 * target — `docs/release/step-4-public-flip.md` had already fallen into the
 * identical trap once, and a second occurrence in it survived the scrub that
 * was supposed to close the first.
 *
 * **Why the forbidden tokens are stored as hashes.** A plaintext denylist would
 * have to spell out the very strings it exists to remove, putting them straight
 * back into the tree. That is not hypothetical either: it is exactly how both
 * leaks happened. Hashing is an honest trade rather than a perfect defence — it
 * stops a reader of this repository *learning* an identifier, but it cannot stop
 * someone who already holds a candidate list from *confirming* a guess by
 * hashing it. The alternative, keeping the patterns in a file outside the
 * repository, is strictly safer and cannot run in CI, which is where a push is
 * actually caught. Disclosure-resistance that runs on every push beats
 * confirmation-resistance that runs nowhere.
 *
 * To forbid a new token without ever committing it: `node scripts/forbid-token.mjs`
 *
 * **Scope: tracked files at HEAD, not history.** History is scanned once, by
 * hand, when a leak is found and rewritten; scanning every blob on every run
 * costs minutes. This test's job is to stop the *next* leak reaching the remote,
 * so a failure here means checking history as well as the working tree.
 */

const REPO = join(__dirname, "..")

const sha256 = (s: string): string =>
    createHash("sha256").update(s, "utf8").digest("hex")

/**
 * SHA-256 of lowercased identifier tokens that must never appear in a tracked
 * file. Add via `scripts/forbid-token.mjs`; never write the plaintext here.
 */
const FORBIDDEN_TOKEN_SHA256 = new Set([
    "2a1207cd4ea9c06b628a38eafc05ec8fa55dc09b9324764b63836cbc85c1c267",
    "5d5df7366b2b1037f5cb9ca3e37913f9ff30dd9eb85d9a7aa0b3adce0ddbfe3e",
    "ec41126c5b743697c888c8950774efa03800885a7ccfb7e91603173da8947dc9",
    "779c8d294aafd578b5d265b526ee2bf3e627c7c083dd05104d0acaba0f1877e2",
    "53b5842161d9f4ba71fa08e207881cff946575f515cc67f8ef0b75f3f0c1267d"
])

/**
 * Domains allowed to appear in an email address in a tracked file. An allowlist,
 * for the same reason `gitIdentity` uses one: it catches an address nobody has
 * thought of yet. Most of these are fixtures and documentation examples; adding
 * an entry is the moment a human decides something is publishable, which is the
 * point of making the list explicit.
 */
const ALLOWED_EMAIL_DOMAINS = new Set([
    "anthropic.com",
    "company.com",
    "db.internal",
    "dev.azure.com",
    "example.com",
    "github.com",
    "gm.uit.edu.vn",
    "proxy.corp",
    "users.noreply.github.com",
    "vps.io"
])

/** Bytes that are not prose: hashing their tokens finds only coincidences. */
const BINARY =
    /\.(png|jpe?g|gif|ico|webp|bmp|woff2?|ttf|otf|eot|exe|dll|asar|bundle|zip|gz|pdf|mp4|wasm|snap)$/i

/** Generated, enormous, and not written by a person. */
const SKIP = ["package-lock.json"]

function trackedTextFiles(): string[] {
    const out = execFileSync("git", ["ls-files", "-z"], {
        cwd: REPO,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
    })
    return out
        .split("\0")
        .filter(Boolean)
        .filter((f) => !BINARY.test(f) && !SKIP.some((s) => f.endsWith(s)))
}

/** Distinct lowercase word tokens in a blob of text. */
function tokensOf(text: string): Set<string> {
    const found = new Set<string>()
    const re = /[a-z0-9]+/g
    const lower = text.toLowerCase()
    let m: RegExpExecArray | null
    while ((m = re.exec(lower)) !== null) found.add(m[0])
    return found
}

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

function readOrSkip(f: string): string | null {
    try {
        return readFileSync(join(REPO, f), "utf8")
    } catch {
        return null
    }
}

describe("the identifiers in this repository's tracked files", () => {
    const files = trackedTextFiles()

    it("has a corpus to scan at all", () => {
        // A filter bug excluding everything would make every assertion below
        // vacuously true, which is how a guard rots into decoration.
        expect(files.length).toBeGreaterThan(300)
    })

    it("detects a forbidden token when one is present", () => {
        // Proves the scanner works without planting a real identifier in the
        // tree. If tokenising or hashing breaks, this fails before the real
        // assertions can pass for the wrong reason.
        const planted = "zzstandinidentifierzz"
        const set = new Set([sha256(planted)])
        const hit = [...tokensOf(`a line mentioning ${planted} in prose`)].some(
            (t) => set.has(sha256(t))
        )
        expect(hit).toBe(true)
    })

    it("publishes no forbidden identifier token", () => {
        const offenders: string[] = []
        for (const f of files) {
            const text = readOrSkip(f)
            if (text === null) continue
            let n = 0
            for (const t of tokensOf(text)) {
                if (FORBIDDEN_TOKEN_SHA256.has(sha256(t))) n++
            }
            if (n > 0) offenders.push(`${f} (${n})`)
        }
        // Names the file and a count, never the token: printing it would leak
        // into CI logs the thing this test exists to keep out.
        expect(
            offenders,
            `${offenders.length} tracked file(s) carry a forbidden identifier: ` +
                `${offenders.join(", ")}. Redact using the placeholder register ` +
                `(<employer-domain> / <Client-A> / [CLIENT]), and remember the ` +
                `working tree is only half of it — check history before pushing.`
        ).toEqual([])
    })

    it("publishes no email address outside the allowed domains", () => {
        const offenders = new Set<string>()
        for (const f of files) {
            const text = readOrSkip(f)
            if (text === null) continue
            for (const m of text.matchAll(EMAIL)) {
                const domain = m[1].toLowerCase().replace(/\.+$/, "")
                if (!ALLOWED_EMAIL_DOMAINS.has(domain)) offenders.add(f)
            }
        }
        expect(
            [...offenders],
            `${offenders.size} tracked file(s) carry an email on a domain that is ` +
                `not allowlisted. To see them: git grep -nE ` +
                `'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'`
        ).toEqual([])
    })
})
