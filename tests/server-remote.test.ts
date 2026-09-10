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
    return {
        dir: mkdtempSync(join(tmpdir(), "server-remote-")),
        tails: {} as Record<string, string>,
        // Every byte the server sent to a pty. The choice handler's whole point
        // is that most refusals write nothing, and a no-op mock cannot show that.
        writes: [] as { id: string; data: string }[],
        /** Every path handed to readFileSync, for the F-2 asset test. */
        reads: [] as string[]
    }
})

// F-2 needs to count the actual disk reads behind /xterm.js, and node's `fs`
// namespace refuses `vi.spyOn` ("Cannot redefine property: readFileSync"), so
// the count is taken with a pass-through module mock instead. Everything else
// in `fs` is the real thing.
vi.mock("fs", async (orig) => {
    const actual = await orig<typeof import("fs")>()
    const readFileSync = ((...args: Parameters<typeof actual.readFileSync>) => {
        h.reads.push(String(args[0]))
        return actual.readFileSync(...args)
    }) as typeof actual.readFileSync
    return { ...actual, readFileSync, default: { ...actual, readFileSync } }
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
        writePty: (id: string, data: string) => {
            h.writes.push({ id, data })
        },
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

describe("the client page carries the decision card (Task 7)", () => {
    // The page is a string by construction and there is no DOM harness for it,
    // so these assert the load-bearing pieces are still in the served HTML. What
    // they guard is a deletion: the wire and the handler already have real tests
    // above, and without a card none of that is reachable from a phone.
    async function page(): Promise<string> {
        const res = await fetch(`${base}/?token=${pairingToken()}`)
        expect(res.status).toBe(200)
        return res.text()
    }

    it("serves the card container and its render pass", async () => {
        const html = await page()
        expect(html).toContain('<div id="decision"></div>')
        expect(html).toContain("function renderDecision()")
    })

    it("shows the raw screen beside the parsed question, both escaped", async () => {
        const html = await page()
        // The question is the string an agent controls; the tail is what lets a
        // human notice it lying. Both go through esc().
        expect(html).toContain("esc(p.question)")
        expect(html).toContain("esc(p.tail)")
    })

    it("answers with a token the server minted, never a composed string", async () => {
        const html = await page()
        expect(html).toContain("t:'choice'")
        expect(html).toContain("decisionId:p.id")
        // Two assertions rather than one, because the single expression this
        // used to look for -- `p.options[Number(...)].send` inline in the
        // sendMsg call -- had to be split: the tap handler now reads the option
        // BEFORE it re-renders the card, and the re-render detaches the very
        // button whose `data-i` the old form read afterwards. The property this
        // test exists to pin is unchanged and still fully covered: the token
        // comes out of `p.options`, which is main's own record, and is never a
        // string this page composed.
        expect(html).toContain("var opt=p.options[Number(b.getAttribute('data-i'))]")
        expect(html).toContain("send:opt.send")
    })

    it("guards the second tap and reports a refusal in the server's words", async () => {
        const html = await page()
        expect(html).toContain("if(submitting) return;")
        expect(html).toContain("choice:res")
        expect(html).toContain("m.reason")
    })

    it("flags a session that wants an answer in the list", async () => {
        const html = await page()
        expect(html).toContain("NEEDS YOU")
    })
})

describe("answering a prompt from a phone (Task 6)", () => {
    // The handler that writes to a live pty. Task 6 shipped without tests; what
    // each of these pins is not the reply text but whether a keystroke reached
    // the terminal, because that is the part that cannot be taken back.
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

    /** A paired socket, attached to `termId`, with the minted decision's id. */
    async function paired(termId: string): Promise<{ ws: WebSocket; decisionId: string }> {
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        const ws = await connectWs({ Cookie: `devdeck_device=${token}` })
        ws.send(JSON.stringify({ t: "attach", id: termId }))
        const d = refreshDecision(termId, "attention", true)
        if (!d) throw new Error("no decision was minted for the fixture")
        return { ws, decisionId: d.id }
    }

    /** The next `choice:res` frame, or a rejection if none arrives. */
    function choiceRes(ws: WebSocket): Promise<{ outcome: string; reason?: string }> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('no "choice:res" frame')), 3000)
            ws.on("message", (raw) => {
                const msg = JSON.parse(raw.toString())
                if (msg.t !== "choice:res") return
                clearTimeout(timer)
                resolve(msg)
            })
        })
    }

    beforeEach(() => {
        sessions = [agentSession("t1")]
        h.tails["t1"] = PROMPT_TAIL
        h.writes = []
    })

    afterEach(() => {
        clearDecision("t1")
        h.tails = {}
        h.writes = []
    })

    it("writes the recorded token to the owning pty and says so", async () => {
        const { ws, decisionId } = await paired("t1")
        const res = choiceRes(ws)
        ws.send(JSON.stringify({ t: "choice", id: "t1", decisionId, send: "1" }))

        expect((await res).outcome).toBe("accepted")
        expect(h.writes).toEqual([{ id: "t1", data: "1" }])
        ws.close()
    })

    it("refuses once the screen has moved on, and writes NOTHING", async () => {
        // The failure this whole design exists to prevent: the card describes a
        // prompt the terminal has already left, and the digit lands in whatever
        // the agent asked next.
        const { ws, decisionId } = await paired("t1")
        h.tails["t1"] = "the agent moved on and asked something else entirely"

        const res = choiceRes(ws)
        ws.send(JSON.stringify({ t: "choice", id: "t1", decisionId, send: "1" }))

        const r = await res
        expect(r.outcome).toBe("rejected")
        expect(r.reason).toContain("moved on")
        expect(h.writes).toEqual([])
        ws.close()
    })

    it("spends a decision exactly once - a second tap writes nothing more", async () => {
        const { ws, decisionId } = await paired("t1")
        const first = choiceRes(ws)
        ws.send(JSON.stringify({ t: "choice", id: "t1", decisionId, send: "1" }))
        expect((await first).outcome).toBe("accepted")

        const second = choiceRes(ws)
        ws.send(JSON.stringify({ t: "choice", id: "t1", decisionId, send: "1" }))
        const r = await second
        expect(r.outcome).not.toBe("accepted")
        expect(r.reason).toContain("Already answered")
        expect(h.writes).toHaveLength(1)
        ws.close()
    })

    it("refuses a send string the client made up, however plausible", async () => {
        const { ws, decisionId } = await paired("t1")
        const res = choiceRes(ws)
        // "y\r" is a perfectly reasonable guess at an approval, and is exactly
        // what must never reach a pty: only main's own recorded tokens do.
        ws.send(JSON.stringify({ t: "choice", id: "t1", decisionId, send: "y\r" }))

        const r = await res
        expect(r.outcome).toBe("rejected")
        expect(r.reason).toContain("not one of the offered answers")
        expect(h.writes).toEqual([])
        ws.close()
    })

    it("refuses an unknown decision id", async () => {
        const { ws } = await paired("t1")
        const res = choiceRes(ws)
        ws.send(JSON.stringify({ t: "choice", id: "t1", decisionId: "dec:t1:nope", send: "1" }))

        const r = await res
        expect(r.outcome).toBe("unknown")
        expect(h.writes).toEqual([])
        ws.close()
    })

    it("refuses a tap from a socket that never opened the session", async () => {
        const { decisionId } = await paired("t1")
        const enrol = await fetch(`${base}/?token=${pairingToken()}`)
        const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
        const other = await connectWs({ Cookie: `devdeck_device=${token}` })

        const res = choiceRes(other)
        other.send(JSON.stringify({ t: "choice", id: "t1", decisionId, send: "1" }))

        const r = await res
        expect(r.outcome).toBe("rejected")
        expect(r.reason).toContain("Not attached")
        expect(h.writes).toEqual([])
        other.close()
    })

    it("refuses when the named session is not the one the decision belongs to", async () => {
        const { ws, decisionId } = await paired("t1")
        ws.send(JSON.stringify({ t: "attach", id: "t9" }))
        const res = choiceRes(ws)
        ws.send(JSON.stringify({ t: "choice", id: "t9", decisionId, send: "1" }))

        const r = await res
        expect(r.outcome).toBe("rejected")
        expect(r.reason).toContain("different session")
        expect(h.writes).toEqual([])
        ws.close()
    })

    it("drops the card on every paired device once the prompt is spent", async () => {
        const { ws, decisionId } = await paired("t1")
        const res = choiceRes(ws)
        ws.send(JSON.stringify({ t: "choice", id: "t1", decisionId, send: "1" }))
        await res

        // The broadcast that follows an accepted answer is what clears the card
        // without the phone deciding anything for itself.
        const after = await new Promise<RemoteSession[]>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("no sessions frame")), 3000)
            ws.on("message", (raw) => {
                const msg = JSON.parse(raw.toString())
                if (msg.t !== "sessions") return
                clearTimeout(timer)
                resolve(msg.sessions)
            })
            ws.send(JSON.stringify({ t: "list" }))
        })
        expect(after.find((s) => s.termId === "t1")).not.toHaveProperty("pending")
        ws.close()
    })
})

/**
 * F-2. `/xterm.js` and `/xterm.css` are the two paths served ABOVE `authFor`,
 * so anyone who can open a TCP socket to this port can request them with no
 * token, no cookie and no device record - and each request used to re-read
 * 488,663 bytes from disk synchronously: 3.45 ms of blocked event loop per
 * request, measured, on the single thread that relays every PTY byte, answers
 * every filesystem and git IPC call, and runs `authenticate()`. ~290 rps is a
 * fully stalled main process. `devices.ts`'s failure throttle exists precisely
 * because `authenticate()` was "attacker-paced, on the same thread that drives
 * the UI"; this path was an order of magnitude more expensive per request and
 * sat IN FRONT of that throttle.
 *
 * Two things are pinned here, and the first is a decision rather than a bug:
 * the assets stay unauthenticated (a phone that cannot fetch them cannot
 * render, and they are third-party library files carrying nothing of the
 * user's), and the per-request cost of that decision is bounded - read once
 * per process, and answerable with a 304.
 */
describe("remote server - the unauthenticated static assets (F-2)", () => {
    it("serves both assets with no credential at all - the deliberate half", async () => {
        for (const path of ["/xterm.js", "/xterm.css"]) {
            const res = await fetch(`${base}${path}`)
            expect(res.status, path).toBe(200)
            expect((await res.text()).length, path).toBeGreaterThan(1000)
        }
        // The contrast that makes the above a decision and not an oversight:
        // every other path on this server refuses an anonymous request.
        expect((await fetch(`${base}/`)).status).toBe(401)
    })

    it("reads each asset from disk ONCE, however many times it is requested", async () => {
        // The assertion is on the syscall, not on elapsed time: a timing
        // assertion would be flaky on a loaded runner, and the syscall is what
        // the fix actually removes.
        h.reads.length = 0
        for (let i = 0; i < 12; i++) {
            expect((await fetch(`${base}/xterm.js`)).status).toBe(200)
            expect((await fetch(`${base}/xterm.css`)).status).toBe(200)
        }
        // At most one read per file, and in practice zero: the cache is
        // per-process and `waitForListen` in beforeEach has already fetched
        // /xterm.js. Against the pre-fix code this same loop records 24 reads
        // of 488,663 bytes.
        expect(h.reads.filter((f) => f.includes("xterm"))).toHaveLength(0)
    })

    it("answers a repeat request 304 from its ETag, so a real client fetches once", async () => {
        const first = await fetch(`${base}/xterm.js`)
        const etag = first.headers.get("etag")
        expect(etag).toBeTruthy()
        // no-cache = "revalidate before use", not "do not store". These URLs
        // carry no version, so pinning them would strand a phone on a stale
        // xterm.js after a DevDeck upgrade.
        expect(first.headers.get("cache-control")).toBe("no-cache")
        const again = await fetch(`${base}/xterm.js`, { headers: { "If-None-Match": etag ?? "" } })
        expect(again.status).toBe(304)
        expect((await again.text()).length).toBe(0)
    })
})
