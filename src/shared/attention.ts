/**
 * CLI-declared attention signals: the wire shape, and the only place that
 * decides what an agent CLI's hook event MEANS.
 *
 * Why this exists at all. Everything DevDeck says about "which agent needs me"
 * is currently INFERRED from pty bytes — output means working, `agentIdleMs` of
 * silence means the turn ended, a BEL means a question. That inference has now
 * produced four separate defects (a glance clearing a live question, a remount's
 * replay manufacturing a hand-back, an OSC sequence cut mid-chunk manufacturing
 * a bell, a replayed transcript aging the silence clock), and every one of them
 * was a false claim on the single question this product exists to answer. An
 * agent CLI can *state* "I am blocked on a question" exactly, over a hook. A
 * statement is not the same evidence as a guess, and this module is where the
 * statement enters DevDeck.
 *
 * Shared, so both halves agree on one wire shape: `main` validates what arrives
 * on the socket, the preload types the channel, and the renderer reads the
 * record. No electron, no node builtins, no DOM — `tests/architectureBoundaries.test.ts`
 * R4 enforces that, which is why the path checks below are regexes rather than
 * `path.isAbsolute`.
 *
 * NOTHING HERE REACHES THE NETWORK, AND THAT IS STRUCTURAL. This module and
 * `main/attention.ts` are scanned by `tests/attentionHook.test.ts` for every
 * outbound-capable API in the language; the hook is an inbound route on a
 * loopback listener and there is no code path from a hook to a socket DevDeck
 * did not already accept a connection on. `product-director` §5 forbids
 * telemetry outright — even anonymous, even for the beta — so the guarantee is
 * a scan the suite fails on, not a sentence in a comment.
 */

import { DEVDECK_TOKEN_ENV } from "./mcpEnv"

/** Env var carrying the DevDeck session id into an agent's own environment. */
export const DEVDECK_SESSION_ENV = "DEVDECK_SESSION"

/**
 * Env var carrying the full hook URL, for CLIs whose hooks are `command`-type
 * only (Codex) and therefore have to `curl` it themselves. Claude Code's `http`
 * hooks do not use it: env interpolation there is documented for HEADER values
 * and not for the url, so `hookSettingsFragment` writes a literal url.
 */
export const DEVDECK_HOOK_URL_ENV = "DEVDECK_HOOK_URL"

/** The one route. Sits on the MCP server's existing 127.0.0.1 listener. */
export const HOOK_PATH = "/hook"

/**
 * Header carrying the DevDeck session id, lower-cased as node delivers it.
 *
 * This is the correlation channel, and it is exact: DevDeck puts
 * `DEVDECK_SESSION` into the pty's environment, the hook config interpolates
 * that var into this header, and the CLI sends it back. It is ADDRESSING, not
 * authentication — see `main/attention.ts` for why that distinction is stated
 * rather than blurred.
 */
export const SESSION_HEADER = "x-devdeck-session"

/** What an agent can say about itself. A strict subset of `AgentStatus`. */
export type DeclaredState = "attention" | "waiting" | "working"

/** How the addressing was resolved. `none` means it was not. */
export type MatchedBy = "session-env" | "cli-session" | "cwd" | "none"

/**
 * One declaration, as it reaches the renderer.
 *
 * `termId` is `null` for a hook DevDeck could not attribute. That case is
 * carried rather than dropped on purpose: a hook that never lands is a SILENT
 * false negative, which the competitive review names as the worst failure class
 * for this product — the user believes they are being told and they are not.
 */
export interface DeclaredSignal {
    /** The DevDeck session this was matched to, or null when it could not be. */
    termId: string | null
    state: DeclaredState
    matchedBy: MatchedBy
    /** ms epoch, stamped by main when the hook arrived — never by the client. */
    at: number
    /** The CLI's own event name, verbatim, for the tooltip. */
    event: string
    /** The agent's own words, if the hook carried any. Capped and cleaned. */
    message?: string
    /** The CLI's own session id, when it sent one. */
    sessionId?: string
    /**
     * Absolute local path to the CLI's own transcript, when it sent one.
     *
     * This is what retires the roadmap's `claude --session-id <uuid>` plan: the
     * hook hands DevDeck the exact transcript for this exact pane, so nothing
     * has to inject a flag into the user's launch command and `usage.ts` stops
     * guessing which `.jsonl` under `~/.claude/projects` belongs to which pane.
     *
     * STORED AS AN OPAQUE STRING AND NEVER OPENED. It arrives from an HTTP
     * client, and a guard that reads a string and then hands it to
     * `readFileSync` is the recurring defect in this codebase. Whoever adds the
     * reader re-validates it there, against the real filesystem, with the
     * capability the API already has — not against this regex.
     */
    transcriptPath?: string
    /** The cwd the CLI reported, cleaned. Used for the fallback match. */
    cwd?: string
}

/**
 * Claude Code `hook_event_name` -> what it declares.
 *
 * Only the four events that carry a hand-over fact. `PreToolUse`/`PostToolUse`
 * would also be exact evidence of "working", and they are deliberately absent:
 * they fire per tool call, so a single turn would post dozens of times, and
 * `Stop` + `Notification` + `UserPromptSubmit` already cover every transition
 * DevDeck paints. A hook that fires on every tool call is also a hook whose
 * failure blocks a tool call, which is a cost the signal does not justify.
 *
 * `SessionStart` declares nothing and is still listed: it is accepted so the
 * first event of a session can BIND the CLI's session id to a DevDeck session
 * (see `main/attention.ts`), which is what carries correlation through the rest
 * of the run.
 */
export const HOOK_EVENT_STATES: Record<string, DeclaredState | null> = {
    Notification: "attention",
    Stop: "waiting",
    UserPromptSubmit: "working",
    SessionStart: null
}

/**
 * Claude Code `notification_type` -> what it declares, where it differs from
 * the event's default.
 *
 * `Notification` fires for a dozen reasons and only some of them are "your
 * move". `agent_completed` is a hand-back, not a question. The auth,
 * elicitation-result and quota-resume notifications are not about the user at
 * all, and mapping them to `attention` would put DevDeck straight back into
 * claiming a session wants you when it does not — the exact failure the
 * inference was replaced for.
 */
export const NOTIFICATION_STATES: Record<string, DeclaredState | null> = {
    permission_prompt: "attention",
    idle_prompt: "attention",
    agent_needs_input: "attention",
    elicitation_dialog: "attention",
    elicitation_url_dialog: "attention",
    agent_completed: "waiting",
    auth_success: null,
    elicitation_complete: null,
    elicitation_response: null,
    quota_auto_resume_fired: null,
    quota_auto_resume_stale: null,
    quota_auto_resume_disabled: null
}

/** Caps. A hook payload is metadata; anything larger is a mistake or abuse. */
export const MAX_MESSAGE = 400
export const MAX_PATH = 1024
export const MAX_ID = 200
/** Body cap for the hook route, well under the MCP route's 1 MB. */
export const MAX_HOOK_BODY_BYTES = 64 * 1024

const isDeclaredState = (v: unknown): v is DeclaredState =>
    v === "attention" || v === "waiting" || v === "working"

/**
 * Strip control characters and collapse whitespace, then cap.
 *
 * Every string here is shown to the user, and one of them is the agent's own
 * last message — which is arbitrary model output containing newlines, ANSI and
 * anything else. A raw value would let a hook draw with escape sequences on a
 * surface that is not a terminal.
 */
function clean(v: unknown, cap: number): string | undefined {
    if (typeof v !== "string") return undefined
    // eslint-disable-next-line no-control-regex
    const flat = v.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim()
    if (!flat) return undefined
    return flat.length > cap ? flat.slice(0, cap - 1) + "…" : flat
}

/** An id we are willing to echo back and key a Map on. */
function cleanId(v: unknown): string | undefined {
    if (typeof v !== "string") return undefined
    const t = v.trim()
    if (!t || t.length > MAX_ID) return undefined
    return /^[A-Za-z0-9._:-]+$/.test(t) ? t : undefined
}

/**
 * An absolute path, as a string, with no attempt to touch the filesystem.
 *
 * Windows drive-letter, UNC and POSIX forms, because a hook can arrive from a
 * CLI running under Git Bash or WSL on the same machine. A NUL byte is refused
 * outright: it is the classic way to make one string look like two to different
 * layers, and no legitimate path carries one.
 */
function cleanPath(v: unknown): string | undefined {
    if (typeof v !== "string") return undefined
    const t = v.trim()
    if (!t || t.length > MAX_PATH || t.includes("\u0000")) return undefined
    return /^([A-Za-z]:[\\/]|\\\\|\/)/.test(t) ? t : undefined
}

/** A validated hook, minus the correlation main has yet to do. */
export interface ParsedHook {
    state: DeclaredState
    event: string
    message?: string
    sessionId?: string
    transcriptPath?: string
    cwd?: string
    /** The session id the CLI was told to send back, from the body. */
    declaredSession?: string
}

export type ParseResult =
    /** Understood, and it says something about the session's state. */
    | { kind: "signal"; hook: ParsedHook }
    /**
     * Understood, and it declares nothing to paint — `SessionStart`, an
     * `auth_success` notification, an event this build does not map. Accepted
     * (a hook must never look broken to the CLI that sent it) and silent: an
     * activity row per ignored event would be noise, and a chatty vendor could
     * fill the feed with it.
     */
    | { kind: "ignored"; event: string; sessionId?: string; cwd?: string }
    /** Not a hook payload at all. */
    | { kind: "invalid"; reason: string }

/**
 * Validate one hook body. Every field is checked; nothing is trusted.
 *
 * Two accepted shapes, and the second is the reason this is not hard-coded to
 * one vendor:
 *  - a CLI's native hook payload, discriminated by `hook_event_name`;
 *  - DevDeck's own explicit `{ state, event }`, for a CLI whose hooks are
 *    `command`-type only and has to be wrapped by hand (Codex), or a vendor
 *    whose event names this build has never heard of.
 *
 * The explicit form is checked FIRST so a wrapper can override a mapping this
 * build gets wrong, without waiting for a DevDeck release.
 */
export function parseHook(raw: unknown): ParseResult {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { kind: "invalid", reason: "body is not a JSON object" }
    }
    const b = raw as Record<string, unknown>
    const event =
        clean(b.hook_event_name, 64) ?? clean(b.event, 64) ?? (b.state ? "declared" : undefined)
    if (!event) return { kind: "invalid", reason: "no hook_event_name and no state" }

    const sessionId = cleanId(b.session_id)
    const cwd = clean(b.cwd, MAX_PATH)
    const common = { event, sessionId, cwd }

    let state: DeclaredState | null | undefined
    if (b.state !== undefined) {
        if (!isDeclaredState(b.state)) {
            return { kind: "invalid", reason: "state must be attention, waiting or working" }
        }
        state = b.state
    } else if (event === "Notification") {
        // The event alone is not enough here: a `Notification` can be a
        // permission prompt (your move) or an auth success (not about you).
        // An unmapped notification_type falls back to the event's default
        // rather than being dropped — a vendor adding a new "needs input"
        // notification should reach the user, and the cost of the wrong
        // direction is a false attention claim.
        const nt = clean(b.notification_type, 64)
        state = nt !== undefined && nt in NOTIFICATION_STATES
            ? NOTIFICATION_STATES[nt]
            : HOOK_EVENT_STATES.Notification
    } else {
        state = event in HOOK_EVENT_STATES ? HOOK_EVENT_STATES[event] : undefined
    }

    if (state === undefined || state === null) return { kind: "ignored", ...common }

    return {
        kind: "signal",
        hook: {
            state,
            ...common,
            // In vendor order of specificity. `notification_text` is the
            // sentence Claude Code shows the user itself, so it is the closest
            // thing to the question being asked; `last_assistant_message` is
            // the whole final message and is capped hard.
            message:
                clean(b.notification_text, MAX_MESSAGE) ??
                clean(b.message, MAX_MESSAGE) ??
                clean(b.last_assistant_message, MAX_MESSAGE) ??
                clean(b.user_input, MAX_MESSAGE),
            transcriptPath: cleanPath(b.transcript_path),
            declaredSession: cleanId(b.devdeck_session)
        }
    }
}

/**
 * The exact `hooks` block to merge into a project's
 * `.claude/settings.local.json`.
 *
 * A function rather than a doc snippet so `docs/hooks.md` and any future writer
 * read one source, and so the documented example is pinned by a test instead of
 * drifting the first time the route or a header name changes.
 *
 * Four decisions worth the words:
 *
 *  - **The url is a literal**, not `${DEVDECK_HOOK_URL}`. Claude Code documents
 *    `$VAR` interpolation for HTTP hook HEADER values; it does not document it
 *    for the url, and a url that silently interpolated to nothing would be a
 *    hook that never fires, which is this feature's worst failure.
 *  - **`allowedEnvVars` is mandatory, not optional.** An env var not listed
 *    there is replaced with an EMPTY STRING rather than left alone, so omitting
 *    it would send a blank token and a blank session id — an unauthorised hook
 *    that also could not be correlated.
 *  - **A short `timeout`.** DevDeck answers on loopback in microseconds. The
 *    default is 600 seconds, and the one thing a supervision feature must never
 *    do is hold up the agent it is supervising.
 *  - **`X-DevDeck-Session` is what makes correlation exact.** Without it a hook
 *    can only be matched by cwd, and DevDeck's whole premise is several agents
 *    in one repo.
 */
export function hookSettingsFragment(port: number): {
    hooks: Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]>
} {
    const one = {
        type: "http",
        url: `http://127.0.0.1:${port}${HOOK_PATH}`,
        headers: {
            Authorization: `Bearer \${${DEVDECK_TOKEN_ENV}}`,
            "X-DevDeck-Session": `\${${DEVDECK_SESSION_ENV}}`
        },
        allowedEnvVars: [DEVDECK_TOKEN_ENV, DEVDECK_SESSION_ENV],
        timeout: 5
    }
    // An empty matcher on Notification fires for every notification_type, and
    // `parseHook` is what decides which of them mean anything. Filtering here
    // instead would put the mapping in the user's settings file, where a DevDeck
    // release could not correct it.
    return {
        hooks: {
            Notification: [{ hooks: [one] }],
            Stop: [{ hooks: [one] }],
            UserPromptSubmit: [{ hooks: [one] }],
            SessionStart: [{ hooks: [one] }]
        }
    }
}
