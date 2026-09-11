import { describe, it, expect, vi, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { leaf } from "../src/renderer/src/layout"
import { clearExit, recordExit } from "../src/renderer/src/termExit"
import { forgetTail, markLaunched, STALL_MS } from "../src/renderer/src/missionTail"
import { wantKind, wantRank } from "../src/renderer/src/tileState"

/**
 * THE COUNT AND THE CLICK SAY THE SAME THING.
 *
 * `wantsYou` counts a stall; `jumpToPending` filtered raw `waiting|attention`
 * and skipped anything acknowledged. So the deck bar's control rendered
 * "1 wants you", promised a door in its own tooltip, and answered the click
 * with "nothing to jump to". The interim fix made the control SAY that, which
 * was honest and incomplete: the count still promised something the click could
 * not deliver.
 *
 * Both now read one function (`wantKind`) over one assembly (`store.wantKinds`),
 * and this file asserts both directions of the agreement:
 *
 *   - the count must not promise a jump that does not exist, and
 *   - a jumpable session must not be skipped.
 *
 * Same seam as tests/seen.test.ts: the real store, a stubbed `window.api`.
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
                    return badgeAnswer
                }
            }
        }
    }
}

/** What the stubbed bridge was handed, and what it answered. */
const badgeCalls: { count: number; description: string }[] = []
let badgeAnswer: { supported: boolean; error: string | null } = { supported: true, error: null }

/** Two agent sessions in one project, in two tabs, with no process trouble. */
function seedPair(): void {
    for (const id of ["t1", "t2"]) {
        clearExit(id)
        forgetTail(id)
    }
    useStore.setState({
        seen: {},
        declared: {},
        paneHold: {},
        boardTasks: [],
        pipelineRun: null,
        activeId: "p1",
        projects: [{ id: "p1", path: "C:/p", name: "p" }] as never,
        termAgents: { t1: "claude", t2: "claude" },
        agentStatus: { t1: "idle", t2: "idle" },
        tabsByProject: {
            p1: [
                { id: "tab1", name: "one", root: leaf("t1") },
                { id: "tab2", name: "two", root: leaf("t2") }
            ]
        } as never,
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: { p1: "t1" }
    })
}

/**
 * Make `id` read as stalled: a board card in `doing` is waiting on it, and it
 * has been silent for longer than the threshold.
 *
 * Both halves are required, and that is the whole design of `isStalled` — quiet
 * and live alone would flag every agent that finished its turn.
 */
function stall(id: string, silentForMs = STALL_MS + 60_000): void {
    forgetTail(id)
    markLaunched(id, Date.now() - silentForMs)
    useStore.setState((s) => ({
        boardTasks: [
            ...s.boardTasks,
            { id: `card-${id}`, title: id, column: "doing", termId: id } as never
        ]
    }))
}

const activePane = (): string | undefined => useStore.getState().activePaneByProject.p1

describe("the wants-you count and the jump cannot disagree", () => {
    beforeEach(() => {
        vi.useRealTimers()
        stubApi()
        seedPair()
    })

    it("jumps to a stalled session it counted, instead of apologising for it", () => {
        // THE DIVERGENCE, as the user met it. The status underneath a stall is
        // the hand-back the agent last did, and looking at the pane
        // acknowledged THAT hand-back - so the old filter skipped the session
        // twice over, on `seen` and on a status a stall does not carry.
        stall("t1")
        useStore.setState({ agentStatus: { t1: "waiting", t2: "idle" }, seen: { t1: true } })

        expect(useStore.getState().wantsCount()).toBe(1)
        expect(useStore.getState().jumpToPending()).toBe(true)
        expect(activePane()).toBe("t1")
    })

    it("counts zero exactly when there is nothing to jump to", () => {
        // The invariant, stated over the worlds that used to break it. Each
        // entry is a seed and the count it must report; the jump must return
        // true for precisely the non-zero ones.
        const worlds: [string, () => void][] = [
            ["nothing wanting", () => undefined],
            [
                "a stall nobody has acknowledged",
                () => {
                    stall("t1")
                    useStore.setState({ agentStatus: { t1: "waiting", t2: "idle" } })
                }
            ],
            [
                "a stall over a session that never printed anything",
                () => {
                    // Status `idle`, which the old filter could never match:
                    // the session was dispatched a card and said nothing at
                    // all, so there was no hand-back to read.
                    stall("t1")
                }
            ],
            [
                "an acknowledged hand-back and nothing else",
                () => useStore.setState({ agentStatus: { t1: "waiting", t2: "idle" }, seen: { t1: true } })
            ],
            [
                "a question on a dead session",
                () => {
                    useStore.setState({ agentStatus: { t1: "attention", t2: "idle" } })
                    recordExit("t1", 1)
                }
            ],
            [
                "a stall on a session whose process is gone",
                () => {
                    stall("t1")
                    useStore.setState({ paneHold: { t1: "resume" } })
                }
            ]
        ]
        for (const [name, seed] of worlds) {
            seedPair()
            seed()
            const count = useStore.getState().wantsCount()
            const moved = useStore.getState().jumpToPending()
            expect(moved, `${name}: counted ${count} and moved ${moved}`).toBe(count > 0)
        }
    })

    it("still refuses to jump to an acknowledged hand-back", () => {
        // The fix must not widen the `seen` rule. A stall is the ONE thing
        // acknowledgement may not dim (nothing would ever clear it); a
        // hand-back you have looked at and left is still spent.
        useStore.setState({ agentStatus: { t1: "waiting", t2: "waiting" }, seen: { t1: true, t2: true } })

        expect(useStore.getState().wantsCount()).toBe(0)
        expect(useStore.getState().jumpToPending()).toBe(false)
    })

    it("takes the question before the stall, and the stall before the hand-back", () => {
        // The ladder, exercised through the store rather than asserted over
        // `wantRank` alone. A stall that is also asking is reported as the
        // question - one keystroke answers that, and nothing outranks it.
        stall("t1")
        useStore.setState({ agentStatus: { t1: "waiting", t2: "attention" } })
        expect(useStore.getState().wantsCount()).toBe(2)
        expect(useStore.getState().jumpToPending()).toBe(true)
        expect(activePane()).toBe("t2")

        seedPair()
        stall("t1")
        useStore.setState({ agentStatus: { t1: "waiting", t2: "waiting" } })
        expect(useStore.getState().jumpToPending()).toBe(true)
        expect(activePane()).toBe("t1")
    })

    it("takes the stall that has been silent longest", () => {
        // A stall's age is its own last output, not the visit stamp `ack`
        // deletes - otherwise an acknowledged stall sorts to 0, wins the jump
        // forever, and a second, older stall is never reachable.
        stall("t1", STALL_MS + 10_000)
        stall("t2", STALL_MS + 600_000)
        useStore.setState({ agentStatus: { t1: "waiting", t2: "waiting" }, seen: { t1: true, t2: true } })

        expect(useStore.getState().wantsCount()).toBe(2)
        expect(useStore.getState().jumpToPending()).toBe(true)
        expect(activePane()).toBe("t2")
    })

    it("never claims a move into a session with no tab behind it", () => {
        // `jumpToTerm` walks tabs and returns silently when it finds none, so
        // the old filter - which walked `agentStatus` - could report `true`
        // having moved nothing at all. The assembly is built from the tabs now.
        useStore.setState({ agentStatus: { ghost: "attention", t1: "idle", t2: "idle" } })

        expect(useStore.getState().wantsCount()).toBe(0)
        expect(useStore.getState().jumpToPending()).toBe(false)
        expect(activePane()).toBe("t1")
    })
})

describe("a declared hand-over can stall, and the stall does not spend it", () => {
    beforeEach(() => {
        vi.useRealTimers()
        stubApi()
        seedPair()
    })

    it("reports the stall while the declaration still stands", () => {
        // The ruling. A declaration is the agent's statement about its own
        // turn; `awaited` is DevDeck's own record that something is still
        // expected of it. Letting the hook silence the second would let an
        // agent mark its own homework - a card left in `doing` would go quiet
        // forever with nothing saying so.
        stall("t1")
        useStore.setState({
            agentStatus: { t1: "waiting", t2: "idle" },
            declared: { t1: { event: "Stop", state: "waiting", termId: "t1" } } as never,
            // Declared or not, a hand-back you looked at is acknowledged; the
            // stall is what survives that, and it is why this is not simply
            // the `waiting` case again.
            seen: { t1: true }
        })

        expect(useStore.getState().wantsCount()).toBe(1)
        expect(useStore.getState().jumpToPending()).toBe(true)
        expect(activePane()).toBe("t1")
        // Neither the status nor the declaration moved: only the user acting or
        // a newer declaration spends one, and a stall is neither.
        expect(useStore.getState().agentStatus.t1).toBe("waiting")
        expect(useStore.getState().declared.t1).toBeTruthy()
    })
})

describe("the want ladder agrees with the tile classifier", () => {
    // `wantRank`'s order is read off `resolveTileState`'s precedence (ASKING
    // rule 4, STALLED rule 5, WAITING rule 7). A private order inside the jump
    // is how two surfaces come to describe the same sessions differently, so
    // the two are checked against each other rather than each against a list.
    const base = {
        prompt: null,
        exitCode: undefined,
        changedCount: undefined,
        awaited: true,
        alive: true,
        held: undefined
    } as const
    const now = 1_000_000

    it("ranks asking above stalled above waiting", () => {
        const asking = { ...base, status: "attention" as const, lastAt: now - 10 }
        const stalled = { ...base, status: "waiting" as const, lastAt: now - STALL_MS - 1 }
        const waiting = { ...base, status: "waiting" as const, lastAt: now - 10 }

        expect(wantKind(asking, now)).toBe("attention")
        expect(wantKind(stalled, now)).toBe("stalled")
        expect(wantKind(waiting, now)).toBe("waiting")
        expect(wantRank("attention")).toBeLessThan(wantRank("stalled"))
        expect(wantRank("stalled")).toBeLessThan(wantRank("waiting"))
    })

    it("wants nothing from a session that is idle, working or dead", () => {
        expect(wantKind({ ...base, status: "idle", lastAt: now - 10 }, now)).toBeNull()
        expect(wantKind({ ...base, status: "working", lastAt: now - 10 }, now)).toBeNull()
        expect(
            wantKind({ ...base, status: "attention", lastAt: now - 10, exitCode: 0 }, now)
        ).toBeNull()
        expect(
            wantKind({ ...base, status: "attention", lastAt: now - 10, held: "resume" }, now)
        ).toBeNull()
    })
})

/**
 * THE TASKBAR BADGE IS THE SAME FACT, ON A SECOND CHANNEL.
 *
 * Q2's rule, and the one the desktop-notification fix of 2026-09-10
 * established: a second channel READS the count, it does not derive one. These
 * drive `syncBadge` through the real store, so what is asserted is the number
 * that actually leaves the renderer — not a scan saying the right function is
 * mentioned nearby.
 */
describe("the taskbar badge reads the wants-you count", () => {
    beforeEach(() => {
        vi.useRealTimers()
        badgeCalls.length = 0
        badgeAnswer = { supported: true, error: null }
        stubApi()
        seedPair()
        useStore.setState({ badgeState: null, activity: [] })
    })

    it("pushes the count and the control's own words, once per change", async () => {
        // Nothing wanting: it still pushes, because zero CLEARS the badge and
        // because that first call is how the app finds out whether this machine
        // has the overlay API at all.
        useStore.getState().syncBadge()
        await Promise.resolve()
        expect(badgeCalls).toEqual([{ count: 0, description: "" }])
        expect(useStore.getState().badgeState).toEqual({ supported: true, error: null })

        // Same count, nothing sent.
        useStore.getState().syncBadge()
        await Promise.resolve()
        expect(badgeCalls).toHaveLength(1)

        // One session wants you: the badge gets that number and the sentence
        // the control renders, from the control's own builder.
        useStore.setState({ agentStatus: { t1: "waiting", t2: "idle" } })
        useStore.getState().syncBadge()
        await Promise.resolve()
        expect(badgeCalls[1]).toEqual({ count: 1, description: "DevDeck — 1 wants you" })

        useStore.setState({ agentStatus: { t1: "waiting", t2: "attention" } })
        useStore.getState().syncBadge()
        await Promise.resolve()
        expect(badgeCalls[2]).toEqual({ count: 2, description: "DevDeck — 2 want you" })
        // The number pushed is the number the count reports, always.
        expect(badgeCalls[2].count).toBe(useStore.getState().wantsCount())
    })

    it("clears rather than drawing a zero when the last session stops wanting you", async () => {
        useStore.setState({ agentStatus: { t1: "attention", t2: "idle" } })
        useStore.getState().syncBadge()
        await Promise.resolve()
        expect(badgeCalls.at(-1)?.count).toBe(1)

        useStore.setState({ agentStatus: { t1: "idle", t2: "idle" } })
        useStore.getState().syncBadge()
        await Promise.resolve()
        expect(badgeCalls.at(-1)).toEqual({ count: 0, description: "" })
    })

    it("says so when the badge could not be set, once", async () => {
        // NEVER SILENT. An ambient signal that never appears is invisible by
        // nature - nothing changes, exactly as if no agent wanted you - and
        // that is the whole shape of the F9 notification bug. So a refusal
        // reaches the activity feed as well as the store.
        badgeAnswer = { supported: true, error: "the taskbar refused it" }
        useStore.setState({ agentStatus: { t1: "waiting", t2: "idle" } })
        useStore.getState().syncBadge()
        await Promise.resolve()
        await Promise.resolve()

        expect(useStore.getState().badgeState?.error).toBe("the taskbar refused it")
        const rows = useStore.getState().activity.filter((a) => a.label.includes("Taskbar badge"))
        expect(rows).toHaveLength(1)

        // A latched failure is retried on the next repaint (so one refusal
        // cannot suppress the badge forever), but it is not re-announced.
        useStore.getState().syncBadge()
        await Promise.resolve()
        await Promise.resolve()
        expect(badgeCalls.length).toBeGreaterThan(1)
        expect(
            useStore.getState().activity.filter((a) => a.label.includes("Taskbar badge"))
        ).toHaveLength(1)
    })

    it("says so when this system has no badge at all", async () => {
        // `supported: false` is not a failure - there is no taskbar to have
        // refused anything - so it must not read as an OS refusal. It still has
        // to be said once, or the count silently exists on one surface only.
        badgeAnswer = { supported: false, error: null }
        useStore.setState({ agentStatus: { t1: "waiting", t2: "idle" } })
        useStore.getState().syncBadge()
        await Promise.resolve()
        await Promise.resolve()

        expect(useStore.getState().badgeState).toEqual({ supported: false, error: null })
        expect(
            useStore.getState().activity.filter((a) => a.label.includes("taskbar badge"))
        ).toHaveLength(1)
    })

    it("survives a bridge that is not there, and reports that too", async () => {
        // It runs inside the deck bar's render effect: a throw here would take
        // the whole bar down, and swallowing it would be the silent failure.
        ;(globalThis as unknown as { window: { api: Record<string, unknown> } }).window.api.badge =
            undefined as never
        useStore.setState({ agentStatus: { t1: "waiting", t2: "idle" } })
        expect(() => useStore.getState().syncBadge()).not.toThrow()
        await Promise.resolve()
        expect(useStore.getState().badgeState?.supported).toBe(false)
        expect(useStore.getState().badgeState?.error).toBeTruthy()
    })
})
