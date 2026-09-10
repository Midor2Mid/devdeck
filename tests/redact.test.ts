import { describe, it, expect } from "vitest"
import { redact, sanitizeLabel, sanitizeLine, sanitizeText } from "../src/main/redact"
import { homedir } from "os"

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
 *
 * Property 2 acquired exactly one exception on 2026-09-10, and the paths that
 * used to sit in this list (and in STILL_SURVIVES) moved to `HOME_FOLDED`
 * below: a path now survives except for the one segment that names its owner.
 * See that block for why.
 */
const MUST_SURVIVE = [
    "D:\\Personal\\Personal Projects\\Products\\devdeck\\src\\main\\index.ts:194:12",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "\\\\server\\share\\bin\\claude.cmd",
    "at EditorPanel (file:///C:/app/out/renderer/assets/index-4f1a2b.js:12:3456)",
    // A folder whose *name* contains a credential word. The name-based env rule
    // must not reach into a path, and this is the case that proves it.
    "C:\\dev\\secrets\\notes.md",
    "C:\\keys\\my-api-key\\readme.txt",
    // The two PATH variables. A blanket NAME=value rule eats both, and losing
    // them blinds the record to the exact thing a `missing` agent is about.
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

/**
 * F-3. The one exception to property 2, and the reason it exists.
 *
 * This record is clipboard-only by design, and the first thing a user does with
 * it is paste it into an issue tracker — which for this project is now a public
 * repo, and `docs/beta/02-recruiting-message.md` proposes asking beta
 * candidates to do exactly that. `shell.resolved`, `shell.customPath` and every
 * `agents[].command` are file paths taken out of settings.json and rendered
 * verbatim, and on Windows an agent CLI routinely lives under
 * `C:\Users\<the user's real name>\AppData\…`. This repo rewrote its own history
 * twice in one week to remove the author's identifiers from tracked files;
 * `tests/publishedIdentifiers.test.ts` guards those. Nothing guarded a
 * stranger's identifier in a paste, one level out.
 *
 * The fold keeps the whole path except the segment that names its owner,
 * because the path IS the evidence: "the agent resolved to
 * `C:\Users\[redacted:user]\AppData\Local\…\claude.exe`" answers *wrong shell*,
 * *not on PATH*, *installed per-user not per-machine* and *which package
 * manager put it there* — and the username answers none of those.
 */
const HOME_FOLDED: [string, string][] = [
    [
        "C:\\Users\\Admin\\AppData\\Roaming\\devdeck",
        "C:\\Users\\[redacted:user]\\AppData\\Roaming\\devdeck"
    ],
    [
        "C:\\Users\\Admin\\AppData\\Local\\Programs\\devdeck\\resources\\app.asar",
        "C:\\Users\\[redacted:user]\\AppData\\Local\\Programs\\devdeck\\resources\\app.asar"
    ],
    ["C:\\Users\\Admin\\.ssh\\id_rsa", "C:\\Users\\[redacted:user]\\.ssh\\id_rsa"],
    ["/home/user/.local/bin/claude", "/home/[redacted:user]/.local/bin/claude"],
    [
        "/Users/someone/Library/Application Support/devdeck/settings.json",
        "/Users/[redacted:user]/Library/Application Support/devdeck/settings.json"
    ],
    [
        "file:///C:/Users/Admin/AppData/Local/Programs/devdeck/resources/app.asar/out/renderer/index.html",
        "file:///C:/Users/[redacted:user]/AppData/Local/Programs/devdeck/resources/app.asar/out/renderer/index.html"
    ],
    // The env dumps. The variable NAME is kept, as everywhere else in this
    // module, and so is every segment that is not the username.
    [
        "PATH=C:\\Windows\\System32;C:\\Users\\Admin\\AppData\\Roaming\\npm",
        "PATH=C:\\Windows\\System32;C:\\Users\\[redacted:user]\\AppData\\Roaming\\npm"
    ],
    [
        "PWD=/home/user/Personal Projects/devdeck",
        "PWD=/home/[redacted:user]/Personal Projects/devdeck"
    ],
    ["OLDPWD=/home/user/.local/bin", "OLDPWD=/home/[redacted:user]/.local/bin"],
    // Git Bash and WSL spell a Windows profile two more ways, and both appear
    // in a `PWD=` on the one platform this app ships on.
    ["/c/Users/Admin/dev/api", "/c/Users/[redacted:user]/dev/api"],
    ["/mnt/c/Users/Admin/dev/api", "/mnt/c/Users/[redacted:user]/dev/api"],
    // A username with a space in it. The fold has to take the whole segment or
    // it leaks the surname, which is the more identifying half.
    [
        "C:\\Users\\John Smith\\AppData\\Roaming\\npm\\claude.cmd",
        "C:\\Users\\[redacted:user]\\AppData\\Roaming\\npm\\claude.cmd"
    ]
]

describe("redact — a home directory is an identifier (F-3)", () => {
    // Every case below passes a home that matches nothing, so what is under
    // test is the GENERIC shape rule and not this machine's own home. Without
    // it, `C:\Users\Admin\…` would fold here via the known-home rule on the
    // author's machine and via the generic rule on a CI runner — green in both
    // places, for two different reasons, one of which nobody checked.
    const NO_HOME = "C:\\nowhere\\nobody"

    for (const [text, expected] of HOME_FOLDED) {
        it(`folds the owner out of ${JSON.stringify(text)}`, () => {
            expect(redact(text, NO_HOME)).toBe(expected)
        })
    }

    it("folds this machine's own home with no argument at all", () => {
        // The other half: that the default parameter is actually wired to the
        // real homedir. Machine-independent, because it derives the expectation
        // from the same source the implementation reads.
        const owner = homedir().split(/[\\/]/).pop() ?? ""
        expect(owner.length).toBeGreaterThan(0)
        const out = redact(`resolved ${homedir()}\\bin\\claude.exe`)
        expect(out).not.toContain(owner)
        expect(out).toContain("[redacted:user]")
        expect(out).toContain("bin\\claude.exe")
    })

    it("keeps the diagnostic tail, which is the whole point of the record", () => {
        const out = redact(
            "resolved C:\\Users\\Admin\\AppData\\Local\\Programs\\claude\\claude.exe",
            NO_HOME
        )
        expect(out).not.toContain("Admin")
        // Per-user install, under AppData\Local\Programs, named claude.exe:
        // every fact a reader needs survives.
        expect(out).toContain("AppData\\Local\\Programs\\claude\\claude.exe")
    })

    it("does not eat the message that follows a path", () => {
        // The record folds newlines to spaces before redacting (sanitizeLine),
        // so a greedy segment class that allowed spaces to the end of the line
        // would swallow the error text sitting after the path.
        expect(redact("cwd C:\\Users\\Admin was not found", NO_HOME)).toBe(
            "cwd C:\\Users\\[redacted:user] was not found"
        )
        expect(redact("spawn /home/user failed with ENOENT", NO_HOME)).toBe(
            "spawn /home/[redacted:user] failed with ENOENT"
        )
    })

    it("leaves the shared profiles alone — they name no one", () => {
        for (const shared of [
            "C:\\Users\\Public\\Documents\\shared.txt",
            "C:\\Users\\Default\\AppData\\Roaming",
            "C:\\Users\\All Users\\npm",
            "C:\\Users\\Default User\\ntuser.dat"
        ]) {
            expect(redact(shared, NO_HOME)).toBe(shared)
        }
        // A real username that merely STARTS with a shared name is not shared.
        expect(redact("C:\\Users\\Publicity\\x", NO_HOME)).toBe(
            "C:\\Users\\[redacted:user]\\x"
        )
    })

    it("folds a home that is not under Users or /home at all", () => {
        // A redirected or roaming profile — ordinary in a managed estate, and
        // outside every generic shape above. `redact` takes the home to fold as
        // an argument (defaulting to the real `os.homedir()`) so this is
        // testable without touching the environment.
        expect(redact("D:\\profiles\\ray\\bin\\claude.exe", "D:\\profiles\\ray")).toBe(
            "D:\\profiles\\[redacted:user]\\bin\\claude.exe"
        )
        // UNC, the other shape a redirected profile takes.
        expect(redact("\\\\corp\\home$\\ray\\.claude\\settings.json", "\\\\corp\\home$\\ray")).toBe(
            "\\\\corp\\home$\\[redacted:user]\\.claude\\settings.json"
        )
        // Same path in the forward-slash spelling a file:// URL uses.
        expect(redact("file:///D:/profiles/ray/x.log", "D:\\profiles\\ray")).toBe(
            "file:///D:/profiles/[redacted:user]/x.log"
        )
        // A space-containing username at the END of a path, with no trailing
        // separator to bound it: only the known home can take this whole.
        expect(redact("cwd was C:\\Users\\John Smith", "C:\\Users\\John Smith")).toBe(
            "cwd was C:\\Users\\[redacted:user]"
        )
    })

    it("does not fold a different user under the same parent", () => {
        // The known-home rule must match the whole segment, not a prefix of it.
        expect(redact("D:\\profiles\\raymond\\x", "D:\\profiles\\ray")).toBe(
            "D:\\profiles\\raymond\\x"
        )
    })

    it("refuses a home it cannot fold safely rather than throwing", () => {
        // Fail closed on shape, not on an exception: a root-level or empty home
        // has no owner segment to remove, and a guard that threw here would
        // take the whole diagnostics record with it.
        for (const home of ["", "   ", "/", "C:\\", "\\", "C:"]) {
            expect(redact("C:\\dev\\api", home)).toBe("C:\\dev\\api")
        }
    })

    it("folds the OS account name and machine name out of an env dump", () => {
        // Neither is a path, and neither explains anything in this record. A
        // COMPUTERNAME is routinely a person's name or an employer's asset tag.
        expect(redact("USERNAME=Admin")).toBe("USERNAME=[redacted:user]")
        expect(redact("USERDOMAIN=ACME-CORP")).toBe("USERDOMAIN=[redacted:user]")
        expect(redact("LOGNAME=ray")).toBe("LOGNAME=[redacted:user]")
        expect(redact("COMPUTERNAME=RAY-LAPTOP")).toBe("COMPUTERNAME=[redacted:host]")
        expect(redact("HOSTNAME=ray-mbp.local")).toBe("HOSTNAME=[redacted:host]")
        // USERPROFILE is a PATH: it keeps its shape and loses only the owner.
        expect(redact("USERPROFILE=C:\\Users\\Admin")).toBe(
            "USERPROFILE=C:\\Users\\[redacted:user]"
        )
        // A name that merely contains one of these words is not one of them.
        expect(redact("USERNAME_FILE=/etc/x")).toBe("USERNAME_FILE=/etc/x")
    })

    it("is idempotent over every folded shape", () => {
        const once = redact(HOME_FOLDED.map(([text]) => text).join("\n"), NO_HOME)
        expect(redact(once, NO_HOME)).toBe(once)
        // And a second pass with a known home does not chew the marker either.
        expect(redact(redact("D:\\profiles\\ray\\x", "D:\\profiles\\ray"), "D:\\profiles\\ray")).toBe(
            "D:\\profiles\\[redacted:user]\\x"
        )
    })

    it("still redacts a credential that shares the line with a home path", () => {
        const out = redact(
            `spawn C:\\Users\\Admin\\AppData\\Roaming\\npm\\claude.cmd; ANTHROPIC_API_KEY=${SECRETS.anthropic}`,
            NO_HOME
        )
        expect(out).not.toContain(SECRETS.anthropic)
        expect(out).not.toContain("Admin")
        expect(out).toContain("AppData\\Roaming\\npm\\claude.cmd")
    })
})

describe("redact — a file path must survive", () => {
    for (const text of MUST_SURVIVE) {
        it(`leaves ${JSON.stringify(text)} byte-identical`, () => {
            expect(redact(text)).toBe(text)
        })
    }

    it("leaves a path untouched when a secret sits in the same string", () => {
        const line = `spawn C:\\Users\\Admin\\AppData\\Roaming\\npm\\claude.cmd failed; ANTHROPIC_API_KEY=${SECRETS.anthropic}`
        const out = redact(line)
        expect(out).toContain("C:\\Users\\[redacted:user]\\AppData\\Roaming\\npm\\claude.cmd")
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
        expect(out).toContain("C:\\Users\\[redacted:user]\\AppData\\Roaming\\devdeck")
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
        // The username folds (F-3); everything that explains where the
        // cache lives survives.
        const cache = "npm_config_cache=C:\\Users\\Admin\\AppData\\Local\\npm-cache"
        expect(redact(cache)).toBe(
            "npm_config_cache=C:\\Users\\[redacted:user]\\AppData\\Local\\npm-cache"
        )
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
            ...MUST_SURVIVE,
            ...HOME_FOLDED.map(([text]) => text)
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
        // Sanitisation is about what a string IS, not what it means: the home
        // paths that `redact` folds are untouched here, in both directions.
        for (const [text] of HOME_FOLDED) expect(sanitizeText(text)).toBe(text)
        for (const [, folded] of HOME_FOLDED) expect(sanitizeText(folded)).toBe(folded)
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
