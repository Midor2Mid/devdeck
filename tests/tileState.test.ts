import { describe, it, expect } from "vitest"
import { resolveTileState, wantsYou, hasProcess, type TileStateInput } from "../src/renderer/src/tileState"
import { STALL_MS } from "../src/renderer/src/missionTail"
import { FASTFAIL } from "../src/renderer/src/termExit"
import type { ApprovalPrompt } from "../src/renderer/src/approval"
// The cross-module pair below needs the OTHER attention count and the shared
// status derivation - the disagreement it pins lived between the two modules.
import {
    deckKeyStatus,
    projectSessionCounts,
    type DeckKeyStatus
} from "../src/renderer/src/deck"
import type { AgentStatus, AnySession } from "../src/renderer/src/store"

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
        held: undefined,
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

    /**
     * The 2026-09-08 walkthrough's finding 8. Restart DevDeck with four agent
     * sessions open: the tabs and the deck keys come back, the ptys do not, and
     * every tile read "QUIET" - the chip whose own note says it "reads as
     * nothing happened here". A stranger reopens DevDeck and reasonably
     * believes their agents are still there. The header already said "0
     * running" from the very same fact.
     */
    it("a restored pane with no process does not read QUIET", () => {
        const s = resolveTileState(input({ status: "idle", held: "resume" }), NOW)
        expect(s.kind).toBe("not-running")
        expect(s.chip).toBe("NOT RUNNING")
        expect(s.detail).toContain("Restored from your last run")
        // Nothing is listening, so nothing may be offered.
        expect(s.actions).toEqual([])
    })

    it("says nothing about a duration for a session with no process", () => {
        // QUIET carries "8m", which reads as an idle LIVE agent. How long ago a
        // previous run of the app last printed is not a fact about now.
        const s = resolveTileState(
            input({ status: "idle", held: "resume", lastAt: NOW - 8 * 60_000 }),
            NOW
        )
        expect(s.chip).toBe("NOT RUNNING")
    })

    // A recorded exit code is the more specific answer and keeps its chip,
    // KILLED included - "NOT RUNNING" would throw away the reason.
    it("an exit code outranks the hold that follows it", () => {
        const s = resolveTileState(input({ status: "idle", exitCode: 1, held: "restart" }), NOW)
        expect(s.chip).toBe("EXITED 1")
    })

    it("reads a pane held for restart with no code as NOT RUNNING", () => {
        expect(resolveTileState(input({ status: "idle", held: "restart" }), NOW).kind).toBe(
            "not-running"
        )
    })

    // Whatever the status map still holds from the process that died with the
    // last run, it cannot make a dead pane claim to be alive.
    it("does not let a stale status make a held pane look alive", () => {
        for (const status of ["working", "waiting", "attention", "idle"] as const) {
            expect(resolveTileState(input({ status, held: "resume" }), NOW).kind).toBe(
                "not-running"
            )
        }
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
    //
    // Every case below goes through `input()`, the same helper resolveTileState
    // is tested with, so `held` is supplied here too. It is a REQUIRED field
    // rather than an optional one on purpose: DeckStatus built this object by
    // hand and omitted it, which is exactly how the flag came to count a
    // restored pane.

    it("does not count a session blocked on a prompt it has already been seen at", () => {
        // CONTRACT REVERSED, 2026-09-08. This test previously asserted `true`
        // for both values of `seen`, on the reasoning that looking at a
        // question does not answer it. The owner's ruling is narrower and
        // wins: ACKNOWLEDGEMENT DIMS THE NAG, NOT THE STATE. Nothing here
        // claims the prompt was answered - the tile still reads NEEDS YOU and
        // still draws live Approve/Deny, and the dot still reports the real
        // status. Only the count steps back, because you have already been
        // told and chose to leave it.
        //
        // What forced the reversal was not taste. `projectSessionCounts`
        // (deck.ts) already honoured the ruling, so the switcher card said 0
        // while the deck's flag said 1 for the same session and the same word.
        // Two counts disagreeing by construction is the defect this predicate
        // was extracted to make impossible.
        const blocked = input({
            status: "waiting",
            prompt: {
                kind: "menu",
                question: "Do you want to proceed?",
                approve: "1",
                deny: ""
            } satisfies ApprovalPrompt,
            lastAt: NOW,
            awaited: false
        })
        expect(wantsYou(blocked, NOW, true)).toBe(false)
        // Unseen, it is still the most blocking thing in the product. `prompt`
        // was not in this input at all until 2026-09-07, which is how the tile
        // and the counters came to answer different questions.
        expect(wantsYou(blocked, NOW, false)).toBe(true)
    })

    it("still lets a plain finished turn be acknowledged", () => {
        // The counterpart: no prompt means `seen` keeps its meaning, or the
        // acknowledgement axis would be dead and the count would only grow.
        const done = input({ status: "waiting", lastAt: NOW, awaited: false })
        expect(wantsYou(done, NOW, true)).toBe(false)
        expect(wantsYou(done, NOW, false)).toBe(true)
    })

    it("is false for an exited session, even when status still reads attention", () => {
        // A dead process wants nothing: nothing is listening for a reply.
        expect(
            wantsYou(input({ status: "attention", exitCode: 0, lastAt: NOW, alive: false }), NOW)
        ).toBe(false)
        expect(wantsYou(input({ status: "attention", exitCode: 1, lastAt: NOW }), NOW)).toBe(false)
    })

    it("is false for a session held for resume or restart, whatever it last said", () => {
        // The `held` half of `hasProcess`, which this predicate did not read
        // until now. A restore stamps `paneHold = "resume"` on every agent pane
        // and starts nothing; an exit stamps "restart". Either way there is no
        // pty to answer, and the deck already draws such a key as not-running -
        // so the flag counting it was the same lie in a second place.
        //
        // The previous note called this "harmless only because statuses aren't
        // restored". That is an accident in another module, not a guarantee:
        // the first change that brings statuses back through a restore turns it
        // into a wrong number with no test failing.
        for (const held of ["resume", "restart"] as const) {
            expect(wantsYou(input({ status: "attention", lastAt: NOW, held }), NOW)).toBe(false)
            expect(wantsYou(input({ status: "waiting", lastAt: NOW, held }), NOW)).toBe(false)
            // Including a stall, which is otherwise unacknowledgeable: a pane
            // with nothing behind it is not stuck, it is finished.
            expect(
                wantsYou(input({ status: "working", lastAt: NOW - STALL_MS - 1, held }), NOW)
            ).toBe(false)
        }
    })

    it("stops counting a `waiting` session you have already seen", () => {
        const live = input({ status: "waiting", lastAt: NOW, awaited: false })
        expect(wantsYou(live, NOW)).toBe(true)
        expect(wantsYou(live, NOW, true)).toBe(false)
    })

    it("stops counting `attention` once you have looked at it", () => {
        // CONTRACT REVERSED, 2026-09-08 - this asserted `true`, under the title
        // "keeps counting `attention` however hard you look at it". Same
        // ruling, and this is the case it was actually about: `attention` is
        // the word `projectSessionCounts` counts, so this branch was the one
        // producing two different numbers for one word 200px apart.
        const asking = input({ status: "attention", lastAt: NOW, awaited: false })
        expect(wantsYou(asking, NOW, true)).toBe(false)
        expect(wantsYou(asking, NOW, false)).toBe(true)
    })

    it("keeps counting a stall you have seen, because a stall is not a handover", () => {
        // The ONE exemption from the ruling, and it survives it for a reason
        // the ruling itself implies: acknowledgement has to be able to expire.
        //
        // `seen` is event-scoped for `waiting` and `attention` - it is granted
        // against a transition and `setStatus` clears it on the next one, so
        // acknowledging a hand-back acknowledges THAT hand-back. A stall
        // arrives with no transition at all (that is what a stall IS), so
        // nothing would ever clear the acknowledgement: dimming it would mean
        // one glance silences a stuck agent for as long as it stays stuck.
        // That is the other failure mode - forgetting silently - not the nag.
        const stalled = input({ status: "working", lastAt: NOW - 60 * 60 * 1000 })
        expect(wantsYou(stalled, NOW)).toBe(true)
        expect(wantsYou(stalled, NOW, true)).toBe(true)
    })

    it("is true for attention", () => {
        expect(wantsYou(input({ status: "attention", lastAt: NOW, awaited: false }), NOW)).toBe(
            true
        )
    })

    it("is true for waiting", () => {
        expect(wantsYou(input({ status: "waiting", lastAt: NOW, awaited: false }), NOW)).toBe(true)
    })

    it("is true for a stalled session", () => {
        expect(
            wantsYou(input({ status: "idle", lastAt: NOW - STALL_MS - 1, awaited: true }), NOW)
        ).toBe(true)
    })

    it("is false for a quiet, unawaited, idle session", () => {
        expect(
            wantsYou(input({ status: "idle", lastAt: NOW - STALL_MS - 1, awaited: false }), NOW)
        ).toBe(false)
    })

    it("is false for working", () => {
        expect(wantsYou(input({ status: "working", lastAt: NOW }), NOW)).toBe(false)
    })
})

/**
 * The acknowledgement ruling, across every count that says the word.
 *
 * The pair, asserted together because the two failure modes are opposites and
 * fixing one is how you ship the other:
 *
 *   - **Absent from every attention count.** Three surfaces say a number: the
 *     deck's flag and Mission's header (both `wantsYou`) and the switcher card
 *     (`projectSessionCounts`). Only the card honoured `seen`, so a session you
 *     had acknowledged read 0 there and 1 on the deck.
 *   - **Still reporting its real status.** `deckKeyStatus` must go on saying
 *     `attention`. A glance that rewrote the state to `idle` was the ORIGINAL
 *     bug - it erased the `!` forever - and it is why `ack` no longer touches
 *     status. Visibility may change a count. It may never change a
 *     classification.
 *
 * Cross-module on purpose: the disagreement lived in the gap between the two
 * modules, so a test inside either one could not have seen it.
 */
describe("acknowledgement dims the nag, not the state", () => {
    const live = (s: AnySession): DeckKeyStatus => deckKeyStatus(s.status, undefined, undefined)

    function session(status: AgentStatus): AnySession {
        return {
            termId: "a",
            projectId: "p1",
            projectName: "P",
            projectPath: "",
            tabName: "tab",
            sessionName: "s",
            agentId: "claude",
            badge: "CL",
            isAgent: true,
            status
        }
    }

    for (const status of ["attention", "waiting"] as const) {
        it("drops a seen " + status + " session from every count, and from none of its state", () => {
            const s = session(status)
            const facts = input({ status, lastAt: NOW, awaited: false })

            // Unseen: the predicate counts it. Not vacuous - without this the
            // assertions below would pass on a predicate that never counts.
            expect(wantsYou(facts, NOW, false)).toBe(true)
            expect(projectSessionCounts([s], live, {}).p1.attention).toBe(
                // The card counts the WORD `attention` and nothing else, which
                // is a narrower question than "wants you" and deliberately so.
                status === "attention" ? 1 : 0
            )

            // Seen: absent from both predicates, and so from the card too.
            expect(wantsYou(facts, NOW, true)).toBe(false)
            expect(projectSessionCounts([s], live, { a: true }).p1.attention).toBe(0)

            // And the state is untouched - what the dot, the tile chip and the
            // tooltip all read still says exactly what the agent did.
            expect(live(s)).toBe(status)
            expect(s.status).toBe(status)
            // A bell with no detected prompt is ASKING; a hand-back is
            // WAITING. Either way the chip still says what the agent did.
            expect(resolveTileState(facts, NOW).kind).toBe(
                status === "attention" ? "asking" : "waiting"
            )
            // Still a real, reachable session on the card too.
            expect(projectSessionCounts([s], live, { a: true }).p1).toMatchObject({
                terms: 1,
                agents: 1
            })
        })
    }

    it("keeps an acknowledged prompt answerable while it stops nagging", () => {
        // The sharpest case: `seen` withdraws the count, and the tile must
        // still be the thing you can answer. If acknowledgement reached the
        // classification here, the Approve/Deny buttons would go with it.
        const facts = input({ status: "waiting", prompt: PROMPT, lastAt: NOW, awaited: false })
        expect(wantsYou(facts, NOW, true)).toBe(false)
        const st = resolveTileState(facts, NOW)
        expect(st.kind).toBe("needs-you")
        expect(st.actions).toContain("approve")
        expect(st.actions).toContain("deny")
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
     *
     * SCOPE NARROWED, 2026-09-08. The invariant now runs over UNACKNOWLEDGED
     * sessions only, because the owner ruled that acknowledgement dims the nag:
     * a tile you have looked at and left goes on asking to be answered — that
     * is its state, and nothing here touches it — while dropping out of the
     * count, which is the whole point of the axis. Asserting the old, wider
     * form would now require `wantsYou` to ignore `seen`, which is exactly the
     * disagreement with `projectSessionCounts` (deck.ts) this wave closed. The
     * contract that survives is the one that caught the original defect: a
     * tile asking to be answered that NOBODY HAS SEEN must be counted.
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
                                        alive,
                                        // A tab with no process still relays a
                                        // prompt sitting in its tail, and such a
                                        // tile has to stay counted.
                                        held: undefined
                                    }
                                    const kind = resolveTileState(i, NOW).kind
                                    if (kind !== "needs-you" && kind !== "asking") continue
                                    // An acknowledged session is allowed to be
                                    // uncounted - see the scope note above. It
                                    // is still walked, so the combination is
                                    // exercised and a crash here would surface.
                                    if (seen) continue
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
        //
        // That line now reads `hasProcess`, so BOTH ways of having no process
        // count as dead here - an exit code, and a pane held for resume or
        // restart. `held` was outside this predicate's input entirely, which
        // made the second one invisible to it.
        const dead = (over: Partial<TileStateInput>): TileStateInput => ({
            status: "attention",
            prompt: PROMPT,
            held: undefined,
            exitCode: undefined,
            lastAt: NOW,
            changedCount: 0,
            awaited: false,
            alive: false,
            ...over
        })
        expect(wantsYou(dead({ exitCode: 1 }), NOW, false)).toBe(false)
        expect(wantsYou(dead({ held: "resume" }), NOW, false)).toBe(false)
        expect(wantsYou(dead({ held: "restart" }), NOW, false)).toBe(false)
        // Not vacuous: with a process behind it, the same facts are counted.
        expect(wantsYou(dead({}), NOW, false)).toBe(true)
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
