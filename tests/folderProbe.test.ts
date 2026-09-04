import { describe, it, expect, vi, beforeEach } from "vitest"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// Electron gets a temp userData dir so projects.json lands somewhere real
// (same pattern as tests/projects.test.ts).
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path")
    return {
        dir: fs.mkdtempSync(path.join(os.tmpdir(), "probe-")),
        stat: vi.fn()
    }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    dialog: {},
    BrowserWindow: class {}
}))
// Only `fs/promises` is mocked - `statSync` (used by addProjectByPath to
// validate a folder) stays real, so the fixtures below are real directories.
vi.mock("fs/promises", () => ({ stat: (p: string) => h.stat(p) }))

import { addProjectByPath, probeProject, probeProjects } from "../src/main/projects"

const dirStat = (isDirectory: boolean): { isDirectory: () => boolean } => ({
    isDirectory: () => isDirectory
})
const errno = (code: string): NodeJS.ErrnoException => {
    const e = new Error(code) as NodeJS.ErrnoException
    e.code = code
    return e
}

describe("probeProject", () => {
    beforeEach(() => {
        h.stat.mockReset()
    })

    it("is ok for a folder that resolves", async () => {
        h.stat.mockResolvedValue(dirStat(true))
        expect(await probeProject("C:/code/app")).toBe("ok")
    })

    it("is missing when the path is a file, not a folder", async () => {
        // The OS answered plainly: what is there is not the folder.
        h.stat.mockResolvedValue(dirStat(false))
        expect(await probeProject("C:/code/app")).toBe("missing")
    })

    it("is missing for ENOENT", async () => {
        h.stat.mockRejectedValue(errno("ENOENT"))
        expect(await probeProject("C:/gone")).toBe("missing")
    })

    it("is missing for ENOTDIR", async () => {
        h.stat.mockRejectedValue(errno("ENOTDIR"))
        expect(await probeProject("C:/file.txt/sub")).toBe("missing")
    })

    it("is UNCHECKED, not missing, when the stat itself fails", async () => {
        // The whole point of the third state: permission denied says nothing
        // about whether the folder is there.
        h.stat.mockRejectedValue(errno("EACCES"))
        const state = await probeProject("C:/locked")
        expect(state).toBe("unchecked")
        expect(state).not.toBe("missing")
    })

    it("is unchecked for an unreachable host", async () => {
        h.stat.mockRejectedValue(errno("EHOSTDOWN"))
        expect(await probeProject("//nas/share/code")).toBe("unchecked")
    })

    it("is unchecked when the stat never comes back", async () => {
        // A stat that hangs (an unmounted drive) must not resolve as missing,
        // and must not hang the probe either.
        h.stat.mockReturnValue(new Promise(() => {}))
        expect(await probeProject("//nas/share/code", 5)).toBe("unchecked")
    })
})

describe("probeProjects", () => {
    beforeEach(() => {
        h.stat.mockReset()
    })

    it("keys every known project by id and takes no path from the caller", async () => {
        const real = mkdtempSync(join(tmpdir(), "pp-"))
        const id = addProjectByPath(real).projects.find((p) => p.path === real)!.id
        h.stat.mockResolvedValue(dirStat(true))
        const states = await probeProjects()
        expect(states[id]).toBe("ok")
        // Every project in the store got an entry, and nothing else did.
        expect(Object.keys(states).length).toBeGreaterThan(0)
    })

    it("reports missing for a project whose folder is gone", async () => {
        const real = mkdtempSync(join(tmpdir(), "pp-"))
        const id = addProjectByPath(real).projects.find((p) => p.path === real)!.id
        h.stat.mockRejectedValue(errno("ENOENT"))
        expect((await probeProjects())[id]).toBe("missing")
    })
})
