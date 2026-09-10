import { useStore } from "../store"
import { toast } from "../toast"
import { Icon } from "./Icon"
import { awaitedTermIds, getLastAt, promptFor } from "../missionTail"
import { exitCodeOf } from "../termExit"
import { useKeyStatus } from "../keyStatus"
import { wantsYou } from "../tileState"
import { wantsYouLabel } from "../deck"

/**
 * The deck bar's wants-you control: the count, the word, and the door.
 *
 * This is the product's whole promise, and until D1 it was a 12px flag glyph in
 * the bottom-right corner of the window beside the git branch, with the act it
 * invites buried in the command palette. It now sits immediately after the view
 * keys, where the bar reads where-am-I -> what-needs-me -> repo facts -> tools.
 *
 * Three rules it must not break:
 *
 *   1. **It renders nothing at zero.** The marker only ever adds, so its
 *      presence is itself the signal and there is no "0 want you" to learn to
 *      ignore. `wantsYouLabel` owns that, and `tests/deck.test.ts` pins it.
 *   2. **It reads `wantsYou` (tileState) and nothing else.** Mission's header
 *      counts the same predicate. Two numbers for one question, on one screen,
 *      disagreeing by construction is a defect this app has already paid to fix
 *      once.
 *   3. **It cannot claim a door that is not there.** `jumpToPending` reports
 *      whether it actually moved, and this says so when it did not - see the
 *      click handler.
 */
export function DeckWants(): JSX.Element | null {
    const sessions = useStore((s) => s.sessions)
    // Stable slices only. Every derived value below is computed in the component
    // body, never inside a selector: a selector returning a fresh array or
    // object spins forever, and neither the build nor the typecheck sees it.
    const seen = useStore((s) => s.seen)
    const boardTasks = useStore((s) => s.boardTasks)
    const pipelineRun = useStore((s) => s.pipelineRun)
    const termAgents = useStore((s) => s.termAgents)
    // `wantsYou`'s `held` - the other half of `hasProcess`. Subscribed here (and
    // it is the slice `useKeyStatus` reads too) so the count repaints the moment
    // a process goes away rather than nagging about a corpse.
    const paneHold = useStore((s) => s.paneHold)
    // The single derivation. `deckKeyStatus` is deliberately not called here:
    // `useKeyStatus` is its one caller and `tests/signalSites.test.ts` pins that.
    const keyStatusOf = useKeyStatus()

    const now = Date.now()
    const awaited = awaitedTermIds(boardTasks, pipelineRun)
    const count = sessions().filter((s) =>
        wantsYou(
            {
                status: s.status,
                // Without this the count cannot see a session blocked on a
                // permission prompt that was acknowledged as a quiet hand-back.
                prompt: promptFor(s, keyStatusOf(s)),
                exitCode: exitCodeOf(s.termId),
                lastAt: getLastAt(s.termId),
                awaited: awaited.has(s.termId),
                // "This tab is an agent", not "this agent is running" - a pane
                // whose process died keeps it. `held` is the other half.
                alive: !!termAgents[s.termId],
                held: paneHold[s.termId]
            },
            now,
            !!seen[s.termId]
        )
    ).length

    const label = wantsYouLabel(count)
    if (!label) return null

    const tip =
        "Agent sessions that want you — asking a question, or finished a turn." +
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
                // find out there wasn't one. Two ways that happens, and both are
                // real: a session can stop wanting you between the paint and the
                // click, and `wantsYou` counts a STALL - an agent silent too
                // long - which carries no `waiting`/`attention` status for
                // `jumpToPending` to find. Saying so is the only honest answer;
                // a click that silently does nothing is the class of lie this
                // control exists to remove.
                if (!useStore.getState().jumpToPending()) {
                    toast("Nothing to jump to — the sessions that want you have no pending turn to open.")
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
