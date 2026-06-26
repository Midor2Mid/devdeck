import { useMemo } from "react"
import { useStore, type ClaudeSession } from "../store"
import { collectLeaves } from "../layout"

export function Sidebar(): JSX.Element {
    const { projects, activeId, addProject, removeProject, setActiveProject } = useStore()

    // Build the cross-project Claude session list from raw slices (so this
    // re-renders on status/layout changes without a new-array selector pitfall).
    const tabsByProject = useStore((s) => s.tabsByProject)
    const termKinds = useStore((s) => s.termKinds)
    const claudeStatus = useStore((s) => s.claudeStatus)
    const jumpToTerm = useStore((s) => s.jumpToTerm)

    const sessions = useMemo<ClaudeSession[]>(() => {
        const out: ClaudeSession[] = []
        for (const [pid, tabs] of Object.entries(tabsByProject)) {
            const project = projects.find((p) => p.id === pid)
            for (const tab of tabs) {
                for (const termId of collectLeaves(tab.root)) {
                    if (termKinds[termId] === "claude") {
                        out.push({
                            termId,
                            projectId: pid,
                            projectName: project?.name ?? "—",
                            tabName: tab.name,
                            status: claudeStatus[termId] ?? "idle"
                        })
                    }
                }
            }
        }
        return out
    }, [tabsByProject, termKinds, claudeStatus, projects])

    const attention = sessions.filter((s) => s.status === "attention").length

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span className="brand">DevDeck</span>
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
                <span>CLAUDE SESSIONS</span>
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
                        Start one with <b>+ Claude</b>.
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
                            {s.status === "attention" && <span className="claude-attn">!</span>}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
