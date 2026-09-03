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
 * 2. **A file path must survive, byte for byte.** The record exists to explain
 *    why a launch did nothing and why a panel threw, and every one of those
 *    answers is a path, a command line or a stack frame. A redactor that eats
 *    `C:\Users\<name>\AppData\Roaming\devdeck` or rewrites
 *    `claude --dangerously-skip-permissions` has destroyed the evidence in
 *    order to protect nothing.
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

/** One rule: a pattern, and the marker that replaces what it matched. */
interface Rule {
    re: RegExp
    /** `$1`-style backreferences are honoured, so a rule can keep the part that is not secret. */
    to: string
}

/**
 * Ordered. PEM first because it is the only multi-line shape and an inner rule
 * would otherwise chew holes in a block the outer rule would have taken whole.
 * The name=value rule is last and refuses a value that is already a marker, so
 * `GITHUB_TOKEN=ghp_…` is reported as a GitHub token rather than being redacted
 * twice and losing which kind of thing it was.
 */
const RULES: Rule[] = [
    // A complete PEM block of any type. Non-greedy, so two blocks in one string
    // are two matches rather than one match swallowing the text between them.
    { re: /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g, to: "[redacted:pem-block]" },
    // An *unterminated* block. A capped message or a truncated log routinely
    // holds the header and the first lines of the key and no footer at all, and
    // the rule above cannot match it — so the bytes that matter would be the
    // only ones to survive. Everything from the header to the end of the string
    // goes, because there is no way to know where the key stopped.
    { re: /-----BEGIN [A-Z0-9 ]+-----[\s\S]*$/g, to: "[redacted:pem-block]" },

    // Anthropic. Before the generic `sk-` rule so the marker names the issuer.
    { re: /\bsk-ant-[A-Za-z0-9_-]{12,}/g, to: "[redacted:anthropic-key]" },
    // OpenAI-shaped, including the `sk-proj-` project keys.
    { re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, to: "[redacted:api-key]" },
    // GitHub: personal access, OAuth, user-to-server, server-to-server, refresh.
    { re: /\bgh[pousr]_[A-Za-z0-9]{16,}/g, to: "[redacted:github-token]" },
    { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, to: "[redacted:github-token]" },
    // AWS access key ids (long-lived and STS).
    { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, to: "[redacted:aws-key-id]" },
    // Google / GCP API keys.
    // Real Google keys are `AIza` plus exactly 35 characters; the bound is a
    // minimum rather than an equality so a lookalike one character off is still
    // taken. Over-redacting a near-miss costs a marker; under-redacting it costs
    // the key.
    { re: /\bAIza[0-9A-Za-z_-]{30,}/g, to: "[redacted:google-key]" },
    // Slack.
    { re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, to: "[redacted:slack-token]" },
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
    {
        re: /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi,
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
    // `missing` verdict is about.
    //
    // The value keeps its quotes' worth of structure but not its content, and
    // **the name is always kept**: "there is an `ANTHROPIC_API_KEY` here and it
    // had a value" is a fact a reader needs, and it costs nothing to say.
    {
        re: /\b([A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIALS?|AUTHORIZATION|COOKIE|SESSION)[A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*PAT)(\s*=\s*)(?!\[redacted)("[^"]*"|'[^']*'|\S+)/gi,
        to: "$1$2[redacted:env-value]"
    }
]

/**
 * Redact every known credential shape in `text`.
 *
 * Idempotent in practice: the markers it writes match none of its own rules,
 * and the `name=value` rule explicitly refuses a value that is already a marker
 * — so redacting an already-redacted string returns it unchanged, which is what
 * lets the sink redact on the way in *and* the record builder redact on the way
 * out without the second pass mangling the first.
 */
export function redact(text: string): string {
    let out = text
    for (const rule of RULES) out = out.replace(rule.re, rule.to)
    return out
}

/** Redact a value that may be absent, keeping `undefined` as `undefined`. */
export function redactMaybe(text: string | undefined): string | undefined {
    return text === undefined ? undefined : redact(text)
}
