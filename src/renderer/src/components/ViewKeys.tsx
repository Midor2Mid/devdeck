import { useStore, type MainView } from "../store"
import { Icon, type IconName } from "./Icon"

export const DECK_VIEWS: { view: MainView; icon: IconName; name: string; group?: "verify" }[] = [
    { view: "mission", icon: "activity", name: "Mission" },
    { view: "tasks", icon: "list", name: "Tasks" },
    { view: "terminal", icon: "terminal", name: "Terminal" },
    // Verification tools: where you check what an agent did. Grouped apart so the
    // deck reads supervision-first, without costing anyone a keystroke — the
    // order (and so Ctrl+1..7) is unchanged.
    { view: "api", icon: "send", name: "API", group: "verify" },
    { view: "database", icon: "database", name: "Database" },
    { view: "browser", icon: "appWindow", name: "Browser" },
    { view: "editor", icon: "code", name: "Editor" }
]

export function ViewKeys(): JSX.Element {
    const view = useStore((s) => s.view)
    const setView = useStore((s) => s.setView)
    // The stable slice, counted outside the selector: `s.projects.length === 0`
    // in a selector is fine, but returning a derived array or object from one
    // spins forever, so the whole file keeps to slices as a habit.
    const projects = useStore((s) => s.projects)
    // With no project every view resolves to the same panel, so a live key
    // would be a control that visibly does nothing. Disabled carries the form
    // through the existing `button:disabled { opacity: .4 }`, and NO key takes
    // the accent underline - nothing on screen may claim to be active.
    const off = projects.length === 0
    return (
        <div
            className="deck-views"
            role="tablist"
            aria-label="Main view"
            // On the GROUP, not the keys: Chromium dispatches no mouse events
            // from a disabled button, so a data-tip on one would never show.
            // One shared sentence is what the design asks for anyway.
            data-tip={off ? "Add a project to use the views." : undefined}
            data-tip-pos="top"
        >
            {DECK_VIEWS.map((v, i) => (
                <button
                    key={v.view}
                    className={
                        "deck-view" +
                        (!off && view === v.view ? " on" : "") +
                        (v.group === "verify" ? " group-start" : "")
                    }
                    role="tab"
                    disabled={off}
                    aria-selected={!off && view === v.view}
                    data-tip={off ? undefined : `${v.name} (Ctrl+${i + 1})`}
                    data-tip-pos="top"
                    onClick={() => setView(v.view)}
                >
                    <Icon name={v.icon} size={16} />
                    <span className="deck-view-name">{v.name}</span>
                </button>
            ))}
        </div>
    )
}
