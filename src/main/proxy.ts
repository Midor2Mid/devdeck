import {
    createServer,
    request as httpRequest,
    type Server,
    type IncomingMessage,
    type ServerResponse
} from "http"
import { connect as netConnect, type Socket } from "net"
import { EventEmitter } from "events"
import { gunzipSync, inflateSync, brotliDecompressSync } from "zlib"

// A local HTTP forward proxy that captures the traffic flowing through it for
// debugging. Plain HTTP is captured in full (headers + body, decompressed);
// HTTPS arrives via CONNECT and is tunneled end-to-end (encrypted), so only the
// connection metadata is recorded - decrypting would require a MITM CA, which
// is deliberately out of scope. Bound to loopback only; off by default.

export interface NetCapture {
    id: string
    ts: number
    /** The project that was active when this was captured (best-effort tag). */
    projectId: string | null
    method: string
    url: string
    host: string
    path: string
    scheme: "http" | "https"
    status: number
    statusText: string
    reqHeaders: Record<string, string>
    resHeaders: Record<string, string>
    reqBody: string
    resBody: string
    reqBodyTruncated: boolean
    resBodyTruncated: boolean
    /** Request body bytes sent upstream. */
    bytesOut: number
    /** Response body bytes received (post-decompression for HTTP). */
    bytesIn: number
    timeMs: number
    /** HTTPS CONNECT tunnel - payload is encrypted, body not captured. */
    tunneled: boolean
    error?: string
}

export const proxyEvents = new EventEmitter()
// Many panels may not be listening; keep the cap generous and quiet.
proxyEvents.setMaxListeners(50)

let server: Server | null = null
let listenPort = 0
let activeProjectId: string | null = null
const captures: NetCapture[] = []
const CAP = 1000
const BODY_CAP = 256 * 1024

function newId(): string {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
}

function record(c: NetCapture): void {
    captures.push(c)
    if (captures.length > CAP) captures.splice(0, captures.length - CAP)
    proxyEvents.emit("capture", c)
}

function headerObj(raw: IncomingMessage["headers"]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
        out[k] = Array.isArray(v) ? v.join(", ") : String(v ?? "")
    }
    return out
}

/** Decompress a captured body when the encoding is known and it wasn't truncated. */
function decodeBody(buf: Buffer, encoding: string | undefined, truncated: boolean): string {
    if (buf.length === 0) return ""
    if (!truncated && encoding) {
        try {
            const enc = encoding.toLowerCase()
            if (enc.includes("br")) buf = brotliDecompressSync(buf)
            else if (enc.includes("gzip")) buf = gunzipSync(buf)
            else if (enc.includes("deflate")) buf = inflateSync(buf)
        } catch {
            /* leave the raw bytes - better than nothing */
        }
    }
    return buf.toString("utf8")
}

/** Accumulate a stream's chunks up to BODY_CAP; report total bytes + truncation. */
function captureBody(stream: NodeJS.ReadableStream): {
    chunks: Buffer[]
    done: () => { buf: Buffer; total: number; truncated: boolean }
} {
    const chunks: Buffer[] = []
    let capped = 0
    let total = 0
    let truncated = false
    stream.on("data", (d: Buffer) => {
        total += d.length
        if (capped < BODY_CAP) {
            const room = BODY_CAP - capped
            if (d.length > room) {
                chunks.push(d.subarray(0, room))
                capped += room
                truncated = true
            } else {
                chunks.push(d)
                capped += d.length
            }
        } else {
            truncated = true
        }
    })
    return {
        chunks,
        done: () => ({ buf: Buffer.concat(chunks), total, truncated })
    }
}

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const target = req.url ?? ""
    // A relative URL means a human/tool hit the proxy directly, not via a proxy
    // config. Serve a short hint instead of a confusing error.
    if (!/^https?:\/\//i.test(target)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(infoHtml())
        return
    }

    let parsed: URL
    try {
        parsed = new URL(target)
    } catch {
        res.writeHead(400, { "Content-Type": "text/plain" })
        res.end("DevDeck proxy: malformed request URL.")
        return
    }

    const start = Date.now()
    const reqCap = captureBody(req)

    const proxyReq = httpRequest(
        {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: parsed.pathname + parsed.search,
            method: req.method,
            headers: req.headers
        },
        (proxyRes) => {
            const resCap = captureBody(proxyRes)
            // Relay the untouched response to the client.
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
            proxyRes.pipe(res)
            proxyRes.on("end", () => {
                const r = reqCap.done()
                const s = resCap.done()
                record({
                    id: newId(),
                    ts: start,
                    projectId: activeProjectId,
                    method: req.method ?? "GET",
                    url: target,
                    host: parsed.host,
                    path: parsed.pathname + parsed.search,
                    scheme: "http",
                    status: proxyRes.statusCode ?? 0,
                    statusText: proxyRes.statusMessage ?? "",
                    reqHeaders: headerObj(req.headers),
                    resHeaders: headerObj(proxyRes.headers),
                    reqBody: decodeBody(
                        r.buf,
                        req.headers["content-encoding"] as string | undefined,
                        r.truncated
                    ),
                    resBody: decodeBody(
                        s.buf,
                        proxyRes.headers["content-encoding"],
                        s.truncated
                    ),
                    reqBodyTruncated: r.truncated,
                    resBodyTruncated: s.truncated,
                    bytesOut: r.total,
                    bytesIn: s.total,
                    timeMs: Date.now() - start,
                    tunneled: false
                })
            })
        }
    )

    proxyReq.on("error", (err) => {
        const r = reqCap.done()
        record({
            id: newId(),
            ts: start,
            projectId: activeProjectId,
            method: req.method ?? "GET",
            url: target,
            host: parsed.host,
            path: parsed.pathname + parsed.search,
            scheme: "http",
            status: 0,
            statusText: "",
            reqHeaders: headerObj(req.headers),
            resHeaders: {},
            reqBody: decodeBody(
                r.buf,
                req.headers["content-encoding"] as string | undefined,
                r.truncated
            ),
            resBody: "",
            reqBodyTruncated: r.truncated,
            resBodyTruncated: false,
            bytesOut: r.total,
            bytesIn: 0,
            timeMs: Date.now() - start,
            tunneled: false,
            error: err.message
        })
        if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" })
        res.end("DevDeck proxy error: " + err.message)
    })

    req.pipe(proxyReq)
}

function handleConnect(req: IncomingMessage, clientSocket: Socket, head: Buffer): void {
    const start = Date.now()
    const [host, portStr] = (req.url ?? "").split(":")
    const port = Number(portStr) || 443
    let bytesIn = 0
    let bytesOut = 0
    let finished = false

    const finish = (error?: string): void => {
        if (finished) return
        finished = true
        record({
            id: newId(),
            ts: start,
            projectId: activeProjectId,
            method: "CONNECT",
            url: `https://${host}:${port}`,
            host: `${host}:${port}`,
            path: "",
            scheme: "https",
            status: error ? 0 : 200,
            statusText: error ? "" : "Connection Established",
            reqHeaders: headerObj(req.headers),
            resHeaders: {},
            reqBody: "",
            resBody: "",
            reqBodyTruncated: false,
            resBodyTruncated: false,
            bytesOut,
            bytesIn,
            timeMs: Date.now() - start,
            tunneled: true,
            error
        })
    }

    const upstream = netConnect(port, host, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (head && head.length) upstream.write(head)
        upstream.pipe(clientSocket)
        clientSocket.pipe(upstream)
    })

    upstream.on("data", (d: Buffer) => (bytesIn += d.length))
    clientSocket.on("data", (d: Buffer) => (bytesOut += d.length))
    upstream.on("close", () => {
        clientSocket.destroy()
        finish()
    })
    upstream.on("error", (err) => {
        clientSocket.destroy()
        finish(err.message)
    })
    clientSocket.on("error", () => {
        upstream.destroy()
        finish("client error")
    })
}

export function setProject(id: string | null): void {
    activeProjectId = id
}

export function list(): NetCapture[] {
    return captures
}

export function clear(): void {
    captures.length = 0
}

export function isRunning(): boolean {
    return server !== null
}

export function status(): { running: boolean; port: number } {
    return { running: server !== null, port: listenPort }
}

export function start(port: number): { running: boolean; port: number } {
    stop()
    const srv = createServer(handleHttp)
    srv.on("connect", handleConnect)
    srv.on("clientError", (_err, socket) => {
        try {
            socket.end("HTTP/1.1 400 Bad Request\r\n\r\n")
        } catch {
            /* ignore */
        }
    })
    srv.on("error", (err) => console.error("[proxy] error:", err.message))
    // Loopback only - a forward proxy is RCE-ish surface; never expose to LAN.
    srv.listen(port, "127.0.0.1")
    server = srv
    listenPort = port
    console.log(`[proxy] capturing on 127.0.0.1:${port}`)
    return status()
}

export function stop(): { running: boolean; port: number } {
    server?.close()
    server = null
    return status()
}

function infoHtml(): string {
    const addr = `http://127.0.0.1:${listenPort}`
    return `<!doctype html><meta charset="utf-8" />
<title>DevDeck proxy</title>
<body style="font-family:system-ui,sans-serif;background:#1b1a18;color:#e4ddcf;padding:40px;line-height:1.6">
<h2 style="color:#b8895c">DevDeck capture proxy</h2>
<p>This is a forward proxy, not a website. Point a client's proxy setting here, then watch traffic in DevDeck's Network panel.</p>
<pre style="background:#141312;border:1px solid #322e28;border-radius:8px;padding:12px">$env:HTTP_PROXY="${addr}"
$env:HTTPS_PROXY="${addr}"</pre>
</body>`
}
