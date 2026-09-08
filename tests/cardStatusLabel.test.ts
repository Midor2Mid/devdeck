import { describe, it, expect } from "vitest"
import { cardStatusLabel } from "../src/renderer/src/board"

// The card's status dot used to be a bare coloured dot: no tooltip, no
// aria-label. These pin the words, because the words are the only thing that
// distinguishes "the agent produced nothing yet" from "we could not check" -
// two states that otherwise look identical on the board.

describe("cardStatusLabel", () => {
    it("names the state in words", () => {
        expect(cardStatusLabel("working", "doing", "", false)).toBe("Agent is producing output")
    })

    it("does not report a quiet duration for an agent that is producing output", () => {
        // "quiet 3m" next to "is producing output" would contradict itself.
        expect(cardStatusLabel("working", "doing", "3m", false)).toBe("Agent is producing output")
    })

    it("reports how long a quiet agent has been quiet", () => {
        expect(cardStatusLabel("waiting", "review", "3m", false)).toBe(
            "Agent went quiet - your move · quiet 3m"
        )
    })

    it("explains why a quiet card is still in Doing when nothing changed", () => {
        expect(cardStatusLabel("waiting", "doing", "2m", false)).toBe(
            "Agent went quiet - your move · quiet 2m · no file changes yet, so it stays in Doing"
        )
    })

    it("says so when the change check failed, rather than implying nothing changed", () => {
        // THE SILENT CASE. Before this, a failed `git status` was swallowed and
        // the card looked exactly like an agent that had produced nothing.
        expect(cardStatusLabel("waiting", "doing", "2m", true)).toBe(
            "Agent went quiet - your move · quiet 2m · couldn't check for file changes - staying in Doing"
        )
    })

    it("does not explain Doing-ness for a card in another column", () => {
        expect(cardStatusLabel("idle", "done", "1h", false)).toBe(
            "Agent session is idle · quiet 1h"
        )
    })

    it("does not explain Doing-ness while the agent is still working", () => {
        expect(cardStatusLabel("working", "doing", "", false)).toBe("Agent is producing output")
    })

    it("omits the duration when it is unknown", () => {
        expect(cardStatusLabel("attention", "doing", "", false)).toBe(
            "Agent is asking for you · no file changes yet, so it stays in Doing"
        )
    })

    it("falls back to the raw status rather than dropping an unknown one", () => {
        expect(cardStatusLabel("quiet", "review", "", false)).toBe("quiet")
    })

    // The card's dot reads the DERIVED status now (deckKeyStatus), and every
    // word above describes a RUNNING agent: a card whose session had exited or
    // been restored was labelled "Agent session is idle", the resting state of
    // one that is alive. Without the entry it would also have fallen through
    // the case above and read the raw token "not-running" at the user.
    it("names a session with no process, instead of describing a live one", () => {
        expect(cardStatusLabel("not-running", "review", "", false)).toBe(
            "Agent is not running - open the session to start it again"
        )
        expect(cardStatusLabel("not-running", "doing", "4m", false)).toBe(
            "Agent is not running - open the session to start it again · quiet 4m" +
                " · no file changes yet, so it stays in Doing"
        )
    })
})
