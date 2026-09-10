import { describe, it, expect } from "vitest"
import {
    deriveDeckStrips,
    deckKeyStatus,
    deckKeyStatusLabel,
    keyIsRunning,
    nextSession,
    projectSessionCounts,
    shortSessionLabel,
    tabDotStatus,
    wantsYouLabel,
    COMPRESS_THRESHOLD
} from "../src/renderer/src/deck"
import { hasProcess, resolveTileState, type TileStateInput } from "../src/renderer/src/tileState"
import { followRank } from "../src/renderer/src/missionTail"
import { FASTFAIL } from "../src/renderer/src/termExit"
import type { AgentStatus, AnySession } from "../src/renderer/src/store"
import type { DeckKeyStatus } from "../src/renderer/src/deck"

function sess(over: Partial<AnySession>): AnySession {
    return {
        termId: "t",
        projectId: "p",
        projectName: "P",
        projectPath: "",
        tabName: "tab",
        sessionName: "s",
        agentId: "claude",
        badge: "CL",
        isAgent: true,
        status: "idle",
        ...over
    }
}

describe("deriveDeckStrips", () => {
    it("groups agent sessions by project in first-seen order", () => {
        const strips = deriveDeckStrips([
            sess({ termId: "a", projectId: "p1", projectName: "One" }),
            sess({ termId: "b", projectId: "p2", projectName: "Two" }),
            sess({ termId: "c", projectId: "p1", projectName: "One" })
        ])
        expect(strips.map((s) => s.projectId)).toEqual(["p1", "p2"])
        expect(strips[0].keys.map((k) => k.termId)).toEqual(["a", "c"])
    })

    it("marks a strip compressed only past the threshold", () => {
        const many = Array.from({ length: COMPRESS_THRESHOLD + 1 }, (_, i) =>
            sess({ termId: "k" + i, projectId: "p1" })
        )
        expect(deriveDeckStrips(many)[0].compressed).toBe(true)
        expect(deriveDeckStrips(many.slice(0, COMPRESS_THRESHOLD))[0].compressed).toBe(false)
    })

    it("prepends an empty strip for the active (cold) project when it has no keys", () => {
        const strips = deriveDeckStrips([sess({ projectId: "p1" })], { id: "cold", name: "Cold" })
        expect(strips[0]).toMatchObject({ projectId: "cold", keys: [] })
        expect(strips).toHaveLength(2)
    })

    it("does not duplicate the active project when it already has keys", () => {
        const strips = deriveDeckStrips([sess({ projectId: "p1", projectName: "One" })], {
            id: "p1",
            name: "One"
        })
        expect(strips).toHaveLength(1)
    })
})

describe("nextSession", () => {
    const list = [sess({ termId: "a" }), sess({ termId: "b" }), sess({ termId: "c" })]
    it("cycles forward and wraps", () => {
        expect(nextSession(list, "a", 1)).toBe("b")
        expect(nextSession(list, "c", 1)).toBe("a")
    })
    it("cycles backward and wraps", () => {
        expect(nextSession(list, "a", -1)).toBe("c")
    })
    it("returns first when current is unknown, null when fewer than two", () => {
        expect(nextSession(list, null, 1)).toBe("a")
        expect(nextSession([sess({ termId: "a" })], "a", 1)).toBeNull()
    })
})

describe("shortSessionLabel", () => {
    it("takes the trailing number, which is where a generated name differs", () => {
        // `newTab` names sessions `<preset> <n>`, so five Claude sessions differ
        // only in the digits — the part compression used to throw away.
        expect(shortSessionLabel("claude 1", "CLAUDE")).toBe("1")
        expect(shortSessionLabel("claude 12", "CLAUDE")).toBe("12")
        expect(shortSessionLabel("sim waiting 2", "WAIT")).toBe("2")
        // Never a truncated number: "234" would name a different session.
        expect(shortSessionLabel("claude 1234", "CLAUDE")).toBe("1234")
    })

    it("falls back to initials for a renamed session", () => {
        expect(shortSessionLabel("auth refactor", "CLAUDE")).toBe("AR")
        expect(shortSessionLabel("ghost", "CLAUDE")).toBe("GH")
        expect(shortSessionLabel("fix-login-bug", "CLAUDE")).toBe("FL")
    })

    it("adds nothing when it would only repeat the badge's own opening", () => {
        // The pill already says CLAUDE; "CL" beside it is not identity.
        expect(shortSessionLabel("claude", "CLAUDE")).toBe("")
        expect(shortSessionLabel("codex", "CODEX")).toBe("")
    })

    it("still labels an unnumbered name when the badge is empty", () => {
        expect(shortSessionLabel("claude", "")).toBe("CL")
    })

    it("returns empty rather than a punctuation smear for a nameless session", () => {
        expect(shortSessionLabel("")).toBe("")
        expect(shortSessionLabel("   ")).toBe("")
        expect(shortSessionLabel("--- ---")).toBe("")
    })

    it("gives two sessions that share a name the same tail", () => {
        // Split panes of one tab really do share `tab.name`. The tail reports
        // the name; it must not invent distinctness the names do not have.
        expect(shortSessionLabel("claude 3", "CLAUDE")).toBe(
            shortSessionLabel("claude 3", "CLAUDE")
        )
    })
})

/**
 * The deck half of "a dead session reads as alive".
 *
 * Mission got rule 3 (`tileState.ts`: no exit code but a `paneHold` means NOT
 * RUNNING) and its header already counted "N running" off `hasProcess`, while
 * the deck kept painting a restored key `status-idle` - so a restart left
 * three dead sessions wearing the resting form of a live agent on the one
 * surface that is always on screen.
 */
describe("deckKeyStatus", () => {
    const STATUSES: AgentStatus[] = ["idle", "working", "waiting", "attention"]

    it("passes the session's own status through while a process is behind it", () => {
        for (const st of STATUSES) {
            expect(deckKeyStatus(st, undefined, undefined)).toBe(st)
        }
    })

    it("reads not-running for a session restored from the last run", () => {
        // The exact shape after a workspace restore: paneHold "resume", and no
        // exit code, because the pty died with the previous app process. This
        // is the case the deck got wrong.
        expect(deckKeyStatus("idle", undefined, "resume")).toBe("not-running")
    })

    it("reads not-running after an exit, including a clean one", () => {
        // 0 is falsy and is an exit: a truthiness test here would have called a
        // cleanly finished agent "idle".
        expect(deckKeyStatus("idle", 0, "restart")).toBe("not-running")
        expect(deckKeyStatus("idle", 0, undefined)).toBe("not-running")
        expect(deckKeyStatus("idle", 1, "restart")).toBe("not-running")
        expect(deckKeyStatus("idle", FASTFAIL, "restart")).toBe("not-running")
    })

    it("outranks a live-looking status, so a dead key can neither breathe nor shout", () => {
        // A session that was waiting or asking when its process died keeps that
        // status - nothing rewrites it. AgentKey derives key-waiting/key-attn
        // from THIS value, so without the override a corpse would keep the
        // breathing edge and the `!`.
        expect(deckKeyStatus("waiting", undefined, "resume")).toBe("not-running")
        expect(deckKeyStatus("attention", 1, "restart")).toBe("not-running")
    })

    it("is not-running exactly when hasProcess is false", () => {
        // The anti-drift assertion. Two derivations of "is there a process
        // behind this tab" is the defect class; this pins the deck to the same
        // predicate the header's count and the tile's chip read.
        for (const st of STATUSES) {
            for (const exitCode of [undefined, 0, 1, FASTFAIL]) {
                for (const held of [undefined, "resume", "restart"] as const) {
                    const running = hasProcess({ exitCode }, held)
                    expect(deckKeyStatus(st, exitCode, held) === "not-running").toBe(!running)
                }
            }
        }
    })

    it("never says idle while the tile says NOT RUNNING or EXITED", () => {
        // The two surfaces, on the same facts, in one assertion - qa's finding
        // was that a restarted session read as fine on both.
        const facts: TileStateInput = {
            status: "idle",
            prompt: null,
            exitCode: undefined,
            lastAt: 1_700_000_000_000,
            changedCount: 0,
            awaited: false,
            alive: true,
            held: "resume"
        }
        for (const held of ["resume", "restart"] as const) {
            const tile = resolveTileState({ ...facts, held }, facts.lastAt!)
            expect(tile.kind).toBe("not-running")
            expect(deckKeyStatus("idle", undefined, held)).toBe("not-running")
        }
        const exited = resolveTileState({ ...facts, held: undefined, exitCode: 1 }, facts.lastAt!)
        expect(exited.kind).toBe("exited")
        expect(deckKeyStatus("idle", 1, undefined)).toBe("not-running")
    })

    it("names not-running in words, since the tooltip printed the raw status", () => {
        expect(deckKeyStatusLabel("not-running")).toBe("not running")
        for (const st of STATUSES) expect(deckKeyStatusLabel(st)).toBe(st)
    })
})

/**
 * The two surfaces the deck fix left behind: Overview's cards/rail and the
 * terminal tab strip both painted the raw status, so the same restored session
 * that Mission called NOT RUNNING and the deck drew as a flat bar was still a
 * faint --clay dot two views away.
 *
 * Overview is one dot per session and calls `deckKeyStatus` directly (covered
 * above). A tab holds several panes, so it needs a reduction — and that
 * reduction is the only new logic, hence the only thing to pin here.
 */
describe("tabDotStatus", () => {
    const LIVE: AgentStatus[] = ["idle", "working", "waiting", "attention"]

    it("has no agent status at all for a tab of plain shells", () => {
        // The caller filters agent leaves, so an empty list IS a shell tab, and
        // "no agent in here" is not a state an agent can be in.
        expect(tabDotStatus([])).toBeNull()
    })

    it("passes a single pane's derived status straight through", () => {
        for (const st of ["idle", "working", "attention", "not-running"] as const) {
            expect(tabDotStatus([st])).toBe(st)
        }
    })

    it("says not-running only when EVERY pane in the tab is", () => {
        expect(tabDotStatus(["not-running", "not-running"])).toBe("not-running")
        // A dead pane split beside a live one: something IS running in this
        // tab, and the tab-level dot is a claim about the tab.
        expect(tabDotStatus(["not-running", "working"])).toBe("working")
        expect(tabDotStatus(["not-running", "attention"])).toBe("attention")
        expect(tabDotStatus(["not-running", "idle"])).toBe("idle")
    })

    it("keeps the strip's existing ladder for live panes", () => {
        expect(tabDotStatus(["idle", "working"])).toBe("working")
        expect(tabDotStatus(["working", "attention"])).toBe("attention")
        expect(tabDotStatus(["idle", "working", "attention"])).toBe("attention")
    })

    it("shows waiting as waiting - the gap the designer closed, now pinned open", () => {
        // This used to assert `idle`, pinning a KNOWN GAP: the tab strip showed
        // three forms and `waiting` fell through to the resting form of a live
        // agent. The ruling (see `tabDotStatus`) granted it, because the reason
        // for the gap - that the waiting mark BREATHED, so every finished turn
        // would animate a tab - stopped being true when that dot went static.
        // Pinned in the new direction so a future re-collapse is a deliberate
        // edit with a failing test, not an accident.
        expect(tabDotStatus(["waiting"])).toBe("waiting")
        expect(tabDotStatus(["waiting", "not-running"])).toBe("waiting")
        expect(tabDotStatus(["waiting", "idle"])).toBe("waiting")
    })

    it("ranks its panes in the same order the follow lists do", () => {
        // The ladder inside `tabDotStatus` and `missionTail`'s RANK are two
        // statements of one priority. A tab whose dot disagreed with the order
        // Mission and Overview sort by would be the same surface-disagreement
        // defect the derived status exists to prevent, so the two are asserted
        // equal rather than reviewed by eye. `not-running` is last and is the
        // one rank that also needs EVERY pane to hold it, which the pairs below
        // exercise from both sides.
        const ORDER: DeckKeyStatus[] = ["attention", "waiting", "working", "idle", "not-running"]
        expect([...ORDER].sort((a, b) => followRank(a) - followRank(b))).toEqual(ORDER)
        for (let i = 0; i < ORDER.length; i++) {
            for (let j = i + 1; j < ORDER.length; j++) {
                expect(tabDotStatus([ORDER[i], ORDER[j]])).toBe(ORDER[i])
                expect(tabDotStatus([ORDER[j], ORDER[i]])).toBe(ORDER[i])
            }
        }
    })

    it("never paints a live form for a tab with no live process", () => {
        // The anti-drift assertion, one level up: whatever the panes' statuses
        // were before they died, a tab of dead panes may not wear a form that
        // means alive. Composed through `deckKeyStatus` rather than by writing
        // "not-running" literals, so this fails if either half drifts.
        const dead: [number | undefined, "resume" | "restart" | undefined][] = [
            [undefined, "resume"],
            [undefined, "restart"],
            [0, undefined],
            [1, "restart"],
            [FASTFAIL, "restart"]
        ]
        for (const st of LIVE) {
            for (const [exitCode, held] of dead) {
                expect(hasProcess({ exitCode }, held)).toBe(false)
                expect(tabDotStatus([deckKeyStatus(st, exitCode, held)])).toBe("not-running")
            }
        }
    })
})

/**
 * The predicate the surfaces that hold a derived status ask, and the fifth
 * derivation it exists to prevent.
 *
 * The dot was only half of "a dead session reads as alive". The other half was
 * every surface that ACTS on one: the composer offered a restored session as a
 * send target and its `Idle` preset pre-selected it, the usage panel counted it
 * under "running now", the palette floated it to the top of the list with
 * "needs you" appended. Each of those asked its own question about the raw
 * status; this is the one answer they now share.
 */
describe("keyIsRunning", () => {
    const STATUSES: AgentStatus[] = ["idle", "working", "waiting", "attention"]

    it("is true for every live status and false for not-running", () => {
        for (const st of STATUSES) expect(keyIsRunning(st)).toBe(true)
        expect(keyIsRunning("not-running")).toBe(false)
    })

    it("agrees with hasProcess on every combination of the two facts", () => {
        // The anti-drift assertion. `hasProcess` is the predicate over the raw
        // facts and this is the same question one derivation later, so the two
        // may never disagree - a surface that picked either would otherwise be
        // choosing between two answers again.
        for (const st of STATUSES) {
            for (const exitCode of [undefined, 0, 1, FASTFAIL]) {
                for (const held of [undefined, "resume", "restart"] as const) {
                    expect(keyIsRunning(deckKeyStatus(st, exitCode, held))).toBe(
                        hasProcess({ exitCode }, held)
                    )
                }
            }
        }
    })
})

/**
 * The switcher card's counts, and the ruling they encode: a count excludes a
 * dead session and an acknowledged one, for two different reasons, and only the
 * dead one changes what the session IS.
 */
describe("projectSessionCounts", () => {
    const live = (s: AnySession): DeckKeyStatus => deckKeyStatus(s.status, undefined, undefined)
    const none: Record<string, true> = {}

    it("counts sessions and agents per project, dead ones included", () => {
        // `terms` and `agents` count what EXISTS. A restored session is a real,
        // reachable tab, and neither number claims anything is running - so
        // this is the one place a dead session must still be counted.
        const counts = projectSessionCounts(
            [
                sess({ termId: "a", projectId: "p1" }),
                sess({ termId: "sh", projectId: "p1", isAgent: false }),
                sess({ termId: "b", projectId: "p2" })
            ],
            (s) => deckKeyStatus(s.status, undefined, s.termId === "a" ? "resume" : undefined),
            none
        )
        expect(counts.p1).toEqual({ terms: 2, agents: 1, attention: 0 })
        expect(counts.p2).toEqual({ terms: 1, agents: 1, attention: 0 })
    })

    it("counts an asking session under attention", () => {
        const counts = projectSessionCounts(
            [sess({ termId: "a", projectId: "p1", status: "attention" })],
            live,
            none
        )
        expect(counts.p1.attention).toBe(1)
    })

    it("does not count a session whose process is gone", () => {
        // The reported defect: `s.status` is what the agent last did and it
        // outlives the process, so a project whose agents had all exited still
        // wore the asking marker on a card that is often the only thing on
        // screen for a project you are not looking at.
        const asking = [sess({ termId: "a", projectId: "p1", status: "attention" })]
        const dead: [number | undefined, "resume" | "restart" | undefined][] = [
            [undefined, "resume"],
            [undefined, "restart"],
            [0, undefined],
            [1, "restart"],
            [FASTFAIL, "restart"]
        ]
        for (const [exitCode, held] of dead) {
            const counts = projectSessionCounts(
                asking,
                (s) => deckKeyStatus(s.status, exitCode, held),
                none
            )
            expect(counts.p1.attention).toBe(0)
            // Still a session, and still an agent - only the nag is withdrawn.
            expect(counts.p1).toMatchObject({ terms: 1, agents: 1 })
        }
    })

    /**
     * The acknowledgement ruling, in one pair of assertions: a seen session
     * stops nagging and keeps its state.
     *
     * Both halves, because a regression in either direction is the same bug in
     * a different coat. Dropping the `seen` half puts the marker back on a
     * project you have already looked at; letting `seen` reach the STATUS is
     * the original defect - a glance that rewrote `attention` to `idle` erased
     * the `!` forever, which is why `ack` no longer touches status.
     */
    it("drops a seen session from the count while it keeps saying attention", () => {
        const asking = sess({ termId: "a", projectId: "p1", status: "attention" })
        const counts = projectSessionCounts([asking], live, { a: true })
        expect(counts.p1.attention).toBe(0)
        expect(counts.p1).toMatchObject({ terms: 1, agents: 1 })
        // The state, untouched by the acknowledgement: the dot on every surface
        // reads this, and it still says the session is asking.
        expect(live(asking)).toBe("attention")
        // And it is the `seen` fact doing it, not something about the session.
        expect(projectSessionCounts([asking], live, none).p1.attention).toBe(1)
    })

    it("counts a seen session again once a fresh bell arrives", () => {
        // `setStatus` clears `seen` on a new attention transition (store.ts),
        // so re-raising the nag is the store's job and this function only has
        // to read the fact honestly.
        const asking = sess({ termId: "a", projectId: "p1", status: "attention" })
        expect(projectSessionCounts([asking], live, {}).p1.attention).toBe(1)
    })

    it("counts nothing for a project with only shells", () => {
        const counts = projectSessionCounts(
            [sess({ termId: "sh", projectId: "p1", isAgent: false, status: "attention" })],
            live,
            none
        )
        expect(counts.p1).toEqual({ terms: 1, agents: 0, attention: 0 })
    })
})

/**
 * The deck bar's wants-you control. Its LAYOUT is not testable here (vitest is
 * `environment: "node"` and there are no component tests), but its grammar is:
 * the zero case renders nothing, and the singular is a real singular.
 */
describe("wantsYouLabel", () => {
    it("renders nothing at zero", () => {
        expect(wantsYouLabel(0)).toBeNull()
    })

    it("agrees with its own verb", () => {
        expect(wantsYouLabel(1)).toBe("1 wants you")
        expect(wantsYouLabel(2)).toBe("2 want you")
        expect(wantsYouLabel(11)).toBe("11 want you")
    })

    it("says nothing rather than printing an impossible count", () => {
        expect(wantsYouLabel(-1)).toBeNull()
        expect(wantsYouLabel(Number.NaN)).toBeNull()
    })
})
