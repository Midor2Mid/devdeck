export type BoardColumn = "todo" | "doing" | "review" | "done"

export interface BoardTask {
    id: string
    projectId: string
    /** The task text — sent to the agent verbatim as its prompt on dispatch. */
    title: string
    column: BoardColumn
    /** Linked agent session once dispatched. */
    termId?: string
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
