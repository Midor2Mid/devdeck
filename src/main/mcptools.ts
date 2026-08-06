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
 *  - The database tools are read-only. `devdeck_db_query` rejects anything that
 *    isn't a data-returning statement, reusing the same `isReadOnlySql` guard the
 *    remote mobile server uses — an agent cannot mutate or drop anything.
 *  - `devdeck_http_send` is the one tool that isn't read-only, because an HTTP
 *    request is whatever the endpoint makes of it. It is contained by only ever
 *    replaying a request the *user already saved*: the agent picks one by id and
 *    cannot supply a URL, so it can't be aimed at an arbitrary host, and there is
 *    no equivalent of SSRF here — the target set is exactly what the user wrote.
 *    Its description warns the agent off replaying anything that mutates state
 *    unasked.
 *  - No secrets are ever returned: connection listings carry names/kinds/database,
 *    never host, user, or password; the saved-request listing omits the query
 *    string, which routinely holds API keys, and never echoes headers or auth.
 *  - Results are capped — rows for queries, characters for response bodies,
 *    entries for logs — so one call can't flood the agent's context (or DevDeck's
 *    memory).
 *
 * This module is pure dispatch over the db layer so it can be unit-tested without
 * Electron or a live socket; the transport lives in `mcpserver.ts`.
 */
import * as db from "./db"
import { isReadOnlySql } from "./guards"

/** Hard ceiling on rows returned to an agent, regardless of the query's own LIMIT. */
export const MAX_ROWS = 200

/** Hard ceiling on a replayed response body, so one call can't flood the context. */
export const MAX_BODY = 20_000

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

/** A key/value row as stored on disk. Read permissively — this is parsed JSON. */
export interface McpKvRow {
    enabled?: boolean
    key?: string
    value?: string
}

/** A saved API request, as much of it as replaying needs. */
export interface McpSavedRequest {
    id: string
    name: string
    method?: string
    url?: string
    params?: McpKvRow[]
    headers?: McpKvRow[]
    bodyType?: string
    bodyText?: string
    formRows?: McpKvRow[]
    auth?: {
        type?: string
        token?: string
        username?: string
        password?: string
        apiKeyName?: string
        apiKeyValue?: string
        apiKeyIn?: string
    }
    /** Name of the collection it lives in, for the listing. */
    collection?: string
}

export interface McpHttpRequest {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
}

export interface McpHttpResponse {
    ok: boolean
    status?: number
    statusText?: string
    body?: string
    timeMs: number
    error?: string
}

export interface McpConsoleEntry {
    level: string
    text: string
    url?: string
    line?: number
}

export interface McpNetEntry {
    method: string
    url: string
    status: number
    type: string
    failed: boolean
}

export interface McpBrowserPage {
    id: number
    url: string
    title: string
}

/**
 * Injected so this module stays pure dispatch — testable without Electron, a
 * live socket, or a real network.
 */
export interface McpDeps {
    projects: () => McpProject[]
    /** Every saved request across all collections, each tagged with its collection. */
    savedRequests?: () => McpSavedRequest[]
    httpSend?: (req: McpHttpRequest) => Promise<McpHttpResponse>
    browserPages?: () => McpBrowserPage[]
    consoleLog?: (pageId: number, limit: number) => McpConsoleEntry[]
    networkLog?: (pageId: number, limit: number) => McpNetEntry[]
}

const enabledRows = (rows: McpKvRow[] | undefined): { key: string; value: string }[] =>
    (rows ?? [])
        .filter((r) => r.enabled !== false && (r.key ?? "").trim() !== "")
        .map((r) => ({ key: (r.key ?? "").trim(), value: r.value ?? "" }))

/** The query string already written into the saved URL, kept as-is. */
function splitUrl(url: string): { base: string; query: string } {
    const q = url.indexOf("?")
    return q === -1 ? { base: url, query: "" } : { base: url.slice(0, q), query: url.slice(q + 1) }
}

/**
 * Turn a saved request into something sendable: merge the params table into the
 * query string, apply auth, and pick a body for the body type. Pure, so the
 * whole thing is unit-testable.
 *
 * Deliberately NOT supported: `form` bodies with file uploads (there is no file
 * to read on the agent's behalf) and chain-variable interpolation / extractors,
 * which are a renderer-side run concept. A request relying on those replays with
 * its literal saved text.
 */
export function buildHttpRequest(r: McpSavedRequest): McpHttpRequest {
    const method = (r.method || "GET").toUpperCase()
    const { base, query } = splitUrl(r.url ?? "")
    const parts = query ? [query] : []
    for (const p of enabledRows(r.params)) {
        parts.push(`${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    }

    const headers: Record<string, string> = {}
    for (const h of enabledRows(r.headers)) headers[h.key] = h.value

    const auth = r.auth ?? {}
    if (auth.type === "bearer" && auth.token) {
        headers["Authorization"] = `Bearer ${auth.token}`
    } else if (auth.type === "basic" && (auth.username || auth.password)) {
        const raw = `${auth.username ?? ""}:${auth.password ?? ""}`
        headers["Authorization"] = `Basic ${Buffer.from(raw, "utf8").toString("base64")}`
    } else if (auth.type === "apikey" && auth.apiKeyName) {
        if (auth.apiKeyIn === "query") {
            parts.push(
                `${encodeURIComponent(auth.apiKeyName)}=${encodeURIComponent(auth.apiKeyValue ?? "")}`
            )
        } else {
            headers[auth.apiKeyName] = auth.apiKeyValue ?? ""
        }
    }

    let body: string | undefined
    if (r.bodyType === "json") {
        body = r.bodyText ?? ""
        if (body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
            headers["Content-Type"] = "application/json"
        }
    } else if (r.bodyType === "form") {
        body = enabledRows(r.formRows)
            .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
            .join("&")
        if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        }
    }

    const url = parts.length ? `${base}?${parts.join("&")}` : base
    return { method, url, headers, body }
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
    },
    {
        name: "devdeck_http_requests",
        description:
            "List the API requests saved in DevDeck's HTTP client: id, name, method, and URL (without its query string, which may hold keys). Pass an id to devdeck_http_send to replay one.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
        name: "devdeck_http_send",
        description:
            `Replay one of the API requests saved in DevDeck (see devdeck_http_requests) and get the real status, timing and body back. Use this to check what an endpoint actually returns instead of assuming. You can only send a request the user has already saved — you cannot supply a URL of your own — and the response body is truncated at ${MAX_BODY} characters. This performs a real request, so avoid replaying anything that mutates state unless the user asked you to.`,
        inputSchema: {
            type: "object",
            properties: {
                requestId: {
                    type: "string",
                    description: "Request id from devdeck_http_requests."
                }
            },
            required: ["requestId"],
            additionalProperties: false
        }
    },
    {
        name: "devdeck_console_logs",
        description:
            "Read the console messages and network activity captured from DevDeck's embedded browser panel — including uncaught exceptions, failed requests and CSP/deprecation warnings. Use this to diagnose a page instead of asking the user to copy DevTools output. If only one page is open its id is optional.",
        inputSchema: {
            type: "object",
            properties: {
                pageId: {
                    type: "number",
                    description:
                        "Page id from the listing this tool returns when several pages are open. Optional when exactly one page is captured."
                },
                limit: {
                    type: "number",
                    description: "Maximum entries per section (default 100)."
                }
            },
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

        case "devdeck_http_requests": {
            const list = deps.savedRequests?.() ?? []
            if (list.length === 0) {
                return ok(
                    "No API requests are saved in DevDeck. Ask the user to save one in the API panel first."
                )
            }
            // The query string is omitted on purpose: it routinely carries API
            // keys, and the agent doesn't need it to choose a request.
            return ok(
                json(
                    list.map((r) => ({
                        id: r.id,
                        name: r.name,
                        method: (r.method || "GET").toUpperCase(),
                        url: splitUrl(r.url ?? "").base,
                        collection: r.collection,
                        paramCount: enabledRows(r.params).length
                    }))
                )
            )
        }

        case "devdeck_http_send": {
            const id = typeof args.requestId === "string" ? args.requestId : ""
            if (!id) return fail("requestId is required.")
            if (!deps.httpSend) return fail("HTTP sending is not available.")
            const saved = (deps.savedRequests?.() ?? []).find((r) => r.id === id)
            // Only a saved request can be replayed — the agent never supplies a
            // URL, so this cannot be pointed at an arbitrary host.
            if (!saved) {
                return fail(
                    `No saved request with id "${id}". Call devdeck_http_requests for the current list.`
                )
            }
            const req = buildHttpRequest(saved)
            let res: McpHttpResponse
            try {
                res = await deps.httpSend(req)
            } catch (e) {
                return fail(`Request failed: ${e instanceof Error ? e.message : String(e)}`)
            }
            if (!res.ok) return fail(`Request failed: ${res.error ?? "unknown error"}`)
            const body = res.body ?? ""
            const capped = body.slice(0, MAX_BODY)
            return ok(
                json({
                    request: { name: saved.name, method: req.method, url: req.url },
                    status: res.status,
                    statusText: res.statusText,
                    timeMs: res.timeMs,
                    truncated: body.length > capped.length,
                    body: capped
                })
            )
        }

        case "devdeck_console_logs": {
            const pages = deps.browserPages?.() ?? []
            if (pages.length === 0) {
                return ok(
                    "No browser page is being captured. Ask the user to open the Browser panel in DevDeck first."
                )
            }
            let pageId: number
            if (typeof args.pageId === "number") {
                if (!pages.some((p) => p.id === args.pageId)) {
                    return fail(
                        `No captured page with id ${args.pageId}. Currently captured: ${json(pages)}`
                    )
                }
                pageId = args.pageId
            } else if (pages.length === 1) {
                pageId = pages[0].id
            } else {
                return fail(
                    "Several pages are being captured — pass one of these ids as pageId:\n" +
                        json(pages)
                )
            }
            const limit =
                typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 100
            const page = pages.find((p) => p.id === pageId)
            return ok(
                json({
                    page,
                    console: deps.consoleLog?.(pageId, limit) ?? [],
                    network: deps.networkLog?.(pageId, limit) ?? []
                })
            )
        }

        default:
            return fail(`Unknown tool: ${name}`)
    }
}
