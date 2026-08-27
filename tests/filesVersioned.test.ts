import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync, utimesSync, statSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { readFileText, writeFileText } from "../src/main/files"
import { CHANGED_ON_DISK } from "../src/shared/fsErrors"

// files.ts imports no electron, so this runs as a plain node test.

function tempFile(content: string): string {
    const p = join(mkdtempSync(join(tmpdir(), "ver-")), "note.md")
    writeFileSync(p, content, "utf8")
    return p
}

/** Move mtime forward without depending on clock resolution. */
function touchLater(path: string): void {
    const t = new Date(statSync(path).mtimeMs + 5000)
    utimesSync(path, t, t)
}

describe("a write onto a file that moved", () => {
    it("carries the version it was read at", () => {
        const p = tempFile("original")
        const { content, mtimeMs } = readFileText(p)
        expect(content).toBe("original")
        expect(mtimeMs).toBeGreaterThan(0)
    })

    it("refuses, and leaves the other writer's content in place", () => {
        const p = tempFile("original")
        const { mtimeMs } = readFileText(p)

        // An agent edits the same file while the tab sits open.
        writeFileSync(p, "the agent's edit", "utf8")
        touchLater(p)

        expect(() => writeFileText(p, "my stale buffer", mtimeMs)).toThrow(CHANGED_ON_DISK)
        expect(readFileSync(p, "utf8")).toBe("the agent's edit")
    })

    it("allows the save when nothing else touched the file", () => {
        const p = tempFile("original")
        const { mtimeMs } = readFileText(p)
        writeFileText(p, "my edit", mtimeMs)
        expect(readFileSync(p, "utf8")).toBe("my edit")
    })

    it("treats base 0 as create-or-force, which is what Overwrite uses", () => {
        const p = tempFile("original")
        writeFileSync(p, "the agent's edit", "utf8")
        touchLater(p)
        writeFileText(p, "forced", 0)
        expect(readFileSync(p, "utf8")).toBe("forced")
    })

    it("does not block a save just because the file was deleted", () => {
        const p = tempFile("original")
        const { mtimeMs } = readFileText(p)
        require("fs").rmSync(p)
        writeFileText(p, "recreated", mtimeMs)
        expect(readFileSync(p, "utf8")).toBe("recreated")
    })
})
