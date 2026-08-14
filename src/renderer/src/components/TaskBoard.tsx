import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useStore } from "../store"
import { useSettings, aiModeAgents, type AgentPreset } from "../settings"
import { tasksByColumn, COLUMNS, formatCost, type BoardColumn, type BoardTask } from "../board"
import { routeAgent, type RoutingRule } from "../routing"
import { Icon } from "./Icon"

const COL_LABEL: Record<BoardColumn, string> = {
    todo: "Todo",
    doing: "Doing",
    review: "Review",
    done: "Done"
}

/**
 * Human-readable reason a rule matched, for the dispatch control's `data-tip`.
 * An automatic choice you cannot trace is what makes routing feel unpredictable.
 */
function describeRule(rule: RoutingRule, projectName: string): string {
    switch (rule.kind) {
        case "always":
            return "Routed by rule: always"
        case "title":
            return `Routed by rule: title contains "${rule.pattern}"`
        case "titleGlob":
            return `Routed by rule: title matches "${rule.pattern}"`
        case "project":
            return `Routed by rule: project is ${projectName}`
        default:
            return "Routed by rule"
    }
}

/**
 * A card's Dispatch control: a split button naming the resolved agent, plus a
 * chevron opening a menu of AI-mode presets to override it for this dispatch
 * only.
 *
 * The override menu is rendered through a portal to `<body>` and positioned
 * from the caret's rect, in `useLayoutEffect`, the same way `LaunchOptions`
 * positions its popover. It used to be `position: absolute; top: 100%` inside
 * `.board-cards`, which sets `overflow-y: auto` — and per the CSS overflow
 * spec, one axis set to `auto`/`hidden` forces the other axis (here
 * `overflow-x`) to compute as `auto` too, so the menu was clipped the moment a
 * card sat near the bottom of a full column. A portal leaves that scrolling
 * ancestor entirely, so it can no longer clip the menu; positioning flips the
 * menu above the caret when there isn't room below, and clamps horizontally
 * so a narrow column doesn't push it off the edge of the viewport either.
 */
function CardDispatch({
    task,
    projectId,
    projectName,
    agents,
    aiAgents,
    routingRules,
    defaultAgentId,
    worktree,
    dispatchBoardTask
}: {
    task: BoardTask
    projectId: string
    projectName: string
    agents: AgentPreset[]
    aiAgents: AgentPreset[]
    routingRules: RoutingRule[]
    defaultAgentId: string
    worktree: boolean
    dispatchBoardTask: (id: string, opts: { worktree: boolean; agentId?: string }) => Promise<void>
}): JSX.Element {
    const [open, setOpen] = useState(false)
    const caretRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

    // Computed here, in the render body, not inside a useSettings selector —
    // routeAgent builds a fresh object every call, which would spin the same
    // infinite-loop bug the comment above TaskBoard's own selectors describes.
    const routed = routeAgent(routingRules, { title: task.title, projectId }, aiAgents, defaultAgentId)
    const resolvedAgent = agents.find((a) => a.id === routed.agentId)
    const rule = routed.ruleId ? routingRules.find((r) => r.id === routed.ruleId) : undefined
    const noAiAgents = aiAgents.length === 0

    useLayoutEffect(() => {
        if (!open) return
        const anchor = caretRef.current
        const menu = menuRef.current
        if (!anchor || !menu) return
        const a = anchor.getBoundingClientRect()
        const b = menu.getBoundingClientRect()
        const gap = 3
        const edge = 8
        let top = a.bottom + gap
        // Flip above the caret when there isn't room below — the bottom-most
        // card in a full column, or any card once the column fills, is
        // exactly the case that used to leave the menu clipped and unreachable.
        if (top + b.height > window.innerHeight - edge) top = a.top - b.height - gap
        top = Math.max(edge, top)
        let left = a.right - b.width // right-aligned to the caret, as before
        left = Math.max(edge, Math.min(left, window.innerWidth - b.width - edge))
        setPos({ left, top })
    }, [open, aiAgents.length])

    return (
        <span className="board-dispatch">
            <button
                className="board-btn accent"
                data-tip={
                    noAiAgents
                        ? "No AI agent preset is configured — add one in Settings to dispatch"
                        : rule
                          ? describeRule(rule, projectName)
                          : undefined
                }
                disabled={noAiAgents}
                onClick={() => void dispatchBoardTask(task.id, { worktree })}
            >
                Dispatch{resolvedAgent ? ` · ${resolvedAgent.name}` : ""}
            </button>
            <button
                ref={caretRef}
                className="board-btn accent board-dispatch-caret"
                aria-label="Choose an agent"
                data-tip={
                    noAiAgents
                        ? "No AI agent preset is configured — add one in Settings to dispatch"
                        : "Override the agent for this dispatch"
                }
                disabled={noAiAgents}
                onClick={() => setOpen((v) => !v)}
            >
                <Icon name="chevronDown" size={11} />
            </button>
            {open &&
                createPortal(
                    <>
                        <div className="menu-backdrop" onClick={() => setOpen(false)} />
                        <div
                            ref={menuRef}
                            className="agent-menu board-dispatch-menu"
                            // Hidden until measured (0-sized on the first paint), so it
                            // never flashes at the top-left before position is known.
                            style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
                        >
                            {aiAgents.map((a) => (
                                <div key={a.id} className="agent-menu-row">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="agent-menu-name"
                                        onClick={() => {
                                            setOpen(false)
                                            void dispatchBoardTask(task.id, { worktree, agentId: a.id })
                                        }}
                                    >
                                        {a.name}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>,
                    document.body
                )}
        </span>
    )
}

/**
 * Per-project task board: create task cards, dispatch one to an agent (in its own
 * worktree by default), and track it across Todo · Doing · Review · Done. A
 * dispatched card auto-moves to Review when its agent goes idle.
 */
export function TaskBoard(): JSX.Element {
    const activeProject = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const boardTasks = useStore((s) => s.boardTasks)
    const agentStatus = useStore((s) => s.agentStatus)
    const addBoardTask = useStore((s) => s.addBoardTask)
    const moveBoardTask = useStore((s) => s.moveBoardTask)
    const removeBoardTask = useStore((s) => s.removeBoardTask)
    const dispatchBoardTask = useStore((s) => s.dispatchBoardTask)
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const openChanges = useStore((s) => s.openChanges)
    const refreshTaskCost = useStore((s) => s.refreshTaskCost)
    const openRace = useStore((s) => s.openRace)
    const races = useStore((s) => s.races)

    // Select the stable slices and derive in the render body — filtering or
    // routing *inside* a useSettings/useStore selector returns a fresh array or
    // object every render, which zustand reads as a new value and spins into an
    // infinite update loop (React #185). See TaskBoard.tsx's costKey comment
    // above and ChangesModal.tsx:49-51 for two real instances of this bug.
    const agents = useSettings((s) => s.agents)
    const routingRules = useSettings((s) => s.routingRules)
    const defaultAgentId = useSettings((s) => s.defaultAgentId)
    // Only AI-mode presets can run a task; normal-mode ones are plain commands.
    const aiAgents = useMemo(() => aiModeAgents(agents), [agents])

    const [draft, setDraft] = useState("")
    const [worktree, setWorktree] = useState(true)

    // Price dispatched cards when the board opens, when one is dispatched, and
    // when its agent settles or it finishes.
    //
    // The dependency is a key built from id + endedAt + agent status, deliberately
    // NOT the cost itself — refreshTaskCost writes cost back into boardTasks, so
    // depending on the whole array (or on cost) would re-trigger this effect with
    // every write and spin forever. Neither the build nor typecheck catches that;
    // only running the app does.
    const dispatched = boardTasks.filter((t) => t.dispatchedAt && t.projectId === activeProject?.id)
    const costKey = dispatched
        .map((t) => `${t.id}:${t.endedAt ?? "live"}:${t.termId ? (agentStatus[t.termId] ?? "") : ""}`)
        .join(",")
    useEffect(() => {
        for (const id of costKey ? costKey.split(",").map((s) => s.split(":")[0]) : []) {
            void refreshTaskCost(id)
        }
    }, [costKey, refreshTaskCost])

    if (!activeProject) {
        return (
            <div className="empty-state">
                <p>No project selected.</p>
            </div>
        )
    }

    const grouped = tasksByColumn(boardTasks, activeProject.id)
    const add = (): void => {
        if (draft.trim()) {
            addBoardTask(activeProject.id, draft)
            setDraft("")
        }
    }
    const idx = (c: BoardColumn): number => COLUMNS.indexOf(c)

    return (
        <div className="board">
            <div className="board-cols">
                {COLUMNS.map((col) => (
                    <div
                        key={col}
                        className="board-col"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            const id = e.dataTransfer.getData("text/board-task")
                            if (id) moveBoardTask(id, col)
                        }}
                    >
                        <div className="board-col-head">
                            <span className="section-label">{COL_LABEL[col]}</span>
                            <span className="muted small">{grouped[col].length}</span>
                        </div>

                        {col === "todo" && (
                            <div className="board-add">
                                <textarea
                                    className="board-add-input"
                                    placeholder="New task… (Enter to add; paste a checklist for many)"
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key !== "Enter") return
                                        // A textarea so a pasted checklist keeps its
                                        // line breaks — but almost every card is one
                                        // line, and Enter is what a one-line field is
                                        // expected to do. Shift+Enter still types a
                                        // newline, paste is untouched (it doesn't use
                                        // this key), and Ctrl/Cmd+Enter keeps working
                                        // for anyone who learned it.
                                        if (e.shiftKey) return
                                        e.preventDefault()
                                        add()
                                    }}
                                />
                                <div className="board-add-foot">
                                    <label className="board-wt">
                                        <input
                                            type="checkbox"
                                            checked={worktree}
                                            onChange={(e) => setWorktree(e.target.checked)}
                                        />
                                        worktree
                                    </label>
                                    <button className="accent" onClick={add} disabled={!draft.trim()}>
                                        Add
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="board-cards">
                            {grouped[col].map((t) => {
                                const status = t.termId ? agentStatus[t.termId] : undefined
                                // A race outlives the todo column — cards are draggable and have move
                                // arrows, and a race left running in doing/review would otherwise have
                                // no door back to it while its agents keep running and billing.
                                const isRacing = !!races[t.id]
                                return (
                                    <div
                                        key={t.id}
                                        className="board-card"
                                        draggable
                                        onDragStart={(e) => e.dataTransfer.setData("text/board-task", t.id)}
                                    >
                                        <div className="board-card-title">{t.title}</div>
                                        <div className="board-card-foot">
                                            {status && <span className={"tab-dot claude status-" + status} />}
                                            {t.cost !== undefined && t.cost > 0 && (
                                                <span
                                                    className="board-card-cost"
                                                    data-tip={
                                                        `About ${formatCost(t.cost)} of agent work` +
                                                        (t.costTokens ? ` · ${t.costTokens.toLocaleString()} tokens` : "") +
                                                        `\nEverything this project's agents did while the card was open${t.endedAt ? "" : " (still running)"}.`
                                                    }
                                                >
                                                    {formatCost(t.cost)}
                                                </span>
                                            )}
                                            {t.column === "todo" && (
                                                <CardDispatch
                                                    task={t}
                                                    projectId={activeProject.id}
                                                    projectName={activeProject.name}
                                                    agents={agents}
                                                    aiAgents={aiAgents}
                                                    routingRules={routingRules}
                                                    defaultAgentId={defaultAgentId}
                                                    worktree={worktree}
                                                    dispatchBoardTask={dispatchBoardTask}
                                                />
                                            )}
                                            {(t.column === "todo" || isRacing) && (
                                                <button
                                                    className="board-btn"
                                                    data-tip={
                                                        isRacing
                                                            ? "Open the race running on this card"
                                                            : "Race two or three agents on this card"
                                                    }
                                                    onClick={() => openRace(t.id)}
                                                >
                                                    {isRacing ? "Race · live" : "Race"}
                                                </button>
                                            )}
                                            {t.termId && (t.column === "doing" || t.column === "review") && (
                                                <button className="board-btn" onClick={() => jumpToTerm(t.termId!)}>
                                                    Jump
                                                </button>
                                            )}
                                            {t.column === "review" && (
                                                <button
                                                    className="board-btn"
                                                    onClick={() =>
                                                        openChanges(t.worktree ?? activeProject.path, t.title)
                                                    }
                                                >
                                                    Diff
                                                </button>
                                            )}
                                            {idx(t.column) > 0 && (
                                                <button
                                                    className="board-btn"
                                                    data-tip="Move back"
                                                    onClick={() => moveBoardTask(t.id, COLUMNS[idx(t.column) - 1])}
                                                >
                                                    ‹
                                                </button>
                                            )}
                                            {idx(t.column) < COLUMNS.length - 1 && (
                                                <button
                                                    className="board-btn"
                                                    data-tip="Move forward"
                                                    onClick={() => moveBoardTask(t.id, COLUMNS[idx(t.column) + 1])}
                                                >
                                                    ›
                                                </button>
                                            )}
                                            <button
                                                className="board-btn board-del"
                                                data-tip="Delete"
                                                onClick={() => removeBoardTask(t.id)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
