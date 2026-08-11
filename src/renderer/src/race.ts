/**
 * Agent bake-off: race two or three agents on one card, each in its own worktree.
 *
 * Pure state and parsing only — no React, no IPC — so the whole state machine is
 * testable without Electron. The store owns the lifecycle; this module owns what
 * a race *is*.
 */

export type EntrantStatus =
    | "starting" // worktree made, session spawning
    | "working" // dispatched, no commit yet
    | "gating" // committed; gate command running
    | "passed" // gate exit 0 — a survivor
    | "failed" // gate non-zero — eliminated
    | "nocommit" // never committed inside the timeout

export interface Entrant {
    agentId: string
    agentName: string
    termId?: string
    worktree: string
    branch: string
    /** Worktree HEAD at dispatch. A change from this is the finish line. */
    baseHead: string
    head?: string
    status: EntrantStatus
    gateExit?: number
    gateMs?: number
    gateOutput?: string
    cost?: number
    costTokens?: number
    added?: number
    removed?: number
}

export interface Race {
    cardId: string
    projectId: string
    projectPath: string
    title: string
    gateCommand: string
    startedAt: number
    entrants: Entrant[]
}

/** How long an entrant gets to produce a commit before it is counted out. */
export const RACE_TIMEOUT_MS = 1_200_000

/** How often the poll checks worktree heads. */
export const RACE_POLL_MS = 5000

/**
 * Read `git diff --shortstat`. Git writes singular forms for one line ("1
 * insertion(+)"), and omits either clause entirely when it is zero.
 */
export function parseShortstat(out: string): { added: number; removed: number } {
    return {
        added: Number(out.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0),
        removed: Number(out.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0)
    }
}

/**
 * The branch argument for one entrant's worktree. Deliberately NOT slugged here:
 * `worktrees.addWorktree` already runs `safeBranch` over whatever it is given, and
 * a second naming scheme would be one more thing to keep in sync. The agent name
 * is what makes two entrants on the same card distinct — a collision would put
 * both in one worktree and silently invalidate both their cost figures.
 */
export function entrantBranch(title: string, agentName: string): string {
    return `${title} ${agentName}`
}

export function isTerminal(s: EntrantStatus): boolean {
    return s === "passed" || s === "failed" || s === "nocommit"
}

/** Entrants whose gate passed — the only ones the user may choose between. */
export function survivors(race: Race): Entrant[] {
    return race.entrants.filter((e) => e.status === "passed")
}

/** Every entrant finished. False for an empty race: nothing finished, nothing started. */
export function raceSettled(race: Race): boolean {
    return race.entrants.length > 0 && race.entrants.every((e) => isTerminal(e.status))
}

/** What the race has cost so far, across all entrants. */
export function raceSpend(race: Race): number {
    return race.entrants.reduce((sum, e) => sum + (e.cost ?? 0), 0)
}
