import { useEffect, useMemo, useState } from "react"
import { useStore } from "../store"
import { Modal } from "./Modal"
import { useSettings, type UsageEvent } from "../settings"
import {
    filterRuns,
    formatCostExact,
    formatDuration,
    runTotals,
    runsSentence,
    RUN_READ_LIMIT
} from "../ledgerView"
import type { RunExclusionReason, RunKind, RunRecord, UsageSummary } from "../../../preload/index"

function fmtTok(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
    if (n >= 1000) return Math.round(n / 1000) + "k"
    return String(n)
}

function fmtWhen(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })
}

// Every kind, in the order a run tends to be thought about, so the filter's
// options don't reshuffle as history arrives. Labelled properly for the control
// they sit in - "card"/"race" are record values, and printing them raw put
// lowercase chrome beside "All kinds" and "All projects".
const RUN_KINDS: { kind: RunKind; label: string }[] = [
    { kind: "card", label: "Cards" },
    { kind: "race", label: "Races" },
    { kind: "pipeline", label: "Pipelines" },
    { kind: "session", label: "Sessions" }
]

// The ledger keeps thousands of runs; the panel is a 540px modal. Totals are
// computed over *everything* that passes the filter - only the rendering is
// capped, and the tail is stated rather than silently dropped.
const RUN_ROWS = 50

// Stable empty list for the pre-load render, so the memos below don't see a
// fresh array on every pass while the ledger is still being read.
const NO_RUNS: RunRecord[] = []

/**
 * Why a run's cost may be excluded, in the words the user needs. Two different
 * facts, deliberately not one sentence: DevDeck prices a run by summing every
 * agent transcript under the project's directory inside the run's window, so a
 * second session in that directory during the run lands in the same figure -
 * but a run whose price simply could not be read shared nothing with anybody,
 * and being told that it did is a fabricated fact in a panel whose whole purpose
 * is honesty about attribution.
 */
const SHARED_TIP =
    "Another agent session shared this project's directory while the run was going, so " +
    "this figure covers both - an attribution, not a receipt. It is left out of the total."

const UNPRICED_TIP =
    "DevDeck has no cost it can vouch for here - the run was never priced, its price " +
    "could not be read, or there is no project directory left to price it over. It is " +
    "left out of the total."

// Two cases that both collapse into runsSentence's one neutral clause ("could
// not be vouched for"), but they are not the same fact and do not share a
// tooltip. "unknown" is a specific claim DevDeck can actually make: a session
// overlapped this run but predates DevDeck recording which directory a
// session ran in, so it can be neither ruled out of this one nor placed in
// it. A reasonless record predates reasons being recorded at all - it may not
// involve another session sharing anything (an unread price, say), so nothing
// about sharing is known one way or the other. Giving it the "unknown" text
// would assert a cause it does not carry, the same fabricated fact this
// tooltip set exists to stop.
const UNKNOWN_TIP =
    "DevDeck cannot tell whether another agent session shared this project during " +
    "the run, so this figure cannot be vouched for. It is left out of the total " +
    "rather than guessed at."

const NO_REASON_TIP =
    "DevDeck cannot say why this figure isn't a receipt - the record predates " +
    "reasons being tracked - so it cannot be vouched for. It is left out of the " +
    "total rather than guessed at."

function exclusionTip(reason?: RunExclusionReason): string {
    if (reason === "shared") return SHARED_TIP
    if (reason === "unpriced") return UNPRICED_TIP
    if (reason === "unknown") return UNKNOWN_TIP
    return NO_REASON_TIP
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

    // The run ledger: finished runs only, newest first, read once when the panel
    // opens. `runs` is the stable array everything below derives from - the
    // filter and the totals are memos over it, never work done inside a store
    // selector (a selector that returns a fresh array re-renders forever).
    // `null` until the read resolves: an empty array would be rendered as
    // "0 runs · $0 · nothing recorded yet", which is a lie told to someone with
    // a long history for as long as the IPC takes.
    const [runs, setRuns] = useState<RunRecord[] | null>(null)
    const [runKind, setRunKind] = useState<RunKind | "all">("all")
    const [runProject, setRunProject] = useState<string>("all")
    useEffect(() => {
        window.api.ledger
            .read(RUN_READ_LIMIT)
            .then(setRuns)
            .catch(() => setRuns(NO_RUNS))
    }, [])

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

    const runList = runs ?? NO_RUNS
    const shownRuns = useMemo(
        () =>
            filterRuns(
                runList,
                runKind === "all" ? undefined : runKind,
                runProject === "all" ? undefined : runProject
            ),
        [runList, runKind, runProject]
    )
    // The sentence above the list: rows on screen, exclusive-only money, and the
    // count left out of that money said in words. All of it lives in ledgerView
    // so the branch is under test, not just the arithmetic behind it.
    const runsLine = useMemo(
        () => runsSentence(runTotals(shownRuns), shownRuns.length, runList.length > 0),
        [shownRuns, runList]
    )
    // Only the kinds and projects that actually appear in the history - a filter
    // that can only ever return nothing is chrome pretending to be a control.
    const runKindOpts = useMemo(() => {
        const present = new Set(runList.map((r) => r.kind))
        return RUN_KINDS.filter((k) => present.has(k.kind))
    }, [runList])
    const runProjectOpts = useMemo(() => {
        const seen = new Map<string, string>()
        for (const r of runList) if (!seen.has(r.projectId)) seen.set(r.projectId, r.projectName)
        return [...seen].map(([id, name]) => ({ id, name }))
    }, [runList])

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

                {runs !== null && (
                    <div className="usage-section">
                        <div className="usage-runs-head">
                            {/* The window buttons in the head don't govern this section, so
                                it states its own scope inline - the same answer the
                                "Tokens & cost · last Nd" block already gives. */}
                            <div className="usage-section-title">Runs · all time</div>
                            {runs.length > 0 && (
                                <div className="usage-run-filters">
                                    <select
                                        className="usage-run-filter"
                                        value={runKind}
                                        onChange={(e) => setRunKind(e.target.value as RunKind | "all")}
                                        aria-label="Filter runs by kind"
                                    >
                                        <option value="all">All kinds</option>
                                        {runKindOpts.map((k) => (
                                            <option key={k.kind} value={k.kind}>
                                                {k.label}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        className="usage-run-filter"
                                        value={runProject}
                                        onChange={(e) => setRunProject(e.target.value)}
                                        aria-label="Filter runs by project"
                                    >
                                        <option value="all">All projects</option>
                                        {runProjectOpts.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="usage-runs-total">
                            <span className="usage-runs-num">{runsLine.count}</span>
                            {" " + runsLine.unit + " · "}
                            <span className="usage-runs-num">{runsLine.cost}</span>
                            {runsLine.why !== "" && (
                                <span className="usage-runs-why"> · {runsLine.why}</span>
                            )}
                        </div>
                        {shownRuns.length > 0 && (
                            <div className="usage-runs">
                                {shownRuns.slice(0, RUN_ROWS).map((r) => (
                                    <div key={r.id} className="usage-run-row">
                                        <div className="usage-run-main">
                                            <span className="usage-run-kind">{r.kind}</span>
                                            {/* Every card record is "done" by construction, and a
                                                pipeline's "done" is the unremarkable case - showing
                                                it would put a word on nearly every row that says
                                                nothing. The outcomes that carry information (landed
                                                vs abandoned, failed, stopped) are the ones shown. */}
                                            {r.outcome && r.outcome !== "done" && (
                                                <span className={"usage-run-outcome " + r.outcome}>
                                                    {r.outcome}
                                                </span>
                                            )}
                                            <span className="usage-run-label" title={r.label}>
                                                {r.label}
                                            </span>
                                            <span
                                                className={
                                                    "usage-run-cost" + (r.exclusive ? "" : " approx")
                                                }
                                                title={r.exclusive ? undefined : exclusionTip(r.reason)}
                                            >
                                                {/* Exact cents, like the total above them: a run row
                                                    and the figure it pays into must agree. */}
                                                {(r.exclusive ? "" : "~") + formatCostExact(r.cost)}
                                            </span>
                                        </div>
                                        <div className="usage-run-meta">
                                            <span className="usage-run-when">{fmtWhen(r.endedAt)}</span>
                                            <span className="usage-run-proj" title={r.projectName}>
                                                {r.projectName}
                                            </span>
                                            {r.agentIds.length > 0 && (
                                                <span className="usage-run-agents">
                                                    {r.agentIds.map(agentName).join(", ")}
                                                </span>
                                            )}
                                            <span className="usage-run-dur">
                                                {formatDuration(r.endedAt - r.startedAt)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {shownRuns.length > RUN_ROWS && (
                                    <div className="muted small">
                                        {shownRuns.length - RUN_ROWS} older{" "}
                                        {shownRuns.length - RUN_ROWS === 1 ? "run" : "runs"} not
                                        shown
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

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
