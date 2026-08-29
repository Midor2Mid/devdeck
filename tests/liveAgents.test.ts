import { describe, it, expect, beforeEach, vi } from "vitest"

// The fake carries no `pid`, which also keeps `killPty`'s Windows tree-reap
// (`taskkill /T /F /PID`) from firing at a real process id during the suite.
vi.mock("@lydell/node-pty", () => ({
    spawn: (): unknown => ({
        onData: (): void => undefined,
        onExit: (): void => undefined,
        write: (): void => undefined,
        resize: (): void => undefined,
        kill: (): void => undefined
    })
}))

const pty = await import("../src/main/pty")

beforeEach(() => {
    pty.killAll()
})

// Main receives `agentId` on `pty:create` (it decrypts that agent's key from it)
// and used to throw it away, which is why the close handler could not tell
// whether anything was running.
describe("liveAgents", () => {
    it("is empty with nothing running", () => {
        expect(pty.liveAgents()).toEqual([])
    })

    it("ignores plain shells", () => {
        pty.createPty({ id: "a" })
        expect(pty.liveAgents()).toEqual([])
    })

    it("reports one entry per live agent pane, duplicates included", () => {
        pty.createPty({ id: "a", agentId: "claude" })
        pty.createPty({ id: "b", agentId: "claude" })
        pty.createPty({ id: "c" })
        expect(pty.liveAgents().sort()).toEqual(["claude", "claude"])
    })

    it("drops an agent when its pane is killed", () => {
        pty.createPty({ id: "a", agentId: "claude" })
        pty.killPty("a")
        expect(pty.liveAgents()).toEqual([])
    })
})
