import { useEffect, useState } from "react"
import { useStore } from "../store"
import { getTail, getFullTail, getLastAt, relTime, sortForFollow, isStalled, getTrace, barsPath } from "../missionTail"
import { buildOwnership, type OwnershipMap } from "../ownership"
import type { SystemInfo } from "../../../preload/index"

/**
 * The supervision home: every live agent across all projects as a tile (status +
 * a peek of its latest output), and a cross-project review queue of AI-produced
 * changes. Following agents is the primary activity — this is the default view.
 */
export function MissionControl(): JSX.Element {
    // The panel stays mounted (App toggles display) — gate all polling on the
    // Mission view actually being active so timers don't run in other views.
    const view = useStore((s) => s.view)
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
        if (view !== "mission") return
        setTick((t) => t + 1) // refresh peeks immediately on entering the view
        const iv = setInterval(() => setTick((t) => t + 1), 1000)
        return () => clearInterval(iv)
    }, [view])

    // Per-project uncommitted-change counts for the review queue.
    const [changes, setChanges] = useState<Record<string, number>>({})
    useEffect(() => {
        if (view !== "mission") return
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
    }, [view, projects])

    // Ambient system state (Docker + listening ports).
    const [sys, setSys] = useState<SystemInfo | null>(null)
    useEffect(() => {
        if (view !== "mission") return
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
    }, [view])
    const showSystem = !!sys && (sys.docker.length > 0 || sys.ports.length > 0)

    // Every listening socket used to get its own chip — two dozen of them, mostly
    // OS noise in the dynamic/ephemeral range (49152+ on Windows) plus whatever
    // tooling happened to be attached. Keep the ones that plausibly belong to a
    // dev server up front and fold the rest into one chip.
    const EPHEMERAL_FROM = 32768
    const allPorts = [...(sys?.ports ?? [])].sort((a, b) => a.port - b.port)
    const devPorts = allPorts.filter((p) => p.port < EPHEMERAL_FROM)
    const otherPorts = allPorts.filter((p) => p.port >= EPHEMERAL_FROM)

    // File-ownership / conflict map: which agent is changing which files, across worktrees.
    const [ownership, setOwnership] = useState<OwnershipMap | null>(null)
    useEffect(() => {
        if (view !== "mission") return
        let on = true
        const fetchOwn = async (): Promise<void> => {
            if (document.hidden) return
            const st = useStore.getState()
            const entries = await Promise.all(
                st.agentSessions().map(async (s) => ({
                    termId: s.termId,
                    sessionName: s.sessionName,
                    projectName: s.projectName,
                    files: (
                        await window.api.git
                            .changes(st.termCwd[s.termId] ?? s.projectPath)
                            .catch(() => [])
                    ).map((c) => c.path)
                }))
            )
            if (on) setOwnership(buildOwnership(entries))
        }
        void fetchOwn()
        const iv = setInterval(() => void fetchOwn(), 8000)
        return () => {
            on = false
            clearInterval(iv)
        }
    }, [view])

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
                            const stalled = isStalled(s.status, getLastAt(s.termId), Date.now())
                            const trace = getTrace(s.termId)
                            return (
                                <div
                                    key={s.termId}
                                    className={"mission-tile status-" + s.status + (stalled ? " stalled" : "")}
                                    role="button"
                                    tabIndex={0}
                                    // The trace shows silence as a flatline, which a screen reader
                                    // cannot see — so the sentence it replaces lives here.
                                    aria-label={
                                        `${s.sessionName} · ${s.projectName} · ${s.status}` +
                                        (stalled ? ` · stalled, no output ${ago}` : ago ? ` · last output ${ago} ago` : "")
                                    }
                                    data-tip={
                                        stalled
                                            ? `Stalled — no output ${ago}`
                                            : ago
                                              ? `Last output ${ago} ago`
                                              : undefined
                                    }
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
                                    <div className="mission-tile-proj muted small">{s.projectName}</div>
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
                                    <svg
                                        className="mission-trace"
                                        viewBox={`0 0 ${trace.length} 12`}
                                        preserveAspectRatio="none"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <path d={barsPath(trace)} />
                                    </svg>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="mission-section">
                <div className="mission-head">
                    <span className="section-label">REVIEW QUEUE</span>
                    {/* Lists any uncommitted work (see the empty-state copy below) —
                        it can't tell AI-written changes from hand-written ones. */}
                    <span className="muted small">uncommitted changes awaiting review</span>
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

            {ownership && ownership.files.length > 0 && (
                <div className="mission-section">
                    <div className="mission-head">
                        <span className="section-label">IN-FLIGHT CHANGES</span>
                        <span className={"muted small" + (ownership.conflicts > 0 ? " mission-own-warn" : "")}>
                            {ownership.conflicts > 0
                                ? `${ownership.conflicts} conflict${ownership.conflicts === 1 ? "" : "s"}`
                                : "who's touching what"}
                        </span>
                    </div>
                    <div className="mission-own">
                        {ownership.files.slice(0, 30).map((f) => (
                            <div
                                key={f.projectName + " " + f.path}
                                className={"mission-own-row" + (f.owners.length > 1 ? " conflict" : "")}
                            >
                                <span className="mission-own-path">{f.path}</span>
                                <span className="muted small">{f.projectName}</span>
                                <span className="mission-own-owners">
                                    {f.owners.map((o) => (
                                        <button
                                            key={o.termId}
                                            className="mission-own-chip"
                                            onClick={() => jumpToTerm(o.termId)}
                                        >
                                            {o.sessionName}
                                        </button>
                                    ))}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                        {devPorts.map((p) => (
                            <span key={"p" + p.port} className="mission-chip" data-tip={`pid ${p.pid}`}>
                                :{p.port}
                            </span>
                        ))}
                        {otherPorts.length > 0 && (
                            <span
                                className="mission-chip muted"
                                data-tip={`Ephemeral / high ports (${EPHEMERAL_FROM}+), usually not dev servers: ${otherPorts
                                    .map((p) => p.port)
                                    .join(", ")}`}
                            >
                                +{otherPorts.length} more
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
