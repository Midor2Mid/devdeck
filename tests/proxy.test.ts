import { describe, it, expect, afterEach } from "vitest"
import { createServer, request, type Server } from "http"
import { gzipSync, gunzipSync } from "zlib"
import { once } from "events"
import { AddressInfo } from "net"
import { start, stop, list, clear, setProject, proxyEvents, type NetCapture } from "../src/main/proxy"

// A fresh port per test avoids TIME_WAIT reuse flakiness on the fixed listener.
let portSeq = 8913
const nextPort = (): number => portSeq++

/** A throwaway upstream server that gzips a JSON body. */
function startTarget(): Promise<{ server: Server; port: number }> {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            const body = gzipSync(JSON.stringify({ hello: "world", path: req.url }))
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Content-Encoding": "gzip"
            })
            res.end(body)
        })
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address()
            resolve({ server, port: typeof addr === "object" && addr ? addr.port : 0 })
        })
    })
}

/** Issue a forward-proxy GET (absolute-form request line) and resolve the raw body bytes. */
function proxiedGet(proxyPort: number, targetUrl: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const req = request(
            { host: "127.0.0.1", port: proxyPort, method: "GET", path: targetUrl },
            (res) => {
                const chunks: Buffer[] = []
                res.on("data", (d) => chunks.push(d))
                res.on("end", () => resolve(Buffer.concat(chunks)))
            }
        )
        req.on("error", reject)
        req.end()
    })
}

/** Bind then release a port so a request to it is guaranteed to be refused fast. */
async function deadPort(): Promise<number> {
    const s = createServer()
    s.listen(0, "127.0.0.1")
    await once(s, "listening")
    const port = (s.address() as AddressInfo).port
    await new Promise<void>((r) => s.close(() => r()))
    return port
}

function nextCapture(): Promise<NetCapture> {
    return new Promise((resolve) => proxyEvents.once("capture", resolve))
}

afterEach(() => {
    stop()
    clear()
    setProject(null)
})

describe("capture proxy", () => {
    it("forwards an HTTP request and records a decoded capture", async () => {
        const target = await startTarget()
        setProject("proj-42")
        const pp = nextPort()
        start(pp)

        const captured = nextCapture()
        const body = await proxiedGet(pp, `http://127.0.0.1:${target.port}/api/items`)
        const cap = await captured

        // The proxy relays the response untouched (still gzip-encoded).
        expect(JSON.parse(gunzipSync(body).toString()).hello).toBe("world")

        expect(cap.method).toBe("GET")
        expect(cap.scheme).toBe("http")
        expect(cap.status).toBe(200)
        expect(cap.host).toBe(`127.0.0.1:${target.port}`)
        expect(cap.path).toBe("/api/items")
        expect(cap.tunneled).toBe(false)
        expect(cap.projectId).toBe("proj-42")
        // gzip response body is decompressed for the inspector.
        expect(JSON.parse(cap.resBody).hello).toBe("world")
        expect(cap.bytesIn).toBeGreaterThan(0)

        target.server.close()
    })

    it("records an error capture when the upstream is unreachable", async () => {
        const pp = nextPort()
        start(pp)
        const dead = await deadPort()
        const captured = nextCapture()
        await proxiedGet(pp, `http://127.0.0.1:${dead}/nope`).catch(() => undefined)
        const cap = await captured
        expect(cap.status).toBe(0)
        expect(cap.error).toBeTruthy()
    })

    it("clear() empties the capture buffer", async () => {
        const target = await startTarget()
        const pp = nextPort()
        start(pp)
        const captured = nextCapture()
        await proxiedGet(pp, `http://127.0.0.1:${target.port}/x`)
        await captured
        expect(list().length).toBeGreaterThan(0)
        clear()
        expect(list().length).toBe(0)
        target.server.close()
    })
})
