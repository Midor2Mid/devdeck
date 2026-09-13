import { type DeckKeyStatus } from "../deck"
import { blockedWord, saidTip } from "../declaredSignal"
import type { DeclaredSignal } from "../../../shared/attention"

/**
 * The WORD for a session that is blocked on you.
 *
 * The Overview rail row has said "needs you" / "waiting for you" since it was
 * written; the focus header and the grid card said nothing, and carried the
 * state on the 6px dot alone. That was survivable only while the waiting dot
 * breathed. It is static now (deliberately: motion was the only thing telling
 * waiting from working in a still frame, which is the defect that got fixed),
 * and Overview has no nag channel of its own — no breathing key, no wants-you
 * flag — so on those heads `waiting` had no legible marker left at all.
 * DESIGN.md's rule for that situation is to prefer a word, and they have room
 * for one.
 *
 * One component rather than four copies, and why it left OverviewView for its
 * own file on 2026-09-14: the merged palette's session rows are a FOURTH head
 * that has to say this, and a component private to one view is a component the
 * next surface re-types. The three heads and the palette row cannot come to
 * describe one state differently — the failure this component was extracted to
 * prevent in the first place, now prevented across two files instead of one.
 *
 * `null` for every other status: the marker only ever ADDS, and a session that
 * is working or resting or dead is not blocked on you. `not-running` in
 * particular must not appear here — it says nothing is listening.
 *
 * Takes the DERIVED status (`useKeyStatus`), because "blocked on you" is a
 * claim about a live process and `s.status` outlives the one that made it.
 *
 * PROVENANCE RIDES THE SAME WORDS, as a verb: `needs you` is DevDeck's reading
 * of the terminal, `says it needs you` is the agent stating it over the hook.
 * That is the whole marker — no sixth dot form, no accent, no new token, and
 * nothing a stranger has to look up. `blockedWord` owns both halves.
 */
export function StatusFlag({
    status,
    said,
    block
}: {
    status: DeckKeyStatus
    /** The agent's own declaration for this status, or null if DevDeck inferred it. */
    said?: DeclaredSignal | null
    block?: boolean
}): JSX.Element | null {
    const word = blockedWord(status, said ?? null)
    if (!word) return null
    return (
        <span
            className={"ov-flag " + status + (block ? " ov-ri-flag" : "")}
            data-tip={said ? saidTip(said) : undefined}
        >
            {word}
        </span>
    )
}
