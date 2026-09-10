/**
 * Correlating a declared attention signal to a DevDeck session.
 *
 * A hook arrives OUT OF BAND. Every other fact DevDeck has about a session came
 * up its own pty, where the id is the channel; this one arrives on a socket from
 * an HTTP client that has to say which session it is talking about. Getting that
 * wrong attributes a question to the wrong agent, which is worse than not
 * knowing: the user goes to the pane DevDeck named, finds nothing waiting, and
 * the one claim this product makes is now a claim they have personally seen fail.
 * So every rule here either resolves to exactly one live session or resolves to
 * none, and "none" is reported rather than guessed at.
 *
 * WHAT THE TOKEN IS AND IS NOT. The bearer check happens upstream, in
 * `mcpserver.ts`, against the same constant-time `tokenOk` the remote server
 * uses; that is the trust boundary, and anything holding the token can already
 * call DevDeck's MCP tools. The session matching below is ADDRESSING, not a
 * second security boundary, and it is written down that way so nobody later
 * mistakes it for one. What keeps a token-holder from doing damage through this
 * route is that the route has no damaging capability: it sets a UI state and
 * writes nothing to a pty, ever (`tests/attentionHook.test.ts` records pty
 * writes and asserts the absence, because a no-op mock cannot show it).
 *
 * NOTHING LEAVES THE MACHINE. This module receives; it has no client, no
 * request, no socket of its own. That is scanned for, not asserted — see the
 * egress scan in `tests/attentionHook.test.ts`.
 */
import {
    parseHook,
    type DeclaredSignal,
    type MatchedBy,
    type ParsedHook,
    SESSION_HEADER
} from "../shared/attention"

/** One live pty, as the correlator needs to see it. */
export interface LiveSession {
    id: string
    /** The cwd the pty was actually spawned into, resolved. */
    cwd: string
    /** The agent preset this session runs, if any. Plain shells have none. */
    agentId?: string
}

export interface AttentionDeps {
    /** Live ptys, read fresh per hook — a session can die between two events. */
    liveSessions: () => LiveSession[]
    /** Hand the signal to the renderer. */
    emit: (signal: DeclaredSignal) => void
    /** Injected so the stamp is testable. */
    now?: () => number
}

let deps: AttentionDeps = { liveSessions: () => [], emit: () => {} }

export function setDeps(d: AttentionDeps): void {
    deps = d
}

/**
 * CLI session id -> DevDeck session id, learned from an exact match.
 *
 * Why this exists. The exact channel is an env var DevDeck put into the pty and
 * the hook config interpolates into a header — but a user can configure the
 * hook without the header (an older DevDeck's docs, a hand-written settings
 * file, a matcher copied from a blog post), and a pane whose shell was already
 * running when the server started has no `DEVDECK_SESSION` in its environment at
 * all. In those cases the FIRST event that does match exactly teaches this map,
 * and every later event in the same CLI session inherits that exactness for
 * free. It never upgrades a guess: only a `session-env` match writes here.
 *
 * Bounded, and self-cleaning at read time rather than on a pty-exit hook: a
 * binding whose DevDeck session is no longer live is dropped when it is next
 * looked up, so nothing has to remember to unregister. A hook for a dead
 * session then falls through to the cwd rule and, normally, to "unmatched" —
 * which is the honest answer.
 */
const bindings = new Map<string, string>()
const MAX_BINDINGS = 200

/** Test seam: the map outlives a module import, so a case could leak into the next. */
export function __resetBindingsForTest(): void {
    bindings.clear()
}

function bind(cliSession: string, termId: string): void {
    if (bindings.get(cliSession) === termId) return
    bindings.delete(cliSession)
    bindings.set(cliSession, termId)
    // Insertion-ordered, so the oldest binding is the first key.
    while (bindings.size > MAX_BINDINGS) {
        const oldest = bindings.keys().next()
        if (oldest.done) break
        bindings.delete(oldest.value)
    }
}

/**
 * Compare two cwds the way the filesystem this ships on does.
 *
 * Windows-first: paths differ in separator (`C:\repos\x` from a PowerShell pane,
 * `C:/repos/x` from the same CLI under Git Bash) and in case, and both spellings
 * name one directory. Not `realpath`: this is a comparison between two strings
 * DevDeck and a CLI each produced for the same pane, not a decision about
 * whether a path is allowed — no filesystem call belongs on the hook path.
 */
function sameDir(a: string, b: string): boolean {
    const norm = (p: string): string =>
        p.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
    const x = norm(a)
    return !!x && x === norm(b)
}

export interface Attribution {
    termId: string | null
    matchedBy: MatchedBy
}

/**
 * Which DevDeck session is this hook about?
 *
 * Three rules, strongest first, and every one of them ends at a session that is
 * LIVE right now:
 *
 *  1. `session-env` — the hook sent back the id DevDeck put in its environment
 *     (`X-DevDeck-Session`, or `devdeck_session` in the body for a wrapper that
 *     cannot set headers). Exact by construction; there is nothing to infer.
 *  2. `cli-session` — this CLI session id was bound by an earlier rule-1 match.
 *     Exact, inherited.
 *  3. `cwd` — the reported directory matches exactly ONE live agent session.
 *     Still not an inference about behaviour: it is an addressing lookup with a
 *     uniqueness proof attached, and the proof is the whole point. DevDeck's
 *     premise is several agents in one repo, so this rule refuses the moment
 *     there are two — a coin-flip between two live agents is precisely the
 *     mis-attribution this module exists to avoid.
 *
 * Otherwise `null`, and the caller says so out loud.
 */
export function attribute(hook: ParsedHook, headerSession: string): Attribution {
    const live = deps.liveSessions()
    const liveById = new Map(live.map((s) => [s.id, s]))

    const claimed = headerSession.trim() || hook.declaredSession || ""
    if (claimed && liveById.has(claimed)) {
        if (hook.sessionId) bind(hook.sessionId, claimed)
        return { termId: claimed, matchedBy: "session-env" }
    }

    if (hook.sessionId) {
        const bound = bindings.get(hook.sessionId)
        if (bound && liveById.has(bound)) return { termId: bound, matchedBy: "cli-session" }
        // The binding names a session that is gone. Drop it here rather than
        // wiring a pty-exit listener: a stale binding must never resolve, and
        // this is the only place that would notice.
        if (bound) bindings.delete(hook.sessionId)
    }

    if (hook.cwd) {
        // Agent sessions only. A shell pane sharing the repo is not a candidate
        // for "which agent asked this", and counting it would make an otherwise
        // unique match ambiguous — refusing a hook because a plain terminal
        // happened to be open in the same folder is the wrong failure.
        const inDir = live.filter((s) => s.agentId && sameDir(s.cwd, hook.cwd as string))
        if (inDir.length === 1) return { termId: inDir[0].id, matchedBy: "cwd" }
    }

    return { termId: null, matchedBy: "none" }
}

/** What the route tells the client, in a header. Never in a body — see below. */
export type HookOutcome = "accepted" | "unmatched" | "ignored" | "invalid"

/**
 * Take one hook body. Returns the outcome for the response header only.
 *
 * THE OUTCOME NEVER GOES IN A RESPONSE BODY, and that is not style. Claude Code
 * feeds an HTTP hook's response back through the same output contract as a
 * command hook's stdout, and for several events (`UserPromptSubmit`,
 * `SessionStart`, and per the current reference page `Stop`/`SubagentStop`) that
 * output is ADDED TO THE MODEL'S CONTEXT. A route that answered `{"ok":true}`
 * would be injecting text into the agent it is supposed to be observing, and a
 * route that answered `{"error":...}` would be injecting DevDeck's internal
 * state. An empty body cannot be injected on any vendor, under any flag, so the
 * route sends none — `mcpserver.ts` holds that half.
 */
export function ingest(raw: unknown, headerSession: string): HookOutcome {
    const parsed = parseHook(raw)
    if (parsed.kind === "invalid") return "invalid"
    const at = (deps.now ?? Date.now)()

    if (parsed.kind === "ignored") {
        // Accepted, and silent on every surface — but run through `attribute`
        // anyway, FOR THE BINDING. `SessionStart` is the event that earns this:
        // it declares nothing to paint, it arrives first, and it carries the
        // exact header, so binding here is what lets every later event of the
        // run correlate even if the header goes missing. The returned
        // attribution is deliberately unused; the map write is the whole call.
        attribute(
            { state: "working", event: parsed.event, sessionId: parsed.sessionId, cwd: parsed.cwd },
            headerSession
        )
        return "ignored"
    }

    const { termId, matchedBy } = attribute(parsed.hook, headerSession)
    deps.emit({
        termId,
        state: parsed.hook.state,
        matchedBy,
        at,
        event: parsed.hook.event,
        message: parsed.hook.message,
        sessionId: parsed.hook.sessionId,
        transcriptPath: parsed.hook.transcriptPath,
        cwd: parsed.hook.cwd
    })
    return termId ? "accepted" : "unmatched"
}

/** The header name the route reads the claimed session from. */
export const HOOK_SESSION_HEADER = SESSION_HEADER
