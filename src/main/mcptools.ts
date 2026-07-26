/**
 * The tool surface DevDeck exposes to agent CLIs over MCP.
 *
 * Why this exists: DevDeck already holds live connections to the things an agent
 * keeps asking about — the project's database above all. Until now the only way
 * to get that context to the agent was to *push* it (run a query in the DB panel,
 * click "→ Agent", paste a table into the prompt). This lets the agent *pull*
 * instead: it queries the schema and the data itself, mid-task, when it needs to.
 *
 * Safety posture, deliberately narrow:
 *  - Every tool here is read-only. `devdeck_db_query` rejects anything that isn't
 *    a data-returning statement, reusing the same `isReadOnlySql` guard the remote
 *    mobile server uses — an agent cannot mutate or drop anything through MCP.
 *  - No secrets are ever returned: connection listings carry names/kinds/database,
 *    never host, user, or password.
 *  - Results are row-capped so a `SELECT *` on a huge table can't flood the
 *    agent's context (or DevDeck's memory).
 *
 * This module is pure dispatch over the db layer so it can be unit-tested without
 * Electron or a live socket; the transport lives in `mcpserver.ts`.
 */
import * as db from "./db"
import { isReadOnlySql } from "./guards"

/** Hard ceiling on rows returned to an agent, regardless of the query's own LIMIT. */
export const MAX_ROWS = 200

export interface McpToolDef {
    name: string
    description: string
    inputSchema: Record<string, unknown>
}

/** A project as the agent sees it — enough to map a repo to its DB connections. */
export interface McpProject {
    id: string
    name: string
    path: string
}

/** Injected so tests (and the main process) can supply the project list. */
export interface McpDeps {
    projects: () => McpProject[]
}

export const TOOLS: McpToolDef[] = [
    {
        name: "devdeck_projects",
        description:
            "List the projects open in DevDeck (name and absolute path). Use this to work out which project a path belongs to before looking up its database connections.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
        name: "devdeck_db_connections",
        description:
            "List the database connections configured in DevDeck: id, name, engine, and database name. Credentials are never returned. Pass a connection id to the other devdeck_db_* tools.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: {
                    type: "string",
                    description: "Optional: only connections belonging to this project id."
                }
            },
            additionalProperties: false
        }
    },
    {
        name: "devdeck_db_tables",
        description:
            "List the table names in a database connection. Call this before writing a query so you use real table names instead of guessing.",
        inputSchema: {
            type: "object",
            properties: {
                connectionId: {
                    type: "string",
                    description: "Connection id from devdeck_db_connections."
                }
            },
            required: ["connectionId"],
            additionalProperties: false
        }
    },
    {
        name: "devdeck_db_query",
        description:
            `Run a READ-ONLY SQL query against a DevDeck database connection and get the rows back. Only data-returning statements are allowed (SELECT / WITH / EXPLAIN / PRAGMA / SHOW / DESCRIBE); anything that writes is rejected. At most ${MAX_ROWS} rows are returned. Use this to check real data instead of assuming what the schema or contents look like.`,
        inputSchema: {
            type: "object",
            properties: {
                connectionId: {
                    type: "string",
                    description: "Connection id from devdeck_db_connections."
                },
                sql: { type: "string", description: "A single read-only SQL statement." }
            },
            required: ["connectionId", "sql"],
            additionalProperties: false
        }
    }
]

/** MCP tool results are content blocks; text is enough for everything here. */
export interface McpToolResult {
    content: { type: "text"; text: string }[]
    isError?: boolean
}

const ok = (text: string): McpToolResult => ({ content: [{ type: "text", text }] })
const fail = (text: string): McpToolResult => ({
    content: [{ type: "text", text }],
    isError: true
})

const json = (v: unknown): string => JSON.stringify(v, null, 2)

/** Strip credentials — an agent gets identity and shape, never secrets. */
function publicConn(c: db.ConnProfile): Record<string, unknown> {
    return { id: c.id, name: c.name, engine: c.kind, database: c.database, projectId: c.projectId }
}

export async function callTool(
    name: string,
    args: Record<string, unknown>,
    deps: McpDeps
): Promise<McpToolResult> {
    switch (name) {
        case "devdeck_projects":
            return ok(json(deps.projects()))

        case "devdeck_db_connections": {
            const projectId = typeof args.projectId === "string" ? args.projectId : ""
            const conns = projectId ? db.listConnections(projectId) : db.allConnections()
            if (conns.length === 0) {
                return ok(
                    "No database connections are configured in DevDeck" +
                        (projectId ? " for that project." : ".") +
                        " Add one in the Database panel first."
                )
            }
            return ok(json(conns.map(publicConn)))
        }

        case "devdeck_db_tables": {
            const id = typeof args.connectionId === "string" ? args.connectionId : ""
            if (!id) return fail("connectionId is required.")
            try {
                return ok(json(await db.listTables(id)))
            } catch (e) {
                return fail(`Could not list tables: ${e instanceof Error ? e.message : String(e)}`)
            }
        }

        case "devdeck_db_query": {
            const id = typeof args.connectionId === "string" ? args.connectionId : ""
            const sql = typeof args.sql === "string" ? args.sql : ""
            if (!id) return fail("connectionId is required.")
            if (!sql.trim()) return fail("sql is required.")
            // The guard is the whole security model for this tool — keep it first.
            if (!isReadOnlySql(sql)) {
                return fail(
                    "Refused: devdeck_db_query only runs read-only statements " +
                        "(SELECT / WITH / EXPLAIN / PRAGMA / SHOW / DESCRIBE). " +
                        "Ask the user to run writes themselves in the DevDeck DB panel."
                )
            }
            let res: db.QueryResult
            try {
                res = await db.runQuery(id, sql)
            } catch (e) {
                return fail(`Query failed: ${e instanceof Error ? e.message : String(e)}`)
            }
            if (!res.ok) return fail(`Query failed: ${res.error ?? "unknown error"}`)
            const rows = res.rows ?? []
            const capped = rows.slice(0, MAX_ROWS)
            return ok(
                json({
                    columns: res.columns ?? [],
                    rowCount: rows.length,
                    truncated: rows.length > capped.length,
                    timeMs: res.timeMs,
                    rows: capped
                })
            )
        }

        default:
            return fail(`Unknown tool: ${name}`)
    }
}
