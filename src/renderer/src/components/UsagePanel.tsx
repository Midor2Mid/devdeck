import { useEffect, useMemo, useState } from "react"
import { useStore } from "../store"
import { Modal } from "./Modal"
import { useSettings, type UsageEvent } from "../settings"
import type { UsageSummary } from "../../../preload/index"

function fmtTok(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
    if (n >= 1000) return Math.round(n / 1000) + "k"
    return String(n)
}

type Window = "today" | "week" | "all"

const WINDOWS: { key: Window; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "7 days" },
    { key: "all", label: "All time" }
]

function startOf(window: Window, now: number): number {
    if (window === "all") return 0
    if (window === "week") return now - 7 * 24 * 60 * 60 * 1000
    // Local midnight today.
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
}

function fmtDuration(ms: number): string {
    const m = Math.floor(ms / 60000)
    if (m < 1) return "<1m"
    if (m < 60) return m + "m"
    const h = Math.floor(m / 60)
    const rem = m % 60
    return rem ? `${h}h ${rem}m` : `${h}h`
}

interface Bucket {
    key: string
    label: string
    count: number
    ms: number
}

// A session's contribution to "active time" — open events count up to now.
function durationOf(e: UsageEvent, now: number): number {
    return Math.max(0, (e.endedAt ?? now) - e.startedAt)
}

/**
 * AI usage / activity + cost dashboard.
 *
 * Two data sources: (1) DevDeck's own session *activity* (which agent ran, where,
 * how long) — always available. (2) Token counts + estimated USD cost, parsed
 * from Claude Code's local transcripts (`~/.claude/projects/**.jsonl`) — real
 * numbers, no API needed; cost is estimated from list pricing.
 */
export function UsagePanel(): JSX.Element {
    const close = useStore((s) => s.setUsageOpen)
    const [tokens, setTokens] = useState<UsageSummary | null>(null)
    useEffect(() => {
        window.api.usage.tokens(7).then(setTokens).catch(() => setTokens(null))
    }, [])
    const usageLog = useSettings((s) => s.usageLog)
    const agents = useSettings((s) => s.agents)
    const projects = useStore((s) => s.projects)
    const agentSessions = useStore((s) => s.agentSessions)
    const tabsByProject = useStore((s) => s.tabsByProject)
    const termAgents = useStore((s) => s.termAgents)
    const agentStatus = useStore((s) => s.agentStatus)
    const jumpToTerm = useStore((s) => s.jumpToTerm)

    const [win, setWin] = useState<Window>("week")
    // Tick so open sessions' elapsed time advances while the panel is open.
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 5000)
        return () => clearInterval(t)
    }, [])

    const live = useMemo(
        () => agentSessions(),
        [agentSessions, tabsByProject, termAgents, agentStatus]
    )
    // Map a running session to its open log event (to read its start time).
    const openByTerm = useMemo(() => {
        const m: Record<string, UsageEvent> = {}
        for (const e of usageLog) if (!e.endedAt) m[e.id] = e
        return m
    }, [usageLog])

    const agentName = (id: string): string => agents.find((a) => a.id === id)?.name ?? id
    const projName = (id: string): string => projects.find((p) => p.id === id)?.name ?? "—"

    const stats = useMemo(() => {
        const from = startOf(win, now)
        const events = usageLog.filter((e) => e.startedAt >= from)
        const byAgent = new Map<string, Bucket>()
        const byProject = new Map<string, Bucket>()
        let totalMs = 0
        for (const e of events) {
            const ms = durationOf(e, now)
            totalMs += ms
            const a = byAgent.get(e.agentId) ?? { key: e.agentId, label: agentName(e.agentId), count: 0, ms: 0 }
            a.count++
            a.ms += ms
            byAgent.set(e.agentId, a)
            const p = byProject.get(e.projectId) ?? { key: e.projectId, label: projName(e.projectId), count: 0, ms: 0 }
            p.count++
            p.ms += ms
            byProject.set(e.projectId, p)
        }
        const sortBuckets = (m: Map<string, Bucket>): Bucket[] =>
            [...m.values()].sort((x, y) => y.count - x.count)
        return {
            sessions: events.length,
            totalMs,
            agents: sortBuckets(byAgent),
            projects: sortBuckets(byProject)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [usageLog, win, now, agents, projects])

    const maxAgent = Math.max(1, ...stats.agents.map((b) => b.count))
    const maxProject = Math.max(1, ...stats.projects.map((b) => b.count))

    const renderBars = (buckets: Bucket[], max: number): JSX.Element => (
        <div className="usage-bars">
            {buckets.length === 0 ? (
                <div className="muted small">No sessions in this period.</div>
            ) : (
                buckets.map((b) => (
                    <div key={b.key} className="usage-bar-row">
                        <span className="usage-bar-label" title={b.label}>
                            {b.label}
                        </span>
                        <div className="usage-bar-track">
                            <div
                                className="usage-bar-fill"
                                style={{ width: Math.round((b.count / max) * 100) + "%" }}
                            />
                        </div>
                        <span className="usage-bar-count">
                            {b.count}
                            <span className="muted small"> · {fmtDuration(b.ms)}</span>
                        </span>
                    </div>
                ))
            )}
        </div>
    )

    return (
        <Modal onClose={() => close(false)} className="usage-modal" labelledBy="usage-modal-title">
            <div className="modal-head">
                <span id="usage-modal-title">
                    AI usage
                    <span className="muted small" style={{ marginLeft: 8 }}>
                        session activity
                    </span>
                </span>
                <div className="usage-windows">
                    {WINDOWS.map((w) => (
                        <button
                            key={w.key}
                            className={"btn-min" + (win === w.key ? " on" : "")}
                            onClick={() => setWin(w.key)}
                        >
                            {w.label}
                        </button>
                    ))}
                    <button className="btn-min" onClick={() => close(false)} data-tip="Close">
                        ×
                    </button>
                </div>
            </div>

            <div className="modal-body usage-body">
                {tokens && (
                    <div className="usage-tokens">
                        <div className="usage-tokens-head">
                            <span className="section-label">
                                Tokens &amp; cost · last {tokens.sinceDays}d
                            </span>
                            <span className="usage-cost-total">${tokens.total.cost.toFixed(2)}</span>
                        </div>
                        <div className="usage-tokens-sub muted small">
                            {fmtTok(tokens.total.tokens)} tokens · estimated from Claude Code local logs
                        </div>
                        <div className="usage-tok-rows">
                            {tokens.byProject.slice(0, 6).map((b) => (
                                <div key={b.label} className="usage-tok-row">
                                    <span className="usage-tok-label">{b.label}</span>
                                    <span className="muted small">{fmtTok(b.tokens)}</span>
                                    <span className="usage-tok-cost">${b.cost.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                        {tokens.byModel.length > 0 && (
                            <div className="usage-tok-models muted small">
                                {tokens.byModel
                                    .slice(0, 4)
                                    .map((b) => `${b.label.replace("claude-", "")} $${b.cost.toFixed(2)}`)
                                    .join(" · ")}
                            </div>
                        )}
                    </div>
                )}
                <div className="usage-cards">
                    <div className="usage-card">
                        <div className="usage-card-num">{stats.sessions}</div>
                        <div className="usage-card-label">sessions launched</div>
                    </div>
                    <div className="usage-card">
                        <div className="usage-card-num">{fmtDuration(stats.totalMs)}</div>
                        <div className="usage-card-label">agent time</div>
                    </div>
                    <div className="usage-card">
                        <div className="usage-card-num">{live.length}</div>
                        <div className="usage-card-label">running now</div>
                    </div>
                </div>

                <div className="usage-section">
                    <div className="usage-section-title">By agent</div>
                    {renderBars(stats.agents, maxAgent)}
                </div>

                <div className="usage-section">
                    <div className="usage-section-title">By project</div>
                    {renderBars(stats.projects, maxProject)}
                </div>

                {live.length > 0 && (
                    <div className="usage-section">
                        <div className="usage-section-title">Running now</div>
                        <div className="usage-live">
                            {live.map((s) => {
                                const ev = openByTerm[s.termId]
                                return (
                                    <div
                                        key={s.termId}
                                        className={"usage-live-row status-" + s.status}
                                        onClick={() => {
                                            jumpToTerm(s.termId)
                                            close(false)
                                        }}
                                    >
                                        <span className={"tab-dot claude status-" + s.status} />
                                        <span className="usage-live-agent">{s.badge}</span>
                                        <span className="usage-live-tab">{s.sessionName}</span>
                                        <span className="usage-live-proj muted small">
                                            {s.projectName}
                                        </span>
                                        <span className="spacer" />
                                        <span className="muted small">
                                            {ev ? fmtDuration(now - ev.startedAt) : ""}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="usage-note muted small">
                    Tokens &amp; cost are parsed from Claude Code&apos;s local transcripts (cost
                    estimated from list pricing); the activity below is DevDeck&apos;s own record
                    of which agent ran where, and for how long.
                </div>
            </div>
        </Modal>
    )
}
