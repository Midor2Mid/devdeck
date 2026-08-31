import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

let tail = ""
vi.mock("../src/main/pty", () => ({
    getTail: (): string => tail,
    tailDigest: (): string => "hash:" + tail
}))

const {
    refreshDecision,
    consumeDecision,
    decisionFor,
    clearDecision,
    startDecisionRefresh,
    stopDecisionRefresh,
    publishDecisions,
    REFRESH_MS
} = await import("../src/main/decisions")
import type { DecisionSnapshot } from "../src/shared/decision"

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

    // REVERSED, deliberately. This previously pinned the opposite behaviour —
    // that between the keystroke being sent and the agent processing it the
    // prompt is still on screen, so the same id is re-minted and the card
    // briefly reappears — and was adjudicated CORRECT on the grounds that the
    // card should mirror what is actually on screen, with the second tap
    // refused because `consumed` still holds the id.
    //
    // That adjudication was sound for the surface it was written for. It has
    // been overtaken: the desktop tile now reads THIS registry (the "one
    // classifier" change), and its Approve button calls store.ts's
    // `respondApproval`, which writes to the pty directly — it never reaches
    // `consumeDecision`, so it is not refused by `consumed` and does not
    // re-check the digest. The re-minted card was therefore answerable a second
    // time, unchecked, at the desk. "Refused because consumed" only ever
    // described the remote path.
    //
    // So the mint is suppressed instead, and the honesty argument is paid for
    // in `clearDecision`: the record is dropped when the session leaves
    // attention, which is the real signal that the next identical screen is a
    // new question. Making the desktop button consume like the phone does would
    // let this be reconsidered; until then, not offering the second answer beats
    // mirroring the screen.
    it("does not re-mint a decision that was already answered on the same screen", () => {
        const first = refreshDecision("t1", "waiting", true)!
        expect(consumeDecision(first.id, "1")).toEqual({ ok: true, send: "1", termId: "t1" })

        // Same screen, and the agent has not caught up: no card comes back.
        expect(refreshDecision("t1", "waiting", true)).toBeNull()
        expect(decisionFor("t1")).toBeNull()

        // The spent record is what suppresses it, so it still refuses directly.
        expect(consumeDecision(first.id, "1")).toEqual({ ok: false, reason: "consumed" })
    })

    it("mints again for the same screen once the session has left attention", () => {
        const first = refreshDecision("t1", "waiting", true)!
        expect(consumeDecision(first.id, "1")).toEqual({ ok: true, send: "1", termId: "t1" })
        expect(refreshDecision("t1", "waiting", true)).toBeNull()

        // Leaving attention clears the spent record — a genuinely new question
        // can reuse the screen it is asked on, so suppression must not be
        // permanent.
        expect(refreshDecision("t1", "working", true)).toBeNull()
        const fresh = refreshDecision("t1", "waiting", true)
        expect(fresh?.id).toBe(first.id)
        expect(consumeDecision(fresh!.id, "1")).toEqual({ ok: true, send: "1", termId: "t1" })
    })
})


describe("main re-reads the screen on its own clock", () => {
    // The bug this pins. store.ts's pty handler is
    //     if (agentStatus[id] !== "attention" || visible) setStatus(id, "working")
    // so a session ALREADY in attention whose pane is off screen takes no status
    // transition when more output arrives. No transition, no `mobile:sessions`
    // push, no re-derivation — and Mission Control's whole point is the tile you
    // are NOT looking at. A push-only cache serves the previous screen's answer
    // indefinitely, and the desktop's Approve button types it without re-checking
    // the tail, which is the exact failure `tailHash` exists to prevent.
    const SESSIONS = [{ termId: "t1", status: "attention", isAgent: true }]

    beforeEach(() => {
        tail = MENU
        clearDecision("t1")
        stopDecisionRefresh()
    })

    afterEach(() => {
        stopDecisionRefresh()
        vi.useRealTimers()
    })

    it("re-derives a changed screen with no status push at all", () => {
        vi.useFakeTimers()
        const seen: DecisionSnapshot[] = []
        startDecisionRefresh(() => SESSIONS, (s) => seen.push(s))

        vi.advanceTimersByTime(REFRESH_MS)
        const first = decisionFor("t1")
        expect(first?.question).toBe("Do you want to proceed?")

        // The agent redraws. Nothing pushes: the session is already "attention".
        tail = "Allow running the build script? (y/n)"
        vi.advanceTimersByTime(REFRESH_MS)

        const second = decisionFor("t1")
        expect(second?.question).toBe("Allow running the build script? (y/n)")
        expect(second?.kind).toBe("yesno")
        expect(second?.options[0].send).toBe("y\r")
        expect(second?.id).not.toBe(first?.id)
        // And the renderer was told, so its cache tracks the screen too.
        expect(seen[seen.length - 1]["t1"].question).toBe("Allow running the build script? (y/n)")
    })

    it("forgets the decision when the prompt leaves the screen", () => {
        vi.useFakeTimers()
        startDecisionRefresh(() => SESSIONS, () => {})
        vi.advanceTimersByTime(REFRESH_MS)
        expect(decisionFor("t1")).not.toBeNull()

        tail = "Applying edit...\nWrote 3 files."
        vi.advanceTimersByTime(REFRESH_MS)
        expect(decisionFor("t1")).toBeNull()
    })

    it("stays quiet while the screen is unchanged", () => {
        vi.useFakeTimers()
        let sent = 0
        startDecisionRefresh(() => SESSIONS, () => sent++)
        vi.advanceTimersByTime(REFRESH_MS * 5)
        // Five ticks, one screen: one broadcast. A tick that re-sent an
        // identical snapshot would be an IPC message per second, forever.
        expect(sent).toBe(1)
    })

    it("stops when told to", () => {
        vi.useFakeTimers()
        let sent = 0
        const stop = startDecisionRefresh(() => SESSIONS, () => sent++)
        vi.advanceTimersByTime(REFRESH_MS)
        stop()
        tail = "Allow running the build script? (y/n)"
        vi.advanceTimersByTime(REFRESH_MS * 5)
        expect(sent).toBe(1)
    })

    it("answers a renderer's push even when nothing changed", () => {
        // A reloaded renderer has an empty cache; deduplicating its first push
        // would leave it empty until something on screen happened to change.
        let sent = 0
        publishDecisions(SESSIONS, () => sent++, true)
        publishDecisions(SESSIONS, () => sent++, true)
        expect(sent).toBe(2)
        publishDecisions(SESSIONS, () => sent++)
        expect(sent).toBe(2)
    })
})
