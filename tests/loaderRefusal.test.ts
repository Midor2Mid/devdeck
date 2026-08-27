import { describe, it, expect, vi, beforeEach } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// Same seam as tests/projects.test.ts: mock `electron` so userData is a temp dir.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path")
    return { dir: fs.mkdtempSync(path.join(os.tmpdir(), "refusal-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    dialog: {},
    BrowserWindow: class {}
}))

import { addProjectByPath, removeProject, listProjects } from "../src/main/projects"
import { readMcp, writeMcp } from "../src/main/mcp"
import { readJson } from "../src/main/readJson"

const projectsJson = join(h.dir, "projects.json")

describe("a store that exists but cannot be read", () => {
    beforeEach(() => {
        if (existsSync(projectsJson)) rmSync(projectsJson)
    })

    it("tells a missing file apart from a damaged one", () => {
        const missing = readJson(join(h.dir, "definitely-not-here.json"))
        expect(missing).toEqual({ ok: false, reason: "missing" })

        const damaged = join(h.dir, "damaged.json")
        writeFileSync(damaged, '{"projects":')
        expect(readJson(damaged)).toEqual({ ok: false, reason: "unreadable" })
    })

    it("does not overwrite a truncated projects.json when a project is added", () => {
        const truncated = '{"projects": [{"id":"a","name":"a","path":"/a","addedAt":1}'
        writeFileSync(projectsJson, truncated)

        const dir = mkdtempSync(join(tmpdir(), "newproj-"))
        const store = addProjectByPath(dir)

        // The file on disk is byte-identical: the user's projects survive.
        expect(readFileSync(projectsJson, "utf8")).toBe(truncated)
        // And the caller is told, rather than being shown a one-project store.
        expect(store.unreadable).toBe(true)
        expect(store.projects).toEqual([])
    })

    it("does not let a removal empty a damaged store", () => {
        writeFileSync(projectsJson, "not json at all")
        const before = readFileSync(projectsJson, "utf8")
        const store = removeProject("whatever")
        expect(readFileSync(projectsJson, "utf8")).toBe(before)
        expect(store.unreadable).toBe(true)
    })

    it("saves normally once the file is readable again", () => {
        writeFileSync(projectsJson, "{ broken")
        const dirA = mkdtempSync(join(tmpdir(), "ok-a-"))
        expect(addProjectByPath(dirA).unreadable).toBe(true)

        rmSync(projectsJson) // user fixed it by removing the damaged file
        const dirB = mkdtempSync(join(tmpdir(), "ok-b-"))
        const store = addProjectByPath(dirB)
        expect(store.unreadable).toBeUndefined()
        expect(store.projects.map((p) => p.path)).toEqual([dirB])
        expect(listProjects().projects.length).toBe(1)
    })
})

describe("writeMcp preserving other top-level keys", () => {
    it("keeps keys it can see", () => {
        const proj = mkdtempSync(join(tmpdir(), "mcp-ok-"))
        const file = join(proj, ".mcp.json")
        writeFileSync(
            file,
            JSON.stringify({ mcpServers: { other: { command: "x", args: [] } }, someOtherKey: 1 })
        )

        expect(writeMcp(proj, readMcp(proj))).toBe(true)
        const after = JSON.parse(readFileSync(file, "utf8"))
        expect(after.someOtherKey).toBe(1)
        expect(Object.keys(after.mcpServers)).toEqual(["other"])
    })

    it("refuses rather than deleting keys it could not read", () => {
        const proj = mkdtempSync(join(tmpdir(), "mcp-bad-"))
        const file = join(proj, ".mcp.json")
        // What an agent writing the same file mid-flight looks like.
        const malformed = '{ "mcpServers": { "other": { "command": "x" '
        writeFileSync(file, malformed)

        expect(writeMcp(proj, [{ name: "devdeck", command: "", args: [], env: {}, url: "u" }])).toBe(
            false
        )
        expect(readFileSync(file, "utf8")).toBe(malformed)
    })

    it("still creates the file when there is none", () => {
        const proj = mkdtempSync(join(tmpdir(), "mcp-new-"))
        expect(writeMcp(proj, [{ name: "a", command: "c", args: [], env: {} }])).toBe(true)
        expect(JSON.parse(readFileSync(join(proj, ".mcp.json"), "utf8")).mcpServers.a.command).toBe(
            "c"
        )
    })
})
