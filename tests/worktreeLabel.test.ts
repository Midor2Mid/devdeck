import { describe, it, expect } from "vitest"
import { sessionDir, worktreeLeaf, inWorktree } from "../src/renderer/src/worktree"

const PROJECT = "D:\\code\\devdeck"
const TREE = "D:/code/devdeck.worktrees/fix-JIRA-1423"

describe("sessionDir", () => {
    it("falls back to the project root when a session has no override", () => {
        expect(sessionDir(undefined, PROJECT)).toBe(PROJECT)
    })

    it("falls through an EMPTY override, rather than keeping it", () => {
        // `||` not `??`. A dispatch with the worktree box off records no entry;
        // an empty string is the same statement and must not become the cwd.
        expect(sessionDir("", PROJECT)).toBe(PROJECT)
    })

    it("uses the override when there is one", () => {
        expect(sessionDir(TREE, PROJECT)).toBe(TREE)
    })
})

describe("worktreeLeaf", () => {
    it("is null in the project's own tree, so the marker only ever adds", () => {
        expect(worktreeLeaf(PROJECT, PROJECT)).toBeNull()
    })

    it("is null across separator styles and case - the bug it would otherwise cause", () => {
        // The whole app would wear a WORKTREE label: `git worktree add` hands
        // back forward slashes, a project path is however the user typed it, and
        // `!==` calls those two directories different.
        expect(worktreeLeaf("D:/code/devdeck", PROJECT)).toBeNull()
        expect(worktreeLeaf("d:\\CODE\\devdeck\\", PROJECT)).toBeNull()
    })

    it("names the leaf directory of a worktree", () => {
        expect(worktreeLeaf(TREE, PROJECT)).toBe("fix-JIRA-1423")
        expect(worktreeLeaf(TREE + "/", PROJECT)).toBe("fix-JIRA-1423")
        expect(worktreeLeaf("D:\\code\\devdeck.worktrees\\br", PROJECT)).toBe("br")
    })

    it("is null when either side is empty - an unknown is not a worktree", () => {
        expect(worktreeLeaf("", PROJECT)).toBeNull()
        expect(worktreeLeaf(TREE, "")).toBeNull()
    })
})

describe("inWorktree", () => {
    it("agrees with worktreeLeaf on every case, being the same answer", () => {
        expect(inWorktree(PROJECT, PROJECT)).toBe(false)
        expect(inWorktree(TREE, PROJECT)).toBe(true)
        expect(inWorktree("", PROJECT)).toBe(false)
    })
})
