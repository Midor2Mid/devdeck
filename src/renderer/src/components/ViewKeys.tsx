import { useStore, type MainView } from "../store"
import { Icon, type IconName } from "./Icon"

export const DECK_VIEWS: { view: MainView; icon: IconName; name: string; group?: "verify" }[] = [
    { view: "mission", icon: "activity", name: "Mission" },
    { view: "tasks", icon: "list", name: "Tasks" },
    { view: "terminal", icon: "terminal", name: "Terminal" },
    // Verification tools: where you check what an agent did. Grouped apart so the
    // deck reads supervision-first, without costing anyone a keystroke — the
    // order (and so Ctrl+1..7) is unchanged. The group is now marked on all four,
    // not just the first: it is what the responsive collapse drops labels from,
    // and the hairline is drawn from "first of the group" instead.
    { view: "api", icon: "send", name: "API", group: "verify" },
    { view: "database", icon: "database", name: "Database", group: "verify" },
    { view: "browser", icon: "appWindow", name: "Browser", group: "verify" },
    { view: "editor", icon: "code", name: "Editor", group: "verify" }
]

/** Index of the first verify key — where the group hairline is drawn. */
const FIRST_VERIFY = DECK_VIEWS.findIndex((v) => v.group === "verify")

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
                    className={
                        "deck-view" +
                        (!off && view === v.view ? " on" : "") +
                        (v.group === "verify" ? " verify" : "") +
                        (i === FIRST_VERIFY ? " group-start" : "")
                    }
                    role="tab"
                    // `aria-disabled`, not `disabled`, and that is the whole
                    // fix: Chromium dispatches no mouse OR focus events from a
                    // disabled button, so on first run - every key off - these
                    // seven glyphs could not be named by hovering, by Tab, or
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
                        if (off) return
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
