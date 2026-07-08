import { useEffect, useState } from "react"
import { useStore } from "../store"
import { groupTargets } from "../broadcast"
import { getTail } from "../missionTail"

/**
 * The supervision home: every live agent across all projects as a tile (status +
 * a peek of its latest output), and a cross-project review queue of AI-produced
 * changes. Following agents is the primary activity — this is the default view.
 */
export function MissionControl(): JSX.Element {
    const projects = useStore((s) => s.projects)
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const setActiveProject = useStore((s) => s.setActiveProject)
    const openChanges = useStore((s) => s.openChanges)
    const setReviewOpen = useStore((s) => s.setReviewOpen)
    const agentSessions = useStore((s) => s.agentSessions)
    // Subscribe to the slices the session list derives from so tiles refresh.
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const termAgents = useStore((s) => s.termAgents)
    const termNames = useStore((s) => s.termNames)
    void tabsByProject
    void agentStatus
    void termAgents
    void termNames

    const groups = groupTargets(agentSessions())
    const sessions = agentSessions()
    const totalAgents = sessions.length
    const attention = sessions.filter((s) => s.status === "attention").length

    // Poll the output peeks (tails live outside the store, updated by the pty stream).
    const [, setTick] = useState(0)
    useEffect(() => {
        const iv = setInterval(() => setTick((t) => t + 1), 1000)
        return () => clearInterval(iv)
    }, [])

    // Per-project uncommitted-change counts for the review queue.
    const [changes, setChanges] = useState<Record<string, number>>({})
    useEffect(() => {
        let on = true
        const fetchAll = (): void => {
            if (document.hidden) return
            for (const p of projects) {
                window.api.git
                    .status(p.path)
                    .then((g) => on && setChanges((prev) => ({ ...prev, [p.id]: g.isRepo ? g.changes : 0 })))
                    .catch(() => undefined)
            }
        }
        fetchAll()
        const iv = setInterval(fetchAll, 10000)
        const onFocus = (): void => fetchAll()
        window.addEventListener("focus", onFocus)
        return () => {
            on = false
            clearInterval(iv)
            window.removeEventListener("focus", onFocus)
        }
    }, [projects])

    const reviewRows = projects.filter((p) => (changes[p.id] ?? 0) > 0)

    const openReviewFor = (projectId: string): void => {
        setActiveProject(projectId)
        setReviewOpen(true)
    }

    return (
        <div className="mission">
            <div className="mission-section">
                <div className="mission-head">
                    <span className="section-label">AGENTS</span>
                    <span className="muted small">
                        {totalAgents} running{attention ? ` · ${attention} need attention` : ""}
                    </span>
                </div>
                {totalAgents === 0 ? (
                    <div className="muted mission-empty">
                        No agent sessions running. Start one from the deck (＋) or the command palette.
                    </div>
                ) : (
                    <div className="mission-grid">
                        {groups.flatMap((g) =>
                            g.sessions.map((s) => (
                                <button
                                    key={s.termId}
                                    className={"mission-tile status-" + s.status}
                                    onClick={() => jumpToTerm(s.termId)}
                                >
                                    <div className="mission-tile-head">
                                        <span className={"tab-dot claude status-" + s.status} />
                                        <span className="mission-tile-name">{s.sessionName}</span>
                                        <span className="agent-badge sm">{s.badge}</span>
                                    </div>
                                    <div className="mission-tile-proj muted small">{s.projectName}</div>
                                    <div className="mission-tile-peek">
                                        {getTail(s.termId) || <span className="muted">…</span>}
                                    </div>
                                    {s.status === "attention" && (
                                        <div className="mission-tile-attn">needs you</div>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>

            <div className="mission-section">
                <div className="mission-head">
                    <span className="section-label">REVIEW QUEUE</span>
                    <span className="muted small">AI-produced changes awaiting review</span>
                </div>
                {reviewRows.length === 0 ? (
                    <div className="muted mission-empty">No uncommitted changes across your projects.</div>
                ) : (
                    <div className="mission-review">
                        {reviewRows.map((p) => (
                            <div key={p.id} className="mission-review-row">
                                <span className="mission-review-proj">{p.name}</span>
                                <span className="muted small">
                                    {changes[p.id]} changed file{changes[p.id] === 1 ? "" : "s"}
                                </span>
                                <div className="mission-review-actions">
                                    <button onClick={() => openChanges(p.path, p.name)}>Diff</button>
                                    <button onClick={() => openReviewFor(p.id)}>Lenses</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
