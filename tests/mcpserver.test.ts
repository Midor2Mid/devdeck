import { describe, it, expect } from "vitest"

// No module stub is needed any more: mcptools.ts is pure dispatch over injected
// deps since the database tools went, and with them the only import of db.ts -
// which is what pulled pg / mysql2 / sqlite-wasm / mssql into this suite.
import { TOOLS, callTool, RETIRED_TOOLS } from "../src/main/mcptools"
import { handleRpc } from "../src/main/mcpserver"

const deps = { projects: () => [{ id: "p1", name: "web-api", path: "C:/repos/web-api" }] }
const text = (r: { content: { text: string }[] }): string => r.content[0].text

describe("mcp tool surface", () => {
    it("declares valid tool schemas", () => {
        expect(TOOLS.length).toBeGreaterThan(0)
        for (const t of TOOLS) {
            expect(t.name).toMatch(/^devdeck_/)
            expect(t.description.length).toBeGreaterThan(20)
            expect(t.inputSchema.type).toBe("object")
        }
    })

    it("lists projects", async () => {
        const r = await callTool("devdeck_projects", {}, deps)
        expect(JSON.parse(text(r))[0].name).toBe("web-api")
    })

    it("rejects an unknown tool rather than throwing", async () => {
        const r = await callTool("devdeck_rm_rf", {}, deps)
        expect(r.isError).toBe(true)
    })
})

// A tool that vanishes from the catalog an agent was told about is its own small
// lie: the client read `tools/list` at the start of its session, and a habit or a
// CLAUDE.md can carry a name across sessions. These assert the withdrawal is
// stated rather than silent.
describe("the withdrawn tools", () => {
    it("advertises none of them", () => {
        const advertised = TOOLS.map((t) => t.name)
        for (const name of Object.keys(RETIRED_TOOLS)) {
            expect(advertised).not.toContain(name)
        }
    })

    it("names the five that were withdrawn", () => {
        expect(Object.keys(RETIRED_TOOLS).sort()).toEqual([
            "devdeck_db_connections",
            "devdeck_db_query",
            "devdeck_db_tables",
            "devdeck_http_requests",
            "devdeck_http_send"
        ])
    })

    it("says the tool was removed, not that the server does not know it", async () => {
        for (const name of Object.keys(RETIRED_TOOLS)) {
            const r = await callTool(name, { connectionId: "c1", sql: "SELECT 1" }, deps)
            expect(r.isError).toBe(true)
            expect(text(r)).toContain("removed")
            expect(text(r)).not.toContain("Unknown tool")
        }
    })

    it("still says Unknown tool for a name that never existed", async () => {
        expect(text(await callTool("devdeck_db_delete", {}, deps))).toContain("Unknown tool")
    })

    // The point of the retired list is that a name is answered once and never
    // re-used for something else.
    it("never re-uses a retired name for a live tool", () => {
        for (const t of TOOLS) expect(RETIRED_TOOLS[t.name]).toBeUndefined()
    })
})

describe("JSON-RPC layer", () => {
    it("answers initialize with a protocol version and tool capability", async () => {
        const r = JSON.parse((await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, deps))!)
        expect(r.result.protocolVersion).toBeTruthy()
        expect(r.result.capabilities.tools).toBeDefined()
        expect(r.result.serverInfo.name).toBe("devdeck")
    })

    it("lists tools", async () => {
        const r = JSON.parse((await handleRpc({ id: 2, method: "tools/list" }, deps))!)
        expect(r.result.tools.map((t: { name: string }) => t.name)).toContain("devdeck_projects")
    })

    it("returns no body for notifications", async () => {
        expect(await handleRpc({ method: "notifications/initialized" }, deps)).toBeNull()
    })

    it("errors on an unknown method", async () => {
        const r = JSON.parse((await handleRpc({ id: 3, method: "nope" }, deps))!)
        expect(r.error.code).toBe(-32601)
    })

    it("routes tools/call through the tool layer", async () => {
        const r = JSON.parse(
            (await handleRpc(
                { id: 4, method: "tools/call", params: { name: "devdeck_projects", arguments: {} } },
                deps
            ))!
        )
        expect(JSON.parse(r.result.content[0].text)[0].name).toBe("web-api")
    })

    it("requires a tool name", async () => {
        const r = JSON.parse((await handleRpc({ id: 5, method: "tools/call", params: {} }, deps))!)
        expect(r.error.code).toBe(-32602)
    })
})
