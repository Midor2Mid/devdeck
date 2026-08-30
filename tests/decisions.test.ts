import { describe, it, expect, beforeEach, vi } from "vitest"

let tail = ""
vi.mock("../src/main/pty", () => ({
    getTail: (): string => tail,
    tailDigest: (): string => "hash:" + tail
}))

const { refreshDecision, consumeDecision, decisionFor, clearDecision } = await import(
    "../src/main/decisions"
)

const MENU = [
    "Do you want to proceed?",
    "❯ 1. Yes",
    "  2. No, and tell Claude what to do differently (esc)"
].join("\n")

describe("minting a decision", () => {
    beforeEach(() => {
        tail = MENU
        clearDecision("t1")
    })

    it("mints for an agent that is waiting", () => {
        const d = refreshDecision("t1", "waiting", true)
        expect(d?.question).toBe("Do you want to proceed?")
        expect(d?.options).toEqual([
            { label: "Approve", send: "1" },
            { label: "Deny", send: "\x1b" }
        ])
    })

    it("refuses a session that is merely idle — main's copy of promptFor's gate", () => {
        expect(refreshDecision("t1", "idle", true)).toBeNull()
    })

    it("refuses a non-agent pane even when the text looks like a prompt", () => {
        expect(refreshDecision("t1", "waiting", false)).toBeNull()
    })

    it("keeps the same id while the screen has not changed", () => {
        const a = refreshDecision("t1", "waiting", true)
        const b = refreshDecision("t1", "waiting", true)
        expect(b?.id).toBe(a?.id)
    })

    it("mints a new id when the screen changed", () => {
        const a = refreshDecision("t1", "waiting", true)
        tail = MENU + "\nAllow running this command? (y/n)"
        const b = refreshDecision("t1", "waiting", true)
        expect(b?.id).not.toBe(a?.id)
    })
})

describe("consuming a decision", () => {
    beforeEach(() => {
        tail = MENU
        clearDecision("t1")
    })

    it("accepts a token it minted, once", () => {
        const d = refreshDecision("t1", "waiting", true)!
        expect(consumeDecision(d.id, "1")).toEqual({ ok: true, send: "1", termId: "t1" })
        expect(consumeDecision(d.id, "1")).toEqual({ ok: false, reason: "consumed" })
    })

    it("refuses a string the phone made up", () => {
        const d = refreshDecision("t1", "waiting", true)!
        expect(consumeDecision(d.id, "rm -rf /\r")).toEqual({ ok: false, reason: "not-an-option" })
    })

    it("refuses when the terminal moved on between showing and tapping", () => {
        const d = refreshDecision("t1", "waiting", true)!
        tail = "some completely different screen"
        expect(consumeDecision(d.id, "1")).toEqual({ ok: false, reason: "moved-on" })
    })

    it("refuses an id it never minted", () => {
        expect(consumeDecision("dec:nope:1", "1")).toEqual({ ok: false, reason: "unknown" })
    })

    it("drops the decision when the prompt goes away", () => {
        refreshDecision("t1", "waiting", true)
        tail = "the agent carried on"
        expect(refreshDecision("t1", "waiting", true)).toBeNull()
        expect(decisionFor("t1")).toBeNull()
    })
})
