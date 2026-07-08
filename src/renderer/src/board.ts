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
