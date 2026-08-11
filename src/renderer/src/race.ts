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
    /** When this entrant entered "gating" — GATE_TIMEOUT_MS ages it out from here. */
    gateStartedAt?: number
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
 * How long an entrant may sit in "gating" before it's aged out to "failed"
 * rather than left stranded. Twice checks.run's own 120s default cap: safely
 * longer than any gate command can legitimately still be running, so this only
 * fires when something abandoned the tick mid-gate rather than a slow suite.
 */
export const GATE_TIMEOUT_MS = 240_000

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
 * a second naming scheme would be one more thing to keep in sync.
 *
 * The agent id is what guarantees two entrants differ, and it is used WHOLE. The
 * name alone is not enough — AgentPreset.name is user-editable and two presets
 * called "Claude" are entirely plausible. Nor is a prefix of the id: the built-in
 * presets are `claude`, `claude-opus` and `claude-yolo`, so any slice shorter than
 * the full string collapses the most likely race of all — Claude against Claude
 * Opus — into a single branch.
 *
 * A collision is not cosmetic. Two entrants sharing a branch share a worktree, and
 * cost here is attributed per directory, so both their figures become meaningless
 * while still rendering as if they were real. The ids are readable enough
 * (`claude-opus`) to serve as the branch's human label too.
 */
export function entrantBranch(title: string, agentName: string, agentId: string): string {
    return `${title} ${agentId}`
}

/**
 * Do two paths refer to the same directory? Deliberately string-only: the two
 * sources being compared here are `git worktree list` (forward slashes) and
 * path.join (backslashes on Windows), and treating them as unequal silently
 * disables the whole race — no commit is ever noticed. Case-folded because
 * DevDeck is Windows-first.
 */
export function samePath(a: string, b: string): boolean {
    const n = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
    return !!a && !!b && n(a) === n(b)
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
