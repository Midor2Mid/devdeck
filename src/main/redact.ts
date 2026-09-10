/**
 * Strip credentials out of text on its way into (and out of) the diagnostics
 * record. Pure, node-testable, and deliberately **electron-free** so it can be
 * tested without a mock and reused anywhere in main.
 *
 * **Two properties matter equally, and the second is the one that gets lost.**
 *
 * 1. A secret must not survive. A partial strip is a failure, not a mitigation:
 *    removing the `sk-ant-` prefix and leaving the token behind is worse than
 *    doing nothing, because the record then *looks* redacted.
 * 2. **A file path must survive — except the segment that names its owner.**
 *    The record exists to explain why a launch did nothing and why a panel
 *    threw, and every one of those answers is a path, a command line or a stack
 *    frame. A redactor that eats
 *    `C:\Users\<name>\AppData\Roaming\devdeck` down to a marker, or that
 *    rewrites `claude --dangerously-skip-permissions`, has destroyed the
 *    evidence in order to protect nothing.
 *
 *    This said "byte for byte" until 2026-09-10, and the exception is narrow
 *    and deliberate: `C:\Users\Admin\AppData\…` becomes
 *    `C:\Users\[redacted:user]\AppData\…`. The record is pasted into a
 *    public issue tracker by design, the username is the one segment that
 *    explains nothing about a failing launch, and it is the user's real name on
 *    most Windows installs. See `PATH_RULES`.
 *
 * That second property is why this file has no "looks high-entropy" rule and no
 * blanket `KEY=value` rule. A long base64-ish run is also a hash, a commit sha
 * and half the segments of an npm cache path; a blanket `NAME=value` rule eats
 * `PATH=`, `PATHEXT=` and `SystemRoot=`, which are the three values most likely
 * to explain a `missing` agent. Every rule below is anchored to a **shape that
 * is only ever a credential** — an issuer's own token prefix — or to a variable
 * **name** that says what it holds.
 *
 * Redaction is a mechanism, not a guarantee. Nothing here may be described to a
 * user as "sanitised", "safe" or "anonymous": it removes the credential shapes
 * it knows, and the copy says exactly that ("with API keys and tokens removed").
 */

import { homedir } from "os"

/** One rule: a pattern, and the marker that replaces what it matched. */
interface Rule {
    re: RegExp
    /** `$1`-style backreferences are honoured, so a rule can keep the part that is not secret. */
    to: string
}

/**
 * Zero-width characters, allowed *inside* a token body.
 *
 * None of these can appear in a path, a command line or a stack frame in a way
 * a reader would notice, and every one of them breaks a `[A-Za-z0-9_-]+` run in
 * half. Property 1 says a partial strip is a failure, and
 * `sk-ant-api03-AAAA<ZWSP>BBBB` used to be exactly that: the rule matched the
 * head, wrote a marker, and left the tail in the clear. Folding them into the
 * body classes means the token is taken whole or not at all.
 */
const ZW = "\\u200b-\\u200d\\u2060\\ufeff"

/**
 * The names that say a value is a credential, as one alternation shared by the
 * `=` rule and the `:` rule so the two cannot drift.
 *
 * `PWD` is in the list because `MYSQL_PWD` and `DB_PWD` are real, and it is
 * carved out again below for the two names where it means a **path**.
 */
const CRED = "KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIALS?|AUTHORIZATION|COOKIE|SESSION"

/**
 * The exact names whose value is a working directory, not a credential.
 *
 * `PWD` and `OLDPWD` are POSIX, they appear in every Git Bash and WSL env dump,
 * and their values are the paths property 2 exists to protect. `OLDPWD` was
 * already being eaten before this lookahead existed, because it satisfies the
 * old rule's mandatory one-character prefix — a path lost to a rule about
 * passwords. Anything that merely *contains* `PWD` (`DB_PWD`, `PWD_FILE`) is
 * untouched by this: the lookahead only fires when the name is exactly one of
 * these two and the `=` follows immediately.
 */
const NOT_A_PASSWORD = "(?!(?:OLD)?PWD\\s*=)"

/**
 * Ordered. PEM first because it is the only multi-line shape and an inner rule
 * would otherwise chew holes in a block the outer rule would have taken whole.
 * The two name-keyed rules are last and refuse a value that is already a
 * marker, so `GITHUB_TOKEN=ghp_…` is reported as a GitHub token rather than
 * being redacted twice and losing which kind of thing it was.
 */
const RULES: Rule[] = [
    // A complete PEM block of any type. Non-greedy, so two blocks in one string
    // are two matches rather than one match swallowing the text between them.
    //
    // Case-insensitive on the *type*: `-----BEGIN rsa private key-----` is not
    // how a tool writes one, but it is how a person retyping an error writes
    // one, and an upper-case-only class left the whole body in the clear.
    {
        re: /-----BEGIN [A-Za-z0-9 ]+-----[\s\S]*?-----END [A-Za-z0-9 ]+-----/g,
        to: "[redacted:pem-block]"
    },
    // An *unterminated* block. A capped message or a truncated log routinely
    // holds the header and the first lines of the key and no footer at all, and
    // the rule above cannot match it — so the bytes that matter would be the
    // only ones to survive. Everything from the header to the end of the string
    // goes, because there is no way to know where the key stopped.
    { re: /-----BEGIN [A-Za-z0-9 ]+-----[\s\S]*$/g, to: "[redacted:pem-block]" },

    // Anthropic. Before the generic `sk-` rule so the marker names the issuer.
    { re: new RegExp(`\\bsk-ant-[A-Za-z0-9_${ZW}-]{12,}`, "g"), to: "[redacted:anthropic-key]" },
    // OpenAI-shaped, including the `sk-proj-` project keys.
    { re: new RegExp(`\\bsk-(?:proj-)?[A-Za-z0-9_${ZW}-]{20,}`, "g"), to: "[redacted:api-key]" },
    // Stripe. `sk_live_` sits one underscore away from the `sk-` shapes above
    // and was covered by neither; `rk_` is the restricted-key form.
    {
        re: new RegExp(`\\b[sr]k_(?:live|test)_[A-Za-z0-9${ZW}]{16,}`, "g"),
        to: "[redacted:stripe-key]"
    },
    // GitHub: personal access, OAuth, user-to-server, server-to-server, refresh.
    { re: new RegExp(`\\bgh[pousr]_[A-Za-z0-9${ZW}]{16,}`, "g"), to: "[redacted:github-token]" },
    { re: new RegExp(`\\bgithub_pat_[A-Za-z0-9_${ZW}]{20,}`, "g"), to: "[redacted:github-token]" },
    // npm automation/publish tokens. The 30-character floor and the
    // underscore-free body are what keep `npm_config_cache` and
    // `npm_lifecycle_event` — which are variable *names*, not values — out.
    { re: new RegExp(`\\bnpm_[A-Za-z0-9${ZW}]{30,}`, "g"), to: "[redacted:npm-token]" },
    // AWS access key ids (long-lived and STS).
    { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, to: "[redacted:aws-key-id]" },
    // Google / GCP API keys.
    // Real Google keys are `AIza` plus exactly 35 characters; the bound is a
    // minimum rather than an equality so a lookalike one character off is still
    // taken. Over-redacting a near-miss costs a marker; under-redacting it costs
    // the key.
    { re: new RegExp(`\\bAIza[0-9A-Za-z_${ZW}-]{30,}`, "g"), to: "[redacted:google-key]" },
    // Slack.
    { re: new RegExp(`\\bxox[abposr]-[A-Za-z0-9${ZW}-]{10,}`, "g"), to: "[redacted:slack-token]" },
    // A JWT: three base64url segments. The signature may be empty (`alg: none`),
    // so the third segment is allowed to be, but both dots are required — two
    // dots is what separates a JWT from a dotted filename.
    {
        re: /\beyJ[A-Za-z0-9_=-]{8,}\.[A-Za-z0-9_=-]{8,}\.[A-Za-z0-9_=-]*/g,
        to: "[redacted:jwt]"
    },

    // A password inside a URL's userinfo — how a database connection string
    // carries one. The scheme, the user and the host all survive: they are the
    // half of that string a reader needs and none of it is the credential.
    //
    // The lookahead is why `https://ghp_…@github.com/o/r.git` — a git remote
    // carrying a PAT — comes out naming its issuer. The GitHub rule above
    // replaces the token with `[redacted:github-token]`, and without the guard
    // *this* rule then read that marker as `user:pass` and chewed a hole in it,
    // producing `https://[redacted:[redacted:url-password]@github.com/…`.
    // Nothing leaked, but the record lost which kind of credential it had found
    // and `redact(redact(x)) !== redact(x)` — which is the property that lets
    // the sink redact on the way in and the builder redact on the way out.
    {
        re: /\b([a-z][a-z0-9+.-]*:\/\/)(?!\[redacted)([^\s:@/]+):([^\s@/]+)@/gi,
        to: "$1$2:[redacted:url-password]@"
    },
    // An HTTP authorization value. The scheme is kept so the reader can see
    // *that* the request was authenticated, which is often the whole question.
    {
        re: /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
        to: "$1 [redacted:auth]"
    },

    // `.env`-shaped `NAME=value`, matched on the **name**.
    //
    // Two branches, and the split is the whole reason paths survive. The first
    // matches a name that *contains* a word for a credential. The second
    // matches a name that *ends* in `PAT` — which cannot be folded into the
    // first, because `PATH` and `PATHEXT` both begin with `PAT` and a rule that
    // redacted those would blind the record to the single thing an agent-CLI
    // `missing` verdict is about. (`PATH=` survives the second branch because
    // the `=` has to follow the `PAT` immediately, and `PATH` puts an `H` there.)
    //
    // **The prefix before the keyword is optional, and that is a fix, not a
    // flourish.** It used to be `[A-Za-z_][A-Za-z0-9_]*` — one character at
    // minimum — so `DB_PASSWORD=` matched and `PASSWORD=` did not. The single
    // most common credential variable name in existence was the one shape the
    // rule could not see, and the same off-by-one let `?token=…` through in a
    // URL and `--api-key=…` through in an agent preset command line, which is a
    // shape this record actually carries: `agents[].command` is read out of
    // settings.json and rendered into the blob verbatim.
    //
    // The value keeps its quotes' worth of structure but not its content, and
    // **the name is always kept**: "there is an `ANTHROPIC_API_KEY` here and it
    // had a value" is a fact a reader needs, and it costs nothing to say.
    {
        re: new RegExp(
            `\\b${NOT_A_PASSWORD}([A-Za-z0-9_]*(?:${CRED})[A-Za-z0-9_]*|[A-Za-z0-9_]*PAT)` +
                `(\\s*=\\s*)(?!\\[redacted)("[^"]*"|'[^']*'|\\S+)`,
            "gi"
        ),
        to: "$1$2[redacted:env-value]"
    },

    // The same thing with a **colon**, which had no rule at all.
    //
    // Every name-keyed rule above requires an `=`. A header dump, a YAML
    // fragment and a JSON object all use a colon, and all three are shapes an
    // error message carries: `X-Api-Key: 8f3a…`, `api_key: 8f3a…`,
    // `{"apiKey":"8f3a…"}`, and an `Authorization` value with no scheme in
    // front of it for the rule above to recognise.
    //
    // Tighter than the `=` rule in two deliberate ways, because a colon is
    // vastly more common in the evidence this record exists to carry:
    //
    // - The name must **end** in the keyword (`X-Api-Key`, `access_token`,
    //   `Cookie`), where the `=` rule allows a suffix. `apiKeyId: 5` and
    //   `SessionPanel:` are therefore left alone.
    // - The name must **start** at a line start or after whitespace, a quote, a
    //   brace, a comma, a paren or a bracket — never mid-token. That is what
    //   keeps the rule out of `C:\dev\my-api-key:latest` and out of
    //   `registry.local/team/api-key:1.2.3`, where the `-key:` would otherwise
    //   read as a name and the rest of the line as its value.
    //
    // Hyphens are allowed inside the name so an HTTP header is taken whole. A
    // quoted value is taken as the quoted run so the JSON around it survives;
    // anything else takes the rest of the line, which is what a header value
    // is. A value that already begins with a marker, or with an auth scheme the
    // rule above has already handled, is left alone — that is what keeps
    // `Authorization: Bearer [redacted:auth]` from losing its scheme.
    //
    // Both guards tolerate horizontal space, because a guard that does not is
    // defeated by backtracking: with a greedy `\s*` after the colon the engine
    // simply gives the space back to the value, re-tests the lookahead one
    // character to the left and walks straight through it. That is how
    // `Authorization: Bearer [redacted:auth]` lost its scheme the first time.
    {
        re: new RegExp(
            `(?<=^|[\\s"'\`{,;(\\[])([A-Za-z0-9_-]*(?:${CRED})"?)(\\s*:[^\\S\\r\\n]*)` +
                `(?![^\\S\\r\\n]*\\[redacted)(?![^\\S\\r\\n]*(?:Bearer|Basic|Token)\\b)` +
                `("[^"\\r\\n]*"|'[^'\\r\\n]*'|[^\\r\\n]+)`,
            "gi"
        ),
        to: "$1$2[redacted:named-value]"
    }
]

/**
 * Paths, which are evidence **and** an identifier — the one place where the two
 * duties above actually collide, and the collision is resolved by folding the
 * smallest possible part.
 *
 * Property 2 says a path survives, and it still does: every segment except the
 * one that names its owner. That matters because the record exists to answer
 * *which shell*, *which agent binary*, *installed for the user or the machine*,
 * *put there by which package manager* — and a username answers none of them.
 * `C:\Users\[redacted:user]\AppData\Local\Programs\claude\claude.exe` answers
 * all four.
 *
 * Why this became necessary. The record is clipboard-only by design, and the
 * first thing anyone does with it is paste it into an issue tracker — which for
 * this project is now a public repo, and the beta recruiting plan proposes
 * asking candidates to do exactly that. `shell.resolved`, `shell.customPath`
 * and every `agents[].command` are paths read out of settings.json and rendered
 * verbatim, and on Windows an agent CLI lives under `C:\Users\<a real name>`.
 * `tests/publishedIdentifiers.test.ts` guards the *author's* identifiers in
 * *tracked files*; nothing guarded a *stranger's* identifier in a *paste*.
 *
 * These run AFTER the credential rules, so a token that happens to sit inside a
 * path is still reported as the token it is, and they refuse a value that is
 * already a marker so `redact(redact(x)) === redact(x)` survives.
 */
const PATH_RULES: Rule[] = [
    // `X:\Users\<owner>` and the same path in the forward-slash spelling a
    // `file://` URL uses.
    //
    // The segment is taken in one of two ways and the split is deliberate:
    // greedily up to the next separator (so a username with a space in it is
    // taken WHOLE — half a name is still a name, and the surname is the more
    // identifying half), or, when no separator follows, only as far as the next
    // whitespace. Without that second branch, `cwd C:\Users\Admin was not
    // found` — a real shape, because `sanitizeLine` folds the record's values
    // onto one line before this runs — would lose the error message along with
    // the name.
    //
    // `Public`, `Default`, `Default User` and `All Users` are shared profiles
    // that name nobody, and folding them would cost a reader real information
    // about where something was installed. `Publicity` is not `Public`: the
    // carve-out only fires when the whole segment matches.
    {
        re: new RegExp(
            "\\b([A-Za-z]:[\\\\/]Users[\\\\/])(?!\\[redacted)" +
                "(?!(?:Public|Default User|Default|All Users)(?=[\\\\/]|$))" +
                "(?:[^\\\\/:*?\"<>|\\r\\n]+(?=[\\\\/])|[^\\s\\\\/:*?\"<>|\\r\\n]+)",
            "gi"
        ),
        to: "$1[redacted:user]"
    },
    // `/home/<owner>` and `/Users/<owner>`, with the two prefixes a Windows
    // profile picks up when it is reached through Git Bash (`/c/Users/…`) or
    // WSL (`/mnt/c/Users/…`) — both of which turn up in a `PWD=` on the one
    // platform this app ships on.
    //
    // Anchored at the start of a token rather than allowed to float, so this
    // cannot reach into a URL path or a registry key that happens to contain
    // the word.
    {
        re: /((?:^|(?<=[\s"'`=;,:(]))(?:\/mnt)?(?:\/[A-Za-z])?\/(?:home|Users)\/)(?!\[redacted)[^/\s:;"'`)\]]+/gi,
        to: "$1[redacted:user]"
    },
    // The account name and the machine name on their own, as an env dump
    // carries them. Neither is a path and neither explains anything in this
    // record; a COMPUTERNAME is routinely a person's name or an employer's
    // asset tag. Exact names only — `USERNAME_FILE=` is a path.
    {
        re: /\b(USERNAME|USERDOMAIN|LOGNAME)(\s*=\s*)(?!\[redacted)("[^"]*"|'[^']*'|\S+)/gi,
        to: "$1$2[redacted:user]"
    },
    {
        re: /\b(COMPUTERNAME|HOSTNAME)(\s*=\s*)(?!\[redacted)("[^"]*"|'[^']*'|\S+)/gi,
        to: "$1$2[redacted:host]"
    }
]

/** The real home directory, read once. A platform that refuses to say is treated as unknown. */
const OWN_HOME = ((): string => {
    try {
        return homedir()
    } catch {
        return ""
    }
})()

/**
 * A rule that folds one **known** home directory, whatever shape it has.
 *
 * The generic rules above cover the shapes a home usually takes. A redirected
 * or roaming profile — ordinary in a managed estate, which is where a beta user
 * plausibly works — takes none of them: `D:\profiles\ray`,
 * `\\corp\home$\ray`. This record is built on the machine that owns the home,
 * so the exact string is known and does not have to be guessed.
 *
 * Returns null rather than throwing for a home with no owner segment to remove
 * (`/`, `C:\`, empty, unreadable). An exception here would take the whole
 * diagnostics record with it, and refusing to fold a path that names nobody
 * costs nothing.
 *
 * Both separators are accepted at every position, because the same home shows
 * up as `D:\profiles\ray` in a spawn error and `file:///D:/profiles/ray` in a
 * stack frame. The trailing `(?![^\\/])` is what stops `ray` from folding out
 * of `raymond`: the segment has to end where the match does.
 */
function buildHomeRule(home: string): Rule | null {
    const parts = home.replace(/[\\/]+$/, "").split(/[\\/]/)
    const owner = parts.pop() ?? ""
    if (!owner.trim() || parts.length === 0 || !parts.join("").trim()) return null
    const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const parent = parts.map(esc).join("[\\\\/]")
    return {
        re: new RegExp(`(${parent}[\\\\/])${esc(owner)}(?![^\\\\/])`, "gi"),
        to: "$1[redacted:user]"
    }
}

/** One-entry memo: the home does not change, and neither should the regex. */
let homeCache: { home: string; rule: Rule | null } | null = null
function homeRule(home: string): Rule | null {
    if (!homeCache || homeCache.home !== home) homeCache = { home, rule: buildHomeRule(home) }
    return homeCache.rule
}

/**
 * Redact every known credential shape in `text`.
 *
 * Idempotent: the markers it writes match none of its own rules, and both
 * name-keyed rules and the URL-userinfo rule explicitly refuse a value that is
 * already a marker — so redacting an already-redacted string returns it
 * unchanged, which is what lets the sink redact on the way in *and* the record
 * builder redact on the way out without the second pass mangling the first.
 * `tests/redact.test.ts` pins that over every shape in the suite at once.
 *
 * Three passes, in this order, because the order is load-bearing:
 * credentials first, so a token sitting inside a path is still reported as the
 * token it is; then the *known* home, so a home whose owner segment contains a
 * space is taken whole; then the generic path shapes, which would otherwise
 * fold the first word of that name and leave the rest.
 *
 * `home` exists so the fold is testable without touching the environment. It
 * defaults to this machine's home directory, which is the right answer in
 * production: the record is built on the machine that owns it.
 */
export function redact(text: string, home: string = OWN_HOME): string {
    let out = text
    for (const rule of RULES) out = out.replace(rule.re, rule.to)
    const own = homeRule(home)
    if (own) out = out.replace(own.re, own.to)
    for (const rule of PATH_RULES) out = out.replace(rule.re, rule.to)
    return out
}

/** Redact a value that may be absent, keeping `undefined` as `undefined`. */
export function redactMaybe(text: string | undefined, home: string = OWN_HOME): string | undefined {
    return text === undefined ? undefined : redact(text, home)
}

// ---------------------------------------------------------------------------
// Sanitisation — a different job from redaction, in the same file because both
// are pure string work on the way to the same clipboard.
// ---------------------------------------------------------------------------

/**
 * C0 and C1 control characters, minus TAB and LF.
 *
 * Built from escapes in a string so that no control byte is ever a literal in
 * this file — a NUL pasted into a source file is invisible in every diff.
 */
const CONTROLS = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]", "g")

/**
 * Strip what a *text* record cannot carry.
 *
 * Redaction is about what a string means; this is about what a string **is**.
 * The two failures it closes were measured against a real Electron clipboard,
 * not reasoned about:
 *
 * - **A NUL truncates the clipboard.** `clipboard.writeText("a\0b")` followed
 *   by `clipboard.readText()` returns `"a"`. The copy control proves its write
 *   by reading it back (`clipboard:write` in `main/index.ts`), so one NUL
 *   anywhere in the record makes that comparison fail for the rest of the
 *   install's life and the button says "Couldn't copy" forever; and had the
 *   comparison passed, the user would have pasted a record silently cut off at
 *   the NUL. Either way one byte from the least trusted caller in the system
 *   disables the diagnostic channel — and that caller is `diagnostics:report`,
 *   which is fire-and-forget from a renderer.
 * - **A lone surrogate does the same thing**, coming back as U+FFFD.
 *
 * `\n` and `\t` survive: a component stack is made of them and the record is
 * meant to be read. Everything else in C0/C1 goes, ANSI escapes included — an
 * escape sequence in a blob a human pastes into a terminal is not evidence.
 * CRLF and lone CR fold to `\n` so a line count means one thing.
 */
export function sanitizeText(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        // Lone surrogates, either half, with no partner.
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "\uFFFD")
        .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD")
        .replace(CONTROLS, "")
}

/**
 * Fold a value onto **one line**.
 *
 * For every value the record renders inline — a shell path, an agent name, an
 * agent command, a resolved binary. `renderRecord` writes those into a single
 * formatted line each, so a newline inside one is a line the caller wrote into
 * the record's layout. Brackets survive: `C:\dev\[old]\bin\claude.cmd` is a
 * path, and property 2 says a path survives.
 */
export function sanitizeLine(text: string): string {
    return sanitizeText(text)
        .replace(/[\n\t]/g, " ")
        .replace(/ {2,}/g, " ")
        .trim()
}

/**
 * A one-line label, safe to interpolate into the record's own **bracketed**
 * format.
 *
 * The rendered record writes `[${origin}/${source}]`, and `source` is a string
 * a renderer chooses. A source of `x] x9999  first 1970 [main/kernel` forges a
 * second, entirely fictitious error line inside the blob the user pastes — so
 * the two bracket characters go here rather than being escaped somewhere
 * downstream. A boundary name has never contained either.
 */
export function sanitizeLabel(text: string): string {
    return sanitizeLine(text).replace(/[[\]]/g, " ").replace(/ {2,}/g, " ").trim()
}
