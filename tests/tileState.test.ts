import { describe, it, expect } from "vitest"
import { resolveTileState, wantsYou, hasProcess, type TileStateInput } from "../src/renderer/src/tileState"
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

    it("a session waiting on you is not QUIET", () => {
        const s = resolveTileState(input({ status: "waiting", awaited: false }), NOW)
        expect(s.kind).toBe("waiting")
        expect(s.actions).toEqual(["reply"])
    })

    it("says how long it has been waiting", () => {
        const s = resolveTileState(
            input({ status: "waiting", awaited: false, lastAt: NOW - 3 * 60_000 }),
            NOW
        )
        expect(s.chip).toBe("WAITING 3m")
    })

    // The gate in promptFor covers attention AND waiting, so a waiting session
    // holding a parsable prompt is still the blocking case.
    it("a parsable prompt still outranks WAITING", () => {
        const s = resolveTileState(input({ status: "waiting", prompt: PROMPT }), NOW)
        expect(s.kind).toBe("needs-you")
    })

    it("CHANGED outranks WAITING", () => {
        const s = resolveTileState(
            input({ status: "waiting", awaited: false, changedCount: 2 }),
            NOW
        )
        expect(s.kind).toBe("changed")
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

    // relTime reads anything under 5s as "now" — "QUIET now" reads as an error
    // message, not a status. Same fix as WAITING's chip above.
    it("says QUIET without a duration for output seconds old, not \"QUIET now\"", () => {
        const s = resolveTileState(
            input({ status: "idle", awaited: false, lastAt: NOW - 1000 }),
            NOW
        )
        expect(s.chip).toBe("QUIET")
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
            resolveTileState(input({ status: "waiting", awaited: false }), NOW),
            resolveTileState(input(), NOW),
            resolveTileState(input({ status: "idle" }), NOW)
        ].map((s) => s.mark)
        expect(new Set(marks).size).toBe(marks.length)
    })
})

describe("wantsYou", () => {
    // The ONE predicate behind every "who wants you" count in the frame — the
    // deck bar's flag and Mission's header both read this, so they cannot
    // disagree on who wants the user's attention.

    it("counts a session blocked on a permission prompt it has already been seen at", () => {
        // The defect this pins. `seen` is granted when a session goes `waiting`
        // in front of you (store.ts:674) - a legitimate rule, because watching
        // an agent hand back IS knowing about it. But the prompt detector can
        // then find a QUESTION in that same silence. The tile promotes and
        // renders live Approve/Deny; wantsYou could not see the prompt at all,
        // because it was not in its input, so the deck flag and Mission's header
        // both read zero while two tiles asked to be answered.
        //
        // The rule wantsYou already states for `attention` is the right one and
        // simply was not applied here: looking at a question does not answer it.
        const blocked = {
            status: "waiting" as const,
            prompt: {
                kind: "menu",
                question: "Do you want to proceed?",
                approve: "1",
                deny: ""
            } satisfies ApprovalPrompt,
            exitCode: undefined,
            lastAt: NOW,
            awaited: false,
            alive: true
        }
        expect(wantsYou(blocked, NOW, true)).toBe(true)
        expect(wantsYou(blocked, NOW, false)).toBe(true)
    })

    it("still lets a plain finished turn be acknowledged", () => {
        // The counterpart: no prompt means `seen` keeps its meaning, or the
        // acknowledgement axis would be dead and the count would only grow.
        const done = {
            status: "waiting" as const,
            prompt: null,
            exitCode: undefined,
            lastAt: NOW,
            awaited: false,
            alive: true
        }
        expect(wantsYou(done, NOW, true)).toBe(false)
        expect(wantsYou(done, NOW, false)).toBe(true)
    })

    it("is false for an exited session, even when status still reads attention", () => {
        // A dead process wants nothing: nothing is listening for a reply.
        expect(
            wantsYou({ status: "attention", prompt: null, exitCode: 0, lastAt: NOW, awaited: true, alive: false }, NOW)
        ).toBe(false)
        expect(
            wantsYou({ status: "attention", prompt: null, exitCode: 1, lastAt: NOW, awaited: true, alive: true }, NOW)
        ).toBe(false)
    })

    it("stops counting a `waiting` session you have already seen", () => {
        const live = { status: "waiting" as const, prompt: null, exitCode: undefined, lastAt: NOW, awaited: false, alive: true }
        expect(wantsYou(live, NOW)).toBe(true)
        expect(wantsYou(live, NOW, true)).toBe(false)
    })

    it("keeps counting `attention` however hard you look at it", () => {
        // Looking at a permission prompt does not answer it. Only the states you
        // can genuinely leave alone are acknowledgeable.
        const asking = { status: "attention" as const, prompt: null, exitCode: undefined, lastAt: NOW, awaited: false, alive: true }
        expect(wantsYou(asking, NOW, true)).toBe(true)
    })

    it("keeps counting a stall you have seen, because a stall is not a handover", () => {
        // `seen` modifies the finished-a-turn state, not "this has been quiet for
        // too long" - which is still true, and still worth a look, after you look.
        const stalled = { status: "working" as const, prompt: null, exitCode: undefined, lastAt: NOW - 60 * 60 * 1000, awaited: true, alive: true }
        expect(wantsYou(stalled, NOW)).toBe(true)
        expect(wantsYou(stalled, NOW, true)).toBe(true)
    })

    it("is true for attention", () => {
        expect(
            wantsYou(
                { status: "attention", prompt: null, exitCode: undefined, lastAt: NOW, awaited: false, alive: true },
                NOW
            )
        ).toBe(true)
    })

    it("is true for waiting", () => {
        expect(
            wantsYou(
                { status: "waiting", prompt: null, exitCode: undefined, lastAt: NOW, awaited: false, alive: true },
                NOW
            )
        ).toBe(true)
    })

    it("is true for a stalled session", () => {
        expect(
            wantsYou(
                {
                    status: "idle", prompt: null,
                    exitCode: undefined,
                    lastAt: NOW - STALL_MS - 1,
                    awaited: true,
                    alive: true
                },
                NOW
            )
        ).toBe(true)
    })

    it("is false for a quiet, unawaited, idle session", () => {
        expect(
            wantsYou(
                {
                    status: "idle", prompt: null,
                    exitCode: undefined,
                    lastAt: NOW - STALL_MS - 1,
                    awaited: false,
                    alive: true
                },
                NOW
            )
        ).toBe(false)
    })

    it("is false for working", () => {
        expect(
            wantsYou(
                { status: "working", prompt: null, exitCode: undefined, lastAt: NOW, awaited: true, alive: true },
                NOW
            )
        ).toBe(false)
    })
})

// Remedy item 9: `changedCount` can be null - the read failed, or has not
// happened yet. `0` used to absorb both, and a tile is one of the surfaces that
// turns 0 into a claim about the working tree.
describe("a changed count that could not be established", () => {
    it("does not claim CHANGED", () => {
        expect(resolveTileState(input({ status: "idle", prompt: null, changedCount: null }), NOW).kind).not.toBe(
            "changed"
        )
    })

    it("keeps the more useful headline but says the file check failed", () => {
        // WAITING is the better thing to put on the chip; the unknown rides in
        // the detail, and Review is added so the state is actually actionable.
        const s = resolveTileState(input({ status: "waiting", prompt: null, changedCount: null }), NOW)
        expect(s.kind).toBe("waiting")
        expect(s.chip).toMatch(/WAITING/)
        expect(s.detail).toContain("Couldn't check for file changes")
        expect(s.actions).toContain("review")
    })

    it("replaces QUIET outright, because QUIET reads as nothing happened here", () => {
        const s = resolveTileState(
            input({ status: "idle", prompt: null, awaited: false, changedCount: null }),
            NOW
        )
        expect(s.kind).toBe("unchecked")
        expect(s.chip).toBe("COULDN'T CHECK")
        expect(s.actions).toEqual(["review"])
    })

    it("leaves a session that is asking you something alone", () => {
        // The tile is relaying a question; files are not what is being asked.
        const s = resolveTileState(input({ status: "attention", prompt: null, changedCount: null }), NOW)
        expect(s.kind).toBe("asking")
        expect(s.detail).not.toContain("Couldn't check")
        expect(s.actions).toEqual(["reply"])
    })

    it("stays completely quiet for a session nobody has polled yet", () => {
        // `undefined` is the gap of one poll interval after mount - not a
        // failure, and it must not be dressed as one.
        const s = resolveTileState(input({ status: "idle", prompt: null, awaited: false, changedCount: undefined }), NOW)
        expect(s.kind).toBe("quiet")
        expect(s.detail ?? "").not.toContain("Couldn't check")
    })

    it("says why the Review button is there, instead of leaving it unexplained", () => {
        // A Review button beside "The process exited cleanly." with nothing
        // explaining it is the affordance making a claim the text does not.
        const s = resolveTileState(input({ exitCode: 0, changedCount: null }), NOW)
        expect(s.detail).toContain("exited cleanly")
        expect(s.detail).toContain("Couldn't check for file changes")
        expect(s.actions).toContain("review")
        expect(resolveTileState(input({ exitCode: 0, changedCount: 0 }), NOW).detail).not.toContain(
            "Couldn't check"
        )
    })

    it("still offers Review on a dead session, because nobody knows there is nothing there", () => {
        // `changedCount: 0` correctly withholds it - the tree was checked and is
        // clean. Withholding it on a FAILED check is the app deciding there is
        // nothing to see on evidence it does not have.
        expect(resolveTileState(input({ exitCode: 1, changedCount: null }), NOW).actions).toEqual([
            "review"
        ])
        expect(resolveTileState(input({ exitCode: 1, changedCount: 0 }), NOW).actions).toEqual([])
    })

    it("leaves a real count saying exactly what it said before", () => {
        const s = resolveTileState(input({ status: "idle", prompt: null, changedCount: 4 }), NOW)
        expect(s.kind).toBe("changed")
        expect(s.chip).toContain("4 files")
    })
})

describe("the attention contract", () => {
    /**
     * The standing invariant `product-director` ordered after `6caf63f`.
     *
     * That bug was not a missed branch — it was a tile and a counter answering
     * different questions, because `wantsYou`'s input could not express the most
     * blocking state in the product. The fix closed the instance. This closes
     * the class: **a tile that asks to be answered must be counted by the
     * predicate both counters read.** Anything else puts a live Approve/Deny on
     * screen while the deck flag and Mission's header say nobody needs you.
     *
     * The converse is deliberately NOT asserted. `wantsYou` may legitimately
     * count a session whose tile reads something else — a stalled one, or an
     * unacknowledged hand-back — because those want you without asking a
     * question. One direction is the contract; both would be a coincidence.
     */
    const STATUSES = ["idle", "working", "waiting", "attention"] as const
    const PROMPT: ApprovalPrompt = {
        kind: "menu",
        question: "Do you want to proceed?",
        approve: "1",
        deny: "\x1b"
    }

    it("counts every tile that asks to be answered, under every combination", () => {
        const offenders: string[] = []
        for (const status of STATUSES) {
            for (const prompt of [null, PROMPT]) {
                for (const changedCount of [undefined, null, 0, 3]) {
                    for (const alive of [true, false]) {
                        for (const awaited of [true, false]) {
                            for (const seen of [true, false]) {
                                for (const lastAt of [NOW, NOW - STALL_MS - 1]) {
                                    const i: TileStateInput = {
                                        status,
                                        prompt,
                                        exitCode: undefined,
                                        lastAt,
                                        changedCount,
                                        awaited,
                                        alive
                                    }
                                    const kind = resolveTileState(i, NOW).kind
                                    if (kind !== "needs-you" && kind !== "asking") continue
                                    if (!wantsYou(i, NOW, seen)) {
                                        offenders.push(
                                            `${kind} tile uncounted: status=${status} ` +
                                                `prompt=${prompt ? "yes" : "no"} seen=${seen} ` +
                                                `alive=${alive} awaited=${awaited}`
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        expect(offenders, offenders.slice(0, 5).join("\n")).toEqual([])
    })

    it("still lets a dead session ask nothing, whatever its tile once said", () => {
        // The one exemption, and it is in wantsYou's first line: nothing is
        // listening for a reply, so an exited session is never counted even
        // while its tile still carries the words it died with.
        const dead: TileStateInput = {
            status: "attention",
            prompt: PROMPT,
            exitCode: 1,
            lastAt: NOW,
            changedCount: 0,
            awaited: false,
            alive: false
        }
        expect(wantsYou(dead, NOW, false)).toBe(false)
    })
})

describe("hasProcess — what 'running' counts", () => {
    /**
     * The header said `sessions.length` and therefore counted TABS. Restoring a
     * workspace stamps paneHold = "resume" on every agent pane and starts
     * nothing, so a relaunch with five restored sessions read "5 running" while
     * every one of those panes said "Restored from your last run." The header
     * was the only thing on screen claiming they were alive.
     */
    const live = { exitCode: undefined }

    it("counts a session that has not exited and is not held", () => {
        expect(hasProcess(live, undefined)).toBe(true)
    })

    it("does not count a restored pane, which has started nothing", () => {
        // The reported defect, exactly: this is every agent pane after a
        // workspace restore.
        expect(hasProcess(live, "resume")).toBe(false)
    })

    it("does not count a pane held for restart after its process died", () => {
        expect(hasProcess(live, "restart")).toBe(false)
    })

    it("does not count an exited session, held or not", () => {
        for (const held of [undefined, "resume", "restart"] as const) {
            expect(hasProcess({ exitCode: 0 }, held)).toBe(false)
            expect(hasProcess({ exitCode: 1 }, held)).toBe(false)
        }
    })

    it("never counts more sessions than exist, and never a negative", () => {
        // A whole restored workspace: the count must be 0, not 5.
        const restored = [1, 2, 3, 4, 5].map(() => hasProcess(live, "resume"))
        expect(restored.filter(Boolean)).toHaveLength(0)
    })
})
