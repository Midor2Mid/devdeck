import { describe, it, expect } from "vitest"
import { detectApproval as fromShared } from "../src/shared/approval"
import { detectApproval as fromRenderer } from "../src/renderer/src/approval"
import { cleanTail, lastLines } from "../src/shared/tail"

const MENU = [
    "Do you want to proceed?",
    "❯ 1. Yes",
    "  2. Yes, and don't ask again for rm commands in this project",
    "  3. No, and tell Claude what to do differently (esc)"
].join("\n")

describe("the classifier moved without changing", () => {
    it("is the same function reached through the old renderer path", () => {
        expect(fromRenderer).toBe(fromShared)
    })

    it("still classifies a Claude Code menu the same way", () => {
        expect(fromShared(MENU)).toEqual({
            kind: "menu",
            question: "Do you want to proceed?",
            approve: "1",
            deny: "\x1b"
        })
    })

    it("still refuses a numbered list that is not a prompt", () => {
        expect(fromShared("Steps:\n1. Install\n2. Build\nDone.")).toBeNull()
    })
})

describe("the tail helpers moved without changing", () => {
    it("strips CSI noise and folds \\r into \\n", () => {
        expect(cleanTail("", "\x1b[32mok\x1b[0m\r\ndone\n")).toBe("ok\n\ndone\n")
    })

    it("keeps the last N non-empty lines", () => {
        expect(lastLines("a\n\nb\nc\n", 2)).toBe("b\nc")
    })
})
