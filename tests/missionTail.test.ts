import { describe, it, expect } from "vitest"
import {
    cleanTail,
    peekLine,
    relTime,
    sortForFollow,
    lastLines,
    isStalled,
    printableDelta,
    CARRY_MAX,
    recordRate,
    getTrace,
    barsPath,
    STALL_MS
} from "../src/renderer/src/missionTail"
import type { AnySession } from "../src/renderer/src/store"
import type { DeltaState } from "../src/renderer/src/missionTail"

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

    it("treats CRLF as a line terminator that commits and counts", () => {
        // ConPTY emits \r\n by default and DevDeck is Windows-first. Discarding
        // this the way a bare \r is discarded would zero almost all genuine output.
        expect(printableDelta("hello\r\n").chars).toBe(5)
        const two = printableDelta("first line\r\nsecond one\r\n")
        expect(two.chars).toBe("firstline".length + "secondone".length)
    })

    it("never counts a segment a bare carriage return overwrote before any newline", () => {
        // A bare \r overwrites the pending segment in place — the same as a
        // terminal cursor return — so the overwritten text does not survive on
        // screen; not counting it is correct terminal semantics, not a claim
        // about spinners.
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
        expect(first.state.carry).toBe("but not ")
    })

    it("counts a line assembled from several chunks, once", () => {
        // Agents stream token by token; this is the common case, not an edge case.
        const a = printableDelta("Now let me ")
        const b = printableDelta("check the tests\n", a.state)
        expect(a.chars).toBe(0)
        expect(b.chars).toBe("Now let me check the tests".replace(/\s/g, "").length)
        expect(b.state.carry).toBe("")
    })

    it("handles a CRLF split across two chunks", () => {
        const a = printableDelta("hello\r")
        const b = printableDelta("\nworld\n", a.state)
        expect(a.chars).toBe(0)
        expect(b.chars + a.chars).toBe("hello".length + "world".length)
    })

    it("caps a carry that never sees a newline", () => {
        const out = printableDelta("x".repeat(9000))
        expect(out.chars).toBe(0)
        expect(out.state.carry).toHaveLength(CARRY_MAX)
    })

    it("scores ten distinct real output lines at their full length", () => {
        const lines = [
            "Reading src/main.ts",
            "Found 3 matches in components/App.tsx",
            "Editing src/renderer/src/store.ts",
            "Running npm run typecheck",
            "Typecheck passed with zero errors",
            "Running npx vitest run",
            "497 tests passed",
            "Wrote DESIGN.md",
            "Committed as feat: add mission trace",
            "Done — branch is ready for review"
        ]
        let state: DeltaState | undefined
        let total = 0
        let expected = 0
        for (const line of lines) {
            const out = printableDelta(line + "\n", state)
            state = out.state
            total += out.chars
            expected += line.replace(/\s/g, "").length
        }
        expect(total).toBe(expected)
    })

    it("known limitation: a repeated CSI-positioned repaint terminated the ordinary way scores on every frame", () => {
        // Not a bug -- documented so nobody re-derives the false claim from
        // the code. Telling a TUI repaint (Claude Code's Ink UI moves the
        // cursor with CSI sequences, never terminated by a bare carriage
        // return) apart from genuinely new output needs the rendered
        // terminal buffer, not this pty byte stream -- three attempts at
        // deriving it from the stream alone all failed review (NOTES.md).
        // The same spinner frame, repainted identically, scores every time.
        const frame = `[2K[1G[36m⠋[0m Thinking… (12s)\r\n`
        const first = printableDelta(frame)
        const second = printableDelta(frame, first.state)
        expect(first.chars).toBeGreaterThan(0)
        expect(second.chars).toBe(first.chars)
    })
})

describe("trace ring", () => {
    const T0 = 1_700_000_000_000

    it("returns 60 empty buckets for an unknown session", () => {
        const tr = getTrace("never-seen", T0)
        expect(tr).toHaveLength(60)
        expect(tr.every((v) => v === 0)).toBe(true)
    })

    it("puts a chunk in the newest bucket", () => {
        recordRate("r1", "hello\n", T0)
        const tr = getTrace("r1", T0)
        expect(tr[59]).toBeGreaterThan(0)
        expect(tr.slice(0, 59).every((v) => v === 0)).toBe(true)
    })

    it("rolls older samples left as time passes", () => {
        recordRate("r2", "hello\n", T0)
        // Two buckets later the sample has moved two places left.
        const tr = getTrace("r2", T0 + 4000)
        expect(tr[57]).toBeGreaterThan(0)
        expect(tr[58]).toBe(0)
        expect(tr[59]).toBe(0)
    })

    it("clears entirely once the whole window has elapsed", () => {
        recordRate("r3", "hello\n", T0)
        expect(getTrace("r3", T0 + STALL_MS + 1).every((v) => v === 0)).toBe(true)
    })

    it("accumulates several chunks inside one bucket", () => {
        // r4 commits two lines into the same bucket, r5 only one, so r4's total
        // is strictly larger.
        recordRate("r4", "alpha status line\n", T0)
        recordRate("r4", "beta status line\n", T0 + 500)
        const one = getTrace("r4", T0)[59]
        recordRate("r5", "alpha status line\n", T0)
        expect(one).toBeGreaterThan(getTrace("r5", T0)[59])
    })

    it("scales logarithmically, clamped to 1", () => {
        recordRate("r6", "x".repeat(4096) + "\n", T0)
        expect(getTrace("r6", T0)[59]).toBeCloseTo(1, 2)
        recordRate("r7", "x".repeat(100000) + "\n", T0)
        expect(getTrace("r7", T0)[59]).toBe(1)
        // A regression to a linear scale would give 64/4096 ≈ 0.016 here — a
        // mid-range value must still read as well above the floor.
        recordRate("r6b", "x".repeat(64) + "\n", T0)
        expect(getTrace("r6b", T0)[59]).toBeGreaterThan(0.4)
    })

    it("leaves the trace flat when a chunk never completes a line", () => {
        recordRate("r8", "\r| Thinking...", T0)
        expect(getTrace("r8", T0).every((v) => v === 0)).toBe(true)
    })

    it("counts a line streamed across chunks once, when it completes", () => {
        recordRate("r9", "Now let me ", T0)
        expect(getTrace("r9", T0).every((v) => v === 0)).toBe(true)
        recordRate("r9", "check the tests\n", T0 + 100)
        expect(getTrace("r9", T0 + 100)[59]).toBeGreaterThan(0)
    })

    it("keeps each session's carry separate", () => {
        recordRate("rA", "half ", T0)
        recordRate("rB", "other\n", T0)
        recordRate("rA", "done\n", T0)
        // rA committed "half done" (8 non-space chars), rB committed "other" (5).
        expect(getTrace("rA", T0)[59]).toBeGreaterThan(getTrace("rB", T0)[59])
    })

    it("STALL_MS is the width of the whole window", () => {
        expect(STALL_MS).toBe(120000)
    })
})

describe("barsPath", () => {
    it("emits one closed sub-path per sample", () => {
        const d = barsPath([0, 0.5, 1])
        expect(d.split("Z").length - 1).toBe(3)
    })

    it("draws a baseline for empty buckets rather than nothing", () => {
        const d = barsPath([0])
        expect(d).toContain("Z")
        expect(d.length).toBeGreaterThan(0)
    })

    it("gives an empty bucket a bar top of height - 1, the baseline that makes silence read as a line", () => {
        const height = 12
        const d = barsPath([0], height)
        const top = Number(d.split("L")[1].trim().split(" ")[1])
        expect(top).toBe(height - 1)
    })

    it("makes a full sample taller than a quiet one", () => {
        const tall = barsPath([1], 12)
        const short = barsPath([0.1], 12)
        // Bar tops are the second Y coordinate in each sub-path.
        const topOf = (d: string): number => Number(d.split("L")[1].trim().split(" ")[1])
        expect(topOf(tall)).toBeLessThan(topOf(short))
    })

    it("returns an empty string for an empty trace", () => {
        expect(barsPath([])).toBe("")
    })
})
