import { describe, it, expect, vi, beforeEach } from "vitest"

// db.ts imports native drivers (pg / mysql2 / sqlite-wasm / mssql), so stub the
// whole module — these tests are about dispatch and the read-only guard, not SQL.
const listConnections = vi.fn()
const allConnections = vi.fn()
const listTables = vi.fn()
const runQuery = vi.fn()

vi.mock("../src/main/db", () => ({
    listConnections: (...a: unknown[]) => listConnections(...a),
    allConnections: (...a: unknown[]) => allConnections(...a),
    listTables: (...a: unknown[]) => listTables(...a),
    runQuery: (...a: unknown[]) => runQuery(...a)
}))

const { TOOLS, callTool, MAX_ROWS } = await import("../src/main/mcptools")
const { handleRpc } = await import("../src/main/mcpserver")

const deps = { projects: () => [{ id: "p1", name: "web-api", path: "C:/repos/web-api" }] }
const text = (r: { content: { text: string }[] }): string => r.content[0].text

beforeEach(() => {
    vi.resetAllMocks()
})

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

describe("devdeck_db_connections", () => {
    it("never leaks host, user, or password", async () => {
        allConnections.mockReturnValue([
            {
                id: "c1",
                projectId: "p1",
                name: "prod",
                kind: "postgres",
                host: "db.internal",
                port: 5432,
                database: "app",
                user: "admin",
                passwordEnc: "SECRET"
            }
        ])
        const out = text(await callTool("devdeck_db_connections", {}, deps))
        expect(out).toContain("prod")
        expect(out).toContain("postgres")
        expect(out).not.toContain("db.internal")
        expect(out).not.toContain("admin")
        expect(out).not.toContain("SECRET")
    })

    it("explains itself when nothing is configured", async () => {
        allConnections.mockReturnValue([])
        const r = await callTool("devdeck_db_connections", {}, deps)
        expect(text(r)).toMatch(/no database connections/i)
        expect(r.isError).toBeUndefined()
    })

    it("scopes to a project when asked", async () => {
        listConnections.mockReturnValue([])
        await callTool("devdeck_db_connections", { projectId: "p1" }, deps)
        expect(listConnections).toHaveBeenCalledWith("p1")
        expect(allConnections).not.toHaveBeenCalled()
    })
})

describe("devdeck_db_query is read-only", () => {
    // The tool no longer judges the SQL before running it - a regex on the
    // first word was walked through by `WITH x AS (DELETE ...) SELECT`. What
    // it must do instead is ask the db layer for the read-only path on EVERY
    // call, so the driver refuses the write inside the database. These are the
    // same statements the old guard listed; the assertion is now that each one
    // reaches a driver that cannot execute it, rather than a regex that
    // happens to recognise it.
    const writes = [
        "DELETE FROM users",
        "DROP TABLE users",
        "UPDATE users SET admin = 1",
        "INSERT INTO users VALUES (1)",
        "TRUNCATE users",
        "ALTER TABLE users ADD col int",
        "GRANT ALL ON users TO bob",
        "  \n  delete from users",
        // The two the regex let straight through.
        "WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x",
        "SELECT 1; DROP TABLE users"
    ]

    for (const sql of writes) {
        it(`runs read-only: ${sql.trim().slice(0, 28)}`, async () => {
            runQuery.mockResolvedValue({ ok: true, columns: [], rows: [], timeMs: 1 })
            await callTool("devdeck_db_query", { connectionId: "c1", sql }, deps)
            expect(runQuery).toHaveBeenCalledWith("c1", sql, { readOnly: true })
        })
    }

    it("never asks for a writable query, whatever the SQL looks like", async () => {
        runQuery.mockResolvedValue({ ok: true, columns: [], rows: [], timeMs: 1 })
        await callTool("devdeck_db_query", { connectionId: "c1", sql: "SELECT 1" }, deps)
        const opts = runQuery.mock.calls[0][2]
        expect(opts).toEqual({ readOnly: true })
    })

    it("surfaces the driver's refusal as an error instead of an empty result", async () => {
        // What a write actually looks like now: the database says no, and the
        // agent has to be told that rather than shown zero rows.
        runQuery.mockResolvedValue({
            ok: false,
            error: "cannot execute DELETE in a read-only transaction",
            timeMs: 2
        })
        const r = await callTool("devdeck_db_query", { connectionId: "c1", sql: "DELETE FROM users" }, deps)
        expect(r.isError).toBe(true)
        expect(text(r)).toMatch(/read-only transaction/i)
    })

    it("allows a SELECT and returns rows", async () => {
        runQuery.mockResolvedValue({
            ok: true,
            columns: ["id"],
            rows: [{ id: 1 }, { id: 2 }],
            timeMs: 3
        })
        const r = await callTool(
            "devdeck_db_query",
            { connectionId: "c1", sql: "SELECT id FROM users" },
            deps
        )
        expect(r.isError).toBeUndefined()
        const parsed = JSON.parse(text(r))
        expect(parsed.rows).toHaveLength(2)
        expect(parsed.truncated).toBe(false)
    })

    it("caps rows and says so", async () => {
        runQuery.mockResolvedValue({
            ok: true,
            columns: ["n"],
            rows: Array.from({ length: MAX_ROWS + 50 }, (_, i) => ({ n: i })),
            timeMs: 9
        })
        const parsed = JSON.parse(
            text(await callTool("devdeck_db_query", { connectionId: "c1", sql: "SELECT n FROM t" }, deps))
        )
        expect(parsed.rows).toHaveLength(MAX_ROWS)
        expect(parsed.rowCount).toBe(MAX_ROWS + 50)
        expect(parsed.truncated).toBe(true)
    })

    it("reports a failed query as a tool error, not a crash", async () => {
        runQuery.mockResolvedValue({ ok: false, error: "syntax error", timeMs: 1 })
        const r = await callTool("devdeck_db_query", { connectionId: "c1", sql: "SELECT boom" }, deps)
        expect(r.isError).toBe(true)
        expect(text(r)).toContain("syntax error")
    })

    it("requires both arguments", async () => {
        expect((await callTool("devdeck_db_query", { sql: "SELECT 1" }, deps)).isError).toBe(true)
        expect((await callTool("devdeck_db_query", { connectionId: "c1" }, deps)).isError).toBe(true)
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
        expect(r.result.tools.map((t: { name: string }) => t.name)).toContain("devdeck_db_query")
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
