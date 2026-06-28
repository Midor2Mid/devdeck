import { useStore, type MainView } from "../store"
import { useSettings } from "../settings"
import { Icon, type IconName } from "./Icon"

/**
 * Slim icon rail - the app's primary navigation. Top group switches the main
 * view (terminal / editor / API / database / browser); bottom group opens the
 * cross-cutting tools (work, activity, standup, release, shortcuts, settings).
 * Replaces the old text view-tabs + sidebar header buttons.
 */
const VIEW_NAV: { view: MainView; icon: IconName; label: string }[] = [
    { view: "terminal", icon: "terminal", label: "Terminals - multi-agent sessions, splits & layouts" },
    { view: "editor", icon: "code", label: "Editor - browse & edit project files (Monaco)" },
    { view: "api", icon: "send", label: "API client - test requests, environments & collections" },
    { view: "database", icon: "database", label: "Database - query Postgres / MySQL / SQLite" },
    { view: "browser", icon: "appWindow", label: "Browser - embedded, with send-to-AI" }
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
            <div className="rail-logo" data-tip="DevDeck">
                D
            </div>
            <div className="rail-group">
                {VIEW_NAV.map((v) => (
                    <button
                        key={v.view}
                        className={"rail-btn" + (view === v.view ? " on" : "")}
                        data-tip={v.label}
                        data-tip-pos="right"
                        onClick={() => setView(v.view)}
                    >
                        <Icon name={v.icon} size={20} />
                    </button>
                ))}
            </div>
            <div className="rail-spacer" />
            <div className="rail-group">
                <button className="rail-btn" data-tip="Work - your assigned Jira / Azure DevOps tickets; start a session from one" data-tip-pos="right" onClick={() => setWorkOpen(true)}>
                    <Icon name="work" size={20} />
                </button>
                <button className="rail-btn" data-tip="Activity - agent events across all projects" data-tip-pos="right" onClick={() => setActivityOpen(true)}>
                    <Icon name="activity" size={20} />
                </button>
                <button className="rail-btn" data-tip="Standup - generate today's worklog from git + activity" data-tip-pos="right" onClick={() => setStandupOpen(true)}>
                    <Icon name="list" size={20} />
                </button>
                <button className="rail-btn" data-tip="Release board - promote Dev → UAT → PROD" data-tip-pos="right" onClick={() => setReleaseOpen(true)}>
                    <Icon name="release" size={20} />
                </button>
                <button className="rail-btn" data-tip="Keyboard shortcuts (F1)" data-tip-pos="right" onClick={() => setShortcutsOpen(true)}>
                    <Icon name="help" size={20} />
                </button>
                <button className="rail-btn" data-tip="Settings - appearance, agents, snippets, remote…" data-tip-pos="right" onClick={() => openSettings()}>
                    <Icon name="settings" size={20} />
                </button>
            </div>
        </nav>
    )
}
