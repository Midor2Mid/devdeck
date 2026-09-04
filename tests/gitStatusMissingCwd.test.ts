import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// `git rev-parse` fails for a folder that is not a repo AND for a folder that
// does not exist - execFile cannot tell the two apart, which is the whole
// reason this file exists. `stat` (real, not mocked) is what separates them.
vi.mock("child_process", () => ({
    execFile: (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (e: Error | null, stdout: string) => void
    ): void => {
        cb(new Error("fatal: not a git repository"), "")
    },
    spawn: (): unknown => ({ on: () => undefined })
}))

const { gitStatus } = await import("../src/main/git")

describe("gitStatus when git fails", () => {
    it("counts zero for a real folder that is not a repo", async () => {
        const real = mkdtempSync(join(tmpdir(), "gs-"))
        const g = await gitStatus(real)
        expect(g.isRepo).toBe(false)
        expect(g.changes).toBe(0)
    })

    it("reports null, not 0, when the folder itself is not there", async () => {
        // "No uncommitted changes" is what every surface renders 0 as, and it
        // is a claim about a working tree. There is no working tree to make it
        // about, so the count is unknown - the state DeckStatus draws as
        // "? changes" and the review queue must not sort as clean.
        const g = await gitStatus(join(tmpdir(), "definitely-not-here-" + Date.now()))
        expect(g.isRepo).toBe(false)
        expect(g.changes).toBeNull()
    })

    it("reports null when the path is a file rather than a folder", async () => {
        const g = await gitStatus(join(__filename))
        expect(g.changes).toBeNull()
    })
})
