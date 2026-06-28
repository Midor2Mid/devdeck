import type { WorklogRepo } from "../../preload/index"

/**
 * Turn collected git activity (+ optional agent-session notes) into a tidy
 * markdown standup. Pure so the formatting is unit-testable.
 */
export interface WorklogInput {
    title: string
    repos: WorklogRepo[]
    /** Free-form lines from the activity feed, e.g. "claude · fix #1423". */
    sessions: string[]
}

export function buildWorklog({ title, repos, sessions }: WorklogInput): string {
    const out: string[] = [`# Standup — ${title}`, ""]

    // Done — commits authored in range, grouped by project.
    out.push("## Done")
    const withCommits = repos.filter((r) => r.commits.length > 0)
    if (withCommits.length === 0) {
        out.push("- _No commits in this range._")
    } else {
        for (const r of withCommits) {
            out.push(`- **${r.name}**`)
            for (const c of r.commits) out.push(`    - ${c.subject} (${c.sha})`)
        }
    }
    out.push("")

    // In progress — uncommitted work + live agent sessions.
    const dirty = repos.filter((r) => r.changes > 0)
    if (dirty.length > 0 || sessions.length > 0) {
        out.push("## In progress")
        for (const r of dirty)
            out.push(`- **${r.name}** (${r.branch || "?"}): ${r.changes} uncommitted change${r.changes === 1 ? "" : "s"}`)
        for (const s of sessions) out.push(`- ${s}`)
        out.push("")
    }

    out.push("## Next", "- ", "")
    return out.join("\n")
}
