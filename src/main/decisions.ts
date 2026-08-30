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
import type { DecisionOption, DecisionView } from "../shared/decision"
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
