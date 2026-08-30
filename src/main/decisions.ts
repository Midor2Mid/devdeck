// A permission prompt main is prepared to have answered from somewhere that is
// not this screen — today, a paired phone. Three properties do the work:
//
//   1. It is only minted for a session already flagged "attention"/"waiting".
//      This is main's copy of `promptFor`'s gate (missionTail.ts). The renderer
//      has always had it; main must not ship the capability without it.
//   2. It carries the answer tokens, so a remote client never supplies one.
//   3. It is bound to `tailHash` — the exact text the classifier read. Over a
//      phone link, minutes pass between the card being shown and the tap. If the
//      TUI redrew or somebody answered at the desk, the digit no longer means
//      what the card said, and we refuse rather than fire it blind.
import { detectApproval } from "../shared/approval"
import type { DecisionOption, DecisionSnapshot, DecisionView } from "../shared/decision"
import { getTail, tailDigest } from "./pty"

/** The window the classifier reads. Same 16 lines the Overview has always read. */
const WINDOW = 16

export type RemoteOption = DecisionOption

/**
 * Main's full record of a decision. It extends `DecisionView` rather than
 * restating it, so what crosses the bridge is literally the same object — a
 * field renamed on one side becomes a typecheck error on the other instead of a
 * card that silently renders `undefined`. The three extra fields are main's own
 * bookkeeping — `termId` and `tailHash` are how a tap is matched back to a live
 * screen — and no surface reads them. A serializer writing to something outside
 * this machine should project to `DecisionView` explicitly rather than hand the
 * whole record over; the Electron bridge does not, because the renderer already
 * knows every terminal id it is asking about.
 */
export interface PendingDecision extends DecisionView {
    termId: string
    tailHash: string
    createdAt: number
}

const pending = new Map<string, PendingDecision>()
/** id -> termId, so forgetting a session forgets what it spent. */
const consumed = new Map<string, string>()

export function decisionFor(termId: string): PendingDecision | null {
    return pending.get(termId) ?? null
}

/**
 * Forget everything about one session's decision — the live one and the record
 * of any it already spent.
 *
 * The spent record cannot be keyed off `pending` alone: `consumeDecision`
 * deletes the pending entry, so by the time a session is cleared there is
 * nothing left to look the spent id up by, and it would linger forever — a slow
 * leak, and worse, a later identical prompt on that session would be refused as
 * "consumed" when it is in fact a fresh question. Clearing is the only moment we
 * are told the screen is gone, so it is where the record is dropped.
 *
 * This does NOT weaken the once-only rule. Re-minting after a consume happens
 * without a clear (the tail is unchanged, so `refreshDecision` never reaches the
 * clearing branch), which is exactly how a re-shown card still answers
 * "Already answered."
 */
export function clearDecision(termId: string): void {
    pending.delete(termId)
    for (const [id, owner] of consumed) if (owner === termId) consumed.delete(id)
}

/**
 * Re-derive the pending decision for one session. Returns null — and forgets any
 * previous decision — when the session is not eligible or the prompt is gone.
 */
export function refreshDecision(
    termId: string,
    status: string,
    isAgent: boolean
): PendingDecision | null {
    if (!isAgent || (status !== "attention" && status !== "waiting")) {
        clearDecision(termId)
        return null
    }
    const tail = getTail(termId, WINDOW)
    const prompt = detectApproval(tail)
    if (!prompt) {
        clearDecision(termId)
        return null
    }
    const tailHash = tailDigest(termId, WINDOW)
    const prev = pending.get(termId)
    if (prev && prev.tailHash === tailHash) return prev

    const decision: PendingDecision = {
        // The whole digest, not a prefix of it: the id IS the screen binding, and
        // two screens that differ only near the end must not share an id.
        id: "dec:" + termId + ":" + tailHash,
        termId,
        kind: prompt.kind,
        question: prompt.question,
        tail,
        tailHash,
        options: [
            { label: "Approve", send: prompt.approve },
            { label: "Deny", send: prompt.deny }
        ],
        createdAt: Date.now()
    }
    if (prev) consumed.delete(prev.id)
    pending.set(termId, decision)
    return decision
}

/**
 * What the classifier needs to know about a session. `RemoteSession` satisfies
 * it structurally, so main's session snapshot can be passed straight in without
 * this module having to know what a project or a tab is.
 */
export interface DecisionSubject {
    termId: string
    status: string
    isAgent: boolean
}

/** Re-derive every session's decision and return main's whole current answer. */
export function refreshAll(sessions: readonly DecisionSubject[]): DecisionSnapshot {
    const snapshot: DecisionSnapshot = {}
    for (const s of sessions) {
        const d = refreshDecision(s.termId, s.status, s.isAgent)
        if (d) snapshot[s.termId] = d
    }
    return snapshot
}

/**
 * How often main re-reads the screens, in ms.
 *
 * This exists because a status push is NOT sufficient, and reasoning that it
 * was is what made this a bug. store.ts's pty handler reads
 *
 *     if (agentStatus[id] !== "attention" || visible) setStatus(id, "working")
 *
 * so a session ALREADY flagged attention whose pane is not on screen takes no
 * status transition when more output arrives — and no transition means no
 * `mobile:sessions` push, means no re-derivation. That is not an edge case: it
 * is Mission Control's primary case, a background tile you are not looking at.
 * A cache refreshed only by pushes would keep serving the decision minted from
 * the PREVIOUS screen, arbitrarily long. The phone refuses a stale answer
 * because `consumeDecision` re-checks `tailHash`; the desktop's button does not
 * check anything, so on the desktop a stale digit would simply be typed at
 * whatever the agent is asking now.
 *
 * One second, because that is what the surface already assumed. Before main
 * owned classification, the Mission tile re-ran `detectApproval` over the live
 * tail on its own 1s render tick, so 1s is the freshness the desktop has always
 * had — this restores it rather than choosing something new. It is also not new
 * work: `refreshDecision` returns before touching a tail for anything that is
 * not an agent in attention/waiting, and the tile was doing exactly this scan,
 * at exactly this rate, for exactly these sessions. The sha256 in `tailDigest`
 * runs only when a prompt is actually on screen, which is rare and brief.
 *
 * Slower would be worse than it sounds: the whole window between the screen
 * changing and the refresh is time in which the desktop button sends a
 * keystroke meant for a question the agent has moved past. Faster buys nothing,
 * because no surface can render the answer sooner than its own 1s tick.
 */
export const REFRESH_MS = 1000

let timer: ReturnType<typeof setInterval> | undefined
/**
 * The ids of the last snapshot actually broadcast. A decision's id IS its
 * screen (`dec:<termId>:<tailHash>`), so identical ids mean identical content —
 * which makes this an exact, not approximate, change check, and lets the timer
 * stay quiet through the long stretches when nothing is happening.
 */
let lastKey: string | null = null

function snapshotKey(snapshot: DecisionSnapshot): string {
    return Object.keys(snapshot)
        .sort()
        .map((t) => snapshot[t].id)
        .join("|")
}

/**
 * Re-derive every session's decision and hand the result to `onChanged`.
 *
 * `force` is for a push the renderer made: it is asking, so it gets an answer
 * even when nothing changed. That is not a nicety — a renderer that reloaded
 * has an empty cache, and deduplicating its first push would leave it empty
 * until something on screen happened to change.
 */
export function publishDecisions(
    sessions: readonly DecisionSubject[],
    onChanged: (snapshot: DecisionSnapshot) => void,
    force = false
): DecisionSnapshot {
    const snapshot = refreshAll(sessions)
    const key = snapshotKey(snapshot)
    if (force || key !== lastKey) {
        lastKey = key
        onChanged(snapshot)
    }
    return snapshot
}

/**
 * Start re-deriving decisions on main's own clock, from whatever session list
 * `getSessions` returns. Idempotent: starting again replaces the timer rather
 * than running two.
 */
export function startDecisionRefresh(
    getSessions: () => readonly DecisionSubject[],
    onChanged: (snapshot: DecisionSnapshot) => void,
    intervalMs: number = REFRESH_MS
): () => void {
    stopDecisionRefresh()
    timer = setInterval(() => publishDecisions(getSessions(), onChanged), intervalMs)
    return stopDecisionRefresh
}

export function stopDecisionRefresh(): void {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    lastKey = null
}

export type ConsumeResult =
    | { ok: true; send: string; termId: string }
    | { ok: false; reason: "unknown" | "consumed" | "not-an-option" | "moved-on" }

export function consumeDecision(decisionId: string, send: string): ConsumeResult {
    if (consumed.has(decisionId)) return { ok: false, reason: "consumed" }
    const d = [...pending.values()].find((p) => p.id === decisionId)
    if (!d) return { ok: false, reason: "unknown" }
    if (!d.options.some((o) => o.send === send)) return { ok: false, reason: "not-an-option" }
    if (tailDigest(d.termId, WINDOW) !== d.tailHash) return { ok: false, reason: "moved-on" }
    consumed.set(d.id, d.termId)
    pending.delete(d.termId)
    return { ok: true, send, termId: d.termId }
}
