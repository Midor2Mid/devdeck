import { useEffect, useMemo, useState } from "react"
import { useStore } from "../store"
import type { AnySession } from "../store"
import { SplitView } from "./SplitView"
import { Icon } from "./Icon"
import { getTail, peekLine, sortForFollow } from "../missionTail"

/**
 * Cross-project live-terminal Overview. Two modes:
 *  - Focus + rail: one full-size terminal you work in, plus a status rail of the
 *    other sessions (attention-first) — click a rail row to swap it into focus.
 *  - Grid: every session as a card, grouped by the switcher's project-groups
 *    (falling back to a per-project section), ordered attention-first, foldable.
 *
 * Rendered inside TerminalView's stage (a layout mode) so each terminal id mounts
 * exactly once — a separate always-mounted view would double-attach every pty.
 */

const rank = (s: AnySession): number =>
    s.status === "attention" ? 0 : s.status === "waiting" ? 1 : s.status === "working" ? 2 : 3

function dotClass(s: AnySession): string {
    return s.isAgent ? "tab-dot claude status-" + s.status : "tab-dot shell"
}

export function OverviewView(): JSX.Element {
    const sessionsFn = useStore((s) => s.sessions)
    const projects = useStore((s) => s.projects)
    // Subscribe to the slices the session list derives from so cards refresh.
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const termAgents = useStore((s) => s.termAgents)
    const termNames = useStore((s) => s.termNames)
    void tabsByProject
    void termAgents
    void termNames
    const closePane = useStore((s) => s.closePane)

    const [mode, setMode] = useState<"focus" | "grid">("focus")
    const [focusId, setFocusId] = useState<string | null>(null)
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

    // Refresh the rail peeks (tails live outside the store, fed by the pty stream).
    const [, setTick] = useState(0)
    useEffect(() => {
        const iv = setInterval(() => setTick((t) => t + 1), 1500)
        return () => clearInterval(iv)
    }, [])

    const sessions = sessionsFn()
    void agentStatus // status changes re-render via this subscription
    const ordered = useMemo(() => sortForFollow(sessions), [sessions])

    // Groups for the Grid mode: named project-group, else the project on its own.
    const groups = useMemo(() => {
        const byKey = new Map<
            string,
            { key: string; label: string; isGroup: boolean; sessions: AnySession[] }
        >()
        for (const s of sessions) {
            const g = projects.find((p) => p.id === s.projectId)?.group
            const key = g ? "g:" + g : "p:" + s.projectId
            if (!byKey.has(key))
                byKey.set(key, { key, label: g ?? s.projectName, isGroup: !!g, sessions: [] })
            byKey.get(key)!.sessions.push(s)
        }
        const arr = [...byKey.values()]
        arr.forEach((gr) => gr.sessions.sort((a, b) => rank(a) - rank(b)))
        arr.sort(
            (a, b) =>
                Math.min(...a.sessions.map(rank)) - Math.min(...b.sessions.map(rank)) ||
                a.label.localeCompare(b.label)
        )
        return arr
    }, [sessions, projects])

    const toggleFold = (key: string): void =>
        setCollapsed((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })

    const modeToggle = (
        <div className="ov-seg" role="group" aria-label="Overview mode">
            <button
                className={mode === "focus" ? "on" : ""}
                onClick={() => setMode("focus")}
                data-tip="One terminal in focus + a rail of the rest"
            >
                <Icon name="tabs" size={13} /> Focus
            </button>
            <button
                className={mode === "grid" ? "on" : ""}
                onClick={() => setMode("grid")}
                data-tip="Every terminal at once, grouped by project"
            >
                <Icon name="grid" size={13} /> Grid
            </button>
        </div>
    )

    if (sessions.length === 0) {
        return (
            <div className="overview">
                <div className="ov-bar">
                    <span className="ov-bar-title">Overview · all projects</span>
                    {modeToggle}
                </div>
                <div className="empty-state">
                    <p>No terminals running across your projects.</p>
                    <p className="muted">Open a terminal or agent in any project and it shows up here.</p>
                </div>
            </div>
        )
    }

    const focused = ordered.find((s) => s.termId === focusId) ?? ordered[0]
    const rest = ordered.filter((s) => s.termId !== focused.termId)

    return (
        <div className="overview">
            <div className="ov-bar">
                <span className="ov-bar-title">
                    Overview · {sessions.length} terminal{sessions.length === 1 ? "" : "s"} ·{" "}
                    {new Set(sessions.map((s) => s.projectId)).size} projects
                </span>
                {modeToggle}
            </div>

            {mode === "focus" ? (
                <div className="ov-focus">
                    <div className="ov-main">
                        <div className="ov-main-head">
                            <span className={dotClass(focused)} />
                            <span className="ov-main-name">{focused.sessionName}</span>
                            {focused.isAgent && <span className="agent-badge sm">{focused.badge}</span>}
                            {focused.status === "attention" && <span className="claude-attn">!</span>}
                            <span className="ov-main-proj">{focused.projectName}</span>
                            <span className="ov-main-actions">
                                <button
                                    className="btn-min"
                                    data-tip="Close this session"
                                    onClick={() => closePane(focused.termId)}
                                >
                                    ×
                                </button>
                            </span>
                        </div>
                        <div className="ov-main-body">
                            <SplitView
                                node={{ kind: "leaf", termId: focused.termId }}
                                projectId={focused.projectId}
                                cwd={focused.projectPath}
                            />
                        </div>
                    </div>
                    <div className="ov-rail">
                        <div className="ov-rail-title">Other sessions · {rest.length}</div>
                        {rest.map((s) => {
                            const peek = peekLine(getTail(s.termId))
                            return (
                                <button
                                    key={s.termId}
                                    className="ov-rail-item"
                                    onClick={() => setFocusId(s.termId)}
                                    data-tip="Bring into focus"
                                >
                                    <div className="ov-ri-head">
                                        <span className={dotClass(s)} />
                                        <span className="ov-ri-name">{s.sessionName}</span>
                                        {s.isAgent && <span className="agent-badge sm">{s.badge}</span>}
                                        {s.status === "attention" && <span className="claude-attn">!</span>}
                                        <span className="ov-ri-proj">{s.projectName}</span>
                                    </div>
                                    {(s.status === "attention" || s.status === "waiting") && (
                                        <div className={"ov-ri-flag " + s.status}>
                                            {s.status === "attention" ? "needs you" : "waiting for you"}
                                        </div>
                                    )}
                                    {peek && <div className="ov-ri-peek">{peek}</div>}
                                </button>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <div className="ov-grid-scroll">
                    {groups.map((g) => (
                        <div key={g.key} className={"ov-group" + (collapsed.has(g.key) ? " collapsed" : "")}>
                            <div className="ov-group-head" onClick={() => toggleFold(g.key)}>
                                <Icon name="chevronDown" size={12} className="ov-chev" />
                                {g.isGroup ? <span className="ov-grp-tag">{g.label}</span> : g.label}
                                <span className="ov-grp-count">
                                    · {g.sessions.length} terminal{g.sessions.length === 1 ? "" : "s"}
                                </span>
                            </div>
                            <div className="ov-grid">
                                {g.sessions.map((s) => (
                                    <div key={s.termId} className="ov-card">
                                        <div className="ov-card-head">
                                            <span className={dotClass(s)} />
                                            <span className="ov-card-name">{s.sessionName}</span>
                                            {s.isAgent && (
                                                <span className="agent-badge sm">{s.badge}</span>
                                            )}
                                            {s.status === "attention" && (
                                                <span className="claude-attn">!</span>
                                            )}
                                            {g.isGroup && (
                                                <span className="ov-card-proj">{s.projectName}</span>
                                            )}
                                            <span className="ov-card-actions">
                                                <button
                                                    className="btn-min"
                                                    data-tip="Focus this session"
                                                    onClick={() => {
                                                        setFocusId(s.termId)
                                                        setMode("focus")
                                                    }}
                                                >
                                                    ↗
                                                </button>
                                                <button
                                                    className="btn-min"
                                                    data-tip="Close"
                                                    onClick={() => closePane(s.termId)}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        </div>
                                        <div className="ov-card-body">
                                            <SplitView
                                                node={{ kind: "leaf", termId: s.termId }}
                                                projectId={s.projectId}
                                                cwd={s.projectPath}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
