export interface Lens {
    id: string
    label: string
    /** The concern this reviewer focuses on (embedded verbatim in the prompt). */
    focus: string
}

export const LENSES: Lens[] = [
    {
        id: "correctness",
        label: "Correctness",
        focus: "correctness bugs, logic errors, and unhandled edge cases"
    },
    {
        id: "security",
        label: "Security",
        focus: "security vulnerabilities (injection, auth/authz, unsafe input, leaked secrets)"
    },
    {
        id: "dotnet",
        label: ".NET idioms",
        focus: "C#/.NET best practices, idioms, async/dispose correctness, and API misuse"
    },
    {
        id: "performance",
        label: "Performance",
        focus: "performance problems (N+1 queries, needless allocations, hot-path inefficiencies)"
    },
    {
        id: "tests",
        label: "Tests",
        focus: "missing or weak test coverage for the changed behavior"
    }
]

export const DEFAULT_LENSES = ["correctness", "security"]

/**
 * Build the prompt for one review lens. The agent reads the repo's uncommitted
 * changes itself (no huge diff piped in) and reports concrete, located findings.
 */
export function reviewPrompt(lens: Lens): string {
    return (
        `Run \`git diff HEAD\` to see the uncommitted changes in this repository, ` +
        `then review ONLY those changes with a focus on ${lens.focus}. ` +
        `Report concrete findings as a short list, each with a file:line reference and ` +
        `a one-line explanation. Do not edit any files — this is a review only. ` +
        `If you find nothing in your area, say so briefly.`
    )
}
