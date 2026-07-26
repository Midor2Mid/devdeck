/**
 * DevDeck as an MCP server.
 *
 * Claude Code (and any MCP client) can reach DevDeck's own panels as tools, so an
 * agent pulls context instead of us pushing it. Registered in a project's
 * `.mcp.json` as an HTTP server:
 *
 *   { "mcpServers": { "devdeck": {
 *       "type": "http",
 *       "url": "http://127.0.0.1:8787/mcp",
 *       "headers": { "Authorization": "Bearer <token>" } } } }
 *
 * Why HTTP rather than the more common stdio transport: a stdio server is a
 * separate process the client spawns, which could not see DevDeck's in-memory
 * connection pools — it would need a second bridge back into this process, and it
 * would have to ship as an unpacked script outside app.asar. Hosting the endpoint
 * here removes both problems: the tools run in the process that already holds the
 * live state.
 *
 * Security posture:
 *  - Binds to 127.0.0.1 only. Never all-interfaces — unlike the mobile remote
 *    server there is no Tailscale/LAN use case, and this endpoint is unattended.
 *  - Every request needs `Authorization: Bearer <token>`, compared with the same
 *    constant-time `tokenOk` used by the remote server. The token is generated
 *    once and lives in DevDeck's settings.
 *  - Off by default. The tools it exposes are read-only (see `mcptools.ts`), but
 *    any local process could still reach a listening port, so the user opts in.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http"
import { randomBytes } from "crypto"
import { tokenOk } from "./guards"
import { TOOLS, callTool, type McpDeps } from "./mcptools"

/** MCP protocol revision this server implements. */
const PROTOCOL_VERSION = "2025-06-18"
const MAX_BODY_BYTES = 1 << 20 // 1 MB — tool arguments are small; anything larger is abuse

export interface McpServerConfig {
    port: number
    token: string
}

let server: Server | null = null
let current: McpServerConfig | null = null
let deps: McpDeps = { projects: () => [] }

export function generateToken(): string {
    return randomBytes(24).toString("base64url")
}

/** JSON-RPC 2.0 shapes — only the subset MCP uses. */
interface RpcRequest {
    jsonrpc?: string
    id?: string | number | null
    method?: string
    params?: Record<string, unknown>
}

function rpcResult(id: string | number | null, result: unknown): string {
    return JSON.stringify({ jsonrpc: "2.0", id, result })
}

function rpcError(id: string | number | null, code: number, message: string): string {
    return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })
}

/**
 * Handle one JSON-RPC message. Returns the response body, or null for
 * notifications (which take an HTTP 202 with no body per the MCP spec).
 */
export async function handleRpc(req: RpcRequest, d: McpDeps): Promise<string | null> {
    const id = req.id ?? null
    const method = req.method ?? ""

    // Notifications have no id and expect no response.
    const isNotification = req.id === undefined || req.id === null

    switch (method) {
        case "initialize":
            return rpcResult(id, {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: "devdeck", title: "DevDeck", version: "1" }
            })

        case "notifications/initialized":
        case "notifications/cancelled":
            return null

        case "ping":
            return rpcResult(id, {})

        case "tools/list":
            return rpcResult(id, { tools: TOOLS })

        case "tools/call": {
            const name = typeof req.params?.name === "string" ? req.params.name : ""
            const args = (req.params?.arguments ?? {}) as Record<string, unknown>
            if (!name) return rpcError(id, -32602, "params.name is required")
            try {
                return rpcResult(id, await callTool(name, args, d))
            } catch (e) {
                // Tool faults are reported as results, not transport errors, so the
                // agent can read the message and adapt instead of seeing a dead server.
                return rpcResult(id, {
                    content: [
                        { type: "text", text: `Tool failed: ${e instanceof Error ? e.message : String(e)}` }
                    ],
                    isError: true
                })
            }
        }

        default:
            if (isNotification) return null
            return rpcError(id, -32601, `Method not found: ${method}`)
    }
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = ""
        let size = 0
        req.on("data", (chunk: Buffer) => {
            size += chunk.length
            if (size > MAX_BODY_BYTES) {
                reject(new Error("body too large"))
                req.destroy()
                return
            }
            body += chunk.toString("utf8")
        })
        req.on("end", () => resolve(body))
        req.on("error", reject)
    })
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, body: string, type = "application/json"): void => {
        res.writeHead(status, { "content-type": type, "cache-control": "no-store" })
        res.end(body)
    }

    if (!current) return send(503, rpcError(null, -32000, "server stopping"))

    // Bearer token on every request, including the initialize handshake.
    const auth = req.headers.authorization ?? ""
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""
    if (!tokenOk(bearer, current.token)) {
        return send(401, rpcError(null, -32001, "unauthorized"))
    }

    const path = (req.url ?? "").split("?")[0]
    if (path !== "/mcp") return send(404, rpcError(null, -32601, "not found"))

    // A GET on the endpoint is how clients open a server→client SSE channel. We
    // never push unprompted messages, so decline it explicitly rather than
    // leaving a stream open the client would wait on.
    if (req.method === "GET") return send(405, rpcError(null, -32000, "SSE not supported"))
    if (req.method !== "POST") return send(405, rpcError(null, -32000, "method not allowed"))

    let raw: string
    try {
        raw = await readBody(req)
    } catch {
        return send(413, rpcError(null, -32600, "request too large"))
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return send(400, rpcError(null, -32700, "parse error"))
    }

    // A client may batch messages in an array.
    if (Array.isArray(parsed)) {
        const out: string[] = []
        for (const m of parsed) {
            const r = await handleRpc(m as RpcRequest, deps)
            if (r) out.push(r)
        }
        if (out.length === 0) return send(202, "")
        return send(200, `[${out.join(",")}]`)
    }

    const body = await handleRpc(parsed as RpcRequest, deps)
    if (body === null) return send(202, "")
    send(200, body)
}

export function status(): { running: boolean; port: number | null } {
    return { running: !!server, port: current?.port ?? null }
}

export async function start(config: McpServerConfig, d: McpDeps): Promise<{ ok: boolean; error?: string }> {
    await stop()
    deps = d
    current = config
    return new Promise((resolve) => {
        const s = createServer((req, res) => {
            void handleRequest(req, res).catch(() => {
                try {
                    res.writeHead(500, { "content-type": "application/json" })
                    res.end(rpcError(null, -32603, "internal error"))
                } catch {
                    /* response already gone */
                }
            })
        })
        s.on("error", (err: NodeJS.ErrnoException) => {
            server = null
            current = null
            const msg =
                err.code === "EADDRINUSE"
                    ? `Port ${config.port} is already in use — pick another in Settings.`
                    : err.message
            resolve({ ok: false, error: msg })
        })
        // Loopback only. This is not negotiable for this server: it is unattended
        // and its tools read your databases.
        s.listen(config.port, "127.0.0.1", () => {
            server = s
            console.log(`[mcp] DevDeck MCP server on http://127.0.0.1:${config.port}/mcp`)
            resolve({ ok: true })
        })
    })
}

export function stop(): Promise<void> {
    return new Promise((resolve) => {
        const s = server
        server = null
        current = null
        if (!s) return resolve()
        s.close(() => resolve())
        // Don't let a lingering keep-alive socket hold shutdown open.
        s.closeAllConnections?.()
    })
}
