import { describe, it, expect } from "vitest"
import { MCP_CATALOG, toServer, addServer } from "../src/renderer/src/mcpCatalog"
import type { McpServer } from "../src/preload/index"

describe("MCP_CATALOG", () => {
    it("has entries with unique ids and a command + args each", () => {
        expect(MCP_CATALOG.length).toBeGreaterThanOrEqual(5)
        const ids = MCP_CATALOG.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const e of MCP_CATALOG) {
            expect(e.command).toBeTruthy()
            expect(Array.isArray(e.args)).toBe(true)
        }
    })
})

describe("toServer", () => {
    it("maps to the McpServer shape with cloned args/env", () => {
        const entry = MCP_CATALOG.find((e) => e.id === "github")!
        const s = toServer(entry)
        expect(s.name).toBe(entry.name)
        expect(s.command).toBe(entry.command)
        expect(s.args).toEqual(entry.args)
        expect(s.args).not.toBe(entry.args) // cloned, not shared
    })
})

describe("addServer", () => {
    const fs = MCP_CATALOG.find((e) => e.id === "filesystem")!
    it("appends when no server with that name exists", () => {
        const out = addServer([], fs)
        expect(out.map((s) => s.name)).toEqual([fs.name])
    })
    it("is a no-op when a server with that name already exists", () => {
        const existing: McpServer[] = [{ name: fs.name, command: "x", args: [], env: {} }]
        expect(addServer(existing, fs)).toBe(existing)
    })
})
