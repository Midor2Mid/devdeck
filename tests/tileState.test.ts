import { describe, it, expect } from "vitest"
import { resolveTileState, type TileStateInput } from "../src/renderer/src/tileState"
import { STALL_MS } from "../src/renderer/src/missionTail"
import { FASTFAIL } from "../src/renderer/src/termExit"
import type { ApprovalPrompt } from "../src/renderer/src/approval"

const NOW = 1_700_000_000_000

const PROMPT: ApprovalPrompt = {
    kind: "menu",
    question: "Do you want to make this edit to store.ts?",
    approve: "1",
    deny: "\x1b"
}

/** A live, awaited, working session that just spoke — the neutral starting point. */
function input(over: Partial<TileStateInput> = {}): TileStateInput {
    return {
        status: "working",
        prompt: null,
        exitCode: undefined,
        lastAt: NOW - 1000,
        changedCount: 0,
        awaited: true,
        alive: true,
        ...over
    }
}

describe("resolveTileState precedence", () => {
    it("a prompt outranks everything", () => {
        const s = resolveTileState(
            input({
                status: "attention",
                prompt: PROMPT,
                exitCode: 1,
                lastAt: NOW - STALL_MS - 1,
                changedCount: 9
            }),
            NOW
        )
        expect(s.kind).toBe("needs-you")
        expect(s.chip).toBe("NEEDS YOU")
        expect(s.detail).toBe(PROMPT.question)
        expect(s.actions).toEqual(["approve", "deny"])
    })

    // The concrete reason EXITED sits above STALLED: isStalled's `alive` is
    // `!!termAgents[id]`, true for a pane whose process is dead but whose tab
    // is open. Without the precedence every corpse also reads as stalled.
    it("a dead process that is also silent reads EXITED, not STALLED", () => {
        const s = resolveTileState(
            input({ status: "idle", exitCode: 1, lastAt: NOW - STALL_MS - 1 }),
            NOW
        )
        expect(s.kind).toBe("exited")
        expect(s.chip).toBe("EXITED 1")
    })

    it("an exit outranks attention that carries no parsable prompt", () => {
        const s = resolveTileState(input({ status: "attention", exitCode: 2 }), NOW)
        expect(s.kind).toBe("exited")
    })

    it("attention with no parsable prompt reads ASKING and offers a reply", () => {
        const s = resolveTileState(input({ status: "attention" }), NOW)
        expect(s.kind).toBe("asking")
        expect(s.chip).toBe("ASKING")
        expect(s.actions).toEqual(["reply"])
    })

    it("a silent awaited session reads STALLED with the silence in the chip", () => {
        const s = resolveTileState(input({ status: "idle", lastAt: NOW - 21 * 60_000 }), NOW)
        expect(s.kind).toBe("stalled")
        expect(s.chip).toBe("STALLED · silent 21m")
        expect(s.actions).toEqual(["reply"])
    })

    it("silence nobody is waiting on is not a stall", () => {
        const s = resolveTileState(
            input({ status: "idle", awaited: false, lastAt: NOW - 21 * 60_000 }),
            NOW
        )
        expect(s.kind).toBe("quiet")
    })

    it("changed files read CHANGED and offer Review", () => {
        const s = resolveTileState(input({ status: "idle", changedCount: 4 }), NOW)
        expect(s.chip).toBe("CHANGED · 4 files")
        expect(s.actions).toEqual(["review"])
    })

    it("singularises one changed file", () => {
        expect(resolveTileState(input({ status: "idle", changedCount: 1 }), NOW).chip).toBe(
            "CHANGED · 1 file"
        )
    })

    // Branch 3 over branch 4. A session flagged attention that has also gone
    // silent is asking, not stuck: the question is the more useful thing to say.
    it("ASKING outranks STALLED", () => {
        const s = resolveTileState(
            input({ status: "attention", lastAt: NOW - STALL_MS - 1 }),
            NOW
        )
        expect(s.kind).toBe("asking")
    })

    // Branch 4 over branch 5. Work already produced does not stop a stall being
    // the thing to say about a session nothing has heard from.
    it("STALLED outranks CHANGED", () => {
        const s = resolveTileState(
            input({ status: "idle", lastAt: NOW - STALL_MS - 1, changedCount: 3 }),
            NOW
        )
        expect(s.kind).toBe("stalled")
    })

    // Branch 5 over branch 6, which tileState.ts calls out explicitly: work that
    // exists is reviewable whether or not the agent has finished with it.
    it("CHANGED outranks WORKING", () => {
        const s = resolveTileState(input({ status: "working", changedCount: 2 }), NOW)
        expect(s.kind).toBe("changed")
        expect(s.actions).toEqual(["review"])
    })

    it("a working session with nothing changed reads WORKING and offers nothing", () => {
        const s = resolveTileState(input(), NOW)
        expect(s.kind).toBe("working")
        expect(s.chip).toBe("WORKING")
        expect(s.actions).toEqual([])
    })

    // Unawaited: the same silence with a card waiting on it is a STALL, which
    // the case above already pins.
    it("everything else is QUIET, with how long", () => {
        const s = resolveTileState(
            input({ status: "idle", awaited: false, lastAt: NOW - 8 * 60_000 }),
            NOW
        )
        expect(s.chip).toBe("QUIET 8m")
        expect(s.actions).toEqual([])
    })

    it("says QUIET without a duration when the session never spoke", () => {
        expect(resolveTileState(input({ status: "idle", lastAt: undefined }), NOW).chip).toBe("QUIET")
    })
})

describe("the exit chip", () => {
    it("names a clean exit without a code, and stays quiet in tone", () => {
        const s = resolveTileState(input({ exitCode: 0 }), NOW)
        expect(s.chip).toBe("EXITED")
        expect(s.tone).toBe("quiet")
    })

    it("carries the code in hex in the detail", () => {
        expect(resolveTileState(input({ exitCode: 1 }), NOW).detail).toContain("0x1")
    })

    it("marks the Windows fast-fail exit distinctly and names the cause", () => {
        const s = resolveTileState(input({ exitCode: FASTFAIL }), NOW)
        expect(s.chip).toBe("EXITED · KILLED")
        expect(s.detail).toContain("0xC0000409")
        expect(s.detail?.toLowerCase()).toContain("antivirus")
    })

    // Reply is meaningless to a dead process; Review is not, if it left work.
    it("offers Review on an exit only when the session changed files", () => {
        expect(resolveTileState(input({ exitCode: 1, changedCount: 0 }), NOW).actions).toEqual([])
        expect(resolveTileState(input({ exitCode: 1, changedCount: 3 }), NOW).actions).toEqual([
            "review"
        ])
    })
})

describe("form, not only colour", () => {
    // All 84 skins have to separate these, and two of the themes put --clay and
    // --danger a shade apart. Every state therefore carries its own glyph.
    it("gives every state a distinct mark", () => {
        const marks = [
            resolveTileState(input({ status: "attention", prompt: PROMPT }), NOW),
            resolveTileState(input({ exitCode: 1 }), NOW),
            resolveTileState(input({ status: "attention" }), NOW),
            resolveTileState(input({ status: "idle", lastAt: NOW - STALL_MS - 1 }), NOW),
            resolveTileState(input({ status: "idle", changedCount: 2 }), NOW),
            resolveTileState(input(), NOW),
            resolveTileState(input({ status: "idle" }), NOW)
        ].map((s) => s.mark)
        expect(new Set(marks).size).toBe(marks.length)
    })
})
