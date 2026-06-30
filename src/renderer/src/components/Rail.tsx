import { useStore, type MainView } from "../store"
import { useSettings } from "../settings"
import { Icon, type IconName } from "./Icon"
import { Enso } from "./Enso"

/**
 * Slim icon rail - the app's primary navigation. Top group switches the main
 * view (terminal / editor / API / database / browser); bottom group opens the
 * cross-cutting tools (work, activity, standup, release, shortcuts, settings).
 * A toggle at the bottom expands it to show a label beside each icon.
 */
const VIEW_NAV: { view: MainView; icon: IconName; name: string; label: string }[] = [
    { view: "terminal", icon: "terminal", name: "Terminals", label: "Terminals - multi-agent sessions, splits & layouts" },
    { view: "editor", icon: "code", name: "Editor", label: "Editor - browse & edit project files (Monaco)" },
    { view: "api", icon: "send", name: "API", label: "API client - test requests, environments & collections" },
    { view: "database", icon: "database", name: "Database", label: "Database - query Postgres / MySQL / SQLite" },
    { view: "browser", icon: "appWindow", name: "Browser", label: "Browser - embedded, with send-to-AI" },
    { view: "network", icon: "globe", name: "Network", label: "Network - capture HTTP(S) traffic through the local proxy" }
]

export function Rail(): JSX.Element {
    const view = useStore((s) => s.view)
    const setView = useStore((s) => s.setView)
    const setWorkOpen = useStore((s) => s.setWorkOpen)
    const setInboxOpen = useStore((s) => s.setInboxOpen)
    const setUsageOpen = useStore((s) => s.setUsageOpen)
    const attention = useStore(
        (s) => Object.values(s.agentStatus).filter((x) => x === "attention").length
    )
    const setActivityOpen = useStore((s) => s.setActivityOpen)
    const setStandupOpen = useStore((s) => s.setStandupOpen)
    const setReleaseOpen = useStore((s) => s.setReleaseOpen)
    const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
    const openSettings = useSettings((s) => s.openSettings)
    const expanded = useStore((s) => s.railExpanded)
    const toggleRail = useStore((s) => s.toggleRail)

    // Tooltips are redundant (and visually noisy) once labels are shown.
    const tip = (t: string): string | undefined => (expanded ? undefined : t)

    const tools: { name: string; tip: string; icon: IconName; onClick: () => void; badge?: number; extra?: string }[] = [
        { name: "Inbox", tip: "Agents inbox - every session, attention-first, with quick reply", icon: "inbox", onClick: () => setInboxOpen(true), badge: attention, extra: "rail-inbox" },
        { name: "Work", tip: "Work - your assigned Jira / Azure DevOps tickets; start a session from one", icon: "work", onClick: () => setWorkOpen(true) },
        { name: "Activity", tip: "Activity - agent events across all projects", icon: "activity", onClick: () => setActivityOpen(true) },
        { name: "AI usage", tip: "AI usage - session activity by agent & project", icon: "chart", onClick: () => setUsageOpen(true) },
        { name: "Standup", tip: "Standup - generate today's worklog from git + activity", icon: "list", onClick: () => setStandupOpen(true) },
        { name: "Release", tip: "Release board - promote Dev → UAT → PROD", icon: "release", onClick: () => setReleaseOpen(true) },
        { name: "Shortcuts", tip: "Keyboard shortcuts (F1)", icon: "help", onClick: () => setShortcutsOpen(true) },
        { name: "Settings", tip: "Settings - appearance, agents, snippets, remote…", icon: "settings", onClick: () => openSettings() }
    ]

    return (
        <nav className={"rail" + (expanded ? " expanded" : "")} aria-label="Primary">
            <div className="rail-logo" data-tip={tip("DevDeck")}>
                <Enso size={24} strokeWidth={2} />
                {expanded && <span className="rail-label rail-wordmark">DevDeck</span>}
            </div>
            <div className="rail-group">
                {VIEW_NAV.map((v) => (
                    <button
                        key={v.view}
                        className={"rail-btn" + (view === v.view ? " on" : "")}
                        data-tip={tip(v.label)}
                        data-tip-pos="right"
                        onClick={() => setView(v.view)}
                    >
                        <Icon name={v.icon} size={20} />
                        {expanded && <span className="rail-label">{v.name}</span>}
                    </button>
                ))}
            </div>
            <div className="rail-spacer" />
            <div className="rail-group">
                {tools.map((t) => (
                    <button
                        key={t.name}
                        className={"rail-btn" + (t.extra ? " " + t.extra : "")}
                        data-tip={tip(t.tip)}
                        data-tip-pos="right"
                        onClick={t.onClick}
                    >
                        <Icon name={t.icon} size={20} />
                        {expanded && <span className="rail-label">{t.name}</span>}
                        {t.badge ? <span className="rail-badge">{t.badge}</span> : null}
                    </button>
                ))}
                <button
                    className="rail-btn rail-toggle"
                    data-tip={tip("Expand the menu")}
                    data-tip-pos="right"
                    onClick={toggleRail}
                >
                    <Icon name="chevronDown" size={20} className={expanded ? "rail-chevron-left" : "rail-chevron-right"} />
                    {expanded && <span className="rail-label">Collapse</span>}
                </button>
            </div>
        </nav>
    )
}
