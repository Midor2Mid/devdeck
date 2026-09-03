import { describe, it, expect } from "vitest"
import { redact, sanitizeLabel, sanitizeLine, sanitizeText } from "../src/main/redact"

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

/**
 * The name-based rule's own parser, attacked at the one place its author did
 * not look: the *shortest* name that matches.
 *
 * The rule read `[A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|…)[A-Za-z0-9_]*`, so
 * the prefix before the keyword was **mandatory** — one character at minimum.
 * `DB_PASSWORD=` matched and `XPASSWORD=` matched, but `PASSWORD=` — the single
 * most common credential variable name there is — did not, because there was
 * nothing in front of the keyword to satisfy `[A-Za-z_]`.
 *
 * The same off-by-one let `?token=…` through in a URL and `--api-key=…` through
 * in an agent preset command line, which is the shape this record actually
 * carries: `agents[].command` and `terminal.customShellPath` are read out of
 * settings.json and rendered verbatim into the blob a stranger pastes.
 */
const BARE_NAMES = [
    "PASSWORD",
    "PASSWD",
    "TOKEN",
    "SECRET",
    "KEY",
    "COOKIE",
    "SESSION",
    "CREDENTIAL",
    "CREDENTIALS",
    "AUTHORIZATION",
    "PAT",
    "password",
    "token",
    "Secret"
]

describe("redact — the keyword IS the whole name", () => {
    for (const name of BARE_NAMES) {
        it(`redacts a bare ${name}= value, with nothing in front of the keyword`, () => {
            const out = redact(`${name}=hunter2SuperSecretValue`)
            expect(out).not.toContain("hunter2SuperSecretValue")
            expect(out).toContain(`${name}=`)
        })
    }

    it("redacts a bare token in a query string", () => {
        // The pairing-token shape. `?api_key=` was covered; `?token=` was not.
        const out = redact("GET https://phone.local:7391/pair?token=abcdef0123456789 failed")
        expect(out).not.toContain("abcdef0123456789")
        expect(out).toContain("https://phone.local:7391/pair?token=")
    })

    it("redacts a key handed to an agent preset on its command line", () => {
        // `agents[].command` reaches the record byte for byte. A preset that
        // carries its own key is the most reachable secret in this whole record.
        for (const flag of ["--api-key", "--token", "--password", "--key"]) {
            const out = redact(`codex ${flag}=abcdef0123456789zz --model gpt-5`)
            expect(out, flag).not.toContain("abcdef0123456789zz")
            expect(out, flag).toContain("--model gpt-5")
        }
    })
})

/**
 * `NAME: value` — the colon form — had no rule at all.
 *
 * Every rule keyed on a variable *name* required an `=`. A header dump, a YAML
 * fragment and a JSON object all use a colon, and all three are shapes an error
 * message carries: `X-Api-Key: …`, `Authorization: <raw token with no scheme>`,
 * `{"apiKey":"…"}`.
 */
describe("redact — the colon form of a named credential", () => {
    const HEX = "8f3a9b2c1d4e5f60718293a4b5c6d7e8"
    const COLON_CASES: [string, string][] = [
        ["http header", `X-Api-Key: ${HEX}`],
        ["authorization with no scheme", `Authorization: ${HEX}`],
        ["yaml", `api_key: ${HEX}`],
        ["json double-quoted", `{"apiKey":"${HEX}"}`],
        ["json spaced", `{ "api_key": "${HEX}" }`],
        ["cookie", `Cookie: ${HEX}`],
        ["session", `session: ${HEX}`]
    ]
    for (const [name, line] of COLON_CASES) {
        it(`redacts the value in a ${name}`, () => {
            expect(redact(line)).not.toContain(HEX)
        })
    }

    it("still keeps the Authorization scheme when there is one", () => {
        // The colon rule must not undo the auth rule's one useful concession.
        // Its guard has to tolerate horizontal space or backtracking walks
        // straight through it — which is how this broke the first time.
        const out = redact("Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345")
        expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz012345")
        expect(out).toContain("Bearer ")
    })

    it("leaves a JSON key whose name only mentions a credential", () => {
        // The colon rule requires the name to END in the keyword, which is what
        // keeps it off an id field sitting next to a real one.
        const line = `{"apiKeyId": 5}`
        expect(redact(line)).toBe(line)
    })
})

/**
 * Property 1 restated as a test: a *partial* strip is a failure. A token
 * wearing a zero-width character used to lose its head to a rule and keep its
 * tail in the clear — which is worse than not redacting, because the record
 * then looks redacted.
 */
describe("redact — a token must not survive with a haircut", () => {
    it("takes a key whole when a zero-width space is hiding inside it", () => {
        const out = redact("sk-ant-api03-AAAABBBBCCCC\u200bDDDDEEEEFFFF")
        expect(out).not.toContain("DDDDEEEEFFFF")
    })

    it("takes a github token whole across a zero-width joiner", () => {
        const out = redact("ghp_AbCdEfGhIjKlMnOp\u200dQrStUvWxYz0123456789")
        expect(out).not.toContain("QrStUvWxYz0123456789")
    })

    it("takes a PEM block whose header is not upper-case", () => {
        const out = redact(
            "-----BEGIN rsa private key-----\nMIIEowSECRETBODY\n-----END rsa private key-----"
        )
        expect(out).not.toContain("MIIEowSECRETBODY")
    })
})

/**
 * Two issuer shapes that sit one character away from a rule that already
 * existed, and were covered by neither.
 */
describe("redact — issuers next door to a covered one", () => {
    it("redacts a Stripe live key, which is `sk_` where `sk-` was covered", () => {
        expect(redact("sk_live_51AbCdEfGhIjKlMnOpQrStUvWx")).toBe("[redacted:stripe-key]")
    })

    it("redacts an npm token without eating an npm_ variable NAME", () => {
        expect(redact("npm_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toBe("[redacted:npm-token]")
        // These are names, not values, and they explain a `missing` agent.
        const cache = "npm_config_cache=C:\\Users\\Admin\\AppData\\Local\\npm-cache"
        expect(redact(cache)).toBe(cache)
        expect(redact("npm_lifecycle_event=dev")).toBe("npm_lifecycle_event=dev")
    })
})

/**
 * Idempotence is a documented property of this module, and it was false.
 *
 * `https://ghp_…@github.com/o/r.git` — how a git remote carries a PAT — came
 * out as `https://[redacted:[redacted:url-password]@github.com/o/r.git`: the
 * issuer rule wrote a marker, and the URL-userinfo rule then matched *the
 * marker* and chewed a hole in it. Nothing leaks, but the record loses which
 * kind of credential it found, and `redact(redact(x)) !== redact(x)` breaks the
 * property that lets the sink redact on the way in and the builder redact on
 * the way out — which is now something the builder actually does.
 */
describe("redact — its own markers are not input", () => {
    it("names the issuer of a PAT in a git remote instead of eating its own marker", () => {
        const out = redact("https://ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789@github.com/o/r.git")
        expect(out).toBe("https://[redacted:github-token]@github.com/o/r.git")
    })

    it("is idempotent over every shape in this suite at once", () => {
        const blob = [
            ...Object.values(SECRETS),
            PEM,
            "https://ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789@github.com/o/r.git",
            "postgres://appuser:s3cr3tp@db.internal:5432/main",
            "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345",
            "X-Api-Key: 8f3a9b2c1d4e5f60718293a4b5c6d7e8",
            "PASSWORD=hunter2",
            "sk_live_51AbCdEfGhIjKlMnOpQrStUvWx",
            ...MUST_SURVIVE
        ].join("\n")
        const once = redact(blob)
        expect(redact(once)).toBe(once)
    })
})

/**
 * The other direction for the widened name rule. Making the prefix optional
 * brings two POSIX variables into range whose values are **paths**, and
 * property 2 says a path survives byte for byte. `OLDPWD=` was already being
 * eaten before the carve-out existed.
 */
const STILL_SURVIVES = [
    "PWD=/home/user/Personal Projects/devdeck",
    "OLDPWD=/home/user/.local/bin",
    "PATH=C:\\Windows\\System32;C:\\Users\\Admin\\AppData\\Roaming\\npm",
    "PATHEXT=.COM;.EXE;.BAT;.CMD",
    "SystemRoot=C:\\Windows",
    // The colon rule must not reach into a path segment or a docker tag.
    "C:\\dev\\my-api-key:latest",
    "docker run registry.local/team/api-key:1.2.3",
    "at EditorPanel (file:///C:/app/out/renderer/assets/index-4f1a2b.js:12:3456)",
    "D:\\Personal\\Personal Projects\\Products\\devdeck\\src\\main\\index.ts:194:12",
    "HKLM:\\SOFTWARE\\Microsoft\\Windows",
    // The record's own rendered lines, which go through `redact` on a second pass.
    "  [renderer/ErrorBoundary] x3  first 2026-09-03T05:00:00.000Z  last 2026-09-03T05:01:00.000Z",
    "  configured      powershell"
]

describe("redact — the widened rules still keep the evidence", () => {
    for (const text of STILL_SURVIVES) {
        it(`leaves ${JSON.stringify(text)} byte-identical`, () => {
            expect(redact(text)).toBe(text)
        })
    }
})

/**
 * The over-redaction the widened `=` rule knowingly accepts.
 *
 * With the prefix before the keyword made optional, a name that merely *begins*
 * with a credential word is now taken too: `keyboard=us` reads as `KEY` plus
 * `board`. That is the trade this module already states for the Google rule —
 * over-redacting a near-miss costs a marker, under-redacting it costs the key —
 * and the alternative (requiring the name to *end* in the keyword, as the colon
 * rule does) would lose `TOKEN_FILE=`, `SECRET_FILE=` and every other real
 * `*_FILE` convention. Pinned here so the next person to touch this rule knows
 * it was a decision and not an accident.
 */
describe("redact — the `=` rule's accepted over-redaction", () => {
    it("takes a name that only begins with a credential word", () => {
        expect(redact("keyboard=us")).toBe("keyboard=[redacted:env-value]")
    })
})

/**
 * Sanitisation, which is a different duty from redaction: not what a string
 * *means* but what a string **is**.
 *
 * The failure that motivates it was measured against a real Electron 38
 * clipboard on Windows, not reasoned about. `clipboard.writeText("a\u0000b")`
 * followed by `clipboard.readText()` returns `"a"` — three characters in, one
 * out. `clipboard:write` proves its write by reading it back, so one NUL
 * anywhere in the record makes that comparison fail for the life of the
 * install: the copy button says "Couldn't copy" forever, and had the comparison
 * passed instead, the user would have pasted a record silently cut off at that
 * byte. The byte arrives from `diagnostics:report`, which is fire-and-forget
 * from a renderer — so this is one hostile character against the whole
 * diagnostic channel.
 */
describe("sanitizeText — what a clipboard cannot hold", () => {
    it("removes a NUL, which truncates a real clipboard write", () => {
        expect(sanitizeText("before\u0000after")).toBe("beforeafter")
    })

    it("removes ANSI escapes rather than pasting them into someone's terminal", () => {
        expect(sanitizeText("red \u001b[31mDANGER\u001b[0m done")).toBe("red [31mDANGER[0m done")
    })

    it("replaces a lone surrogate, which comes back from the clipboard as U+FFFD", () => {
        expect(sanitizeText("msg \ud800 tail")).toBe("msg \ufffd tail")
        expect(sanitizeText("msg \udc00 tail")).toBe("msg \ufffd tail")
    })

    it("keeps a well-formed surrogate pair whole", () => {
        expect(sanitizeText("emoji \ud83d\ude80 done")).toBe("emoji \ud83d\ude80 done")
    })

    it("keeps the newlines and tabs a component stack is made of", () => {
        expect(sanitizeText("at A\n\tat B\n\tat C")).toBe("at A\n\tat B\n\tat C")
    })

    it("folds CRLF and a lone CR to LF so a line count means one thing", () => {
        expect(sanitizeText("a\r\nb\rc")).toBe("a\nb\nc")
    })

    it("leaves every path in the must-survive corpus byte-identical", () => {
        for (const text of MUST_SURVIVE) expect(sanitizeText(text)).toBe(text)
    })
})

describe("sanitizeLine / sanitizeLabel — the record's layout is not caller-writable", () => {
    it("folds a value that is rendered inline onto one line", () => {
        expect(sanitizeLine("C:\\bin\\x.exe\n  fake line")).toBe("C:\\bin\\x.exe fake line")
    })

    it("keeps brackets in a path, because a path can contain them", () => {
        const p = "C:\\dev\\[old]\\bin\\claude.cmd"
        expect(sanitizeLine(p)).toBe(p)
    })

    it("strips the brackets from a label, which is rendered inside brackets", () => {
        // `renderRecord` writes `[${origin}/${source}]`. A source carrying `]`
        // and `[` forges a second, fictitious error line in the pasted blob.
        expect(sanitizeLabel("x] x9999  first 1970 [main/kernel")).toBe(
            "x x9999 first 1970 main/kernel"
        )
    })

    it("refuses to leave a newline in a label", () => {
        expect(sanitizeLabel("ErrorBoundary\nInjected")).toBe("ErrorBoundary Injected")
    })
})
