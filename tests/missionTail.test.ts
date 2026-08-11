import { describe, it, expect } from "vitest"
import { cleanTail, peekLine, relTime, sortForFollow, lastLines, isStalled, printableDelta, CARRY_MAX } from "../src/renderer/src/missionTail"
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

describe("printableDelta", () => {
    it("counts non-whitespace characters in completed lines", () => {
        expect(printableDelta("hello world\n").chars).toBe(10)
    })

    it("treats CRLF as a line terminator, not a redraw", () => {
        // ConPTY emits \r\n by default and DevDeck is Windows-first. Scoring this
        // as a redraw would zero almost all genuine output.
        expect(printableDelta("hello\r\n").chars).toBe(5)
        expect(printableDelta("a\r\nb\r\n").chars).toBe(2)
    })

    it("scores a bare-carriage-return spinner frame as zero", () => {
        // A spinner rewrites one line in place and never commits it.
        expect(printableDelta("\r| Thinking...").chars).toBe(0)
        expect(printableDelta("\r/ Thinking...\r- Thinking...").chars).toBe(0)
    })

    it("scores an ANSI-only chunk as zero", () => {
        expect(printableDelta("\x1b[2K\x1b[1G").chars).toBe(0)
        expect(printableDelta("\x1b[31m\x1b[0m").chars).toBe(0)
    })

    it("counts a line that a carriage return revised before committing", () => {
        // The final revision is what reached the screen.
        expect(printableDelta("draft\rfinal\n").chars).toBe(5)
    })

    it("ignores whitespace and tabs in the count", () => {
        expect(printableDelta("  a\tb  \n").chars).toBe(2)
    })

    it("returns zero for an empty chunk", () => {
        expect(printableDelta("").chars).toBe(0)
    })

    it("carries an unterminated segment out instead of dropping it", () => {
        const first = printableDelta("but not ")
        expect(first.chars).toBe(0)
        expect(first.carry).toBe("but not ")
    })

    it("counts a line assembled from several chunks, once", () => {
        // Agents stream token by token; this is the common case, not an edge case.
        const a = printableDelta("Now let me ")
        const b = printableDelta("check the tests\n", a.carry)
        expect(a.chars).toBe(0)
        expect(b.chars).toBe(21)
        expect(b.carry).toBe("")
    })

    it("handles a CRLF split across two chunks", () => {
        const a = printableDelta("hello\r")
        const b = printableDelta("\nworld\n", a.carry)
        expect(a.chars).toBe(0)
        expect(b.chars + a.chars).toBe(10)
    })

    it("caps a carry that never sees a newline", () => {
        const out = printableDelta("x".repeat(9000))
        expect(out.chars).toBe(0)
        expect(out.carry).toHaveLength(CARRY_MAX)
    })
})
