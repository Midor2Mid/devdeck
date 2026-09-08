import { describe, it, expect, afterEach } from "vitest"
import {
    cleanTail,
    peekLine,
    relTime,
    sortForFollow,
    followRank,
    lastLines,
    isStalled,
    awaitedTermIds,
    markLaunched,
    getLastAt,
    recordTail,
    CARRY_MAX,
    STALL_MS,
    hasBell,
    forgetTail,
    promptFor,
    setDecisions
} from "../src/renderer/src/missionTail"
import type { AnySession } from "../src/renderer/src/store"
import { deckKeyStatus, type DeckKeyStatus } from "../src/renderer/src/deck"

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
    /** Every session live: the raw status IS the derived one. */
    const live = (s: AnySession): DeckKeyStatus => deckKeyStatus(s.status, undefined, undefined)

    it("orders attention → working → idle, stable within a status", () => {
        const out = sortForFollow(
            [
                sess({ termId: "i", status: "idle" }),
                sess({ termId: "a", status: "attention" }),
                sess({ termId: "w1", status: "working" }),
                sess({ termId: "w2", status: "working" })
            ],
            live
        )
        expect(out.map((s) => s.termId)).toEqual(["a", "w1", "w2", "i"])
    })

    it("sorts a dead session last, whatever it last said", () => {
        // The defect: the rank read `s.status`, which is what the agent last
        // DID and outlives the process that did it - so an exited or restored
        // session kept the `attention` it died wearing and took the FIRST slot
        // in Mission and in Overview, above every agent still running.
        //
        // Ranking on the derived status is the fix, and it is the same
        // derivation the dot, the chip and every count read.
        const dead = (s: AnySession): DeckKeyStatus =>
            s.termId === "corpse"
                ? deckKeyStatus(s.status, 1, "restart")
                : deckKeyStatus(s.status, undefined, undefined)
        const out = sortForFollow(
            [
                sess({ termId: "corpse", status: "attention" }),
                sess({ termId: "i", status: "idle" }),
                sess({ termId: "a", status: "attention" })
            ],
            dead
        )
        expect(out.map((s) => s.termId)).toEqual(["a", "i", "corpse"])
    })

    it("ranks a restored pane last too, not on the status it was restored with", () => {
        // `paneHold = "resume"` with no exit code: the other half of
        // `hasProcess`, and the half a future restore-the-statuses change
        // would make visible.
        const held = (s: AnySession): DeckKeyStatus =>
            deckKeyStatus(s.status, undefined, s.termId === "restored" ? "resume" : undefined)
        const out = sortForFollow(
            [sess({ termId: "restored", status: "waiting" }), sess({ termId: "w", status: "working" })],
            held
        )
        expect(out.map((s) => s.termId)).toEqual(["w", "restored"])
    })
})

describe("followRank", () => {
    // Exported for Overview's grid, which ranks a GROUP rather than sorting a
    // list. Same order, so the two surfaces cannot disagree about which
    // session - or which project group - comes first.
    it("puts a session with no process behind the four live statuses", () => {
        expect(followRank("not-running")).toBeGreaterThan(followRank("idle"))
        expect(followRank("attention")).toBeLessThan(followRank("waiting"))
        expect(followRank("waiting")).toBeLessThan(followRank("working"))
        expect(followRank("working")).toBeLessThan(followRank("idle"))
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

describe("promptFor", () => {
    // The fixture is now what MAIN mints (refreshDecision in main/decisions.ts),
    // not the terminal text it was derived from: this surface no longer reads a
    // tail at all.
    const MENU = {
        id: "dec:p-1:abc",
        kind: "menu" as const,
        question: "Do you want to make this edit to store.ts?",
        tail: "Do you want to make this edit to store.ts?\n\u276f 1. Yes\n  2. No (esc)",
        options: [
            { label: "Approve", send: "1" },
            { label: "Deny", send: "\x1b" }
        ]
    }

    afterEach(() => {
        setDecisions({})
        forgetTail("p-1")
    })

    it("returns main's prompt for an agent flagged attention", () => {
        setDecisions({ "p-1": MENU })
        const p = promptFor(sess({ termId: "p-1", isAgent: true, status: "attention" }), "attention")
        expect(p?.kind).toBe("menu")
        expect(p?.approve).toBe("1")
    })

    it("returns main's prompt for an agent flagged waiting", () => {
        setDecisions({ "p-1": MENU })
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "waiting" }), "waiting")).not.toBeNull()
    })

    // The gate, not the detector: the same prompt on a working or idle session
    // is mid-stream output, and answering it sends a keystroke nobody asked for.
    it("returns null for a session that is not flagged attention or waiting", () => {
        setDecisions({ "p-1": MENU })
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "working" }), "working")).toBeNull()
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "idle" }), "idle")).toBeNull()
    })

    it("returns null for a plain shell", () => {
        setDecisions({ "p-1": MENU })
        expect(promptFor(sess({ termId: "p-1", isAgent: false, status: "attention" }), "attention")).toBeNull()
    })

    // The tail is no longer this function's input: a session with a textbook
    // prompt sitting in its recorded output, and no decision from main, has no
    // prompt here. This is the test that would fail if the renderer ever
    // re-grew a classifier of its own.
    it("returns null when main minted no decision, whatever the tail says", () => {
        recordTail("p-1", "Do you want to proceed?\n\u276f 1. Yes\n  2. No (esc)\n")
        setDecisions({})
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "attention" }), "attention")).toBeNull()
    })

    // A snapshot is main's COMPLETE answer, so a prompt going away is expressed
    // by its absence. Merging instead of replacing would leave the tile
    // offering Approve for a question the agent has already moved past.
    it("drops a decision the next snapshot no longer carries", () => {
        setDecisions({ "p-1": MENU })
        setDecisions({})
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "attention" }), "attention")).toBeNull()
    })

    it("forgetTail drops the session's decision with its tail", () => {
        setDecisions({ "p-1": MENU })
        forgetTail("p-1")
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "attention" }), "attention")).toBeNull()
    })

    /**
     * The gate is on the DERIVED status, and that is why the status is a
     * required argument rather than read off the session.
     *
     * A session keeps the status it died with, so this same decision hung two
     * live Approve / Deny buttons on a `not-running` row in Overview - and it
     * would have read NEEDS YOU on a Mission tile too, because `prompt`
     * outranks the NOT-RUNNING rule inside resolveTileState. Composed through
     * `deckKeyStatus` rather than passing the literal, so this fails if either
     * half drifts.
     */
    it("returns null for a session with nothing behind it, whatever it died saying", () => {
        setDecisions({ "p-1": MENU })
        const dead: [number | undefined, "resume" | "restart" | undefined][] = [
            [undefined, "resume"],
            [undefined, "restart"],
            [0, undefined],
            [1, "restart"]
        ]
        for (const status of ["attention", "waiting"] as const) {
            const s = sess({ termId: "p-1", isAgent: true, status })
            for (const [exitCode, held] of dead) {
                expect(promptFor(s, deckKeyStatus(status, exitCode, held))).toBeNull()
            }
            // Not vacuous: the same session with a process still gets the prompt.
            expect(promptFor(s, deckKeyStatus(status, undefined, undefined))).not.toBeNull()
        }
    })
})

describe("promptFor consumes main's decision", () => {
    afterEach(() => setDecisions({}))

    it("returns null for a session main minted no decision for", () => {
        setDecisions({})
        expect(promptFor({ termId: "t1", isAgent: true, status: "waiting" } as AnySession, "waiting")).toBeNull()
    })

    it("returns main's prompt verbatim \u2014 it does not re-classify", () => {
        setDecisions({
            t1: {
                id: "dec:t1:aaa",
                kind: "menu",
                question: "Do you want to proceed?",
                tail: "Do you want to proceed?\n\u276f 1. Yes\n  2. No (esc)",
                options: [
                    { label: "Approve", send: "1" },
                    { label: "Deny", send: "\x1b" }
                ]
            }
        })
        expect(promptFor({ termId: "t1", isAgent: true, status: "waiting" } as AnySession, "waiting")).toEqual({
            kind: "menu",
            question: "Do you want to proceed?",
            approve: "1",
            deny: "\x1b"
        })
    })

    it("still refuses an idle session even when main offers one", () => {
        setDecisions({
            t1: {
                id: "dec:t1:bbb",
                kind: "yesno",
                question: "ok? (y/n)",
                tail: "ok? (y/n)",
                options: [
                    { label: "Approve", send: "y\r" },
                    { label: "Deny", send: "n\r" }
                ]
            }
        })
        expect(promptFor({ termId: "t1", isAgent: true, status: "idle" } as AnySession, "idle")).toBeNull()
    })
})
