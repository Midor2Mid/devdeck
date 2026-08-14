import { useEffect, useMemo, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { tasksByColumn, COLUMNS, formatCost, type BoardColumn } from "../board"
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
    const aiAgents = useMemo(() => agents.filter((a) => a.runMode !== "normal"), [agents])

    const [draft, setDraft] = useState("")
    const [worktree, setWorktree] = useState(true)
    const [overrideOpen, setOverrideOpen] = useState<string | null>(null)

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
                                            {t.column === "todo" &&
                                                (() => {
                                                    // Computed here, in the render body, not inside a
                                                    // useSettings selector — routeAgent builds a fresh
                                                    // object every call, which would spin the same
                                                    // infinite-loop bug the comment above describes.
                                                    const routed = routeAgent(
                                                        routingRules,
                                                        { title: t.title, projectId: activeProject.id },
                                                        agents,
                                                        defaultAgentId
                                                    )
                                                    const resolvedAgent = agents.find((a) => a.id === routed.agentId)
                                                    const rule = routed.ruleId
                                                        ? routingRules.find((r) => r.id === routed.ruleId)
                                                        : undefined
                                                    return (
                                                        <span className="board-dispatch">
                                                            <button
                                                                className="board-btn accent board-dispatch-btn"
                                                                data-tip={
                                                                    rule
                                                                        ? describeRule(rule, activeProject.name)
                                                                        : undefined
                                                                }
                                                                onClick={() =>
                                                                    void dispatchBoardTask(t.id, { worktree })
                                                                }
                                                            >
                                                                Dispatch{resolvedAgent ? ` · ${resolvedAgent.name}` : ""}
                                                            </button>
                                                            <button
                                                                className="board-btn accent board-dispatch-caret"
                                                                aria-label="Choose an agent"
                                                                data-tip="Override the agent for this dispatch"
                                                                onClick={() =>
                                                                    setOverrideOpen((v) => (v === t.id ? null : t.id))
                                                                }
                                                            >
                                                                <Icon name="chevronDown" size={11} />
                                                            </button>
                                                            {overrideOpen === t.id && (
                                                                <>
                                                                    <div
                                                                        className="menu-backdrop"
                                                                        onClick={() => setOverrideOpen(null)}
                                                                    />
                                                                    <div className="agent-menu board-dispatch-menu">
                                                                        {aiAgents.map((a) => (
                                                                            <button
                                                                                key={a.id}
                                                                                type="button"
                                                                                role="menuitem"
                                                                                className="agent-menu-name"
                                                                                onClick={() => {
                                                                                    setOverrideOpen(null)
                                                                                    void dispatchBoardTask(t.id, {
                                                                                        worktree,
                                                                                        agentId: a.id
                                                                                    })
                                                                                }}
                                                                            >
                                                                                {a.name}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </span>
                                                    )
                                                })()}
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
