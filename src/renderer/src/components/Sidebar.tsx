import { useMemo } from "react"
import { useStore, SHELL, type AgentStatus } from "../store"
import { useSettings } from "../settings"
import { collectLeaves } from "../layout"

interface SessionRow {
    termId: string
    projectName: string
    tabName: string
    badge: string
    status: AgentStatus
}

export function Sidebar(): JSX.Element {
    const { projects, activeId, addProject, removeProject, setActiveProject } = useStore()
    const openSettings = useSettings((s) => s.openSettings)
    const agents = useSettings((s) => s.agents)

    const tabsByProject = useStore((s) => s.tabsByProject)
    const termAgents = useStore((s) => s.termAgents)
    const agentStatus = useStore((s) => s.agentStatus)
    const jumpToTerm = useStore((s) => s.jumpToTerm)

    const sessions = useMemo<SessionRow[]>(() => {
        const badgeOf = (id: string): string =>
            agents.find((a) => a.id === id)?.badge ?? id.toUpperCase()
        const out: SessionRow[] = []
        for (const [pid, tabs] of Object.entries(tabsByProject)) {
            const project = projects.find((p) => p.id === pid)
            for (const tab of tabs) {
                for (const termId of collectLeaves(tab.root)) {
                    const agentId = termAgents[termId] ?? SHELL
                    if (agentId === SHELL) continue
                    out.push({
                        termId,
                        projectName: project?.name ?? "—",
                        tabName: tab.name,
                        badge: badgeOf(agentId),
                        status: agentStatus[termId] ?? "idle"
                    })
                }
            }
        }
        return out
    }, [tabsByProject, termAgents, agentStatus, projects, agents])

    const attention = sessions.filter((s) => s.status === "attention").length

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span className="brand">DevDeck</span>
                <button className="gear-btn" title="Settings" onClick={openSettings}>
                    ⚙
                </button>
            </div>

            <div className="sidebar-section-title">
                <span>PROJECTS</span>
                <button className="icon-btn" title="Add a project folder" onClick={addProject}>
                    +
                </button>
            </div>

            <div className="project-list">
                {projects.length === 0 && (
                    <div className="muted sidebar-empty">
                        No projects yet.
                        <br />
                        Click <b>+</b> to add a folder.
                    </div>
                )}
                {projects.map((p) => (
                    <div
                        key={p.id}
                        className={"project-item" + (p.id === activeId ? " active" : "")}
                        onClick={() => setActiveProject(p.id)}
                        title={p.path}
                    >
                        <span className="project-name">{p.name}</span>
                        <span
                            className="project-remove"
                            title="Remove project"
                            onClick={(e) => {
                                e.stopPropagation()
                                removeProject(p.id)
                            }}
                        >
                            ×
                        </span>
                    </div>
                ))}
            </div>

            <div className="sidebar-section-title claude-title">
                <span>AGENT SESSIONS</span>
                {attention > 0 && (
                    <span className="attention-badge" title={`${attention} need attention`}>
                        {attention}
                    </span>
                )}
            </div>
            <div className="claude-list">
                {sessions.length === 0 ? (
                    <div className="muted sidebar-empty">
                        None running.
                        <br />
                        Start one with <b>+ {agents[0]?.name ?? "agent"}</b>.
                    </div>
                ) : (
                    sessions.map((s) => (
                        <div
                            key={s.termId}
                            className="claude-session"
                            onClick={() => jumpToTerm(s.termId)}
                            title={`${s.tabName} · ${s.projectName} — ${s.status}`}
                        >
                            <span className={"tab-dot claude status-" + s.status} />
                            <span className="claude-session-text">
                                <span className="claude-session-tab">{s.tabName}</span>
                                <span className="claude-session-project">{s.projectName}</span>
                            </span>
                            <span className="agent-badge sm">{s.badge}</span>
                            {s.status === "attention" && <span className="claude-attn">!</span>}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
