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

export function diffPrompt(kind: DiffAiKind, diff: string): string {
    const body = diff.trim() ? diff : "(no changes detected)"
    return `${INTRO[kind]}\n\n\`\`\`diff\n${body}\n\`\`\``
}
