import { useEffect, useMemo, useState, useCallback } from "react"
import { useStore } from "../store"
import { buildWorklog } from "../worklog"
import type { WorklogRepo } from "../../../preload/index"

/**
 * Standup / worklog generator — collects commits you authored across all
 * projects in a time window (+ live agent sessions from the activity feed) and
 * renders an editable markdown summary to paste into Jira / standup.
 */
const RANGES: { id: string; label: string; ms: number; midnight?: boolean }[] = [
    { id: "today", label: "Today", ms: 0, midnight: true },
    { id: "24h", label: "Last 24h", ms: 24 * 3600e3 },
    { id: "3d", label: "Last 3 days", ms: 3 * 24 * 3600e3 },
    { id: "7d", label: "Last 7 days", ms: 7 * 24 * 3600e3 }
]

export function StandupModal(): JSX.Element {
    const close = useStore((s) => s.setStandupOpen)
    const projects = useStore((s) => s.projects)
    const activity = useStore((s) => s.activity)

    const [rangeId, setRangeId] = useState("today")
    const [repos, setRepos] = useState<WorklogRepo[]>([])
    const [text, setText] = useState("")
    const [loading, setLoading] = useState(false)
    const [copied, setCopied] = useState(false)

    const since = useMemo(() => {
        const r = RANGES.find((x) => x.id === rangeId) ?? RANGES[0]
        if (r.midnight) {
            const d = new Date()
            d.setHours(0, 0, 0, 0)
            return d
        }
        return new Date(Date.now() - r.ms)
    }, [rangeId])

    const sessionLines = useMemo(() => {
        const seen = new Set<string>()
        const lines: string[] = []
        for (const e of activity) {
            if (e.ts < since.getTime()) continue
            if (e.kind !== "start" && e.kind !== "pipeline") continue
            if (seen.has(e.label)) continue
            seen.add(e.label)
            lines.push(e.label)
        }
        return lines.slice(0, 12)
    }, [activity, since])

    const generate = useCallback(async () => {
        setLoading(true)
        const collected = await window.api.worklog.collect(
            projects.map((p) => ({ name: p.name, path: p.path })),
            since.toISOString()
        )
        setRepos(collected)
        setText(
            buildWorklog({
                title: new Date().toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" }),
                repos: collected,
                sessions: sessionLines
            })
        )
        setLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projects, since, sessionLines])

    useEffect(() => {
        generate()
    }, [generate])

    const copy = (): void => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    const totalCommits = repos.reduce((n, r) => n + r.commits.length, 0)

    return (
        <div className="modal-backdrop" onMouseDown={() => close(false)}>
            <div className="modal standup-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <span>Standup / worklog</span>
                    <div>
                        <select value={rangeId} onChange={(e) => setRangeId(e.target.value)} className="standup-range">
                            {RANGES.map((r) => (
                                <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                        </select>
                        <button className="btn-min" onClick={generate}>regenerate</button>
                        <button className="btn-min" onClick={() => close(false)}>×</button>
                    </div>
                </div>
                <div className="modal-body standup-body">
                    <div className="standup-summary muted">
                        {loading ? "Collecting…" : `${totalCommits} commit${totalCommits === 1 ? "" : "s"} across ${repos.length} project${repos.length === 1 ? "" : "s"} · edit freely below`}
                    </div>
                    <textarea
                        className="standup-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        spellCheck={false}
                    />
                    <div className="standup-actions">
                        <button className="accent" onClick={copy}>{copied ? "✓ Copied" : "Copy markdown"}</button>
                        <span className="muted small">Commits are filtered to your git email per repo.</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
