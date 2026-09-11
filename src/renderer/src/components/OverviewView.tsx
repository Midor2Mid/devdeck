import { useEffect, useMemo, useState } from "react"
import { useStore } from "../store"
import { pendingAnswer, sentLabel, sentTip } from "../answered"
import type { AnySession } from "../store"
import { SplitView } from "./SplitView"
import { Icon } from "./Icon"
import { getTail, peekLine, sortForFollow, followRank, promptFor } from "../missionTail"
import { type DeckKeyStatus } from "../deck"
import { useKeyStatus } from "../keyStatus"
import { type ApprovalPrompt } from "../approval"
import { declaredFor, blockedWord, saidTip } from "../declaredSignal"
import type { DeclaredSignal } from "../../../shared/attention"

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

/**
 * The dot on a card, a rail row or a collapsed group's mini-strip.
 *
 * Takes the status rather than reading `s.status`, because `s.status` is what
 * the agent last DID and it survives the process that did it: every dot on this
 * surface painted `status-idle` - the resting form of a live agent - for a
 * session restored from the last run. The caller derives it once through
 * `deckKeyStatus` (see `statusOf` below), which is the same predicate behind
 * Mission's "N running" count, its NOT RUNNING chip and the deck key's dot.
 *
 * A shell keeps its own single form: it is not an agent, so none of the five
 * agent forms apply to it.
 */
function dotClass(s: AnySession, status: DeckKeyStatus): string {
    return s.isAgent ? "tab-dot claude status-" + status : "tab-dot shell"
}

/**
 * The WORD for a session that is blocked on you — on every session head this
 * view has, not just the rail row.
 *
 * The rail row has said "needs you" / "waiting for you" since it was written;
 * the focus header and the grid card head said nothing, and carried the state
 * on the 6px dot alone. That was survivable only while the waiting dot
 * breathed. It is static now (deliberately: motion was the only thing telling
 * waiting from working in a still frame, which is the defect that got fixed),
 * and Overview has no nag channel of its own — no breathing key, no wants-you
 * flag — so on these two heads `waiting` had no legible marker left at all.
 * DESIGN.md's rule for that situation is to prefer a word, and these heads have
 * room for one.
 *
 * One component rather than three copies, and the same two words the rail
 * already shipped, so the three heads cannot come to describe one state
 * differently — the failure this whole surface has been corrected for twice.
 *
 * `null` for every other status: the marker only ever ADDS, and a session that
 * is working or resting or dead is not blocked on you. `not-running` in
 * particular must not appear here — it says nothing is listening.
 *
 * Takes the DERIVED status (`useKeyStatus`), because "blocked on you" is a
 * claim about a live process and `s.status` outlives the one that made it.
 *
 * PROVENANCE RIDES THE SAME WORDS, as a verb: `needs you` is DevDeck's reading
 * of the terminal, `says it needs you` is the agent stating it over the hook.
 * That is the whole marker - no sixth dot form, no accent, no new token, and
 * nothing a stranger has to look up. `blockedWord` owns both halves so the
 * three heads cannot come to describe one state differently, which is the
 * failure this component was extracted to prevent in the first place.
 */
function StatusFlag({
    status,
    said,
    block
}: {
    status: DeckKeyStatus
    /** The agent's own declaration for this status, or null if DevDeck inferred it. */
    said?: DeclaredSignal | null
    block?: boolean
}): JSX.Element | null {
    const word = blockedWord(status, said ?? null)
    if (!word) return null
    return (
        <span
            className={"ov-flag " + status + (block ? " ov-ri-flag" : "")}
            data-tip={said ? saidTip(said) : undefined}
        >
            {word}
        </span>
    )
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
 *  opening its terminal. stopPropagation so it doesn't also trigger the row.
 *
 *  Used by both Overview modes (the Focus rail and the Grid cards), so the
 *  confirmation below lands on every place this surface offers the buttons.
 *
 *  `prompt` is optional and the mount decision lives HERE rather than at the
 *  two call sites, because with `{approval && …}` around it the two surfaces
 *  disagreed about the same state. A Grid card embeds a live terminal, so
 *  answering it produces a byte, the byte reclassifies the session to
 *  `working`, `promptFor` stops returning a prompt — and the whole block
 *  unmounted, taking the confirmation with it. The Focus rail showed the sent
 *  row correctly only because a rail session's pane is not rendered, so no byte
 *  arrived. Same state, same 6s constant, one place to decide. */
function ApprovalActions({ termId, prompt }: { termId: string; prompt?: ApprovalPrompt | null }): JSX.Element | null {
    const respond = useStore((s) => s.respondApproval)
    // A stable slice, like `seen` — the store's runtime record of what WE sent.
    const answered = useStore((s) => s.answered)
    // The same record and the same window Mission's tile reads (answered.ts).
    // This surface raised the toast and then kept two live buttons under the
    // question, so one click read as confirmed on Mission and unconfirmed here
    // — and the honest next move for a stranger was to press it again, into a
    // live agent. `Date.now()` at render rather than a timer of our own: this
    // view already repaints every 1500ms for the rail peeks, so the row clears
    // within one tick of the window closing.
    const sent = pendingAnswer(answered[termId], Date.now())
    // Nothing to say: no live prompt, and no answer inside its window. The one
    // case that used to unmount the confirmation is the other one — the prompt
    // has gone but the answer is still inside its 6s window — and there the
    // sent row stands on its own. The question is not invented back: a Grid
    // card has the agent's own terminal directly below this, which is where the
    // question still is.
    if (!prompt && !sent) return null
    return (
        <div className="ov-approve" onClick={(e) => e.stopPropagation()}>
            {prompt && (
                <div className="ov-approve-q" data-tip={prompt.question}>
                    {prompt.question}
                </div>
            )}
            {sent ? (
                /* The question stays — nobody knows yet whether the answer was
                   taken — but the two live buttons are replaced by what was
                   sent, so the natural second press has nothing to hit. It says
                   "sent", never "approved". */
                <div className="ov-approve-sent muted small" data-tip={sentTip(sent.keys)}>
                    {sentLabel(sent.keys)}
                </div>
            ) : prompt ? (
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
            ) : null}
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
    // Carries the `paneHold` subscription that repaints a card whose process
    // went away - see useKeyStatus.
    const keyStatusOf = useKeyStatus()
    // The provenance axis. A stable slice - the record is read per session below
    // through `declaredFor`, never derived in the selector.
    const declared = useStore((s) => s.declared)
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

    // What one session on this surface may claim. Every claim below reads the
    // shared resolver and not `s.status`: the dot, the `!` glyph, the "needs
    // you" flag and - since it is what the two Approve / Deny buttons hang off
    // - the permission prompt itself are all statements about a RUNNING agent,
    // and a restored or exited session kept making them here after Mission and
    // the deck had both stopped.
    const ordered = useMemo(() => sortForFollow(sessions, keyStatusOf), [sessions, keyStatusOf])

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
        // Both orderings read the shared follow order (missionTail), the same one
        // the rail above and Mission's grid use. This surface used to rank on
        // `status` with a private function, so the two lists could disagree about
        // which session came first — the defect `wantsYou`'s comment describes.
        const arr = [...byKey.values()]
        arr.forEach((gr) => (gr.sessions = sortForFollow(gr.sessions, keyStatusOf)))
        // Ranked on the derived status too, or a group whose agents have all
        // exited would sort above one still working on the `attention` the
        // last of them died wearing.
        const best = (gr: { sessions: AnySession[] }): number =>
            Math.min(...gr.sessions.map((s) => followRank(keyStatusOf(s))))
        arr.sort((a, b) => best(a) - best(b) || a.label.localeCompare(b.label))
        return arr
    }, [sessions, projects, keyStatusOf])

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
                            <span className={dotClass(focused, keyStatusOf(focused))} />
                            <EditableName termId={focused.termId} name={focused.sessionName} className="ov-main-name" />
                            {focused.isAgent && <span className="agent-badge sm">{focused.badge}</span>}
                            {keyStatusOf(focused) === "attention" && <span className="claude-attn">!</span>}
                            <StatusFlag
                                status={keyStatusOf(focused)}
                                said={declaredFor(declared, focused.termId, keyStatusOf(focused))}
                            />
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
                            const status = keyStatusOf(s)
                            // Gated on the DERIVED status: a `not-running` row
                            // was still offering live Approve / Deny under a
                            // question nothing was listening for.
                            const approval = promptFor(s, status)
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
                                        <span className={dotClass(s, status)} />
                                        <span className="ov-ri-name">{s.sessionName}</span>
                                        {s.isAgent && <span className="agent-badge sm">{s.badge}</span>}
                                        {status === "attention" && <span className="claude-attn">!</span>}
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
                                    {/* The flag is the same lie in WORDS: a dead
                                        session whose last status was `attention`
                                        read "needs you", and nothing in there
                                        needs anything. Derived, so the row's dot
                                        and its sentence cannot disagree either.
                                        `block` keeps this on its own line, above
                                        the peek — the two heads share the words
                                        but put them inline. */}
                                    <StatusFlag
                                        status={status}
                                        said={declaredFor(declared, s.termId, status)}
                                        block
                                    />
                                    {peek && <div className="ov-ri-peek">{peek}</div>}
                                    <ApprovalActions termId={s.termId} prompt={approval} />
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
                                            <span key={s.termId} className={dotClass(s, keyStatusOf(s))} />
                                        ))}
                                    </span>
                                )}
                                <span className="ov-grp-expand">
                                    {collapsed.has(g.key) ? "show" : "hide"}
                                </span>
                            </div>
                            <div className="ov-grid">
                                {g.sessions.map((s) => {
                                    const status = keyStatusOf(s)
                                    const approval = promptFor(s, status)
                                    return (
                                    <div key={s.termId} className="ov-card">
                                        <div className="ov-card-head">
                                            <span className={dotClass(s, status)} />
                                            <EditableName termId={s.termId} name={s.sessionName} className="ov-card-name" />
                                            {s.isAgent && (
                                                <span className="agent-badge sm">{s.badge}</span>
                                            )}
                                            {status === "attention" && (
                                                <span className="claude-attn">!</span>
                                            )}
                                            <StatusFlag
                                                status={status}
                                                said={declaredFor(declared, s.termId, status)}
                                            />
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
                                        <ApprovalActions termId={s.termId} prompt={approval} />
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
