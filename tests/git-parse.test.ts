import { describe, it, expect } from "vitest"
import { parseWorktreeList, safeBranch, worktreeBase } from "../src/main/worktrees"
import { parseStatus } from "../src/main/changes"
import { parseBranchLine, isCommitSha } from "../src/main/git"

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

describe("parseBranchLine", () => {
    it("reads the upstream when in sync", () => {
        expect(parseBranchLine("## main...origin/main")).toEqual({
            upstream: "origin/main",
            ahead: 0,
            behind: 0
        })
    })

    it("reads ahead and behind counts", () => {
        expect(parseBranchLine("## main...origin/main [ahead 1, behind 2]")).toEqual({
            upstream: "origin/main",
            ahead: 1,
            behind: 2
        })
        expect(parseBranchLine("## fix/x...origin/fix/x [behind 7]")).toMatchObject({
            upstream: "origin/fix/x",
            ahead: 0,
            behind: 7
        })
    })

    it("returns no upstream for an untracked branch or detached head", () => {
        const none = { upstream: "", ahead: 0, behind: 0 }
        expect(parseBranchLine("## local-only")).toEqual(none)
        expect(parseBranchLine("## HEAD (no branch)")).toEqual(none)
        expect(parseBranchLine("")).toEqual(none)
        expect(parseBranchLine(" M src/a.ts")).toEqual(none)
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

describe("isCommitSha", () => {
    it("accepts the short and full shas git actually produces", () => {
        expect(isCommitSha("1a2b3c4")).toBe(true)
        expect(isCommitSha("0e375ccbc867f1e52fe81d169b211d7b08ccc655")).toBe(true)
        expect(isCommitSha("ABCDEF1")).toBe(true)
    })

    it("rejects anything git could read as an option", () => {
        // "--output=<file>" is a real git diff flag. Interpolated into
        // `${ref}..HEAD` it becomes "--output=/tmp/x..HEAD" and writes a file of
        // the caller's choosing — argument injection without a shell in sight.
        expect(isCommitSha("--output=/tmp/pwned")).toBe(false)
        expect(isCommitSha("-n")).toBe(false)
        expect(isCommitSha("--upload-pack=touch /tmp/x")).toBe(false)
    })

    it("rejects refs that are not shas at all", () => {
        expect(isCommitSha("HEAD")).toBe(false)
        expect(isCommitSha("main")).toBe(false)
        expect(isCommitSha("")).toBe(false)
        expect(isCommitSha("1a2b3c")).toBe(false) // too short to be a git short sha
        expect(isCommitSha("1a2b3c4z")).toBe(false)
    })
})
