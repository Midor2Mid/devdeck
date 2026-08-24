import { useEffect, useMemo, useState } from "react"
import { useStore } from "../store"
import type { AnySession } from "../store"
import { SplitView } from "./SplitView"
import { Icon } from "./Icon"
import { getTail, peekLine, sortForFollow, promptFor } from "../missionTail"
import { type ApprovalPrompt } from "../approval"

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

/** A session name that becomes an inline editor on double-click (reuses the
 *  same renameSession the deck keys / tabs use). */
function EditableName({
    termId,
    name,
    className
}: {
    termId: string
    name: string
    className: string
}): JSX.Element {
    const rename = useStore((s) => s.renameSession)
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(name)
    if (editing) {
        const commit = (): void => {
            rename(termId, text.trim() || name)
            setEditing(false)
        }
        return (
            <input
                className="session-rename"
                autoFocus
                value={text}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit()
                    else if (e.key === "Escape") setEditing(false)
                }}
            />
        )
    }
    return (
        <span
            className={className}
            data-tip="Double-click to rename"
            onDoubleClick={(e) => {
                e.stopPropagation()
                setText(name)
                setEditing(true)
            }}
        >
            {name}
        </span>
    )
}

/** One-click Approve / Deny for a detected prompt — answers the agent without
 *  opening its terminal. stopPropagation so it doesn't also trigger the row. */
function ApprovalActions({ termId, prompt }: { termId: string; prompt: ApprovalPrompt }): JSX.Element {
    const respond = useStore((s) => s.respondApproval)
    return (
        <div className="ov-approve" onClick={(e) => e.stopPropagation()}>
            <div className="ov-approve-q" data-tip={prompt.question}>
                {prompt.question}
            </div>
            <div className="ov-approve-row">
                <button
                    className="ov-approve-yes"
                    onClick={() => respond(termId, prompt.approve)}
                    data-tip="Send Yes to the agent"
                >
                    ✓ Approve
                </button>
                <button
                    className="ov-approve-no"
                    onClick={() => respond(termId, prompt.deny)}
                    data-tip="Reject this action"
                >
                    ✕ Deny
                </button>
            </div>
        </div>
    )
}

// Which groups are folded, persisted across view switches + restarts (localStorage,
// same lightweight store the project MRU uses — no workspace-schema change needed).
const COLLAPSE_KEY = "devdeck.overviewCollapsed"
function loadCollapsed(): Set<string> {
    try {
        return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]") as string[])
    } catch {
        return new Set()
    }
}
function saveCollapsed(s: Set<string>): void {
    try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s]))
    } catch {
        /* storage unavailable — ignore */
    }
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
    const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)

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
            saveCollapsed(next)
            return next
        })

    const allKeys = groups.map((g) => g.key)
    const allCollapsed = allKeys.length > 0 && allKeys.every((k) => collapsed.has(k))
    const toggleAll = (): void => {
        const next = allCollapsed ? new Set<string>() : new Set(allKeys)
        saveCollapsed(next)
        setCollapsed(next)
    }

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
                    <div className="ov-bar-right">{modeToggle}</div>
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
                <div className="ov-bar-right">
                    {mode === "grid" && groups.length > 1 && (
                        <button
                            className="ov-foldall"
                            onClick={toggleAll}
                            data-tip={allCollapsed ? "Expand every group" : "Collapse every group"}
                        >
                            {allCollapsed ? "Expand all" : "Collapse all"}
                        </button>
                    )}
                    {modeToggle}
                </div>
            </div>

            {mode === "focus" ? (
                <div className="ov-focus">
                    <div className="ov-main">
                        <div className="ov-main-head">
                            <span className={dotClass(focused)} />
                            <EditableName termId={focused.termId} name={focused.sessionName} className="ov-main-name" />
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
                            const approval = promptFor(s)
                            return (
                                <div
                                    key={s.termId}
                                    className="ov-rail-item"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setFocusId(s.termId)}
                                    // Middle-click closes, the way it does on a browser
                                    // or editor tab. Costs no pixels and is the fastest
                                    // path once you know it; the hover × is what teaches
                                    // it. mousedown is where the autoscroll cursor gets
                                    // suppressed — auxclick is too late.
                                    onMouseDown={(e) => {
                                        if (e.button === 1) e.preventDefault()
                                    }}
                                    onAuxClick={(e) => {
                                        if (e.button !== 1) return
                                        e.preventDefault()
                                        e.stopPropagation()
                                        closePane(s.termId)
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault()
                                            setFocusId(s.termId)
                                        } else if (e.key === "Delete") {
                                            // The row is already focusable, so this is
                                            // the keyboard equivalent of the hover ×.
                                            e.preventDefault()
                                            closePane(s.termId)
                                        }
                                    }}
                                    data-tip="Bring into focus · middle-click or Del to close"
                                >
                                    <div className="ov-ri-head">
                                        <span className={dotClass(s)} />
                                        <span className="ov-ri-name">{s.sessionName}</span>
                                        {s.isAgent && <span className="agent-badge sm">{s.badge}</span>}
                                        {s.status === "attention" && <span className="claude-attn">!</span>}
                                        <span className="ov-ri-proj">{s.projectName}</span>
                                        <button
                                            type="button"
                                            className="tab-close ov-ri-close"
                                            aria-label={`Close ${s.sessionName}`}
                                            data-tip="Close this session"
                                            onClick={(e) => {
                                                // The whole row is a button that swaps
                                                // focus — this must not trigger it.
                                                e.stopPropagation()
                                                closePane(s.termId)
                                            }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                    {(s.status === "attention" || s.status === "waiting") && (
                                        <div className={"ov-ri-flag " + s.status}>
                                            {s.status === "attention" ? "needs you" : "waiting for you"}
                                        </div>
                                    )}
                                    {peek && <div className="ov-ri-peek">{peek}</div>}
                                    {approval && (
                                        <ApprovalActions termId={s.termId} prompt={approval} />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <div className="ov-grid-scroll">
                    {groups.map((g) => (
                        <div key={g.key} className={"ov-group" + (collapsed.has(g.key) ? " collapsed" : "")}>
                            <div
                                className="ov-group-head"
                                role="button"
                                tabIndex={0}
                                aria-expanded={!collapsed.has(g.key)}
                                onClick={() => toggleFold(g.key)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault()
                                        toggleFold(g.key)
                                    }
                                }}
                            >
                                <Icon name="chevronDown" size={12} className="ov-chev" />
                                {g.isGroup ? <span className="ov-grp-tag">{g.label}</span> : g.label}
                                <span className="ov-grp-count">
                                    · {g.sessions.length} terminal{g.sessions.length === 1 ? "" : "s"}
                                </span>
                                {collapsed.has(g.key) && (
                                    <span className="ov-grp-mini" aria-hidden="true">
                                        {g.sessions.map((s) => (
                                            <span key={s.termId} className={dotClass(s)} />
                                        ))}
                                    </span>
                                )}
                                <span className="ov-grp-expand">
                                    {collapsed.has(g.key) ? "show" : "hide"}
                                </span>
                            </div>
                            <div className="ov-grid">
                                {g.sessions.map((s) => {
                                    const approval = promptFor(s)
                                    return (
                                    <div key={s.termId} className="ov-card">
                                        <div className="ov-card-head">
                                            <span className={dotClass(s)} />
                                            <EditableName termId={s.termId} name={s.sessionName} className="ov-card-name" />
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
                                        {approval && (
                                            <ApprovalActions termId={s.termId} prompt={approval} />
                                        )}
                                        <div className="ov-card-body">
                                            <SplitView
                                                node={{ kind: "leaf", termId: s.termId }}
                                                projectId={s.projectId}
                                                cwd={s.projectPath}
                                            />
                                        </div>
                                    </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
