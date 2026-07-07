import { describe, it, expect, vi } from "vitest"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// Mock Electron with a temp userData dir so projects.json lands somewhere real.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path")
    return { dir: fs.mkdtempSync(path.join(os.tmpdir(), "proj-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    dialog: {},
    BrowserWindow: class {}
}))

import { addProjectByPath, listProjects } from "../src/main/projects"

const dirA = mkdtempSync(join(tmpdir(), "pa-"))

describe("projects ops", () => {
    it("adds a project by folder path and dedups", () => {
        const s1 = addProjectByPath(dirA)
        expect(s1.projects.length).toBe(1)
        expect(s1.projects[0].path).toBe(dirA)
        const s2 = addProjectByPath(dirA) // same path again
        expect(s2.projects.length).toBe(1)
    })

    it("ignores a path that isn't a directory", () => {
        const before = listProjects().projects.length
        addProjectByPath(join(h.dir, "nope-not-real"))
        expect(listProjects().projects.length).toBe(before)
    })
})
