import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { WebSocket } from "ws"
import { rmSync } from "fs"
import type { RemoteSession } from "../src/main/server"

// Same temp-userData + no-DPAPI setup as tests/devices.test.ts, since server.ts
// pulls in devices.ts (which needs `app`/`safeStorage`).
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("path")
    // `tails` is what the stubbed pty hands the decision registry - see the
    // pty mock below and the Task 5 block at the bottom of this file.
    return { dir: mkdtempSync(join(tmpdir(), "server-remote-")), tails: {} as Record<string, string> }
})

vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

// Native/heavy modules server.ts imports but this file has no interest in
// exercising - stubbed the same way tests/mcpserver.test.ts stubs db.ts.
vi.mock("../src/main/pty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventEmitter } = require("events")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("crypto")
    // Not `require`: this one is TypeScript source, so it has to go through
    // vitest's own resolver.
    const { lastLines } =
        await vi.importActual<typeof import("../src/shared/tail")>("../src/shared/tail")
    return {
        ptyEvents: new EventEmitter(),
        getBuffer: () => "",
        writePty: () => {},
        resizePty: () => {},
        // decisions.ts reads the screen through these two. Both run the fixture
        // through the REAL `lastLines` and honour `n`, because production's
        // getTail does: it trims each line, drops blank ones and keeps the last
        // n. A mock that hashed the raw fixture would compute a digest
        // production never computes, and every "did the screen move on?" test
        // would then pass against a normalization that does not exist.
        getTail: (id: string, n: number) => lastLines(h.tails[id] ?? "", n),
        tailDigest: (id: string, n: number) =>
            createHash("sha256").update(lastLines(h.tails[id] ?? "", n)).digest("hex")
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

const { start, stop, closeDeviceSockets } = await import("../src/main/server")
const { pairingToken, revokeDevice, listDevices, __resetCacheForTest } =
    await import("../src/main/devices")
const { refreshDecision, clearDecision } = await import("../src/main/decisions")

const PORT = 18732
const base = `http://127.0.0.1:${PORT}`
// Mutable so a test can decide what main is reporting; reset in beforeEach.
let sessions: RemoteSession[] = []
const deps = { getSessions: () => sessions, requestNewSession: () => {} }

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

/** Connect a raw WebSocket, resolving on a real open and rejecting on any refusal.
 *  The rejection error carries the HTTP status of the refused upgrade so callers
 *  can assert it's specifically a 401, not merely "some failure". */
function connectWs(headers: Record<string, string> = {}, query = ""): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws${query}`, { headers })
        ws.once("open", () => resolve(ws))
        ws.once("unexpected-response", (_req, res) => {
            ws.terminate()
            const err = new Error(`upgrade rejected: ${res.statusCode}`) as Error & {
                statusCode?: number
            }
            err.statusCode = res.statusCode
            reject(err)
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
    // devices.ts (I4) caches its store/decrypted tokens in memory; the file
    // delete above does nothing to that cache on its own.
    __resetCacheForTest()
    sessions = []
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
        await expect(connectWs()).rejects.toMatchObject({ statusCode: 401 })
    })

    it("allowEnroll:false - a WebSocket presenting the pairing token as ?token= is refused, not enrolled", async () => {
        await expect(
            connectWs({}, `?token=${encodeURIComponent(pairingToken())}`)
        ).rejects.toMatchObject({ statusCode: 401 })
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
        // 403 (Forbidden), not 401: this is the Origin defense-in-depth check,
        // a distinct rejection from the auth-failure path below - it never
        // even reaches authFor(), so it must not be conflated with a 401.
        await expect(
            connectWs({ Cookie: `devdeck_device=${token}`, Origin: "http://evil.example" })
        ).rejects.toMatchObject({ statusCode: 403 })
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

describe("revoke closes the live socket (C1)", () => {
    // The bug this closes: auth is checked once, at upgrade. Deleting the
    // device's record on its own does nothing to a socket that already
    // passed that check - a revoked (stolen/ex-collaborator) device kept
    // full terminal reach for as long as it held the connection open, while
    // its row had already vanished from the panel. `devices:revoke`'s IPC
    // handler now calls `closeDeviceSockets` right after the store write;
    // this exercises that pairing directly (index.ts's handler is a
    // one-line, untested wrapper around exactly this).
    it("closeDeviceSockets terminates a revoked device's open WebSocket", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        const [paired] = listDevices(30)
        expect(paired).toBeTruthy()

        const ws = await connectWs({ Cookie: `devdeck_device=${token}` })
        expect(ws.readyState).toBe(WebSocket.OPEN)

        const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()))
        revokeDevice(paired.id)
        closeDeviceSockets(paired.id)
        await closed
        expect(ws.readyState).toBe(WebSocket.CLOSED)
    })

    it("leaves other devices' live sockets alone", async () => {
        const enrolA = await fetch(`${base}/?token=${pairingToken()}`)
        const tokenA = deviceTokenFrom(enrolA.headers.get("set-cookie"))
        const enrolB = await fetch(`${base}/?token=${pairingToken()}`)
        const tokenB = deviceTokenFrom(enrolB.headers.get("set-cookie"))
        const [a, b] = listDevices(30)
        expect(a && b).toBeTruthy()

        const wsA = await connectWs({ Cookie: `devdeck_device=${tokenA}` })
        const wsB = await connectWs({ Cookie: `devdeck_device=${tokenB}` })

        const closedA = new Promise<void>((resolve) => wsA.once("close", () => resolve()))
        revokeDevice(a.id)
        closeDeviceSockets(a.id)
        await closedA

        expect(wsA.readyState).toBe(WebSocket.CLOSED)
        expect(wsB.readyState).toBe(WebSocket.OPEN)
        wsB.close()
    })
})

describe("remote server - the auth path is rate-limited (remedy 15)", () => {
    it("stops answering guesses from a client that keeps failing, over the real HTTP path", async () => {
        // The unit test in tests/devices.test.ts proves the throttle; this one
        // proves server.ts actually hands it the peer address, which is the
        // half a devices.ts-only test cannot see. Every request here comes
        // from 127.0.0.1, so it is one bucket by construction.
        for (let i = 0; i < 6; i++) {
            const res = await fetch(`${base}/?token=wrong-${i}`)
            expect(res.status).toBe(401)
        }

        // The pairing token is genuine: only the refusal window can turn this
        // into a 401.
        const refused = await fetch(`${base}/?token=${pairingToken()}`)
        expect(refused.status).toBe(401)

        // And the same request succeeds the moment the window is cleared -
        // which is what rules out "the token was wrong all along".
        __resetCacheForTest()
        const allowed = await fetch(`${base}/?token=${pairingToken()}`)
        expect(allowed.status).toBe(200)
    })

    it("charges one failed REQUEST once, even when it presents two dead credentials", async () => {
        // authFor tries the cookie and then ?token=. Counting both halved the
        // free budget for exactly the case the fallback exists to serve: a
        // browser holding a revoked device cookie, which then loads a page,
        // its assets and a WebSocket, and would be refused while holding a
        // freshly scanned, entirely valid pairing token.
        for (let i = 0; i < 4; i++) {
            const res = await fetch(`${base}/?token=wrong-${i}`, {
                headers: { Cookie: `devdeck_device=dead-${i}` }
            })
            expect(res.status).toBe(401)
        }
        // Four requests, four charges - under the free budget. With both
        // credentials counted this would be eight, and this would 401.
        const allowed = await fetch(`${base}/?token=${pairingToken()}`)
        expect(allowed.status).toBe(200)
    })

    it("does not charge a request that carries no credential at all", async () => {
        // An anonymous GET is not a guess. Ten of them must not spend the
        // budget a real device needs.
        for (let i = 0; i < 10; i++) expect((await fetch(`${base}/`)).status).toBe(401)
        expect((await fetch(`${base}/?token=${pairingToken()}`)).status).toBe(200)
    })

    it("refuses the WebSocket upgrade too, not just HTTP", async () => {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        expect(token).toBeTruthy()

        for (let i = 0; i < 6; i++) {
            await expect(
                connectWs({ Cookie: `devdeck_device=wrong-${i}` })
            ).rejects.toMatchObject({ statusCode: 401 })
        }
        await expect(connectWs({ Cookie: `devdeck_device=${token}` })).rejects.toMatchObject({
            statusCode: 401
        })
    })
})

describe("the pending decision rides the session broadcast (Task 5)", () => {
    // A real Claude Code permission prompt, shaped exactly as `getTail` would
    // hand it over: a question, a pointed "1. Yes", and an "(esc)" reject.
    const PROMPT_TAIL = [
        "Do you want to proceed?",
        "❯ 1. Yes",
        "  2. No, and tell Claude what to do differently (esc)"
    ].join("\n")

    function agentSession(termId: string): RemoteSession {
        return {
            termId,
            projectId: "p1",
            projectName: "DevDeck",
            projectPath: "D:/devdeck",
            tabName: "claude",
            badge: "AI",
            isAgent: true,
            status: "attention"
        }
    }

    /** The next `{t}` frame the server pushes down `ws`. */
    function nextMessage(ws: WebSocket, t: string): Promise<{ sessions: RemoteSession[] }> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`no "${t}" frame arrived`)), 3000)
            ws.on("message", (raw) => {
                const msg = JSON.parse(raw.toString())
                if (msg.t !== t) return
                clearTimeout(timer)
                resolve(msg)
            })
        })
    }

    /** Pair a device, then read back the session the server broadcasts for
     *  `termId` - the literal bytes a phone receives, not an internal object. */
    async function remoteSessionFor(termId: string): Promise<RemoteSession | undefined> {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        const ws = await connectWs({ Cookie: `devdeck_device=${token}` })
        try {
            const frame = nextMessage(ws, "sessions")
            // The server pushes a session list on connect; asking again makes
            // the test independent of whether that first frame beat the listener.
            ws.send(JSON.stringify({ t: "list" }))
            return (await frame).sessions.find((s) => s.termId === termId)
        } finally {
            ws.close()
        }
    }

    afterEach(() => {
        clearDecision("t1")
        clearDecision("t2")
        h.tails = {}
    })

    it("carries a pending decision on the session broadcast", async () => {
        sessions = [agentSession("t1")]
        h.tails["t1"] = PROMPT_TAIL
        expect(refreshDecision("t1", "attention", true)).toBeTruthy()

        const s = await remoteSessionFor("t1")
        expect(s?.pending).toEqual({
            id: expect.stringMatching(/^dec:t1:/),
            kind: "menu",
            question: "Do you want to proceed?",
            tail: expect.stringContaining("❯ 1. Yes"),
            options: [
                { label: "Approve", send: "1" },
                { label: "Deny", send: "\x1b" }
            ]
        })
    })

    it("omits pending entirely when there is nothing to answer", async () => {
        sessions = [agentSession("t2")]
        // No tail, so the registry mints nothing.
        expect(refreshDecision("t2", "attention", true)).toBeNull()

        const s = await remoteSessionFor("t2")
        expect(s).toBeTruthy()
        // Not merely undefined: an explicit `null` on the wire would make the
        // client's `if (s.pending)` guard the only thing standing between a
        // phone and a card it cannot answer.
        expect(s).not.toHaveProperty("pending")
    })
})
