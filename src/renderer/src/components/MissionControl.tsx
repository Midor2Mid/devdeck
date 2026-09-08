import { useEffect, useState } from "react"
import { useStore } from "../store"
import { pendingAnswer, sentLabel, sentTip } from "../answered"
import { useSettings, isUnsafeAgent, primaryAgentPreset } from "../settings"
import {
    getTail,
    getFullTail,
    getLastAt,
    relTime,
    sortForFollow,
    awaitedTermIds,
    promptFor
} from "../missionTail"
import { buildOwnership, type OwnershipMap } from "../ownership"
import { baselineOf, nextChangedCounts } from "../agentSignals"
import { exitCodeOf } from "../termExit"
import { resolveTileState, wantsYou, hasProcess } from "../tileState"
import { useKeyStatus } from "../keyStatus"
import { Icon } from "./Icon"
import type { SystemInfo } from "../../../preload/index"


// Whether the ports wall is open, persisted across view switches + restarts
// (localStorage, the same lightweight store OverviewView's group folding and the
// project MRU use - no workspace-schema change needed). Default CLOSED: this is
// ambient machine state with no agent edge, and eighteen port pills belonging to
// Steam and SQL Server were the loudest object on a stranger's first project
// screen. Someone who wants it open only has to say so once.
const PORTS_OPEN_KEY = "devdeck.missionPortsOpen"
function loadPortsOpen(): boolean {
    try {
        return localStorage.getItem(PORTS_OPEN_KEY) === "1"
    } catch {
        return false
    }
}
function savePortsOpen(open: boolean): void {
    try {
        localStorage.setItem(PORTS_OPEN_KEY, open ? "1" : "0")
    } catch {
        /* storage unavailable - ignore */
    }
}

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
    const activeId = useStore((s) => s.activeId)
    const newTab = useStore((s) => s.newTab)
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const setActiveProject = useStore((s) => s.setActiveProject)
    const openChanges = useStore((s) => s.openChanges)
    const setReviewOpen = useStore((s) => s.setReviewOpen)
    const agentSessions = useStore((s) => s.agentSessions)
    const respondApproval = useStore((s) => s.respondApproval)
    const replySession = useStore((s) => s.replySession)
    const sessionCwd = useStore((s) => s.sessionCwd)
    // Subscribe to the slices the session list derives from so tiles refresh.
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const termAgents = useStore((s) => s.termAgents)
    const seen = useStore((s) => s.seen)
    // Keystroke answers already sent, so a tile can say so instead of offering
    // the same button again. A stable slice, like `seen`.
    const answered = useStore((s) => s.answered)
    const termNames = useStore((s) => s.termNames)
    // The two places an outstanding expectation on a session is recorded. Both
    // are stable slices, so subscribing to them is safe; the Set is derived in
    // the body below rather than inside a selector, because a SELECTOR returning
    // a fresh Set on every call is the getSnapshot trap (see NOTES). Deriving it
    // here carries none of that risk and needs no memo - one pass over
    // boardTasks, on a component that already re-renders once a second.
    const boardTasks = useStore((s) => s.boardTasks)
    const pipelineRun = useStore((s) => s.pipelineRun)
    // Both are stable slices; the primary agent and the active project are
    // derived below, outside any selector, for the getSnapshot reason above.
    const agents = useSettings((s) => s.agents)
    const openSettings = useSettings((s) => s.openSettings)
    const primaryAgent = primaryAgentPreset(agents)
    const activeProject = projects.find((p) => p.id === activeId)
    void tabsByProject
    void agentStatus
    void termAgents
    void termNames

    // Held panes: "resume" is stamped on every agent pane at restore (store.ts,
    // the workspace load) and "restart" when a process exits. Either way there
    // is no process behind the tab.
    const paneHold = useStore((st) => st.paneHold)
    // The same two facts, through the resolver every other surface reads, so
    // the tile's own dot cannot describe this session differently from its chip.
    // Declared ahead of the sort because the sort reads it too.
    const keyStatusOf = useKeyStatus()
    // Attention-first: the agent that needs you floats to the top - ranked on
    // the DERIVED status, so a dead session cannot hold the first slot with the
    // `attention` it died wearing.
    const sessions = sortForFollow(agentSessions(), keyStatusOf)
    // A quiet agent is only stalled if something is actually waiting on it.
    const awaited = awaitedTermIds(boardTasks, pipelineRun)
    const totalAgents = sessions.length

    // Tiles the user has expanded to see fuller recent output inline.
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    // Reply drafts per session. Local, and cleared on send: a half-typed reply is
    // not worth persisting, and every tile holding one would be state churn on a
    // component that re-renders once a second.
    const [drafts, setDrafts] = useState<Record<string, string>>({})
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

    // Per-project uncommitted-change counts for the review queue. `null` for a
    // project whose count could not be read — the queue says so instead of
    // dropping the row, which read as "this one is clean".
    const [changes, setChanges] = useState<Record<string, number | null>>({})
    useEffect(() => {
        if (view !== "mission") return
        let on = true
        const fetchAll = (): void => {
            if (document.hidden) return
            for (const p of projects) {
                window.api.git
                    .status(p.path)
                    // `g.changes` is already the honest answer in all four cases -
                    // a count, 0 for a folder that is simply not a repo, and null
                    // when the count is unknown (a failed `git status`, or a cwd
                    // that does not resolve). `g.isRepo ? g.changes : 0` threw the
                    // null away, because a missing folder is ALSO isRepo:false,
                    // and reported 0 uncommitted changes for a folder that is gone.
                    .then((g) => on && setChanges((prev) => ({ ...prev, [p.id]: g.changes })))
                    // The IPC itself failing is the same unknown as a failed
                    // `git status` inside it — record it, don't leave the row
                    // showing the last number as though it were current.
                    .catch(() => on && setChanges((prev) => ({ ...prev, [p.id]: null })))
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
    const [portsOpen, setPortsOpen] = useState<boolean>(loadPortsOpen)
    const togglePorts = (): void =>
        setPortsOpen((prev) => {
            savePortsOpen(!prev)
            return !prev
        })

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
    // Paths each session has made dirty since it started, from the SAME read the
    // ownership map makes below — the chip adds no git call of its own.
    const [changedBySession, setChangedBySession] = useState<Record<string, number | null>>({})
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
                    // Carried, not re-derived: the ownership map keys sessions by
                    // TREE (two worktrees of one project cannot collide), and it
                    // has to be the same directory the read below used.
                    cwd: st.sessionCwd(s.termId),
                    // null, not [] - a failed read is UNKNOWN, not "nothing changed".
                    // git.changes rejects on purpose (a transient failure: a repo
                    // mid-rebase, an index.lock another agent holds, the timeout) so
                    // each caller can decide what unknown means; writing [] here made
                    // this caller silently choose "nothing" for a user-visible
                    // per-session claim, so a session with 12 changed files could
                    // drop to CHANGED · 0 files (losing its Review button) for one
                    // poll and flip back 8 seconds later.
                    files: await window.api.git
                        // M6: through sessionCwd, not a second spelling of it.
                        // `?? projectPath` and `|| projectPath` disagree for an
                        // empty-string termCwd entry, so the conflict map could
                        // read a different directory than the card evidence for
                        // the same session - the mismatch b66a23e existed to end.
                        .changes(st.sessionCwd(s.termId))
                        .then((cs) => cs.map((c) => c.path) as string[] | null)
                        .catch(() => null)
                }))
            )
            if (!on) return
            // Ownership only reflects sessions whose read succeeded this tick -
            // a failed one is simply absent from `ok` for this poll. The changed
            // count carries the failure instead: nextChangedCounts writes null
            // for that session, so the tile declines to make a file claim rather
            // than reading 0 or a count that was true eight seconds ago.
            const ok = entries.filter(
                (e): e is {
                    termId: string
                    sessionName: string
                    projectName: string
                    cwd: string
                    files: string[]
                } => e.files !== null
            )
            // The baseline goes in with the dirty list, so the map attributes to
            // a session only what appeared AFTER it started. Without it, every
            // session in a shared tree owned every dirty file in that tree and
            // the header claimed a red conflict per file - for two sessions that
            // had written nothing. Same evidence the tiles' CHANGED count uses,
            // so the two halves of this view can no longer disagree.
            setOwnership(buildOwnership(ok.map((e) => ({ ...e, baseline: baselineOf(e.termId) }))))
            setChangedBySession((prev) => nextChangedCounts(prev, entries))
        }
        void fetchOwn()
        const iv = setInterval(() => void fetchOwn(), 8000)
        return () => {
            on = false
            clearInterval(iv)
        }
    }, [view])

    // A project belongs in the queue when it has changes AND when nobody could
    // find out whether it has any. `?? 0` used to drop the second case, so a
    // repo mid-rebase or holding an index.lock was reported as reviewed.
    // `undefined` (not polled yet) is still excluded: that is a gap of one
    // interval on mount, not an answer.
    const reviewRows = projects.filter((p) => p.id in changes && changes[p.id] !== 0)

    const openReviewFor = (projectId: string): void => {
        setActiveProject(projectId)
        setReviewOpen(true)
    }

    // Resolve every tile's state ONCE per render, here, rather than inside the
    // grid's map: the header's "N need attention" count and the grid itself
    // must agree on what each tile is saying, and resolving twice (once for
    // the count, once per tile) would double the per-tile work this component
    // already does once a second for no reason.
    const now = Date.now()
    const resolved = sessions.map((s) => {
        // What this session IS, before the tile claims anything about it. The
        // chip had the rule and the tile's own dot and left border did not, so
        // one tile said NOT RUNNING in words while wearing the resting form of
        // a live agent 20px away - and `promptFor` was status-blind, which is
        // how a dead session could still have relayed a question (`prompt`
        // outranks the NOT-RUNNING rule inside resolveTileState).
        const keyStatus = keyStatusOf(s)
        const prompt = promptFor(s, keyStatus)
        const input = {
            status: s.status,
            prompt,
            exitCode: exitCodeOf(s.termId),
            lastAt: getLastAt(s.termId),
            // Passed through as-is, never `?? 0` and never `?? null`. An absent
            // entry is `undefined` - a session nobody has polled yet - and that
            // is a quieter fact than `null`, which means a poll ran and failed.
            changedCount: changedBySession[s.termId],
            awaited: awaited.has(s.termId),
            alive: !!termAgents[s.termId],
            // The tile is now asked the same question the header's "N running"
            // already asked: is there a process behind this tab? A restored
            // pane's pty died with the previous app process, and every status
            // below "held" describes a running agent.
            held: paneHold[s.termId]
        }
        return { s, prompt, keyStatus, input, st: resolveTileState(input, now) }
    })
    // The same predicate the deck bar's flag reads (tileState's wantsYou) — see
    // its doc comment for why this app cannot afford two counts for one
    // question again.
    const attention = resolved.filter((r) => wantsYou(r.input, now, !!seen[r.s.termId])).length
    // Sessions with a process behind them — NOT `sessions.length`, which counts
    // tabs and read "5 running" for five restored panes that had started
    // nothing. See hasProcess in tileState.
    const running = resolved.filter((r) => hasProcess(r.input, r.input.held)).length

    /**
     * The AGENTS empty state's one control — the only accent on this screen.
     *
     * Three states, because there are three. A project with an agent command
     * gets the act itself; a project with none gets the place to configure one
     * (DevDeck runs CLIs the user installs, so "start an agent" would be a
     * button that cannot keep its word); and with no active project there is no
     * cwd to spawn into, so `newTab` would no-op silently and nothing is
     * offered instead of a control that lies.
     *
     * `primaryAgent` comes from `primaryAgentPreset`, the one definition the
     * terminal tab bar's `+ <agent>` button and `Ctrl+Shift+Enter` also use, so
     * all three controls that claim to start "the" agent start the same one.
     * Until 29b257d the chord resolved `agents[0]` instead, and this comment
     * recorded that the chord was deliberately not cited because the
     * equivalence did not hold. It holds now; the history is kept because the
     * omission it explains would otherwise look like an oversight.
     */
    let startControl: JSX.Element | null = null
    if (activeProject && primaryAgent) {
        const risk = isUnsafeAgent(primaryAgent.command)
            ? ` This one skips permission prompts, so it can edit and run anything in ${activeProject.name} without asking.`
            : ""
        startControl = (
            <button
                className="accent"
                onClick={() => newTab(primaryAgent.id)}
                data-tip={`Starts ${primaryAgent.name} in ${activeProject.name} and switches to the terminal.${risk}`}
            >
                Start a {primaryAgent.name} session
            </button>
        )
    } else if (activeProject) {
        startControl = (
            <button
                className="accent"
                onClick={() => openSettings("agents")}
                data-tip="DevDeck runs agent CLIs you install yourself. Add one and it becomes a launch card."
            >
                Set up an agent command
            </button>
        )
    }

    return (
        <div className="mission">
            <div className="mission-section">
                <div className="mission-head">
                    <span className="section-label">AGENTS</span>
                    <span className="muted small">
                        {running} running{attention ? ` · ${attention} need attention` : ""}
                    </span>
                </div>
                {totalAgents === 0 ? (
                    <>
                        {/* The prose this replaced pointed at an icon-only ＋ on
                            the deck and at "the command palette", neither of
                            which a stranger can name - and Task 13 lands a new
                            project on Terminal, so the way to reach this state
                            is now to arrive on Mission with nothing running.
                            Written against CommandLauncher's empty state: say
                            what is true, then give the act its own control. */}
                        <div className="muted mission-empty">
                            No agent sessions yet. Start one and it appears here as a tile you can
                            watch and reply to, from whichever project it is running in.
                        </div>
                        {/* An unclassed block wrapper on purpose: .mission-section
                            is a column flex, so a bare button would stretch to
                            the full width of the pane. This keeps it intrinsic
                            and left-aligned with the section, and adds no CSS. */}
                        <div>{startControl}</div>
                    </>
                ) : (
                    <div className="mission-grid">
                        {resolved.map(({ s, prompt, keyStatus, st }) => {
                            const ago = relTime(now, getLastAt(s.termId))
                            const isExpanded = expanded.has(s.termId)
                            const stalled = st.kind === "stalled"
                            // An answer we sent moments ago and have heard nothing
                            // back about yet. Time-boxed rather than cleared on the
                            // agent's next byte - see ANSWERED_MS in answered.ts,
                            // which Overview's cards read too so one click cannot
                            // read as confirmed here and unconfirmed there.
                            const sent = pendingAnswer(answered[s.termId], now)
                            // changedBySession starts {} on mount (and briefly holds a
                            // stale count after a session's own reply while the next
                            // poll is in flight), so a session that is really CHANGED
                            // can read WAITING for one interval, show the reply box,
                            // and then flip to CHANGED - removing the box out from
                            // under a draft that was never sent. A draft keeps its
                            // input reachable across a state change like that one -
                            // but only where a reply still means something: nothing is
                            // listening on a dead process (exited()'s own comment says
                            // so), and NEEDS YOU is answered by the prompt's own two
                            // buttons, not by free text beside them. Without this
                            // narrowing, a half-typed reply on a WAITING/ASKING/STALLED
                            // tile whose process then exits - or that resolves to a
                            // parsed prompt - would keep rendering a control that
                            // cannot do anything, which is exactly the class of lie
                            // this feature exists to prevent.
                            const hasDraft = !!(drafts[s.termId] ?? "").trim()
                            const canReply =
                                st.actions.includes("reply") ||
                                (hasDraft && st.kind !== "exited" && st.kind !== "needs-you")
                            return (
                                <div
                                    key={s.termId}
                                    className={"mission-tile status-" + keyStatus + (stalled ? " stalled" : "")}
                                    data-tip={st.detail ?? (ago ? `Last output ${ago} ago` : undefined)}
                                    onClick={() => jumpToTerm(s.termId)}
                                >
                                    <div className="mission-tile-head">
                                        <span className={"tab-dot claude status-" + keyStatus} />
                                        {/* I3: the wrapper is no longer role="button", so this is the
                                            one focusable, announced control for "jump to this session" -
                                            without it, a screen-reader user would have no way to reach
                                            what the mouse's onClick above still does. The trace shows
                                            silence as a flatline, which a screen reader cannot see, so
                                            the sentence it replaces lives in this label along with
                                            everything else a sighted user reads off the tile (badge
                                            included), since the chip and question below now read as
                                            ordinary text rather than being swallowed by a wrapper label. */}
                                        <button
                                            className="mission-tile-name"
                                            aria-label={[s.sessionName, s.projectName, s.badge, st.chip, st.detail]
                                                .filter(Boolean)
                                                .join(" · ")}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                jumpToTerm(s.termId)
                                            }}
                                        >
                                            {s.sessionName}
                                        </button>
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
                                    <div className={"mtile-chip tone-" + st.tone}>
                                        <span className="mtile-mark" aria-hidden="true">
                                            {st.mark}
                                        </span>
                                        {st.chip}
                                    </div>
                                    {st.kind === "needs-you" && st.detail && (
                                        <div className="mtile-q" data-tip={st.detail}>
                                            {st.detail}
                                        </div>
                                    )}
                                    {(st.actions.length > 0 || canReply) && (
                                        <div className="mtile-actions" onClick={(e) => e.stopPropagation()}>
                                            {st.actions.includes("approve") &&
                                                prompt &&
                                                (sent ? (
                                                    /* The confirmation that did not exist: the
                                                       question stays visible (nobody knows yet
                                                       whether the answer was taken), but the two
                                                       live buttons are replaced by what was sent,
                                                       so the natural second press has nothing to
                                                       hit. It says "sent", never "approved". */
                                                    <span
                                                        className="muted small"
                                                        data-tip={sentTip(sent.keys)}
                                                    >
                                                        {sentLabel(sent.keys)}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <button
                                                            className="ov-approve-yes"
                                                            data-tip="Send Yes to the agent"
                                                            onClick={() =>
                                                                respondApproval(s.termId, prompt.approve)
                                                            }
                                                        >
                                                            ✓ Approve
                                                        </button>
                                                        <button
                                                            className="ov-approve-no"
                                                            data-tip="Reject this action"
                                                            onClick={() =>
                                                                respondApproval(s.termId, prompt.deny)
                                                            }
                                                        >
                                                            ✕ Deny
                                                        </button>
                                                    </>
                                                ))}
                                            {st.actions.includes("review") && (
                                                <button
                                                    className="mtile-act"
                                                    data-tip="Open this session's changes"
                                                    onClick={() => openChanges(sessionCwd(s.termId), s.sessionName)}
                                                >
                                                    Review
                                                </button>
                                            )}
                                            {canReply && (
                                                <input
                                                    className="mtile-reply"
                                                    placeholder="Reply…"
                                                    aria-label={`Reply to ${s.sessionName}`}
                                                    value={drafts[s.termId] ?? ""}
                                                    onChange={(e) =>
                                                        setDrafts((d) => ({ ...d, [s.termId]: e.target.value }))
                                                    }
                                                    onKeyDown={(e) => {
                                                        if (e.key !== "Enter") return
                                                        replySession(s.termId, drafts[s.termId] ?? "")
                                                        setDrafts((d) => ({ ...d, [s.termId]: "" }))
                                                    }}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="mission-section">
                <div className="mission-head">
                    <span className="section-label">Uncommitted changes</span>
                    {/* The title now says what the list is, so the subtitle carries
                        only what the title cannot: this counts hand-written and
                        AI-written work alike, because git cannot tell them apart. */}
                    <span className="muted small">hand-written and agent-written alike</span>
                </div>
                {reviewRows.length === 0 ? (
                    <div className="muted mission-empty">No uncommitted changes across your projects.</div>
                ) : (
                    <div className="mission-review">
                        {reviewRows.map((p) => (
                            <div key={p.id} className="mission-review-row">
                                <span className="mission-review-proj">{p.name}</span>
                                <span className="muted small">
                                    {changes[p.id] === null
                                        ? "couldn't check for changes"
                                        : `${changes[p.id]} changed file${changes[p.id] === 1 ? "" : "s"}`}
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
                        {/* The claim and the fact behind it, in the same place. The
                            count used to be the whole dirty tree seen twice, so it
                            went red on any dirty repo with two sessions; it now
                            counts only files that were not there when the sessions
                            started, and the tip says what that does and does not
                            prove. See buildOwnership. */}
                        <span
                            className={"muted small" + (ownership.conflicts > 0 ? " mission-own-warn" : "")}
                            data-tip={
                                ownership.conflicts > 0
                                    ? `${ownership.conflicts} file${ownership.conflicts === 1 ? "" : "s"} here appeared after two or more sessions in the same working tree had already started. DevDeck can't tell which session wrote them - only that nobody inherited them. Two agents in one working tree overwrite each other.`
                                    : "Files that appeared after a session started, in that session's working tree. A change that was already there when it launched belongs to the tree, not to the agent."
                            }
                        >
                            {ownership.conflicts > 0
                                ? `${ownership.conflicts} conflict${ownership.conflicts === 1 ? "" : "s"}`
                                : "changed since these sessions started"}
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
                        {/* Sentence case, unlike the uppercase labels above it, and
                            deliberately: "SYSTEM" named an internal concept, and a
                            stranger read it as "something about my system is wrong". */}
                        <span className="section-label">Ports in use on this PC</span>
                        <button
                            className="btn-min"
                            aria-expanded={portsOpen}
                            aria-label={
                                portsOpen
                                    ? "Hide ports in use on this PC"
                                    : "Show ports in use on this PC"
                            }
                            onClick={togglePorts}
                        >
                            <Icon name={portsOpen ? "chevronDown" : "chevronRight"} size={12} />{" "}
                            {portsOpen ? "hide" : "show"}
                        </button>
                    </div>
                    {/* Shown whether or not the wall is open - collapsed, it is what
                        tells you what "show" would reveal, and that these ports are
                        not DevDeck's. */}
                    <div className="muted small">every process listening right now, not only DevDeck</div>
                    {portsOpen && (
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
                    )}
                </div>
            )}
        </div>
    )
}
