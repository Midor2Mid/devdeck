import { useMemo, useState } from "react"
import { useStore, type AgentStatus } from "../store"

const ORDER: Record<AgentStatus, number> = { attention: 0, waiting: 1, working: 2, idle: 3 }

// A unified "agents" command center: every agent session across projects, with the
// ones needing attention pinned on top, a quick reply box, and jump-to. Serves the
// core goal — running several parallel Claude sessions without losing track.
export function InboxPanel(): JSX.Element {
    // Build the session list from raw slices in useMemo — calling agentSessions()
    // directly inside the selector returns a fresh array each render (infinite loop).
    const agentSessions = useStore((s) => s.agentSessions)
    const tabsByProject = useStore((s) => s.tabsByProject)
    const termAgents = useStore((s) => s.termAgents)
    const agentStatus = useStore((s) => s.agentStatus)
    const sessions = useMemo(
        () => agentSessions(),
        [agentSessions, tabsByProject, termAgents, agentStatus]
    )
    const close = useStore((s) => s.setInboxOpen)
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const replySession = useStore((s) => s.replySession)
    const [drafts, setDrafts] = useState<Record<string, string>>({})

    const sorted = [...sessions].sort((a, b) => ORDER[a.status] - ORDER[b.status])
    const attention = sessions.filter((s) => s.status === "attention" || s.status === "waiting").length

    // The same store action Mission's tiles call, so the drawer and the tiles
    // cannot drift on what "a reply" means again — the store action already
    // trims and refuses an empty line, and logs the activity both surfaces now
    // share.
    const send = (termId: string): void => {
        replySession(termId, drafts[termId] ?? "")
        setDrafts((d) => ({ ...d, [termId]: "" }))
    }

    return (
        <div className="drawer-backdrop" onMouseDown={() => close(false)}>
            <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
                <div className="drawer-head">
                    <span>
                        Agents
                        <span className="muted small" style={{ marginLeft: 8 }}>
                            {sessions.length} running
                            {attention > 0 ? ` · ${attention} need you` : ""}
                        </span>
                    </span>
                    <button className="btn-min" onClick={() => close(false)} data-tip="Close">
                        ×
                    </button>
                </div>
                <div className="drawer-body">
                    {sorted.length === 0 ? (
                        <div className="muted sidebar-empty">
                            No agent sessions running. Start one with <b>+ Claude</b> (or any agent).
                        </div>
                    ) : (
                        sorted.map((s) => (
                            <div key={s.termId} className={"inbox-row status-" + s.status}>
                                <div className="inbox-row-head">
                                    <span className={"tab-dot claude status-" + s.status} />
                                    <span className="inbox-tab">{s.sessionName}</span>
                                    <span className="inbox-project">{s.projectName}</span>
                                    <span className="agent-badge sm">{s.badge}</span>
                                    {s.status === "attention" && <span className="claude-attn">!</span>}
                                    <span className="spacer" />
                                    <button
                                        className="btn-min"
                                        data-tip="Jump to this session"
                                        onClick={() => {
                                            jumpToTerm(s.termId)
                                            close(false)
                                        }}
                                    >
                                        ↗
                                    </button>
                                </div>
                                <div className="inbox-reply">
                                    <input
                                        value={drafts[s.termId] ?? ""}
                                        placeholder="reply / prompt…"
                                        onChange={(e) =>
                                            setDrafts((d) => ({ ...d, [s.termId]: e.target.value }))
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") send(s.termId)
                                        }}
                                    />
                                    <button
                                        className="accent"
                                        disabled={!(drafts[s.termId] ?? "").trim()}
                                        onClick={() => send(s.termId)}
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
