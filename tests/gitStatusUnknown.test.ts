import { describe, it, expect, vi, beforeEach } from "vitest"

// `gitStatus` shells out twice. The mock decides what each call does, so the
// interesting case - `rev-parse` succeeds and `status` fails - can be produced
// exactly, which is what makes `changes: null` observable at all.
const h = vi.hoisted(() => ({
    statusFails: false,
    statusOut: "## main...origin/main\n M src/a.ts\n?? src/b.ts\n",
    lastArgs: [] as string[][]
}))

vi.mock("child_process", () => ({
    execFile: (
        _cmd: string,
        args: string[],
        _opts: unknown,
        cb: (e: Error | null, stdout: string) => void
    ): void => {
        h.lastArgs.push(args)
        if (args[0] === "rev-parse") {
            cb(null, "main\n")
            return
        }
        if (h.statusFails) cb(new Error("fatal: unable to read index"), "")
        else cb(null, h.statusOut)
    },
    spawn: (): unknown => ({ on: () => undefined })
}))

const { gitStatus } = await import("../src/main/git")

beforeEach(() => {
    h.statusFails = false
    h.lastArgs = []
})

describe("gitStatus when the count cannot be read", () => {
    it("counts changes when git answers", async () => {
        const g = await gitStatus("D:/proj")
        expect(g.isRepo).toBe(true)
        expect(g.changes).toBe(2)
    })

    it("reports null, not 0, when `git status` fails", async () => {
        // A held .git/index.lock, a repo mid-rebase, the 4s timeout. This used
        // to resolve `{ isRepo: true, changes: 0 }`, and every surface above
        // renders 0 as the sentence "no uncommitted changes" - so a repo the
        // app had just failed to read was reported as reviewed and clean.
        h.statusFails = true
        const g = await gitStatus("D:/proj")
        expect(g.isRepo).toBe(true)
        expect(g.changes).toBeNull()
    })

    it("does not invent tracking information it did not receive either", async () => {
        h.statusFails = true
        const g = await gitStatus("D:/proj")
        expect(g.upstream).toBe("")
        expect(g.ahead).toBe(0)
        expect(g.behind).toBe(0)
    })

    it("asks git for every untracked file, not one entry per directory", async () => {
        // The default `-unormal` collapses a wholly untracked directory into a
        // single entry: an agent that scaffolded forty new files contributed 1
        // to the number the whole review queue is sorted by.
        await gitStatus("D:/proj")
        const status = h.lastArgs.find((a) => a[0] === "status")!
        expect(status).toContain("-uall")
    })
})
