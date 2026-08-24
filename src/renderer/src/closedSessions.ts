import type { ShellKind } from "./settings"

/** How many closures the undo ring remembers. */
export const CLOSED_RING_CAP = 5

/** Everything needed to put a closed session back. */
export interface ClosedSession {
    termId: string
    projectId: string
    tabId: string
    tabName: string
    name: string
    agentId: string
    isAgent: boolean
    cwd?: string
    shellKind?: ShellKind
    initialCommand?: string
    closedAt: number
}

export function pushClosed(ring: ClosedSession[], entry: ClosedSession): ClosedSession[] {
    // Newest first, and one entry per dead terminal: closing a tab closes each
    // of its panes, and that path can reach the same pane twice. Two entries for
    // one pane would reopen it twice.
    const without = ring.filter((c) => c.termId !== entry.termId)
    return [entry, ...without].slice(0, CLOSED_RING_CAP)
}

/**
 * Where a reopened session goes: back into its own tab while that tab is still
 * open, otherwise into a new one. Reopening into the tab it came from is what
 * makes undo feel like undo rather than like a fresh launch.
 */
export function restorePlan(
    entry: ClosedSession,
    tabs: { id: string }[]
): { kind: "same-tab"; tabId: string } | { kind: "new-tab" } {
    return tabs.some((t) => t.id === entry.tabId)
        ? { kind: "same-tab", tabId: entry.tabId }
        : { kind: "new-tab" }
}

/**
 * The command a reopened session should run, or undefined to let the launcher
 * use the preset's own command.
 *
 * An agent comes back resumed where its preset says how, which is the closest
 * thing to undo that exists for a conversation living in another process. Where
 * it does not, the session starts cold rather than being handed a guessed flag.
 * A shell re-runs whatever it was started with, and nothing else: resume args
 * belong to agents, so a shell never gets them even if a preset with its id
 * happens to carry some.
 */
export function reopenCommand(
    entry: ClosedSession,
    preset: { command: string; resumeArgs?: string } | undefined
): string | undefined {
    if (!entry.isAgent) return entry.initialCommand
    if (preset?.resumeArgs) return `${preset.command} ${preset.resumeArgs}`
    return undefined
}
