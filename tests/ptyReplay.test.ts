import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
// `clearActed`: the act axis is a module Set inside the store, reset per
// session the same way the tail is - a case that leaked it into the next one
// would pass for the wrong reason.
import { useStore, clearActed } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { leaf } from "../src/renderer/src/layout"
import { forgetTail, getLastAt, isStalled, STALL_MS } from "../src/renderer/src/missionTail"

const TERM = "t-replay"
const BEL = "\x07"
/** What a shell emits when its pty is resized: erase the line, repaint it. */
const REDRAW = "\x1b[2K\r"
const CR = "\r"
const CRLF = "\r\n"

let ptyData: (e: { id: string; data: string; replay?: boolean }) => void = () => undefined

/** Only the namespaces this path touches, as in tests/visibilityGate.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: Record<string, unknown> }).window = {
        // `beep()` builds an AudioContext off `window`; without it the soft
        // signal throws on the way through the idle timer.
        AudioContext: class {
            createOscillator(): unknown {
                return { connect: () => undefined, frequency: {}, start: () => undefined, stop: () => undefined }
            }
            createGain(): unknown {
                return { connect: () => undefined, gain: {} }
            }
            get destination(): unknown {
                return {}
            }
            get currentTime(): number {
                return 0
            }
            close(): void {
                return undefined
            }
        },
        api: {
            pty: {
                onData: (fn: (e: { id: string; data: string; replay?: boolean }) => void): (() => void) => {
                    ptyData = fn
                    return (): void => undefined
                },
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (): void => undefined,
                buffer: async (): Promise<{ buffer: string; exitCode: number | undefined }> => ({
                    buffer: "",
                    exitCode: undefined
                })
            },
            notify: {
                state: async (): Promise<{ supported: boolean; error: string | null }> => ({
                    supported: true,
                    error: null
                }),
                attention: async (): Promise<{ supported: boolean; error: string | null }> => ({
                    supported: true,
                    error: null
                }),
                onActivate: (): (() => void) => (): void => undefined
            },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                }),
                setActive: async (): Promise<void> => undefined
            },
            workspace: {
                load: async () => ({ ok: false as const, reason: "missing" as const }),
                save: (): void => undefined
            },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

/** One agent session. `watching` decides whether `isVisible(TERM)` is true. */
function seed(watching: boolean): void {
    forgetTail(TERM)
    useStore.setState({
        view: watching ? "terminal" : "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: {},
        agentStatus: {},
        paneHold: {},
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: watching ? { p1: TERM } : {},
        notifications: [],
        activity: [],
        boardTasks: [],
        seen: {},
        answered: {}
    })
    clearActed(TERM)
}

/**
 * A REPLAYED chunk is not an event.
 *
 * Main replays a session's whole kept buffer when a pane re-attaches
 * (`pty:create` -> `getBuffer`, main/index.ts), so re-entering an agent's tab
 * delivers the transcript a second time. Every defect this file pins is the
 * renderer reading those bytes as something that just happened:
 *
 *   - an ANSWERED bell inside the replayed scrollback re-fired `hasBell` and
 *     flipped a hand-back to `attention`, summoning the user to an agent they
 *     had already answered - an attention false positive, which is worse in
 *     kind than the `WORKING` blip that came from the same cause;
 *   - main trims that buffer to the next line break, which can land INSIDE an
 *     OSC title sequence, so the BEL that TERMINATED a title arrived at the top
 *     of a replay with no opener in front of it and read as a bell of its own.
 *
 * The fix is a fact, not an inference: main knows a chunk is a replay and says
 * so (`replay: true` on the `pty:data` payload). The opposite failure mode - a
 * bell going missing because it happened to be in a replay - is pinned here
 * too, because these two are the whole point and they pull in opposite
 * directions.
 */
describe("a replayed chunk is not an event", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
        useSettings.setState({
            agentIdleMs: 50,
            notifications: { desktop: false, sound: false, waitingSound: false }
        })
    })

    beforeEach(() => {
        vi.useFakeTimers()
    })

    /**
     * The defect, exactly as it was reproduced: `["waiting","attention"]`.
     *
     * The question rang, the user answered it, the agent moved on and the turn
     * ended. Re-entering the tab then replayed the transcript - bell and all -
     * and the session announced a question that had been answered minutes ago.
     */
    it("does not raise attention for an answered bell that comes back in the replay", async () => {
        seed(false)
        const answered = "may I edit store.ts?" + BEL
        const afterwards = "ok, editing store.ts" + CRLF
        ptyData({ id: TERM, data: answered })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        useStore.getState().respondApproval(TERM, "y" + CR)
        ptyData({ id: TERM, data: afterwards })
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        // Re-enter the tab: the pane remounts, main replays the whole kept
        // buffer, and the remounted xterm refits, which resizes the pty and
        // makes the far end repaint.
        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: answered + afterwards, replay: true })
        ptyData({ id: TERM, data: REDRAW + "ok, editing store.ts" })

        // Was "attention", with a summons in the inbox for a question the user
        // had already answered.
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        expect(useStore.getState().notifications).toEqual([])
        vi.useRealTimers()
    })

    /**
     * The same class, one layer down. `BUFFER_CAP` trims main's buffer to the
     * next line break (pty.ts), and nothing makes that boundary respect an
     * escape sequence: a title set can be cut so that only `]0;my-project\x07`
     * survives into the replay. `hasBell` is stateful per session and correctly
     * reads that BEL as a real one - there is no opener in front of it - so a
     * bell nobody rang appeared out of a buffer trim.
     */
    it("does not manufacture a bell out of an OSC the buffer trim cut in half", async () => {
        seed(false)
        ptyData({ id: TERM, data: "\x1b]0;my-project" + BEL + "Ready for review." + CRLF })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: "]0;my-project" + BEL + "Ready for review." + CRLF, replay: true })

        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        expect(useStore.getState().notifications).toEqual([])
        vi.useRealTimers()
    })

    /**
     * The direction that must NOT be traded away, and the reason nothing is
     * lost by ignoring a replay's bells: the store's classifier is app-wide and
     * permanent (`init` subscribes once; main broadcasts every live chunk to the
     * window whether or not a pane is mounted), so a bell that rings while you
     * are in another tab is classified WHEN IT RINGS. The replay that follows on
     * re-attach is only ever a second showing of bytes already classified - and
     * it must not undo them either.
     */
    it("keeps a bell that rang while the pane was detached, through the re-attach replay", () => {
        seed(false)
        const question = "Do you want to proceed? [y/n]" + BEL
        ptyData({ id: TERM, data: question })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        expect(useStore.getState().notifications).toHaveLength(1)

        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: question, replay: true })
        ptyData({ id: TERM, data: REDRAW + "Do you want to proceed? [y/n]" })

        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        vi.useRealTimers()
    })

    /**
     * The other half of "must not swallow", and the case that rules out fixing
     * this with a time window or a burst count: the agent really does ask
     * something new, in a LIVE chunk, immediately after a replay.
     */
    it("still raises attention for a real bell that rings right after a replay", async () => {
        seed(false)
        const turn = "Refactored 4 files." + CRLF + "Ready for review." + CRLF
        ptyData({ id: TERM, data: turn })
        await vi.advanceTimersByTimeAsync(200)

        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: turn, replay: true })
        ptyData({ id: TERM, data: REDRAW + "Ready for review." })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        ptyData({ id: TERM, data: "may I run the tests?" + BEL })

        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        // No inbox row, because the jump above put the user ON this pane -
        // visibility gates the notification and never the classification (M4).
        expect(useStore.getState().notifications).toEqual([])
        vi.useRealTimers()
    })

    /**
     * The flag hardens the hand-back gate as well: a replay may not be the
     * first of the two chunks that prove "the output continued", whatever its
     * bytes happen to look like. Paired with the next case, which is the lane
     * the flag CANNOT reach.
     */
    it("does not let a replay bank the chunk a hand-back is promoted by", async () => {
        seed(false)
        const turn = "Refactored 4 files." + CRLF + "Ready for review." + CRLF
        ptyData({ id: TERM, data: turn })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: turn, replay: true })
        // One live chunk of genuinely new output is a repaint's worth of
        // evidence, not a resumed turn. If the replay had banked, this would
        // promote on its own.
        ptyData({ id: TERM, data: "reading store.ts" + CRLF })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        // And the second one still promotes, on the bar that was always there.
        ptyData({ id: TERM, data: "editing store.ts" + CRLF })
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        vi.useRealTimers()
    })

    /**
     * The silence clock, one field over from the bells above.
     *
     * `recordTail` stamps `lastAt` - "when this terminal last produced output" -
     * and it did so BEFORE the replay guard, so the same second showing of the
     * same bytes that must not ring a bell was refreshing the stall timer.
     * Glancing at a tab reset "silent for N" and cleared a STALLED chip, which
     * is the visibility-changes-classification defect this store is organised
     * against: whether you were looking may change a count or a form, never
     * what a session IS.
     *
     * A replay is not evidence the agent spoke. It carries no instant of its
     * own - main replays whatever it kept, which may be hours old - so there is
     * nothing in it to stamp.
     */
    it("does not let a replayed transcript postpone a stall", async () => {
        seed(false)
        const turn = "Refactored 4 files." + CRLF + "Ready for review." + CRLF
        const t0 = Date.now()
        ptyData({ id: TERM, data: turn })
        await vi.advanceTimersByTimeAsync(200)

        // Two minutes of silence on a live session a board card is waiting on.
        // The clock is moved rather than run so no unrelated interval fires;
        // `alive` and `awaited` are passed straight in - the fact under test is
        // `lastAt`, not the two gates around it.
        const later = t0 + STALL_MS + 1000
        vi.setSystemTime(later)
        expect(isStalled(getLastAt(TERM), true, true, later)).toBe(true)

        // Glance at the tab: the pane remounts and main replays the buffer.
        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: turn, replay: true })

        // Was false - the glance had rewritten `lastAt` to now.
        expect(isStalled(getLastAt(TERM), true, true, later)).toBe(true)
        vi.useRealTimers()
    })

    /**
     * The direction that must not be traded away, as everywhere else in this
     * file: real output really does reset the clock, and a stall that has been
     * answered has to clear.
     */
    it("still refreshes the silence clock for a live chunk", async () => {
        seed(false)
        const t0 = Date.now()
        ptyData({ id: TERM, data: "Ready for review." + CRLF })
        await vi.advanceTimersByTimeAsync(200)

        const later = t0 + STALL_MS + 1000
        vi.setSystemTime(later)
        expect(isStalled(getLastAt(TERM), true, true, later)).toBe(true)

        ptyData({ id: TERM, data: "reading store.ts" + CRLF })
        expect(getLastAt(TERM)).toBe(later)
        expect(isStalled(getLastAt(TERM), true, true, later)).toBe(false)
        vi.useRealTimers()
    })

    /**
     * Why `paneEcho`'s character comparison stays, rather than being replaced
     * by the flag. Main can only mark the chunk it RESENDS; the refit-repaint
     * that follows a remount, and the repaint a bare glance causes, are
     * genuinely live pty output - the far end really did write those bytes,
     * because the pane really did resize - and no flag from main can say
     * otherwise. Two glances inside one idle window is that lane with nothing
     * else covering it: no replay, no timer in between to re-arm the grace, and
     * the second repaint would spend what the first banked.
     */
    it("keeps WAITING across two glances in one idle window, with no replay involved", async () => {
        seed(false)
        ptyData({ id: TERM, data: "Ready for review." + CRLF })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: REDRAW + "Ready for review." })
        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: REDRAW + "Ready for review." })

        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        vi.useRealTimers()
    })
})
