import { describe, it, expect } from "vitest"
import { cleanTail, peekLine } from "../src/renderer/src/missionTail"

describe("cleanTail", () => {
    it("strips CSI color codes", () => {
        expect(cleanTail("", "\x1b[31mhello\x1b[0m")).toBe("hello")
    })

    it("strips erase-line / cursor CSI sequences", () => {
        expect(cleanTail("", "\x1b[2K\x1b[1Gfoo")).toBe("foo")
    })

    it("converts carriage returns to newlines and drops other control chars", () => {
        expect(cleanTail("", "a\rb\x07c")).toBe("a\nbc")
    })

    it("accumulates prev + chunk", () => {
        expect(cleanTail("ab", "cd")).toBe("abcd")
    })

    it("keeps only the last max characters", () => {
        const out = cleanTail("", "x".repeat(300), 100)
        expect(out).toHaveLength(100)
    })
})

describe("peekLine", () => {
    it("returns the last non-empty line", () => {
        expect(peekLine("line1\nline2\n")).toBe("line2")
    })
    it("trims and skips blank trailing lines", () => {
        expect(peekLine("  \n done \n   ")).toBe("done")
    })
    it("returns empty string for all-blank input", () => {
        expect(peekLine("  \n \n")).toBe("")
    })
})
