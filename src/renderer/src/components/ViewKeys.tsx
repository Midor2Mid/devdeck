import { useStore, type MainView } from "../store"
import { Icon, type IconName } from "./Icon"

export const DECK_VIEWS: { view: MainView; icon: IconName; name: string; group?: "verify" }[] = [
    { view: "mission", icon: "activity", name: "Mission" },
    { view: "tasks", icon: "list", name: "Tasks" },
    { view: "terminal", icon: "terminal", name: "Terminal" },
    // Verification tools: where you check what an agent did. Grouped apart so the
    // deck reads supervision-first, without costing anyone a keystroke — the
    // order (and so Ctrl+1..8) is unchanged.
    { view: "api", icon: "send", name: "API", group: "verify" },
    { view: "database", icon: "database", name: "Database" },
    { view: "browser", icon: "appWindow", name: "Browser" },
    { view: "network", icon: "globe", name: "Network" },
    { view: "editor", icon: "code", name: "Editor" }
]

export function ViewKeys(): JSX.Element {
    const view = useStore((s) => s.view)
    const setView = useStore((s) => s.setView)
    return (
        <div className="deck-views" role="tablist" aria-label="Main view">
            {DECK_VIEWS.map((v, i) => (
                <button
                    key={v.view}
                    className={
                        "deck-view" +
                        (view === v.view ? " on" : "") +
                        (v.group === "verify" ? " group-start" : "")
                    }
                    role="tab"
                    aria-selected={view === v.view}
                    data-tip={`${v.name} (Ctrl+${i + 1})`}
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
