import { useEffect } from "react"
import { useStore } from "../store"
import { toast } from "../toast"
import { Icon } from "./Icon"
import { wantsYouLabel } from "../deck"

/**
 * The deck bar's wants-you control: the count, the word, and the door.
 *
 * This is the product's whole promise, and until D1 it was a 12px flag glyph in
 * the bottom-right corner of the window beside the git branch, with the act it
 * invites buried in the command palette. It now sits immediately after the view
 * keys, where the bar reads where-am-I -> what-needs-me -> repo facts -> tools.
 *
 * Four rules it must not break:
 *
 *   1. **It renders nothing at zero.** The marker only ever adds, so its
 *      presence is itself the signal and there is no "0 want you" to learn to
 *      ignore. `wantsYouLabel` owns that, and `tests/deck.test.ts` pins it.
 *   2. **It does not derive the count.** `store.wantsCount()` does, over
 *      `wantKind`, and the taskbar badge and Ctrl+Shift+J read the same answer.
 *      The assembly used to live in this file, which is how the chord came to
 *      filter a different set from the one this number counted - and why the
 *      count could promise a door the click could not open. A number a
 *      component builds is also a number no unit test can reach, and this repo
 *      has no component tests.
 *   3. **It cannot claim a door that is not there.** `jumpToPending` reports
 *      whether it actually moved, and this says so when it did not.
 *   4. **The badge is this number, not a second one.** See the effect below.
 */
export function DeckWants(): JSX.Element | null {
    // Repaint subscriptions, and nothing else. The count itself is derived in
    // the store, which is not reactive - so these are the slices whose change
    // has to bring this component back for another look. `seen` and `paneHold`
    // are read by the derivation; `boardTasks` and `pipelineRun` are what make
    // a session `awaited`, which is what turns silence into a stall. Sessions
    // and statuses arrive through Deck's own subscriptions one level up.
    //
    // Stable slices only. Nothing here is computed inside a selector: a
    // selector returning a fresh array or object spins forever, and neither the
    // build nor the typecheck sees it.
    const seen = useStore((s) => s.seen)
    const paneHold = useStore((s) => s.paneHold)
    const boardTasks = useStore((s) => s.boardTasks)
    const pipelineRun = useStore((s) => s.pipelineRun)
    void seen
    void paneHold
    void boardTasks
    void pipelineRun

    const wantsCount = useStore((s) => s.wantsCount)
    const syncBadge = useStore((s) => s.syncBadge)
    const count = wantsCount()

    // The Windows taskbar overlay badge - the same count, for the moment you
    // are not looking at DevDeck at all. It rides this component's renders
    // rather than a clock of its own, which is the only way it cannot disagree
    // with the words below: one number, one repaint, two channels. `syncBadge`
    // re-reads `wantsCount()` rather than taking the number, so there is no
    // argument position in which a future edit could hand the badge something
    // else; `count` is the dependency because it is what changed.
    useEffect(() => {
        syncBadge()
    }, [count, syncBadge])

    const label = wantsYouLabel(count)
    if (!label) return null

    const tip =
        "Agent sessions that want you — asking a question, stalled, or finished a turn." +
        " Click to open the one waiting longest (Ctrl+Shift+J)."

    return (
        <button
            type="button"
            className="deck-wants"
            aria-label={tip}
            data-tip={tip}
            data-tip-pos="top"
            onClick={() => {
                // The tooltip promises a door, so the click has to be able to
                // find out there wasn't one. Exactly one way that still
                // happens: a session can stop wanting you between the paint and
                // the click. The other one - the count including a stall the
                // jump could not find - is gone, because both now read
                // `wantKinds`. Saying so is still the only honest answer to a
                // click that moved nothing.
                if (!useStore.getState().jumpToPending()) {
                    toast("Nothing to jump to — the session that wanted you no longer does.")
                }
            }}
        >
            <span className="deck-wants-flag">
                <Icon name="flag" size={12} />
            </span>
            {label}
        </button>
    )
}
