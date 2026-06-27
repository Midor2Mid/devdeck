import { describe, it, expect } from "vitest"
import { parseWorktreeList, safeBranch, worktreeBase } from "../src/main/worktrees"
import { parseStatus } from "../src/main/changes"

describe("safeBranch", () => {
    it("slugs spaces and strips unsafe chars", () => {
        expect(safeBranch("fix the thing!")).toBe("fix-the-thing")
    })
    it("keeps slashes and dots used in branch names", () => {
        expect(safeBranch("fix/JIRA-1423.v2")).toBe("fix/JIRA-1423.v2")
    })
    it("trims leading separators and .lock", () => {
        expect(safeBranch("/-foo.lock")).toBe("foo")
    })
    it("falls back when empty", () => {
        expect(safeBranch("   ")).toBe("agent-work")
    })
})

describe("worktreeBase", () => {
    it("is a sibling .worktrees folder", () => {
        expect(worktreeBase("/home/me/proj").replace(/\\/g, "/")).toBe("/home/me/proj.worktrees")
    })
})

describe("parseWorktreeList", () => {
    const porcelain = [
        "worktree /home/me/proj",
        "HEAD 1234567890abcdef",
        "branch refs/heads/main",
        "",
        "worktree /home/me/proj.worktrees/fix-1",
        "HEAD abcdef1234567890",
        "branch refs/heads/fix-1",
        ""
    ].join("\n")

    it("parses entries and marks the first as main", () => {
        const wts = parseWorktreeList(porcelain)
        expect(wts).toHaveLength(2)
        expect(wts[0]).toMatchObject({ path: "/home/me/proj", branch: "main", main: true })
        expect(wts[1]).toMatchObject({ path: "/home/me/proj.worktrees/fix-1", branch: "fix-1", main: false })
        expect(wts[0].head).toBe("12345678")
    })

    it("handles detached heads", () => {
        const wts = parseWorktreeList("worktree /x\nHEAD deadbeefdeadbeef\ndetached\n")
        expect(wts[0].branch).toBe("(detached)")
    })

    it("returns empty for empty input", () => {
        expect(parseWorktreeList("")).toEqual([])
    })
})

describe("parseStatus", () => {
    it("classifies staged / unstaged / untracked", () => {
        const out = parseStatus([" M src/a.ts", "A  src/b.ts", "?? new.txt", "D  gone.ts"].join("\n"))
        expect(out).toHaveLength(4)
        expect(out[0]).toMatchObject({ path: "src/a.ts", staged: false, label: "Modified" })
        expect(out[1]).toMatchObject({ path: "src/b.ts", staged: true, label: "Added" })
        expect(out[2]).toMatchObject({ path: "new.txt", untracked: true, label: "Untracked" })
        expect(out[3]).toMatchObject({ path: "gone.ts", staged: true, label: "Deleted" })
    })

    it("keeps the new path for renames", () => {
        const out = parseStatus(["R  old.ts -> new.ts"].join("\n"))
        expect(out[0]).toMatchObject({ path: "new.ts", label: "Renamed" })
    })
})
