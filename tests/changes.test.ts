import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * listChanges's failure contract is the whole reason agentSignals' baseline
 * can tell "unknown" from "clean" apart: a failed `git status` must reject,
 * not resolve []  — resolving [] made a transient failure (missing git, a
 * non-repo directory, the exec timeout, a `.git/index.lock` from another
 * agent/worktree op) indistinguishable from a genuinely clean tree. No
 * existing test mocked `child_process` for a main-process git function, so
 * this establishes that pattern (mirroring how tests/aikeys.test.ts and
 * tests/projects.test.ts mock `electron`) rather than reshaping changes.ts to
 * be testable.
 */
type ExecFileCb = (err: Error | null, stdout: string, stderr: string) => void

const state = vi.hoisted(() => ({ err: null as Error | null, stdout: "", stderr: "" }))

vi.mock("child_process", () => ({
    execFile: (_file: string, _args: string[], _opts: unknown, cb: ExecFileCb): void => {
        cb(state.err, state.stdout, state.stderr)
    }
}))

import { listChanges, discardFile } from "../src/main/changes"
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

describe("listChanges", () => {
    beforeEach(() => {
        state.err = null
        state.stdout = ""
        state.stderr = ""
    })

    it("rejects when git status fails, rather than resolving as no changes", async () => {
        state.err = new Error("boom")
        state.stderr = "fatal: not a git repository"
        await expect(listChanges("/not-a-repo")).rejects.toThrow(/not a git repository/)
    })

    it("resolves an empty list for a genuinely clean repo", async () => {
        state.stdout = ""
        state.stderr = ""
        await expect(listChanges("/clean-repo")).resolves.toEqual([])
    })
})

// Part 6's inversion: a destructive operation's result must be READ. Discarding
// an untracked entry used a non-recursive `rm`, so a directory - which git's
// porcelain reports as one row, `?? build/` - threw, was caught, returned false,
// and the modal printed "Discarded." anyway, after a dialog saying it could not
// be undone.
describe("discardFile on an untracked entry", () => {
    it("deletes an untracked FILE", async () => {
        const dir = mkdtempSync(join(tmpdir(), "disc-"))
        writeFileSync(join(dir, "scratch.txt"), "x")
        await expect(discardFile(dir, "scratch.txt", true)).resolves.toBe(true)
        expect(existsSync(join(dir, "scratch.txt"))).toBe(false)
    })

    it("deletes an untracked DIRECTORY, which is what the porcelain reports", async () => {
        const dir = mkdtempSync(join(tmpdir(), "disc-"))
        mkdirSync(join(dir, "build", "nested"), { recursive: true })
        writeFileSync(join(dir, "build", "nested", "a.js"), "x")
        await expect(discardFile(dir, "build", true)).resolves.toBe(true)
        expect(existsSync(join(dir, "build"))).toBe(false)
    })

    it("reports true for something already gone, so a repeat is not an error", async () => {
        const dir = mkdtempSync(join(tmpdir(), "disc-"))
        await expect(discardFile(dir, "never-existed", true)).resolves.toBe(true)
    })
})
