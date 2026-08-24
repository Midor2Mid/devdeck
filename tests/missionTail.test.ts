import { describe, it, expect, afterEach } from "vitest"
import {
    cleanTail,
    peekLine,
    relTime,
    sortForFollow,
    lastLines,
    isStalled,
    awaitedTermIds,
    markLaunched,
    getLastAt,
    recordTail,
    printableDelta,
    CARRY_MAX,
    recordRate,
    getTrace,
    barsPath,
    STALL_MS,
    hasBell,
    forgetTail,
    promptFor
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
    it("flags a live session something is waiting on that has gone quiet", () => {
        expect(isStalled(now - 10 * 60000, true, true, now, 2 * 60000)).toBe(true)
    })
    it("does not flag a session that spoke recently", () => {
        expect(isStalled(now - 30000, true, true, now, 2 * 60000)).toBe(false)
    })
    it("does not flag a dead session", () => {
        // Nothing to check on: the pane is gone, not stuck.
        expect(isStalled(now - 10 * 60000, false, true, now, 2 * 60000)).toBe(false)
    })
    it("does not flag a quiet session nothing is waiting on", () => {
        // THE REGRESSION IN THE OTHER DIRECTION. Quiet + live is the normal
        // resting state of an agent that finished its turn and is waiting for
        // YOU, and of every pane opened and never typed into (markLaunched
        // starts the clock at launch). Marking those stalled put the stripe on
        // every tile over a lunch break, and a marker that is always on carries
        // no information - the same defect as never firing, wearing the
        // opposite sign. Status cannot separate stuck from finished, so the gate
        // is EXPECTATION: is anything actually waiting on this session?
        expect(isStalled(now - 10 * 60000, true, false, now, 2 * 60000)).toBe(false)
    })
    it("flags a session that launched and never emitted anything", () => {
        // The crashed-CLI case, unreachable before markLaunched: lastAt is the
        // launch instant rather than undefined, so silence is measurable.
        markLaunched("crashed-cli", now - 10 * 60000)
        expect(isStalled(getLastAt("crashed-cli"), true, true, now, 2 * 60000)).toBe(true)
        forgetTail("crashed-cli")
    })
    it("cannot judge a session with no timestamp at all", () => {
        expect(isStalled(undefined, true, true, now, 2 * 60000)).toBe(false)
    })
})

describe("awaitedTermIds", () => {
    const doing = { column: "doing", termId: "t1" }

    it("counts a board card in doing that names the session", () => {
        expect(awaitedTermIds([doing], null).has("t1")).toBe(true)
    })
    it("ignores a card in any other column", () => {
        // A card in review or done is not waiting on its agent - you are.
        const ids = awaitedTermIds(
            [
                { column: "todo", termId: "t1" },
                { column: "review", termId: "t2" },
                { column: "done", termId: "t3" }
            ],
            null
        )
        expect(ids.size).toBe(0)
    })
    it("ignores a card that names no session", () => {
        expect(awaitedTermIds([{ column: "doing" }], null).size).toBe(0)
    })
    it("counts the session a running pipeline step is blocked on", () => {
        const run = {
            status: "running",
            steps: [
                { status: "done", termId: "t-old" },
                { status: "running", termId: "t-now" }
            ]
        }
        const ids = awaitedTermIds([], run)
        expect(ids.has("t-now")).toBe(true)
        // A step that already finished is not waiting on anything.
        expect(ids.has("t-old")).toBe(false)
    })
    it("counts a step in a run that is itself waiting on the user", () => {
        // "waiting" means the AGENT asked something mid-step: the step is still
        // the reason that session is being watched.
        const run = { status: "waiting", steps: [{ status: "running", termId: "t-now" }] }
        expect(awaitedTermIds([], run).has("t-now")).toBe(true)
    })
    it("ignores a run that has stopped, failed or finished", () => {
        for (const status of ["done", "stopped", "error", "paused"]) {
            const run = { status, steps: [{ status: "running", termId: "t-now" }] }
            expect(awaitedTermIds([], run).size).toBe(0)
        }
    })
    it("takes both sources at once", () => {
        const run = { status: "running", steps: [{ status: "running", termId: "t-step" }] }
        expect([...awaitedTermIds([doing], run)].sort()).toEqual(["t-step", "t1"])
    })
})

describe("markLaunched", () => {
    it("stamps a last-output time so silence is measurable from launch", () => {
        markLaunched("boot", 5000)
        expect(getLastAt("boot")).toBe(5000)
        forgetTail("boot")
    })
    it("does not clobber a real output time", () => {
        markLaunched("boot2", 5000)
        recordTail("boot2", "hello")
        const after = getLastAt("boot2")
        markLaunched("boot2", 6000)
        expect(getLastAt("boot2")).toBe(after)
        forgetTail("boot2")
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

describe("hasBell", () => {
    it("detects a real bell", () => {
        expect(hasBell("t1", "done\x07")).toBe(true)
        forgetTail("t1")
    })
    it("ignores the BEL that terminates an OSC title sequence", () => {
        expect(hasBell("t2", "\x1b]0;my-project\x07")).toBe(false)
        forgetTail("t2")
    })
    it("ignores an OSC split across chunks", () => {
        expect(hasBell("t3", "\x1b]0;my-pro")).toBe(false)
        expect(hasBell("t3", "ject\x07")).toBe(false)
        forgetTail("t3")
    })
    it("still sees a real bell after a split OSC closes", () => {
        // The chunk that closes the OSC carries only its own terminator BEL —
        // if that terminator were mistaken for a bell (or this were tested
        // with a naive chunk.includes("\x07")) this call would wrongly read
        // true, the way the very bug this function exists to fix would.
        expect(hasBell("t4", "\x1b]0;title")).toBe(false)
        expect(hasBell("t4", "\x07")).toBe(false)
        expect(hasBell("t4", "ding\x07")).toBe(true)
        forgetTail("t4")
    })
    it("sees a bell alongside an OSC in one chunk", () => {
        expect(hasBell("t5", "\x1b]0;title\x07\x07")).toBe(true)
        forgetTail("t5")
    })
    it("does not leak state between sessions", () => {
        expect(hasBell("t6", "\x1b]0;open")).toBe(false)
        expect(hasBell("t7", "\x07")).toBe(true)
        forgetTail("t6")
        forgetTail("t7")
    })
    it("recognizes an OSC opener split across chunks (lone ESC, then ']')", () => {
        expect(hasBell("t8", "hello\x1b")).toBe(false)
        expect(hasBell("t8", "]0;title\x07")).toBe(false)
        forgetTail("t8")
    })
    it("recognizes an ST terminator split across chunks and still sees the next real bell", () => {
        expect(hasBell("t9", "\x1b]0;title\x1b")).toBe(false)
        expect(hasBell("t9", "\\")).toBe(false)
        expect(hasBell("t9", "\x07")).toBe(true)
        forgetTail("t9")
    })
    it("does not confuse a fresh ESC with the stray one it just fell through on, and still catches a real bell after", () => {
        // Byte stream: "hello" + ESC (falls through, unpaired) + ESC (this one
        // pairs with the ']' that follows) + "0;title" + BEL (its terminator)
        // + BEL (a real one). Against the pre-round implementation (no
        // pendingEsc at all) the third call wrongly reads true: it has no
        // memory of chunk 2's trailing ESC, so it sees a bare ']' followed by
        // ordinary text ending in BEL and calls that a real bell.
        expect(hasBell("t10", "hello\x1b")).toBe(false)
        expect(hasBell("t10", "\x1b")).toBe(false)
        expect(hasBell("t10", "]0;title\x07")).toBe(false)
        expect(hasBell("t10", "\x07")).toBe(true)
        forgetTail("t10")
    })
    it("treats an empty chunk mid-pairing as a complete no-op (split ST terminator)", () => {
        // Reproduces the round-2 finding: an empty chunk between the two
        // halves of a split ST must not discard the carried ESC.
        expect(hasBell("t11", "\x1b]0;title\x1b")).toBe(false)
        expect(hasBell("t11", "")).toBe(false)
        expect(hasBell("t11", "\\")).toBe(false)
        expect(hasBell("t11", "\x07")).toBe(true)
        forgetTail("t11")
    })
    it("treats an empty chunk mid-pairing as a complete no-op (split OSC opener)", () => {
        expect(hasBell("t12", "hello\x1b")).toBe(false)
        expect(hasBell("t12", "")).toBe(false)
        expect(hasBell("t12", "]0;title\x07")).toBe(false)
        forgetTail("t12")
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

describe("promptFor", () => {
    const TAIL =
        "Do you want to make this edit to store.ts?\n" +
        "❯ 1. Yes\n" +
        "  2. No, and tell Claude what to do differently (esc)\n"

    afterEach(() => forgetTail("p-1"))

    it("returns the detected prompt for an agent flagged attention", () => {
        recordTail("p-1", TAIL)
        const p = promptFor(sess({ termId: "p-1", isAgent: true, status: "attention" }))
        expect(p?.kind).toBe("menu")
        expect(p?.approve).toBe("1")
    })

    it("returns the detected prompt for an agent flagged waiting", () => {
        recordTail("p-1", TAIL)
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "waiting" }))).not.toBeNull()
    })

    // The gate, not the detector: the same tail on a working or idle session is
    // mid-stream output, and answering it sends a keystroke nobody asked for.
    it("returns null for a session that is not flagged attention or waiting", () => {
        recordTail("p-1", TAIL)
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "working" }))).toBeNull()
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "idle" }))).toBeNull()
    })

    it("returns null for a plain shell", () => {
        recordTail("p-1", TAIL)
        expect(promptFor(sess({ termId: "p-1", isAgent: false, status: "attention" }))).toBeNull()
    })

    it("returns null when the tail holds no prompt", () => {
        recordTail("p-1", "compiling…\ndone\n")
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "attention" }))).toBeNull()
    })
})
