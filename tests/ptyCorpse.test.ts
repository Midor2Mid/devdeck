import { describe, it, expect, beforeEach, vi } from "vitest"

/** The fake pty the mocked spawn hands back, with hooks to drive it. */
interface Fake {
    onDataCb?: (d: string) => void
    onExitCb?: (e: { exitCode: number }) => void
    killed: boolean
    written: string[]
}
let fakes: Fake[] = []

vi.mock("@lydell/node-pty", () => ({
    spawn: (): unknown => {
        const f: Fake = { killed: false, written: [] }
        fakes.push(f)
        return {
            onData: (cb: (d: string) => void): void => {
                f.onDataCb = cb
            },
            onExit: (cb: (e: { exitCode: number }) => void): void => {
                f.onExitCb = cb
            },
            write: (d: string): void => {
                f.written.push(d)
            },
            resize: (): void => undefined,
            kill: (): void => {
                f.killed = true
            }
        }
    }
}))

const pty = await import("../src/main/pty")

const ID = "t-1"
/** Spawn, emit one chunk, then kill the process with `code`. */
function runAndDie(code: number, out = "boom: could not find module\r\n"): void {
    pty.createPty({ id: ID })
    fakes[fakes.length - 1].onDataCb?.(out)
    fakes[fakes.length - 1].onExitCb?.({ exitCode: code })
}

describe("a dead session leaves a corpse", () => {
    beforeEach(() => {
        pty.killPty(ID)
        fakes = []
    })

    // The whole point: the output that explains the failure has to outlive the
    // process, or a pane reached from another tab is an empty box with a code.
    it("keeps the buffer after the process exits", () => {
        runAndDie(1)
        expect(pty.getBuffer(ID)).toContain("could not find module")
    })

    it("reports the exit code alongside the buffer", () => {
        runAndDie(1)
        expect(pty.bufferOf(ID)).toEqual({
            buffer: expect.stringContaining("could not find module"),
            exitCode: 1
        })
    })

    // 0 is falsy: a clean exit is still an exit, and every consumer tests
    // `!== undefined`.
    it("treats a clean exit as an exit", () => {
        runAndDie(0)
        expect(pty.bufferOf(ID).exitCode).toBe(0)
    })

    it("reports no exit code for a live session", () => {
        pty.createPty({ id: ID })
        expect(pty.bufferOf(ID).exitCode).toBeUndefined()
    })

    it("reports nothing for an id it has never seen", () => {
        expect(pty.bufferOf("never-existed")).toEqual({ buffer: "", exitCode: undefined })
    })

    // A corpse is NOT live, so a deliberate restart must spawn rather than
    // silently no-op the way an attach to a running session does.
    it("spawns again over a corpse", () => {
        runAndDie(1)
        const before = fakes.length
        pty.createPty({ id: ID })
        expect(fakes.length).toBe(before + 1)
        expect(pty.bufferOf(ID).exitCode).toBeUndefined()
    })

    it("still refuses to spawn over a LIVE session", () => {
        pty.createPty({ id: ID })
        const before = fakes.length
        pty.createPty({ id: ID })
        expect(fakes.length).toBe(before)
    })

    it("drops a corpse when the pane is closed", () => {
        runAndDie(1)
        pty.killPty(ID)
        expect(pty.bufferOf(ID)).toEqual({ buffer: "", exitCode: undefined })
    })

    // There is no process to kill; the old code called session.proc.kill() and
    // was saved only by its try/catch.
    it("closing a dead pane kills nothing", () => {
        runAndDie(1)
        const killedBefore = fakes.filter((f) => f.killed).length
        pty.killPty(ID)
        expect(fakes.filter((f) => f.killed).length).toBe(killedBefore)
    })

    it("writing to a corpse is a no-op, not a throw", () => {
        runAndDie(1)
        expect(() => pty.writePty(ID, "hello\r")).not.toThrow()
        expect(fakes[0].written).toEqual([])
    })

    it("resizing a corpse is a no-op, not a throw", () => {
        runAndDie(1)
        expect(() => pty.resizePty(ID, 80, 24)).not.toThrow()
    })
})

// I3: killPty deletes its map entry synchronously, but the real process's
// onExit can still fire later (e.g. the OS hasn't actually reaped it yet) -
// if a restart already spawned a new live entry under the same id by then,
// that late exit describes a process that is no longer running under this id.
describe("a late exit for an id that has been re-spawned", () => {
    beforeEach(() => {
        pty.killPty(ID)
        fakes = []
    })

    it("does not overwrite the fresh session with the old one's corpse", () => {
        pty.createPty({ id: ID }) // P1, live
        const p1 = fakes[0]
        pty.killPty(ID) // deletes the map entry; P1's real exit hasn't fired yet
        pty.createPty({ id: ID }) // P2, live - spawns over the (now empty) slot
        p1.onExitCb?.({ exitCode: 1 }) // P1's exit finally lands
        // P2 is still live: no corpse, no exit code.
        expect(pty.bufferOf(ID)).toEqual({ buffer: "", exitCode: undefined })
    })

    it("is still broadcast, flagged stale, for remote clients watching a deliberate kill", () => {
        const events: { id: string; exitCode: number; stale: boolean }[] = []
        pty.ptyEvents.on("exit", (e) => events.push(e))
        pty.createPty({ id: ID })
        const p1 = fakes[0]
        pty.killPty(ID)
        pty.createPty({ id: ID })
        p1.onExitCb?.({ exitCode: 1 })
        expect(events).toEqual([{ id: ID, exitCode: 1, stale: true, started: true }])
    })

    it("an ordinary (non-stale) exit is not flagged", () => {
        const events: { id: string; exitCode: number; stale: boolean }[] = []
        pty.ptyEvents.on("exit", (e) => events.push(e))
        runAndDie(1)
        expect(events).toEqual([{ id: ID, exitCode: 1, stale: false, started: true }])
    })
})
