import { describe, it, expect } from "vitest"
import { cleanTail, peekLine, relTime, sortForFollow, lastLines, isStalled } from "../src/renderer/src/missionTail"
import type { AnySession } from "../src/renderer/src/store"

function sess(over: Partial<AnySession>): AnySession {
    return {
        termId: "t", projectId: "p", projectName: "P", projectPath: "", tabName: "tab",
        sessionName: "s", agentId: "claude", badge: "CL", isAgent: true, status: "idle", ...over
    }
}

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

describe("relTime", () => {
    it("returns empty when no timestamp", () => {
        expect(relTime(1000, undefined)).toBe("")
    })
    it("says 'now' under 5s", () => {
        expect(relTime(10000, 8000)).toBe("now")
    })
    it("formats seconds, minutes, hours", () => {
        expect(relTime(40000, 5000)).toBe("35s")
        expect(relTime(70000, 5000)).toBe("1m")
        expect(relTime(3_700_000, 5000)).toBe("1h")
    })
})

describe("sortForFollow", () => {
    it("orders attention → working → idle, stable within a status", () => {
        const out = sortForFollow([
            sess({ termId: "i", status: "idle" }),
            sess({ termId: "a", status: "attention" }),
            sess({ termId: "w1", status: "working" }),
            sess({ termId: "w2", status: "working" })
        ])
        expect(out.map((s) => s.termId)).toEqual(["a", "w1", "w2", "i"])
    })
})

describe("lastLines", () => {
    it("returns the last N non-empty, trimmed lines joined by newline", () => {
        expect(lastLines("a\n\nb\nc", 2)).toBe("b\nc")
    })
    it("trims each line and skips blanks", () => {
        expect(lastLines("  \n x \n y ", 2)).toBe("x\ny")
    })
    it("returns everything when fewer than N lines", () => {
        expect(lastLines("only", 5)).toBe("only")
    })
    it("returns empty for all-blank", () => {
        expect(lastLines("  \n \n", 4)).toBe("")
    })
})

describe("isStalled", () => {
    const now = 1_000_000
    it("flags a working agent with no output past the threshold", () => {
        expect(isStalled("working", now - 5 * 60000, now, 2 * 60000)).toBe(true)
    })
    it("does not flag recent working agents", () => {
        expect(isStalled("working", now - 30000, now, 2 * 60000)).toBe(false)
    })
    it("only applies to working status", () => {
        expect(isStalled("idle", now - 10 * 60000, now, 2 * 60000)).toBe(false)
        expect(isStalled("attention", now - 10 * 60000, now, 2 * 60000)).toBe(false)
    })
    it("needs a known last-output time", () => {
        expect(isStalled("working", undefined, now, 2 * 60000)).toBe(false)
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
