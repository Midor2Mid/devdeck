import { describe, it, expect } from "vitest"
import {
    ANSWERED_MS,
    describeKeys,
    pendingAnswer,
    sentLabel,
    sentTip
} from "../src/renderer/src/answered"

const NOW = 1_700_000_000_000

/**
 * The confirmation for an answer DevDeck sent on your behalf.
 *
 * Two surfaces show it - Mission's tile and Overview's cards and rail - and
 * while the window and the sentence lived inside one component the other kept
 * offering live Approve/Deny after the same click. What is pinned here is that
 * there is ONE window and ONE sentence, and that the sentence stops at "sent".
 */
describe("describeKeys", () => {
    it("names what was sent, not the bytes", () => {
        expect(describeKeys("y\r")).toBe('"y"')
        expect(describeKeys("1")).toBe('"1"')
        expect(describeKeys("\x1b")).toBe("Esc")
    })

    it("calls a bare newline Enter rather than printing nothing", () => {
        // The commonest case of all: `Sent "" to claude 1` was the alternative.
        expect(describeKeys("\r")).toBe("Enter")
        expect(describeKeys("\r\n")).toBe("Enter")
    })
})

describe("pendingAnswer", () => {
    it("reports nothing when no answer was sent", () => {
        expect(pendingAnswer(undefined, NOW)).toBeUndefined()
    })

    it("speaks for the buttons inside the window", () => {
        const ans = { at: NOW, keys: "y\r" }
        expect(pendingAnswer(ans, NOW)).toBe(ans)
        expect(pendingAnswer(ans, NOW + ANSWERED_MS - 1)).toBe(ans)
    })

    it("hands the buttons back at the boundary", () => {
        // The honest fallback: nothing came back, so pressing again may well be
        // the right move - which is only true if the buttons actually return.
        const ans = { at: NOW, keys: "y\r" }
        expect(pendingAnswer(ans, NOW + ANSWERED_MS)).toBeUndefined()
        expect(pendingAnswer(ans, NOW + ANSWERED_MS + 5000)).toBeUndefined()
    })
})

describe("the sent copy", () => {
    it("says what was sent and what it is waiting for", () => {
        expect(sentLabel("y\r")).toBe('Sent "y" · waiting for its next output')
        expect(sentLabel("\x1b")).toBe("Sent Esc · waiting for its next output")
    })

    it("never claims the answer was accepted", () => {
        // The defect class this codebase is organised against: a signal that
        // asserts an outcome nobody knows yet. The label may only report the
        // send...
        const label = sentLabel("y\r")
        expect(label).toMatch(/^Sent /)
        expect(label).not.toMatch(/approved|accepted|denied|done/i)
        // ...and where the tip does use the word, it is under "Whether", which
        // names the outcome as unknown and says where the answer will show up.
        const tip = sentTip("y\r")
        expect(tip).toContain("Whether it was accepted shows up")
        expect(tip).toContain("agent's own output")
    })
})
