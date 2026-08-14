/**
 * Renderer-side summaries of the run ledger (src/main/ledger.ts). Pure logic
 * only - no electron, no fs, no window.api - so it tests directly under
 * vitest and Task 4 can render whatever it returns.
 *
 * The one rule that matters: a row's cost is sometimes an *attribution* over
 * a shared project directory and time window, not a receipt for that run
 * alone - RunRecord.exclusive is false whenever another agent session
 * overlapped the run's window in the same directory. Summing those rows into a
 * total would double count (or worse, misattribute) real money, so runTotals
 * leaves them out and reports how many were excluded instead of silently
 * under-reporting - and, since `exclusive: false` is not one fact but two,
 * reports which kind of not-a-receipt each one was.
 */

import type { RunKind, RunRecord } from "../../main/ledger"
// One money formatter for the whole renderer. A second one lived here and wrote
// a real $0.004 run as "$0.00" - free, which it was not - while board.ts's
// (same name, same renderer) already said "<$0.01". Re-exported rather than
// reimplemented, so there is exactly one answer to how DevDeck writes a dollar.
import { formatCost } from "./board"

export { formatCost }

export interface RunTotals {
    /** Summed cost of exclusive runs only. */
    cost: number
    /** How many rows contributed. */
    counted: number
    /** How many were left out because their cost was not a receipt. */
    excluded: number
    /** Of `excluded`, how many shared a directory with another session. */
    excludedShared: number
    /** Of `excluded`, how many had no cost to vouch for. */
    excludedUnpriced: number
}

/**
 * `excluded` is the total; the two sub-counts explain it and need not add up to
 * it. A record written before `reason` existed says only that it isn't a
 * receipt, and guessing a reason for it would be exactly the invented fact the
 * reason field was added to stop.
 */
export function runTotals(runs: RunRecord[]): RunTotals {
    const totals: RunTotals = {
        cost: 0,
        counted: 0,
        excluded: 0,
        excludedShared: 0,
        excludedUnpriced: 0
    }
    for (const run of runs) {
        if (!run.exclusive) {
            totals.excluded++
            if (run.reason === "shared") totals.excludedShared++
            else if (run.reason === "unpriced") totals.excludedUnpriced++
            continue
        }
        totals.cost += run.cost
        totals.counted++
    }
    return totals
}

export function filterRuns(runs: RunRecord[], kind?: RunKind, projectId?: string): RunRecord[] {
    return runs.filter((run) => {
        if (kind !== undefined && run.kind !== kind) return false
        if (projectId !== undefined && run.projectId !== projectId) return false
        return true
    })
}

/**
 * How many records to ask the bridge for. The store rotates at RUN_CAP, so this
 * is "everything" - stated as a number rather than left unbounded, which put a
 * whole unbounded file through IPC on every panel open and would have grown
 * without limit if a rotation ever failed. (RUN_CAP itself lives in main, whose
 * module imports electron; naming the same number here is the price of not
 * pulling that into the renderer bundle.)
 */
export const RUN_READ_LIMIT = 5000

export interface RunsSentence {
    /** How many runs are on screen. The list and this number must agree. */
    count: number
    unit: "run" | "runs"
    /** The exclusive-only total, formatted. */
    cost: string
    /** The clause after the figures - why the total omits rows, or why there are none. Empty when neither applies. */
    why: string
}

/**
 * The one sentence above the run list: "12 runs · $4.18 · 3 excluded from the
 * total (shared a project with another session)".
 *
 * Two numbers with two different jobs, and they are deliberately not the same
 * one. `count` counts the rows the user can see - stating the exclusive-only
 * count there would print "0 runs" above three rendered rows. `cost` sums only
 * the exclusive ones, because a shared run's figure is an attribution over a
 * project directory and time window rather than a receipt for that run. The gap
 * between the two is exactly what the `why` clause exists to say out loud;
 * dropping it would leave an under-report looking like a receipt.
 */
export function runsSentence(
    totals: RunTotals,
    shown: number,
    hasHistory: boolean
): RunsSentence {
    let why = ""
    if (totals.excluded > 0) {
        // One reason covering every excluded row needs no count of its own -
        // "3 excluded from the total (3 shared ...)" says three twice. A mix
        // does, and so does the remainder from records written before reasons
        // were recorded, which can only be described as "not receipts".
        const clause = (n: number, phrase: string): string =>
            n === totals.excluded ? phrase : `${n} ${phrase}`
        const parts: string[] = []
        if (totals.excludedShared > 0)
            parts.push(clause(totals.excludedShared, "shared a project with another session"))
        if (totals.excludedUnpriced > 0)
            parts.push(clause(totals.excludedUnpriced, "had no cost to vouch for"))
        const unexplained = totals.excluded - totals.excludedShared - totals.excludedUnpriced
        if (unexplained > 0) parts.push(clause(unexplained, "not receipts"))
        why = `${totals.excluded} excluded from the total (${parts.join(", ")})`
    } else if (shown === 0) {
        why = hasHistory ? "no runs match this filter" : "nothing recorded yet"
    }
    return {
        count: shown,
        unit: shown === 1 ? "run" : "runs",
        cost: formatCost(totals.cost),
        why
    }
}

/** Reads in the largest sensible unit; never renders a negative or nonsense duration. */
export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "0s"

    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
}
