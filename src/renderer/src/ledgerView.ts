/**
 * Renderer-side summaries of the run ledger (src/main/ledger.ts). Pure logic
 * only - no electron, no fs, no window.api - so it tests directly under
 * vitest and Task 4 can render whatever it returns.
 *
 * The one rule that matters: a row's cost is sometimes an *attribution* over
 * a shared project directory and time window, not a receipt for that run
 * alone - RunRecord.exclusive is false whenever another agent session shared
 * the directory during the run. Summing those rows into a total would double
 * count (or worse, misattribute) real money, so runTotals leaves them out and
 * reports how many were excluded instead of silently under-reporting.
 */

import type { RunKind, RunRecord } from "../../main/ledger"

export interface RunTotals {
    /** Summed cost of exclusive runs only. */
    cost: number
    tokens: number
    /** How many rows contributed. */
    counted: number
    /** How many were left out because their cost was an attribution, not a receipt. */
    excluded: number
}

export function runTotals(runs: RunRecord[]): RunTotals {
    const totals: RunTotals = { cost: 0, tokens: 0, counted: 0, excluded: 0 }
    for (const run of runs) {
        if (!run.exclusive) {
            totals.excluded++
            continue
        }
        totals.cost += run.cost
        totals.tokens += run.tokens
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

/** Money, never blank and never a dash: zero is written `$0`, not nothing. */
export function formatCost(cost: number): string {
    return cost === 0 ? "$0" : "$" + cost.toFixed(2)
}

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
        why = `${totals.excluded} excluded from the total (shared a project with another session)`
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
