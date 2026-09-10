import { useRef } from "react"
import { useStore, type MainView } from "../store"
import { useToasts } from "../toast"
import { Icon, type IconName } from "./Icon"

/**
 * The four keys, in reading order: where am I -> what needs me -> repo facts ->
 * tools. Ctrl+1..4 is this array's index.
 *
 * D1 deleted API and Database and demoted Tasks to the More menu, which took the
 * bar from seven keys to four - and with it the `verify` grouping and its
 * hairline between key 2 and key 3. With four keys the supervise-then-verify
 * order is carried by the order alone, so the hairline was chrome no longer
 * earning its pixel. The `max-width: 959px` label collapse went with it for a
 * harder reason: seven fully-labelled keys measured 590px, four measure ~350,
 * and the window's own minimum is 900 - so that query could never fire again,
 * and DESIGN.md's rule is that a rule nobody can trigger is a rule nobody can
 * trust.
 */
export const DECK_VIEWS: { view: MainView; icon: IconName; name: string }[] = [
    { view: "mission", icon: "activity", name: "Mission" },
    { view: "terminal", icon: "terminal", name: "Terminal" },
    { view: "browser", icon: "appWindow", name: "Browser" },
    { view: "editor", icon: "code", name: "Editor" }
]

/** Why the keys are off, in the words shown on the key itself. */
const OFF_REASON = "open a project to use the views"

/**
 * Whether the view keys can act.
 *
 * Exported because `Ctrl+1..N` in App.tsx must answer this the same way the
 * buttons do, and it did not: the chord bypassed the disabled state entirely,
 * so on first run it moved the topbar to "Terminal" while the first-run panel
 * stayed up and no key lit. One predicate, two callers, no room to drift.
 */
export function viewKeysLive(projects: { id: string }[]): boolean {
    return projects.length > 0
}

export function ViewKeys(): JSX.Element {
    const view = useStore((s) => s.view)
    const setView = useStore((s) => s.setView)
    // The stable slice, counted outside the selector: `s.projects.length === 0`
    // in a selector is fine, but returning a derived array or object from one
    // spins forever, so the whole file keeps to slices as a habit.
    const projects = useStore((s) => s.projects)
    const addProject = useStore((s) => s.addProject)
    const pushToast = useToasts((s) => s.push)
    const dismissToast = useToasts((s) => s.dismiss)
    // At most one "nothing happened" toast on screen: four inert keys must not
    // be able to stack four copies of the same sentence.
    const lastToast = useRef<string | null>(null)
    // With no project every view resolves to the same panel, so a live key
    // would be a control that visibly does nothing. NO key takes the accent
    // underline while off - nothing on screen may claim to be active.
    const off = !viewKeysLive(projects)
    return (
        <div
            className="deck-views"
            role="tablist"
            aria-label="Main view"
        >
            {DECK_VIEWS.map((v, i) => (
                <button
                    key={v.view}
                    className={"deck-view" + (!off && view === v.view ? " on" : "")}
                    role="tab"
                    // `aria-disabled`, not `disabled`, and that is the whole
                    // fix: Chromium dispatches no mouse OR focus events from a
                    // disabled button, so on first run - every key off - these
                    // four glyphs could not be named by hovering, by Tab, or
                    // by a screen reader, at the first moment of the product.
                    // aria-disabled keeps the key focusable and hoverable and
                    // still announces "unavailable", so the tip and the label
                    // below can be read; the guard on the click is what makes
                    // it inert (Enter/Space on a focused button still fires).
                    aria-disabled={off || undefined}
                    aria-selected={!off && view === v.view}
                    // Permanent, in both states, and it survives the label
                    // collapsing at narrow widths - `display: none` takes the
                    // visible text out of the accessibility tree with it.
                    aria-label={off ? `${v.name} - ${OFF_REASON}` : `${v.name} (Ctrl+${i + 1})`}
                    data-tip={off ? `${v.name} - ${OFF_REASON}` : `${v.name} (Ctrl+${i + 1})`}
                    data-tip-pos="top"
                    onClick={() => {
                        if (off) {
                            // The reason is on the key, but only in a tooltip
                            // that wants a 420ms hover - and a stranger clicks
                            // first. Keys that answer a click with
                            // nothing at all was the product's first ten
                            // seconds, so the click answers for itself, and the
                            // answer worth giving is the fix rather than a
                            // second copy of the reason. `off` is
                            // `projects.length === 0`, which is exactly the
                            // condition under which the deck's own empty
                            // control offers the folder dialog, so this offers
                            // the same act.
                            if (lastToast.current) dismissToast(lastToast.current)
                            lastToast.current = pushToast({
                                text: `No project is open, so ${v.name} has nothing to show yet.`,
                                actionLabel: "Open folder…",
                                onAction: () => void addProject()
                            })
                            return
                        }
                        setView(v.view)
                    }}
                >
                    <Icon name={v.icon} size={16} />
                    <span className="deck-view-name">{v.name}</span>
                </button>
            ))}
        </div>
    )
}
