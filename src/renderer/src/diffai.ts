/**
 * Prompts for the "AI on the diff" actions in the change-review surface. Pure
 * so the prompt text is unit-testable; the store feeds the result to an agent.
 */
export type DiffAiKind = "review" | "explain" | "commit" | "pr"

const INTRO: Record<DiffAiKind, string> = {
    review:
        "Review the following diff for correctness, bugs, edge cases, and clarity. " +
        "Be concise and cite file:line. Do not change anything yet - just report.",
    explain: "Explain what the following diff changes and why, as a short bulleted summary.",
    commit:
        "Write a single conventional-commit message (a concise subject line, then a short " +
        "body if useful) for the following diff. Output only the commit message.",
    pr:
        "Write a pull-request description in markdown with **## Summary**, **## Changes**, and " +
        "**## Testing** sections for the following diff. Output only the description."
}

/**
 * Prepended when the work is handed to a *different* agent than the one that
 * wrote it. An agent reviewing its own diff tends to defend it; one told plainly
 * that someone else wrote this, and not to assume it is right, reviews it as a
 * reviewer. Only added for `review` — it would be noise on commit/PR text.
 */
const INDEPENDENT =
    "These changes were written by a different agent, not by you. Review them " +
    "independently: do not assume they are correct, and say so plainly if the " +
    "approach itself is wrong rather than only commenting on details."

export function diffPrompt(
    kind: DiffAiKind,
    diff: string,
    opts: { independent?: boolean } = {}
): string {
    const body = diff.trim() ? diff : "(no changes detected)"
    const intro =
        opts.independent && kind === "review" ? `${INDEPENDENT}\n\n${INTRO[kind]}` : INTRO[kind]
    return `${intro}\n\n\`\`\`diff\n${body}\n\`\`\``
}
