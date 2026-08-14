export type BoardColumn = "todo" | "doing" | "review" | "done"

export interface BoardTask {
    id: string
    projectId: string
    /** The task text — sent to the agent verbatim as its prompt on dispatch. */
    title: string
    column: BoardColumn
    /** Linked agent session once dispatched. */
    termId?: string
    /**
     * The agent preset dispatched on this card. Stamped alongside `termId`
     * because it has to outlive it: the pane usually closes before the card is
     * dragged to done, and reading the agent back off a closed pane returns
     * nothing — which left the run ledger's agents column blank on most card
     * rows, one of the seven columns it promises.
     */
    agentId?: string
    /**
     * The project's name as it was at dispatch. Resolving the name from live
     * projects when a run is recorded writes a blank for a project since removed,
     * which renders as an empty cell and collapses every removed project onto one
     * blank entry in the run filter — the opposite of "a removed project's
     * history stays readable".
     */
    projectName?: string
    /** Worktree path if dispatched isolated. */
    worktree?: string
    createdAt: number
    /** When an agent was dispatched on this card — the start of its cost window. */
    dispatchedAt?: number
    /** When it reached done, closing the cost window. Absent while still running. */
    endedAt?: number
    /**
     * Estimated USD this card's agent work cost, and the tokens behind it. Cached
     * on the card because it's derived from transcript files on disk: recomputing
     * on every render would re-read them constantly, and a finished card's cost
     * never changes again.
     */
    cost?: number
    costTokens?: number
    /**
     * The `dispatchedAt` of the run already written to the run ledger for this
     * card, or absent if none has been. Moving a card out of done clears its
     * endedAt and cost and lets it accrue again, so done → doing → done would
     * otherwise write a SECOND record over [dispatchedAt, laterEnd] — a window
     * that *contains* the first one's rather than being a delta from it — and
     * both would be summable. One ordinary drag, no race needed.
     *
     * It lives on the card rather than in a renderer-module set because it has
     * to be exactly as durable as the thing it guards: a quit empties module
     * state, while workspace.json brings `dispatchedAt` and `termId` straight
     * back. Here it rides to disk with the rest of the card for free.
     *
     * Compared against `dispatchedAt`, not merely checked for presence: a
     * genuine re-dispatch stamps a fresh `dispatchedAt`, which is a new run over
     * a new window, and it does record again.
     */
    recordedFor?: number
}

/**
 * The window a card's agent work occupies: dispatch → done, or dispatch → now if
 * it hasn't finished. Returns null when the card was never dispatched, which is
 * the case for every card added by hand and never handed to an agent.
 */
export function costWindow(task: BoardTask, now: number): { from: number; to: number } | null {
    if (!task.dispatchedAt) return null
    return { from: task.dispatchedAt, to: task.endedAt ?? now }
}

/** Two-significant-figure USD, so sub-cent work doesn't render as "$0.00". */
export function formatCost(usd: number): string {
    if (usd <= 0) return "$0"
    if (usd < 0.01) return "<$0.01"
    if (usd < 1) return `$${usd.toFixed(2)}`
    if (usd < 10) return `$${usd.toFixed(2)}`
    return `$${usd.toFixed(0)}`
}

export const COLUMNS: BoardColumn[] = ["todo", "doing", "review", "done"]

/** Filter tasks to a project and group them by column (insertion order preserved). */
export function tasksByColumn(tasks: BoardTask[], projectId: string): Record<BoardColumn, BoardTask[]> {
    const out: Record<BoardColumn, BoardTask[]> = { todo: [], doing: [], review: [], done: [] }
    for (const t of tasks) {
        if (t.projectId === projectId) out[t.column].push(t)
    }
    return out
}

/** Split pasted text into task titles, one per non-blank line, stripping list markers. */
export function parseChecklist(text: string): string[] {
    return text
        .split("\n")
        .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)]|\[[ xX]?\])\s*/, "").trim())
        .filter(Boolean)
}
