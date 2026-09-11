import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { leaf } from "../src/renderer/src/layout"
import { clearExit } from "../src/renderer/src/termExit"
import { forgetTail, isStalled, markLaunched, stallsAt, STALL_MS } from "../src/renderer/src/missionTail"

/**
 * A STALL HAS TO REACH THE DECK AND THE TASKBAR BY ITSELF.
 *
 * The 2026-09-12 verification (§3) found the count and the click agreeing about
 * a real stall while the deck bar's control was ABSENT and the taskbar badge
 * with it: `MissionControl` has a `setInterval`, `DeckWants` has none, and a
 * stall is the one classification that arrives with no store write at all. The
 * flag appeared only when Ctrl+Shift+J happened to repaint the frame - i.e. the
 * badge failed at the single state it exists for, because that is the state in
 * which nobody is looking at the window.
 *
 * The fix is not a second interval. Mission already has one, and two clocks
 * sampling one fact is the defect class this codebase spent two weeks removing.
 * The crossing instead becomes what every other state change already is: a
 * store write (`stallEpoch`), armed by one alarm set for the exact instant
 * `wantKinds` could answer differently.
 *
 * This file drives that alarm through the store seam, which is the only seam
 * available - there are no component tests here. `deckRender()` below stands in
 * for the one thing the component does that matters: it asks for the count.
 */

function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (): void => undefined
            },
            attention: { onDeclared: (): (() => void) => (): void => undefined },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                }),
                setActive: async (): Promise<void> => undefined
            },
            workspace: {
                load: async () => ({ ok: false, reason: "missing" }),
                save: (): void => undefined
            },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] },
            badge: {
                set: async (p: { count: number; description: string }) => {
                    badgeCalls.push(p)
                    return { supported: true, error: null }
                }
            }
        }
    }
}

const badgeCalls: { count: number; description: string }[] = []

/** One agent session in one project, with a process behind it and nothing wrong. */
function seed(): void {
    clearExit("t1")
    forgetTail("t1")
    useStore.setState({
        seen: {},
        declared: {},
        paneHold: {},
        boardTasks: [],
        pipelineRun: null,
        stallEpoch: 0,
        activeId: "p1",
        projects: [{ id: "p1", path: "C:/p", name: "p" }] as never,
        termAgents: { t1: "claude" },
        agentStatus: { t1: "idle" },
        tabsByProject: { p1: [{ id: "tab1", name: "one", root: leaf("t1") }] } as never,
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: { p1: "t1" }
    })
}

/**
 * What `DeckWants` does on every render: ask for the count.
 *
 * Named rather than inlined because the arming of the alarm hangs off exactly
 * this call, and a reader has to be able to see that the test is not reaching
 * for a private hook the app never touches.
 */
const deckRender = (): number => useStore.getState().wantsCount()

/** A board card in `doing` naming this session - what makes it `awaited`. */
function dispatchCardTo(id: string): void {
    useStore.setState((s) => ({
        boardTasks: [
            ...s.boardTasks,
            { id: `card-${id}`, title: id, column: "doing", termId: id } as never
        ]
    }))
}

describe("stallsAt is the inverse of isStalled, not a second opinion about it", () => {
    // The alarm is armed off `stallsAt`; the answer is read off `isStalled`. If
    // those two ever disagreed about WHEN, the deck would wake at an instant at
    // which nothing had happened yet and go back to sleep - the original bug,
    // one millisecond wide. So the arithmetic is not restated here, it is
    // checked against the predicate itself.
    it("names the first instant at which the predicate flips", () => {
        const lastAt = 1_000_000
        const at = stallsAt(lastAt)
        expect(at).not.toBeNull()
        expect(isStalled(lastAt, true, true, (at as number) - 1)).toBe(false)
        expect(isStalled(lastAt, true, true, at as number)).toBe(true)
    })

    it("has nothing to schedule for a session that has never spoken", () => {
        // `lastAt` absent is the honest post-reload state, and `isStalled`
        // refuses to rule on it. So must the alarm - a made-up instant here
        // would wake the deck to read a stall the predicate will never report.
        expect(stallsAt(undefined)).toBeNull()
    })

    it("respects a non-default threshold on both sides", () => {
        const at = stallsAt(1_000_000, 5_000) as number
        expect(isStalled(1_000_000, true, true, at - 1, 5_000)).toBe(false)
        expect(isStalled(1_000_000, true, true, at, 5_000)).toBe(true)
    })
})

describe("a stall reaches the deck without anything else happening", () => {
    beforeEach(() => {
        badgeCalls.length = 0
        vi.useFakeTimers()
        stubApi()
        seed()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it("moves the epoch when the clock crosses, with no store write in between", () => {
        // THE REGRESSION, as QA met it. A card is dispatched to a live agent and
        // the agent then says nothing. Nothing is clicked, no status changes, no
        // slice moves. Before this fix the deck's four subscriptions all stayed
        // still and the control - and the badge riding its render effect - never
        // came back.
        markLaunched("t1", Date.now())
        dispatchCardTo("t1")
        expect(deckRender()).toBe(0)
        const before = useStore.getState().stallEpoch

        vi.advanceTimersByTime(STALL_MS + 1)

        expect(useStore.getState().stallEpoch).toBeGreaterThan(before)
        // And what the repaint will find is the stall itself.
        expect(deckRender()).toBe(1)
    })

    it("wakes at the crossing, not a second early and not a second late", () => {
        markLaunched("t1", Date.now())
        dispatchCardTo("t1")
        deckRender()

        vi.advanceTimersByTime(STALL_MS)
        expect(useStore.getState().stallEpoch).toBe(0)
        expect(deckRender()).toBe(0)

        vi.advanceTimersByTime(1)
        expect(useStore.getState().stallEpoch).not.toBe(0)
    })

    it("says nothing when the agent spoke before the crossing, and waits again", () => {
        // The alarm is armed off `lastAt`, which only ever moves LATER. So it
        // fires early on a chatty session - and that has to cost a comparison,
        // not a repaint: a store write here would be the deck flickering for a
        // stall that did not happen.
        markLaunched("t1", Date.now())
        dispatchCardTo("t1")
        deckRender()

        vi.advanceTimersByTime(STALL_MS - 1_000)
        // The agent speaks. `recordTail` stamps a module Map, not the store -
        // which is precisely why the alarm cannot be left to a subscription.
        forgetTail("t1")
        markLaunched("t1", Date.now())

        vi.advanceTimersByTime(1_001)
        expect(useStore.getState().stallEpoch).toBe(0)
        expect(deckRender()).toBe(0)
        // Re-armed on its way out rather than given up on.
        expect(vi.getTimerCount()).toBe(1)

        vi.advanceTimersByTime(STALL_MS)
        expect(useStore.getState().stallEpoch).not.toBe(0)
        expect(deckRender()).toBe(1)
    })

    it("fires once for one crossing and then disarms", () => {
        markLaunched("t1", Date.now())
        dispatchCardTo("t1")
        deckRender()

        vi.advanceTimersByTime(STALL_MS + 1)
        const at = useStore.getState().stallEpoch
        expect(at).not.toBe(0)

        // Ten more minutes of the same silence. The session is already stalled,
        // the answer cannot change again by the clock alone, and a timer still
        // running here would be the interval this design refuses to add.
        vi.advanceTimersByTime(10 * 60_000)
        expect(useStore.getState().stallEpoch).toBe(at)
        expect(vi.getTimerCount()).toBe(0)
    })
})

describe("what the clock costs when nothing is stalled", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        stubApi()
        seed()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it("arms no timer at all while nothing is waiting on any session", () => {
        // The claim, asserted rather than argued. An agent can be running, quiet
        // and acknowledged for a week; if no card and no pipeline step is
        // waiting on it, its silence is the normal resting state and this costs
        // one walk of an empty Set per deck render - no timer, and so no render.
        markLaunched("t1", Date.now() - 60 * 60_000)
        expect(vi.getTimerCount()).toBe(0)
        deckRender()
        deckRender()
        deckRender()
        expect(vi.getTimerCount()).toBe(0)
        vi.advanceTimersByTime(6 * 60 * 60_000)
        expect(useStore.getState().stallEpoch).toBe(0)
    })

    it("keeps exactly one alarm across repeated renders, and drops it with the card", () => {
        markLaunched("t1", Date.now())
        dispatchCardTo("t1")
        deckRender()
        expect(vi.getTimerCount()).toBe(1)
        // Re-arming for an instant already armed is a no-op, so a deck that
        // repaints on every keystroke does not churn timers.
        for (let i = 0; i < 20; i++) deckRender()
        expect(vi.getTimerCount()).toBe(1)

        // The card moves to review: nothing is waiting on the session any more,
        // so there is no crossing left to watch for.
        useStore.setState((s) => ({
            boardTasks: s.boardTasks.map((t) => ({ ...t, column: "review" }))
        }))
        deckRender()
        expect(vi.getTimerCount()).toBe(0)
    })
})
