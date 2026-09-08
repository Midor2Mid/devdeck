import { useCallback } from "react"
import { deckKeyStatus, type DeckKeyStatus } from "./deck"
import { useStore, type AgentStatus } from "./store"
import { exitCodeOf } from "./termExit"

/**
 * What a session IS, for the surface about to say something about it.
 *
 * Takes anything with a termId and the store's status for it - a session, or a
 * `{ termId, status }` pair assembled from `agentStatus` - so a tab, a pane, a
 * card, a row and a palette entry all ask the one question the same way.
 */
export type KeyStatusOf = (s: { termId: string; status: AgentStatus }) => DeckKeyStatus

/**
 * The ONE place a renderer surface turns a session into a status it may paint.
 *
 * `deckKeyStatus` was already the single derivation, but every consumer reached
 * it by writing the same three-fact call itself - subscribe to `paneHold`, read
 * `exitCodeOf`, pass `s.status` - and eleven surfaces did not write it at all.
 * They painted `s.status`, which is what the agent last DID and outlives the
 * process that did it: a restored or exited session went on wearing `idle`, the
 * resting form of a LIVE agent, on the deck, in Overview, on the tab strip, in
 * a Mission tile, on a board card, in the palette's ranking and inside the
 * composer's target list, where it was still selectable as a send target.
 *
 * So the call pattern itself is what lives here now. A surface asks
 * `keyStatusOf(session)` and cannot answer "is there a process behind this" for
 * itself - which is the question this app has already answered five different
 * ways in five different places.
 *
 * Two facts, one reactive and one not, and that asymmetry is the reason this is
 * a hook rather than a plain function:
 *   - `paneHold` is store state. A pty exit stamps it ("restart") and a
 *     workspace restore fills it ("resume"), so subscribing to that slice is
 *     what repaints a surface whose process went away. It is a stable slice
 *     reference between changes, which is what lets the returned callback keep
 *     its identity and sit safely in a `useMemo` dependency list - a selector
 *     that built a fresh object or array per render is the loop neither the
 *     build nor the typecheck catches.
 *   - `exitCodeOf` is a module Map (termExit) with no subscription of its own.
 *     It does not need one: the same exit that records a code also stamps
 *     `paneHold`, so the repaint above covers both.
 */
export function useKeyStatus(): KeyStatusOf {
    const paneHold = useStore((s) => s.paneHold)
    return useCallback(
        (s) => deckKeyStatus(s.status, exitCodeOf(s.termId), paneHold[s.termId]),
        [paneHold]
    )
}
