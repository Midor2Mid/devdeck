/**
 * DevDeck as an MCP server.
 *
 * Claude Code (and any MCP client) can reach DevDeck's own state as tools, so an
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
 * state — the attached browser pages, the open projects. It would need a second
 * bridge back into this process, and it would have to ship as an unpacked script
 * outside app.asar. Hosting the endpoint here removes both problems: the tools
 * run in the process that already holds the live state.
 *
 * TWO ROUTES ON ONE LISTENER.
 *  - `POST /mcp` — the JSON-RPC tool surface described above.
 *  - `POST /hook` — an agent CLI declaring its own state, so DevDeck stops
 *    inferring "which agent needs me" from pty bytes for that session. It is
 *    here rather than on a port of its own because it needs nothing this server
 *    does not already have: a loopback listener, one bearer token, and an opt-in.
 *    A second listener would be a second thing to secure, a second thing to
 *    document and a second thing the user has to allow through a firewall
 *    prompt, for no capability. `attention.ts` holds the correlation and
 *    `shared/attention.ts` the wire shape; this file is transport only.
 *
 * Security posture:
 *  - Binds to 127.0.0.1 only. Never all-interfaces — unlike the mobile remote
 *    server there is no Tailscale/LAN use case, and this endpoint is unattended.
 *    The hook route re-checks that at the request as well (`fromThisMachine`).
 *  - Every request needs `Authorization: Bearer <token>`, compared with the same
 *    constant-time `tokenOk` used by the remote server. The token is generated
 *    once and lives in DevDeck's settings. THE HOOK ROUTE IS NOT EXEMPT and the
 *    check happens before the routing, so it cannot become exempt by accident.
 *  - Off by default. The tools it exposes are read-only (see `mcptools.ts`) and
 *    the hook route's only effect is on what DevDeck SHOWS — it can never write
 *    to a pty — but any local process could still reach a listening port, so
 *    the user opts in.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http"
import { randomBytes } from "crypto"
import { tokenOk } from "./guards"
import { TOOLS, callTool, type McpDeps } from "./mcptools"
import { ingest, HOOK_SESSION_HEADER } from "./attention"
import {
    HOOK_PATH,
    MAX_HOOK_BODY_BYTES,
    DEVDECK_SESSION_ENV,
    DEVDECK_HOOK_URL_ENV
} from "../shared/attention"
import { DEVDECK_TOKEN_ENV } from "../shared/mcpEnv"

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

function readBody(req: IncomingMessage, cap = MAX_BODY_BYTES): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = ""
        let size = 0
        req.on("data", (chunk: Buffer) => {
            size += chunk.length
            if (size > cap) {
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

/**
 * Is this connection from this machine?
 *
 * Belt to the listener's braces. `s.listen(port, "127.0.0.1")` is what actually
 * makes that true today, and this re-establishes it at the request rather than
 * at the bind — so the no-telemetry-and-no-remote-reach property of the hook
 * route survives someone widening the bind for a reason that has nothing to do
 * with hooks. Fails closed on an address node could not give us.
 */
function fromThisMachine(req: IncomingMessage): boolean {
    const a = req.socket.remoteAddress ?? ""
    return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1"
}

/**
 * `POST /hook` — an agent CLI declaring its own state.
 *
 * Rides the listener and the bearer check the MCP route already has: no second
 * port, no second token, no exemption. The caller (`handleRequest`) has already
 * compared the bearer with `tokenOk` before this runs, and that ordering is the
 * contract — this function must never become reachable ahead of it.
 *
 * EVERY RESPONSE HAS AN EMPTY BODY. A hook's response is fed back through the
 * CLI's hook-output contract and for several events lands in the model's
 * context, so anything DevDeck wrote here would be text injected into the agent
 * it is watching. The outcome goes in a header instead, where `curl` does not
 * print it and no CLI reads it — visible to a human debugging with `-i`, inert
 * to everything else. `tests/attentionHook.test.ts` asserts the empty body on
 * every branch, including the failures.
 */
function hookReply(res: ServerResponse, status: number, outcome: string): void {
    res.writeHead(status, {
        "content-length": "0",
        "cache-control": "no-store",
        "x-devdeck-hook": outcome
    })
    res.end()
}

async function handleHook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const done = (status: number, outcome: string): void => hookReply(res, status, outcome)
    if (!fromThisMachine(req)) return done(403, "not-local")
    if (req.method !== "POST") return done(405, "method-not-allowed")

    let raw: string
    try {
        // A tighter cap than the MCP route's: a hook payload is metadata about
        // one turn, and the largest field on it is a capped message.
        raw = await readBody(req, MAX_HOOK_BODY_BYTES)
    } catch {
        return done(413, "too-large")
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return done(400, "not-json")
    }
    const outcome = ingest(parsed, String(req.headers[HOOK_SESSION_HEADER] ?? ""))
    // 204 for everything DevDeck understood, `unmatched` included: the CLI did
    // its part correctly and telling it otherwise would put an error in the
    // user's agent for a DevDeck-side configuration gap. The gap is reported
    // where the user is actually looking — the activity feed — by the renderer.
    return done(outcome === "invalid" ? 400 : 204, outcome)
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, body: string, type = "application/json"): void => {
        res.writeHead(status, { "content-type": type, "cache-control": "no-store" })
        res.end(body)
    }

    // Read BEFORE the checks below, and used only to pick the SHAPE of a
    // refusal - never to skip one. The hook route's every response has to be
    // empty-bodied, refusals included: a CLI feeds an http hook's response back
    // through its hook-output contract, and for several events that lands in
    // the model's context. A stale token would otherwise inject
    // `{"error":{"message":"unauthorized"}}` into the agent DevDeck is watching.
    const path = (req.url ?? "").split("?")[0]
    const isHook = path === HOOK_PATH

    if (!current) {
        if (isHook) return hookReply(res, 503, "stopping")
        return send(503, rpcError(null, -32000, "server stopping"))
    }

    // Bearer token on every request, including the initialize handshake and the
    // hook route. Same constant-time comparison, same token, no exemption.
    const auth = req.headers.authorization ?? ""
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""
    if (!tokenOk(bearer, current.token)) {
        if (isHook) return hookReply(res, 401, "unauthorized")
        return send(401, rpcError(null, -32001, "unauthorized"))
    }

    if (isHook) return handleHook(req, res)
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

/**
 * The env vars a terminal needs for its agent's hooks to reach DevDeck and be
 * correlated to THIS pane. Empty when the server is not running.
 *
 * In main, not in the renderer, and that is the point. Main is the only layer
 * that knows both the live server's port and the pty's own id at the moment of
 * the spawn, so it is the only layer that can make this unforgettable - a
 * component that has to remember is a component that will be forgotten on the
 * next launch path. Injected LAST in `index.ts`'s merge order: a project env
 * var must not be able to shadow a fact DevDeck is asserting about itself, and
 * `DEVDECK_SESSION` least of all, since redirecting it would send one pane's
 * attention signals to another.
 *
 * THE TOKEN IS SCOPED EXACTLY AS IT ALREADY WAS, deliberately, and the
 * duplication with `TerminalPane.tsx`'s `extraEnv` is the price. That component
 * puts `DEVDECK_MCP_TOKEN` into agent-preset terminals only; widening it to
 * every pane so a shell the user typed `claude` into would work is a change to
 * who can read DevDeck's bearer token - every child process of every terminal
 * rather than of an agent pane - and that is not a call this feature gets to
 * make on the side. So `isAgent` gates it, and the two sites write the same
 * value for the same panes. A plain shell pane gets the session id and the url
 * (neither is a secret: one is an addressing label, the other is in this
 * comment) and its hooks will be refused, which the docs state.
 *
 * The url is for CLIs whose hooks are `command`-type only and have to `curl` it
 * themselves; Claude Code's `http` hooks carry a literal url instead, because
 * env interpolation there is documented for header values and not for the url.
 */
export function hookEnv(sessionId: string, isAgent: boolean): Record<string, string> {
    if (!current) return {}
    const env: Record<string, string> = {
        [DEVDECK_SESSION_ENV]: sessionId,
        [DEVDECK_HOOK_URL_ENV]: `http://127.0.0.1:${current.port}${HOOK_PATH}`
    }
    if (isAgent) env[DEVDECK_TOKEN_ENV] = current.token
    return env
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
        // Loopback only. This is not negotiable for this server: it is
        // unattended, and it answers for the projects and pages this desktop
        // has open.
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
