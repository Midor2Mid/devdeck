import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { WebSocket } from "ws"
import { rmSync } from "fs"

// Same temp-userData + no-DPAPI setup as tests/devices.test.ts, since server.ts
// pulls in devices.ts (which needs `app`/`safeStorage`).
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("path")
    return { dir: mkdtempSync(join(tmpdir(), "server-remote-")) }
})

vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

// Native/heavy modules server.ts imports but this file has no interest in
// exercising - stubbed the same way tests/mcpserver.test.ts stubs db.ts.
vi.mock("../src/main/pty", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventEmitter } = require("events")
    return {
        ptyEvents: new EventEmitter(),
        getBuffer: () => "",
        writePty: () => {},
        resizePty: () => {}
    }
})
vi.mock("../src/main/db", () => ({
    allConnections: () => [],
    runQuery: async () => ({ ok: true, timeMs: 0 }),
    listTables: async () => []
}))
vi.mock("../src/main/projects", () => ({
    listProjects: () => ({ projects: [], activeId: null })
}))
// The bind decision isn't what this file is about, and every non-"tailscale"
// outcome of the real chooseBind is "0.0.0.0" - binding every interface would
// risk a Windows Firewall prompt in a plain test run. Force loopback; every
// other guard (tokenOk, isExpired, the SSRF/SQL guards) keeps its real
// behaviour, so the auth path under test is genuine.
vi.mock("../src/main/guards", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/main/guards")>()
    return { ...actual, chooseBind: () => ({ ok: true, host: "127.0.0.1" }) }
})

const { start, stop } = await import("../src/main/server")
const { pairingToken, revokeDevice, listDevices } = await import("../src/main/devices")

const PORT = 18732
const base = `http://127.0.0.1:${PORT}`
const deps = { getSessions: () => [], requestNewSession: () => {} }

async function waitForListen(): Promise<void> {
    const deadline = Date.now() + 3000
    for (;;) {
        try {
            await fetch(`${base}/xterm.js`)
            return
        } catch {
            if (Date.now() > deadline) throw new Error("test server never started listening")
            await new Promise((r) => setTimeout(r, 20))
        }
    }
}

/** Pull the devdeck_device cookie's value out of a Set-Cookie header. */
function deviceTokenFrom(setCookie: string | null): string {
    const m = (setCookie ?? "").match(/devdeck_device=([^;]+)/)
    return m ? decodeURIComponent(m[1]) : ""
}

/** Connect a raw WebSocket, resolving on a real open and rejecting on any refusal. */
function connectWs(headers: Record<string, string> = {}, query = ""): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws${query}`, { headers })
        ws.once("open", () => resolve(ws))
        ws.once("unexpected-response", () => {
            ws.terminate()
            reject(new Error("upgrade rejected"))
        })
        ws.once("error", (err) => reject(err))
    })
}

beforeEach(async () => {
    try {
        rmSync(`${h.dir}/remote-devices.json`)
    } catch {
        /* nothing to remove yet */
    }
    await start({ port: PORT, bind: "lan", deviceTtlDays: 30, tls: false }, deps)
    await waitForListen()
})

afterEach(() => {
    stop()
})

describe("remote server - cookie auth (Task 4)", () => {
    it("enrols on the pairing token over HTTP and sets an HttpOnly, SameSite=Strict device cookie", async () => {
        const res = await fetch(`${base}/?token=${pairingToken()}`)
        expect(res.status).toBe(200)
        const setCookie = res.headers.get("set-cookie")
        expect(setCookie).toBeTruthy()
        expect(setCookie).toMatch(/devdeck_device=/)
        expect(setCookie).toMatch(/HttpOnly/)
        expect(setCookie).toMatch(/SameSite=Strict/)
    })

    it("the WebSocket accepts a device token presented ONLY as a cookie - no ?token= anywhere", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        expect(token).toBeTruthy()

        // No query string at all on the WS URL - the cookie is the sole credential.
        const ws = await connectWs({ Cookie: `devdeck_device=${token}` })
        expect(ws.readyState).toBe(WebSocket.OPEN)
        ws.close()
    })

    it("rejects a WebSocket with neither a cookie nor a ?token=", async () => {
        await expect(connectWs()).rejects.toThrow()
    })

    it("allowEnroll:false - a WebSocket presenting the pairing token as ?token= is refused, not enrolled", async () => {
        await expect(connectWs({}, `?token=${encodeURIComponent(pairingToken())}`)).rejects.toThrow()
    })

    it("a reload with a stale/unknown device cookie 401s rather than being silently accepted", async () => {
        const res = await fetch(`${base}/`, { headers: { Cookie: "devdeck_device=not-a-real-token" } })
        expect(res.status).toBe(401)
    })

    it("the cookie takes precedence over a stale ?token= query pairing token on the HTTP path", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))

        // A garbage query token alongside a valid cookie must not be able to
        // knock a valid session back to "unauthorized" - cookie wins.
        const res = await fetch(`${base}/?token=garbage`, {
            headers: { Cookie: `devdeck_device=${token}` }
        })
        expect(res.status).toBe(200)
    })

    // B-1 full matrix: a VALID cookie alongside a VALID pairing token must
    // still return early on the cookie and never touch the pairing branch -
    // the previous "cookie wins" test used a garbage query token, which would
    // still pass even if the code fell through and minted a duplicate device
    // on every single page load.
    it("a valid cookie short-circuits even a valid pairing token - no duplicate device is minted", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        expect(listDevices(30)).toHaveLength(1)

        const res = await fetch(`${base}/?token=${pairingToken()}`, {
            headers: { Cookie: `devdeck_device=${token}` }
        })
        expect(res.status).toBe(200)
        expect(deviceTokenFrom(res.headers.get("set-cookie"))).toBe(token)
        expect(listDevices(30)).toHaveLength(1)
    })

    // Low: an unauthenticated cross-site request (no cookie at all - e.g. an
    // <img src=...> from a malicious page, which SameSite=Strict already
    // keeps the real cookie off) must not be able to force-clear a victim's
    // valid device cookie just by getting a 401 back.
    it("a 401 with no cookie presented does not emit a cookie-clearing Set-Cookie", async () => {
        const res = await fetch(`${base}/`)
        expect(res.status).toBe(401)
        expect(res.headers.get("set-cookie")).toBeNull()
    })

    // B-1: precedence must be decided on auth OUTCOME, not merely on the
    // cookie having a value - a dead cookie (idle-expired or revoked) must
    // not shadow a fresh pairing token, or a re-scanned QR code 401s forever.
    it("a revoked (dead) cookie does not shadow a fresh pairing ?token= - the request still re-pairs", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const deadToken = deviceTokenFrom(enrol.headers.get("set-cookie"))
        const paired = listDevices(30)
        expect(paired).toHaveLength(1)
        revokeDevice(paired[0].id)

        const res = await fetch(`${base}/?token=${pairingToken()}`, {
            headers: { Cookie: `devdeck_device=${deadToken}` }
        })
        expect(res.status).toBe(200)
        const newToken = deviceTokenFrom(res.headers.get("set-cookie"))
        expect(newToken).toBeTruthy()
        expect(newToken).not.toBe(deadToken)
    })

    // B-1: the 401 itself must clear whatever dead cookie was just presented,
    // since the page's JS never runs on a 401 to clear it any other way.
    it("a 401 clears the presented device cookie (Max-Age=0)", async () => {
        const res = await fetch(`${base}/`, { headers: { Cookie: "devdeck_device=not-a-real-token" } })
        expect(res.status).toBe(401)
        const setCookie = res.headers.get("set-cookie")
        expect(setCookie).toMatch(/devdeck_device=;/)
        expect(setCookie).toMatch(/Max-Age=0/)
    })

    // B-2: the cookie's own lifetime must slide forward with real use, not
    // expire on a fixed schedule from first enrolment while the server-side
    // idle check (which does slide) would have kept the device alive.
    it("re-issues the cookie on every authenticated load, not only a fresh enrolment", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))

        const again = await fetch(`${base}/`, { headers: { Cookie: `devdeck_device=${token}` } })
        expect(again.status).toBe(200)
        const setCookie = again.headers.get("set-cookie")
        expect(setCookie).toBeTruthy()
        expect(deviceTokenFrom(setCookie)).toBe(token)
    })

    // Defense in depth: the credential is ambient now, so a cross-site Origin
    // on the WS upgrade must be refused even with a valid cookie attached.
    it("rejects a WebSocket upgrade whose Origin doesn't match this server's host", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        await expect(
            connectWs({ Cookie: `devdeck_device=${token}`, Origin: "http://evil.example" })
        ).rejects.toThrow()
    })

    it("accepts a WebSocket upgrade whose Origin matches this server's host", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        const ws = await connectWs({
            Cookie: `devdeck_device=${token}`,
            Origin: `http://127.0.0.1:${PORT}`
        })
        expect(ws.readyState).toBe(WebSocket.OPEN)
        ws.close()
    })
})
