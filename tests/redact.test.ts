import { describe, it, expect } from "vitest"
import { redact } from "../src/main/redact"

/**
 * The redactor has two duties and they pull against each other, so both are
 * tested with equal weight. A redactor that eats the paths is useless for the
 * thing the diagnostics record exists to explain, and a redactor that leaves
 * half a token behind is worse than none because the record then *looks* clean.
 */

// Shapes only — none of these is a real credential, and each is constructed to
// be long enough to trip its rule.
const SECRETS = {
    anthropic: "sk-ant-api03-Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MFFXRVJUWQ-AAAAAA",
    openai: "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789",
    ghp: "ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
    gho: "gho_0123456789abcdefghijklmnopqrstuvwxyz",
    ghu: "ghu_ZZZZ0123456789abcdefghijklmnopqrstuv",
    ghs: "ghs_YYYY0123456789abcdefghijklmnopqrstuv",
    ghr: "ghr_XXXX0123456789abcdefghijklmnopqrstuv",
    githubPat: "github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz012345",
    akia: "AKIAIOSFODNN7EXAMPLE",
    asia: "ASIAIOSFODNN7EXAMPLE",
    jwt:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
        ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ" +
        ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    google: "AIzaSyA1234567890abcdefghijklmnopqrstuvw",
    slack: "xoxb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx"
}

const PEM = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEowIBAAKCAQEAx7Xy0Q9mQ0Kv7t2h0Yl3nLbW5r0aQ0oQ7z0d9Yk2Q0Zc1Xw4",
    "9lQ0Zc1Xw49lQ0Zc1Xw49lQ0Zc1Xw49lQ0Zc1Xw49lQ0Zc1Xw49lQ0Zc1Xw49lQ0=",
    "-----END RSA PRIVATE KEY-----"
].join("\n")

describe("redact — a secret must not survive", () => {
    for (const [name, value] of Object.entries(SECRETS)) {
        it(`removes a ${name} token whole, prefix included`, () => {
            const out = redact(`the value is ${value} and that is all`)
            expect(out).not.toContain(value)
            // A partial strip is a failure: the body of the token must be gone,
            // not just its issuer prefix. Every sample's tail is unique enough
            // that its presence would mean the token leaked with a haircut.
            expect(out).not.toContain(value.slice(-16))
            expect(out).toContain("[redacted:")
        })
    }

    it("removes a whole PEM block, not just its header", () => {
        const out = redact(`before\n${PEM}\nafter`)
        expect(out).not.toContain("MIIEowIBAAKCAQEA")
        expect(out).not.toContain("BEGIN RSA PRIVATE KEY")
        expect(out).toContain("before")
        expect(out).toContain("after")
    })

    it("removes an unterminated PEM block — a capped log holds the header and the key, never the footer", () => {
        const truncated = PEM.split("\n").slice(0, 3).join("\n")
        const out = redact(`context line\n${truncated}`)
        expect(out).not.toContain("MIIEowIBAAKCAQEA")
        expect(out).toContain("context line")
    })

    it("removes two PEM blocks separately without swallowing the text between them", () => {
        const out = redact(`${PEM}\nKEEP THIS LINE\n${PEM}`)
        expect(out).toContain("KEEP THIS LINE")
        expect(out).not.toContain("MIIEowIBAAKCAQEA")
    })

    it("keeps an .env line's key and loses its value", () => {
        const out = redact("ANTHROPIC_API_KEY=sk-ant-api03-loremipsumdolorsitametconsectetur")
        expect(out).toContain("ANTHROPIC_API_KEY=")
        expect(out).not.toContain("loremipsumdolorsitametconsectetur")
    })

    it("redacts an env value that has no recognisable token shape, on the name alone", () => {
        const out = redact("DB_PASSWORD=hunter2")
        expect(out).toBe("DB_PASSWORD=[redacted:env-value]")
    })

    it("redacts a GITHUB_PAT value even though PATH must not be touched", () => {
        const out = redact("GITHUB_PAT=abcdef0123456789")
        expect(out).not.toContain("abcdef0123456789")
        expect(out).toContain("GITHUB_PAT=")
    })

    it("redacts a password in a connection string but keeps scheme, user and host", () => {
        const out = redact("postgres://appuser:s3cr3tp@db.internal:5432/main")
        expect(out).not.toContain("s3cr3tp")
        expect(out).toContain("postgres://appuser:")
        expect(out).toContain("@db.internal:5432/main")
    })

    it("redacts an Authorization value but keeps the scheme", () => {
        const out = redact("Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345")
        expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz012345")
        expect(out).toContain("Bearer ")
    })

    it("is idempotent — a second pass does not re-chew its own markers", () => {
        const once = redact(`ANTHROPIC_API_KEY=${SECRETS.anthropic} at C:\\Users\\Admin\\app.log`)
        expect(redact(once)).toBe(once)
    })
})

/**
 * The other direction. Each of these strings is the *evidence* the record
 * exists to carry, and every one of them must come out byte-identical.
 */
const MUST_SURVIVE = [
    "C:\\Users\\Admin\\AppData\\Roaming\\devdeck",
    "C:\\Users\\Admin\\AppData\\Local\\Programs\\devdeck\\resources\\app.asar",
    "D:\\Personal\\Personal Projects\\Products\\devdeck\\src\\main\\index.ts:194:12",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "\\\\server\\share\\bin\\claude.cmd",
    "/home/user/.local/bin/claude",
    "/Users/someone/Library/Application Support/devdeck/settings.json",
    "file:///C:/Users/Admin/AppData/Local/Programs/devdeck/resources/app.asar/out/renderer/index.html",
    "at EditorPanel (file:///C:/app/out/renderer/assets/index-4f1a2b.js:12:3456)",
    // A folder whose *name* contains a credential word. The name-based env rule
    // must not reach into a path, and this is the case that proves it.
    "C:\\dev\\secrets\\notes.md",
    "C:\\Users\\Admin\\.ssh\\id_rsa",
    "C:\\keys\\my-api-key\\readme.txt",
    // The two PATH variables. A blanket NAME=value rule eats both, and losing
    // them blinds the record to the exact thing a `missing` agent is about.
    "PATH=C:\\Windows\\System32;C:\\Users\\Admin\\AppData\\Roaming\\npm",
    "PATHEXT=.COM;.EXE;.BAT;.CMD",
    "SystemRoot=C:\\Windows",
    "NODE_ENV=production",
    // The real preset command lines, verbatim.
    "claude --dangerously-skip-permissions",
    "claude",
    "codex --model gpt-5",
    "npm run dev",
    "cd api && go run .",
    // Version-ish and hash-ish runs a high-entropy heuristic would have eaten.
    "electron 38.4.0 / chrome 140.0.7339.207 / node 22.22.0",
    "commit 6435943f0c1a2b3c4d5e6f708192a3b4c5d6e7f8",
    "0xC0000409"
]

describe("redact — a file path must survive", () => {
    for (const text of MUST_SURVIVE) {
        it(`leaves ${JSON.stringify(text)} byte-identical`, () => {
            expect(redact(text)).toBe(text)
        })
    }

    it("leaves a path untouched when a secret sits in the same string", () => {
        const line = `spawn C:\\Users\\Admin\\AppData\\Roaming\\npm\\claude.cmd failed; ANTHROPIC_API_KEY=${SECRETS.anthropic}`
        const out = redact(line)
        expect(out).toContain("C:\\Users\\Admin\\AppData\\Roaming\\npm\\claude.cmd")
        expect(out).not.toContain(SECRETS.anthropic)
    })

    it("leaves the whole record's mixed content intact except the credentials", () => {
        // The exact pairing criteria 41-43 name: a planted secret and a real
        // Windows path plus a real command line, in one blob.
        const blob = [
            "C:\\Users\\Admin\\AppData\\Roaming\\devdeck",
            "claude --dangerously-skip-permissions",
            SECRETS.ghp,
            SECRETS.akia,
            SECRETS.jwt,
            PEM
        ].join("\n")
        const out = redact(blob)
        expect(out).toContain("C:\\Users\\Admin\\AppData\\Roaming\\devdeck")
        expect(out).toContain("claude --dangerously-skip-permissions")
        for (const s of [SECRETS.ghp, SECRETS.akia, SECRETS.jwt]) expect(out).not.toContain(s)
        expect(out).not.toContain("MIIEowIBAAKCAQEA")
    })

    it("leaves an empty string alone", () => {
        expect(redact("")).toBe("")
    })
})
