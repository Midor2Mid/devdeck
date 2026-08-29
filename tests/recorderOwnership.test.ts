import { describe, it, expect, vi, beforeEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// `recorder` pulls in `pty` for its event bus, and `pty` loads a native module.
vi.mock("@lydell/node-pty", () => ({ spawn: () => ({ onData: () => undefined, onExit: () => undefined }) }))

import { startRecording, stopRecording, isRecording, flushAll } from "../src/main/recorder"
import { ptyEvents } from "../src/main/pty"

const TERM = "t-rec"

function project(): string {
    return mkdtempSync(join(tmpdir(), "rec-"))
}

/** Make the recordings directory impossible to create, by putting a file in its way. */
function block(path: string): void {
    writeFileSync(join(path, ".devdeck"), "not a directory")
}

beforeEach(() => {
    // Each test owns the map; a leaked entry from a failed stop is the point.
    if (isRecording(TERM)) {
        try {
            stopRecording(TERM, "cleanup")
        } catch {
            /* leave it; the next line is what actually matters */
        }
    }
})

describe("recorder ownership", () => {
    it("writes to the path captured at start, with no path from the caller", () => {
        const p = project()
        startRecording(TERM, p)
        ptyEvents.emit("data", { id: TERM, data: "hello" })
        const meta = stopRecording(TERM, "my run")
        expect(meta).not.toBeNull()
        expect(meta!.path.startsWith(join(p, ".devdeck", "recordings"))).toBe(true)
        expect(meta!.events).toBe(1)
        const written = JSON.parse(readFileSync(meta!.path, "utf8"))
        expect(written.events[0].data).toBe("hello")
    })

    it("keeps the events when the write fails, instead of deleting them first", () => {
        // This is the regression: `stopRecording` used to detach the listener and
        // drop the map entry BEFORE writing, so a throw here destroyed the only
        // copy of the recording and the caller's catch had nothing to retry.
        const p = project()
        block(p)
        startRecording(TERM, p)
        ptyEvents.emit("data", { id: TERM, data: "precious" })
        expect(() => stopRecording(TERM, "doomed")).toThrow()
        expect(isRecording(TERM)).toBe(true)

        // And it is genuinely still recoverable: clear the obstruction, retry.
        rmSync(join(p, ".devdeck"))
        const meta = stopRecording(TERM, "retry")
        expect(meta!.events).toBe(1)
        expect(JSON.parse(readFileSync(meta!.path, "utf8")).events[0].data).toBe("precious")
    })

    it("stops appending once a recording has been written", () => {
        const p = project()
        startRecording(TERM, p)
        ptyEvents.emit("data", { id: TERM, data: "during" })
        stopRecording(TERM, "done")
        ptyEvents.emit("data", { id: TERM, data: "after" })
        const files = readdirSync(join(p, ".devdeck", "recordings"))
        expect(files).toHaveLength(1)
        const rec = JSON.parse(readFileSync(join(p, ".devdeck", "recordings", files[0]), "utf8"))
        expect(rec.events).toHaveLength(1)
    })

    it("flushAll writes an in-progress recording, which is what quit needs", () => {
        const p = project()
        startRecording(TERM, p)
        ptyEvents.emit("data", { id: TERM, data: "unsaved work" })
        flushAll()
        expect(isRecording(TERM)).toBe(false)
        const files = readdirSync(join(p, ".devdeck", "recordings"))
        expect(files).toHaveLength(1)
    })

    it("flushAll does not let an unwritable recording block the quit", () => {
        const p = project()
        block(p)
        startRecording(TERM, p)
        expect(() => flushAll()).not.toThrow()
    })
})
