import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

/**
 * The Windows agent throws `error code: 267` for a bad cwd from inside
 * `_completePtyConnection` — ASYNCHRONOUSLY, so `createPty`'s try/catch (which
 * covers the synchronous missing-shell throw) never sees it and the throw reaches
 * Electron's fatal main-process dialog. There is no way to observe that in a unit
 * test, so what is asserted here is the only thing that prevents it: node-pty is
 * never reached at all.
 *
 * `spawn` is therefore a strict spy — if it is ever called with a missing cwd the
 * real app crashes, regardless of what else the session state looks like.
 */
const spawnCalls: { file: string; args: string[]; opts: { cwd?: string } }[] = []

vi.mock("@lydell/node-pty", () => ({
    spawn: (file: string, args: string[], opts: { cwd?: string }): unknown => {
        spawnCalls.push({ file, args, opts })
        return {
            onData: (): void => undefined,
            onExit: (): void => undefined,
            write: (): void => undefined,
            resize: (): void => undefined,
            kill: (): void => undefined
        }
    }
}))

const pty = await import("../src/main/pty")

const MISSING = join(tmpdir(), "devdeck-definitely-not-here-9f3a2c")
const shell = { file: "powershell.exe", args: [] }

/** Every `data` and `exit` this test's own listeners saw, per test. */
let seen: { data: string[]; exits: { id: string; exitCode: number; stale: boolean }[] }
let onData: (e: { id: string; data: string }) => void
let onExit: (e: { id: string; exitCode: number; stale: boolean }) => void
let onSpawn: () => void
let spawnNotices: number

beforeEach(() => {
    spawnCalls.length = 0
    spawnNotices = 0
    seen = { data: [], exits: [] }
    onData = (e): number => seen.data.push(e.data)
    onExit = (e): number => seen.exits.push(e)
    onSpawn = (): number => (spawnNotices += 1)
    pty.ptyEvents.on("data", onData)
    pty.ptyEvents.on("exit", onExit)
    pty.ptyEvents.on("spawn", onSpawn)
})

afterEach(() => {
    pty.ptyEvents.off("data", onData)
    pty.ptyEvents.off("exit", onExit)
    pty.ptyEvents.off("spawn", onSpawn)
})

describe("createPty with a cwd that is not there", () => {
    beforeEach(() => pty.killPty("cwd-missing"))

    it("never reaches node-pty", () => {
        pty.createPty({ id: "cwd-missing", cwd: MISSING, shell })
        expect(spawnCalls).toEqual([])
    })

    it("reports through the same corpse surface a real death uses", () => {
        pty.createPty({ id: "cwd-missing", cwd: MISSING, shell })
        expect(seen.exits).toEqual([{ id: "cwd-missing", exitCode: 1, stale: false }])
        const notice = seen.data.join("")
        expect(notice).toContain("folder")
        expect(notice).toContain(MISSING)
    })

    // The shell is fine. Sending the user to repair it is a wrong diagnosis, and
    // the missing-shell branch's copy does exactly that.
    it("does not send the user to fix a shell that is fine", () => {
        pty.createPty({ id: "cwd-missing", cwd: MISSING, shell })
        expect(seen.data.join("")).not.toContain("Settings -> Terminal")
        expect(seen.data.join("")).not.toContain("shell:")
    })

    // A pane reached from another tab reads the corpse rather than the live
    // stream, so the notice has to survive in the buffer AND the tail, not just
    // in the one `data` event.
    it("leaves the notice readable in the buffer and the tail", () => {
        pty.createPty({ id: "cwd-missing", cwd: MISSING, shell })
        expect(pty.bufferOf("cwd-missing")).toEqual({
            buffer: expect.stringContaining(MISSING),
            exitCode: 1
        })
        expect(pty.getTail("cwd-missing", 10)).toContain(MISSING)
    })

    // "spawn" feeds the diagnostics record's "what shell actually launched" half.
    // Nothing launched here, so recording an attempt would be a false entry.
    it("announces no shell spawn, because none was attempted", () => {
        pty.createPty({ id: "cwd-missing", cwd: MISSING, shell })
        expect(spawnNotices).toBe(0)
    })
})

describe("createPty with a cwd that exists but is not a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "ptycwd-"))
    const filePath = join(dir, "not-a-dir.txt")
    writeFileSync(filePath, "x")

    beforeEach(() => pty.killPty("cwd-file"))

    // statSync SUCCEEDS here, so an existence check alone would wave this
    // through into the same asynchronous throw.
    it("refuses to spawn into a file", () => {
        pty.createPty({ id: "cwd-file", cwd: filePath, shell })
        expect(spawnCalls).toEqual([])
        expect(pty.bufferOf("cwd-file").exitCode).toBe(1)
    })
})

describe("createPty with a cwd that is there", () => {
    const dir = mkdtempSync(join(tmpdir(), "ptycwd-ok-"))

    beforeEach(() => {
        pty.killPty("cwd-ok")
        pty.killPty("cwd-default")
    })

    it("spawns as before", () => {
        pty.createPty({ id: "cwd-ok", cwd: dir, shell })
        expect(spawnCalls.length).toBe(1)
        expect(spawnCalls[0].opts.cwd).toBe(dir)
        expect(seen.exits).toEqual([])
    })

    // The guard must check the cwd node-pty is actually handed, which for an
    // opts-less create is the USERPROFILE/process.cwd() fallback - not `undefined`.
    it("still spawns when no cwd was given at all", () => {
        pty.createPty({ id: "cwd-default", shell })
        expect(spawnCalls.length).toBe(1)
        expect(seen.exits).toEqual([])
    })
})
