import { useEffect, useState } from "react"
import { useStore } from "../store"
import { getTail, getFullTail, getLastAt, relTime, sortForFollow } from "../missionTail"
import type { SystemInfo } from "../../../preload/index"

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

    // Attention-first: the agent that needs you floats to the top.
    const sessions = sortForFollow(agentSessions())
    const totalAgents = sessions.length
    const attention = sessions.filter((s) => s.status === "attention").length

    // Tiles the user has expanded to see fuller recent output inline.
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const toggleExpand = (id: string): void =>
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

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

    // Ambient system state (Docker + listening ports).
    const [sys, setSys] = useState<SystemInfo | null>(null)
    useEffect(() => {
        let on = true
        const fetchSys = (): void => {
            if (document.hidden) return
            window.api.system.info().then((s) => on && setSys(s)).catch(() => undefined)
        }
        fetchSys()
        const iv = setInterval(fetchSys, 8000)
        return () => {
            on = false
            clearInterval(iv)
        }
    }, [])
    const showSystem = !!sys && (sys.docker.length > 0 || sys.ports.length > 0)

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
                        {sessions.map((s) => {
                            const ago = relTime(Date.now(), getLastAt(s.termId))
                            const isExpanded = expanded.has(s.termId)
                            return (
                                <div
                                    key={s.termId}
                                    className={"mission-tile status-" + s.status}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => jumpToTerm(s.termId)}
                                >
                                    <div className="mission-tile-head">
                                        <span className={"tab-dot claude status-" + s.status} />
                                        <span className="mission-tile-name">{s.sessionName}</span>
                                        <span className="agent-badge sm">{s.badge}</span>
                                        <button
                                            className="mission-tile-expand"
                                            data-tip={isExpanded ? "Collapse" : "Show recent output"}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                toggleExpand(s.termId)
                                            }}
                                        >
                                            {isExpanded ? "−" : "⋯"}
                                        </button>
                                    </div>
                                    <div className="mission-tile-proj muted small">
                                        {s.projectName}
                                        {ago ? ` · ${ago}` : ""}
                                    </div>
                                    {isExpanded ? (
                                        <pre className="mission-tile-full">
                                            {getFullTail(s.termId) || "(no output yet)"}
                                        </pre>
                                    ) : (
                                        <div className="mission-tile-peek">
                                            {getTail(s.termId) || <span className="muted">…</span>}
                                        </div>
                                    )}
                                    {s.status === "attention" && (
                                        <div className="mission-tile-attn">needs you</div>
                                    )}
                                </div>
                            )
                        })}
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

            {showSystem && (
                <div className="mission-section">
                    <div className="mission-head">
                        <span className="section-label">SYSTEM</span>
                        <span className="muted small">containers &amp; listening ports</span>
                    </div>
                    <div className="mission-system">
                        {sys!.docker.map((c) => (
                            <span key={"d" + c.name} className="mission-chip" data-tip={c.ports || c.status}>
                                <span className="mission-chip-dot ok" /> {c.name}
                                <span className="muted small"> {c.status}</span>
                            </span>
                        ))}
                        {sys!.ports.map((p) => (
                            <span key={"p" + p.port} className="mission-chip" data-tip={`pid ${p.pid}`}>
                                :{p.port}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
