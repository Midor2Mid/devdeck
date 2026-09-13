import { describe, it, expect, beforeEach, vi } from "vitest"

// Same shape as tests/changes.test.ts: `git` is the one thing this module talks
// to, so the mock is the process boundary and everything above it is real.
const state = { err: null as Error | null, stdout: "", stderr: "" }
vi.mock("child_process", () => ({
    execFile: (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(state.err, state.stdout, state.stderr)
    }
}))

import { listWorktrees, parseWorktreeList } from "../src/main/worktrees"

const PORCELAIN = [
    "worktree D:/code/devdeck",
    "HEAD 1234567890abcdef",
    "branch refs/heads/main",
    "",
    "worktree D:/code/devdeck.worktrees/fix-JIRA-1423",
    "HEAD fedcba0987654321",
    "branch refs/heads/fix/JIRA-1423",
    ""
].join("\n")

describe("parseWorktreeList", () => {
    it("reads the porcelain list and marks the first tree as main", () => {
        const list = parseWorktreeList(PORCELAIN)
        expect(list).toHaveLength(2)
        expect(list[0]).toMatchObject({ path: "D:/code/devdeck", branch: "main", main: true })
        expect(list[1]).toMatchObject({ branch: "fix/JIRA-1423", main: false })
    })

    it("names a detached head rather than leaving the branch blank", () => {
        const list = parseWorktreeList("worktree D:/x\nHEAD abcdef1234\ndetached\n")
        expect(list[0].branch).toBe("(detached)")
    })
})

// The third state. `listWorktrees` resolved `[]` both for "this project has only
// its main tree" and for "git failed", and WorktreesModal rendered both as an
// empty list - unknown rendered as zero, the defect this repo already fixed in
// `listChanges` (tests/changes.test.ts asserts a non-repo directory reads
// unknown, on purpose) and flagged in `nextChangedCounts`.
//
// Reported as `{ ok, list }` rather than thrown, because unlike `listChanges`
// this one has a caller that must render THREE things and an exception collapses
// two of them again at the first `.catch(() => [])`.
describe("listWorktrees says whether it could read at all", () => {
    beforeEach(() => {
        state.err = null
        state.stdout = ""
        state.stderr = ""
    })

    it("reports ok with the trees it found", async () => {
        state.stdout = PORCELAIN
        const r = await listWorktrees("D:/code/devdeck")
        expect(r.ok).toBe(true)
        expect(r.list.map((w) => w.branch)).toEqual(["main", "fix/JIRA-1423"])
    })

    it("reports ok with an empty list for a repo that has only its main tree", async () => {
        // Not a failure: a project with the worktree toggle off (its default)
        // is the COMMON case, and it must not read as an error.
        state.stdout = "worktree D:/code/devdeck\nHEAD 1234567890abcdef\nbranch refs/heads/main\n"
        const r = await listWorktrees("D:/code/devdeck")
        expect(r.ok).toBe(true)
        expect(r.list).toHaveLength(1)
    })

    it("reports NOT ok, and never an empty list, when git fails", async () => {
        // The whole point: `ok === false` with `list: []` is distinguishable
        // from `ok === true` with `list: []`, and the modal renders two
        // different sentences for them.
        state.err = new Error("boom")
        state.stderr = "fatal: not a git repository"
        const r = await listWorktrees("D:/not-a-repo")
        expect(r.ok).toBe(false)
        expect(r.list).toEqual([])
    })
})
