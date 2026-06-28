import { useStore, type MainView } from "../store"
import { useSettings } from "../settings"
import { Icon, type IconName } from "./Icon"

/**
 * Slim icon rail — the app's primary navigation. Top group switches the main
 * view (terminal / editor / API / database / browser); bottom group opens the
 * cross-cutting tools (work, activity, standup, release, shortcuts, settings).
 * Replaces the old text view-tabs + sidebar header buttons.
 */
const VIEW_NAV: { view: MainView; icon: IconName; label: string }[] = [
    { view: "terminal", icon: "terminal", label: "Terminals" },
    { view: "editor", icon: "code", label: "Editor" },
    { view: "api", icon: "send", label: "API client" },
    { view: "database", icon: "database", label: "Database" },
    { view: "browser", icon: "appWindow", label: "Browser" }
]

export function Rail(): JSX.Element {
    const view = useStore((s) => s.view)
    const setView = useStore((s) => s.setView)
    const setWorkOpen = useStore((s) => s.setWorkOpen)
    const setActivityOpen = useStore((s) => s.setActivityOpen)
    const setStandupOpen = useStore((s) => s.setStandupOpen)
    const setReleaseOpen = useStore((s) => s.setReleaseOpen)
    const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
    const openSettings = useSettings((s) => s.openSettings)

    return (
        <nav className="rail" aria-label="Primary">
            <div className="rail-logo" title="DevDeck">
                D
            </div>
            <div className="rail-group">
                {VIEW_NAV.map((v) => (
                    <button
                        key={v.view}
                        className={"rail-btn" + (view === v.view ? " on" : "")}
                        title={v.label}
                        onClick={() => setView(v.view)}
                    >
                        <Icon name={v.icon} size={20} />
                    </button>
                ))}
            </div>
            <div className="rail-spacer" />
            <div className="rail-group">
                <button className="rail-btn" title="Work — Jira / Azure items" onClick={() => setWorkOpen(true)}>
                    <Icon name="work" size={20} />
                </button>
                <button className="rail-btn" title="Activity feed" onClick={() => setActivityOpen(true)}>
                    <Icon name="activity" size={20} />
                </button>
                <button className="rail-btn" title="Standup / worklog" onClick={() => setStandupOpen(true)}>
                    <Icon name="list" size={20} />
                </button>
                <button className="rail-btn" title="Release board" onClick={() => setReleaseOpen(true)}>
                    <Icon name="release" size={20} />
                </button>
                <button className="rail-btn" title="Keyboard shortcuts (F1)" onClick={() => setShortcutsOpen(true)}>
                    <Icon name="help" size={20} />
                </button>
                <button className="rail-btn" title="Settings" onClick={() => openSettings()}>
                    <Icon name="settings" size={20} />
                </button>
            </div>
        </nav>
    )
}
