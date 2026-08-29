/**
 * The decision "is it safe to stop", separated from the dialog that asks it.
 *
 * The renderer knows how many agents are live and cannot veto a window close;
 * main can veto and did not know. This module holds the half of that fix that
 * is worth testing: given the live agent ids, does the user need to be asked,
 * and what does the question say? It imports nothing — no `electron`, no
 * `dialog` — so a unit test can call it directly.
 */

export interface ClosePrompt {
    /** Headline of the dialog. */
    message: string
    /** Second line, naming what would be lost. */
    detail: string
    /** Button labels, in order; index 0 is the default and index 1 cancels. */
    buttons: [string, string]
}

/**
 * `null` when nothing is running and the close should just proceed.
 *
 * Deliberately counts *agents*, not terminals. A plain shell sitting at a
 * prompt is not work in progress, and prompting for one would train the user
 * to dismiss the dialog without reading it — at which point the veto protects
 * nothing.
 */
export function closePrompt(agents: string[]): ClosePrompt | null {
    const n = agents.length
    if (n === 0) return null
    const names = [...new Set(agents)].sort()
    const which = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
    return {
        message: n === 1 ? "1 agent is still running" : `${n} agents are still running`,
        detail: `Closing DevDeck stops ${n === 1 ? "it" : "them"} immediately: ${which}.`,
        buttons: ["Cancel", "Close anyway"]
    }
}
