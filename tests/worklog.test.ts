import { describe, it, expect } from "vitest"
import { parseLog } from "../src/main/worklog"
import { buildWorklog } from "../src/renderer/src/worklog"
import type { WorklogRepo } from "../src/preload/index"

const SEP = "\x1f"

describe("parseLog", () => {
    it("parses sha/subject/when lines", () => {
        const stdout = [`a1b2${SEP}feat: x${SEP}2 hours ago`, `c3d4${SEP}fix: y${SEP}1 day ago`].join("\n")
        expect(parseLog(stdout)).toEqual([
            { sha: "a1b2", subject: "feat: x", when: "2 hours ago" },
            { sha: "c3d4", subject: "fix: y", when: "1 day ago" }
        ])
    })
    it("ignores blank lines and dropless rows", () => {
        expect(parseLog("\n\n")).toEqual([])
    })
})

const repo = (over: Partial<WorklogRepo>): WorklogRepo => ({
    name: "proj",
    path: "/p",
    branch: "main",
    changes: 0,
    commits: [],
    ...over
})

describe("buildWorklog", () => {
    it("lists commits per project under Done", () => {
        const md = buildWorklog({
            title: "Fri",
            repos: [repo({ name: "api", commits: [{ sha: "a1", subject: "feat: board", when: "1h" }] })],
            sessions: []
        })
        expect(md).toContain("# Standup — Fri")
        expect(md).toContain("## Done")
        expect(md).toContain("- **api**")
        expect(md).toContain("    - feat: board (a1)")
    })

    it("shows a placeholder when there are no commits", () => {
        const md = buildWorklog({ title: "T", repos: [repo({})], sessions: [] })
        expect(md).toContain("_No commits in this range._")
    })

    it("reports uncommitted work and sessions under In progress", () => {
        const md = buildWorklog({
            title: "T",
            repos: [repo({ name: "web", branch: "dev", changes: 3 })],
            sessions: ["claude · fix #1423"]
        })
        expect(md).toContain("## In progress")
        expect(md).toContain("- **web** (dev): 3 uncommitted changes")
        expect(md).toContain("- claude · fix #1423")
    })

    it("omits In progress entirely when clean and no sessions", () => {
        const md = buildWorklog({ title: "T", repos: [repo({ commits: [{ sha: "a", subject: "s", when: "w" }] })], sessions: [] })
        expect(md).not.toContain("## In progress")
        expect(md).toContain("## Next")
    })
})
