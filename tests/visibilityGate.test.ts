import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { leaf } from "../src/renderer/src/layout"
import { forgetTail } from "../src/renderer/src/missionTail"

const TERM = "t-vis"
const BEL = "\x07"

let ptyData: (e: { id: string; data: string }) => void = () => undefined
let beeps = 0

/** Only the namespaces this path touches, as in tests/paneHold.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: Record<string, unknown> }).window = {
        // `beep()` builds an AudioContext off `window`; a recording constructor
        // is the only observable this soft signal has.
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
            constructor() {
                beeps++
            }
        },
        api: {
            pty: {
                onData: (fn: (e: { id: string; data: string }) => void): (() => void) => {
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
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                })
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
        boardTasks: []
    })
    beeps = 0
}

// M4: the state that caused the signal was destroyed by looking at it. The
// identical byte sequence from the identical agent produced a notification when
// you were in your browser and NO STATE CHANGE AT ALL when you were on the pane
// — so no user could reproduce, confirm, or falsify a DevDeck attention claim.
// Visibility now gates the notification only. These tests are the falsifiability
// the mechanism was missing.
describe("visibility gates the notification, not the classification", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
        useSettings.setState({ agentIdleMs: 50, notifications: { waitingSound: true } })
    })

    beforeEach(() => {
        vi.useFakeTimers()
    })

    it("marks a session you are WATCHING as waiting when it goes quiet", async () => {
        seed(true)
        ptyData({ id: TERM, data: "thinking..." })
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        await vi.advanceTimersByTimeAsync(200)
        // Was "idle" — the pane you were looking at recorded nothing at all.
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        vi.useRealTimers()
    })

    it("still withholds the sound for a pane you are already looking at", async () => {
        seed(true)
        ptyData({ id: TERM, data: "thinking..." })
        await vi.advanceTimersByTimeAsync(200)
        expect(beeps).toBe(0)
        vi.useRealTimers()
    })

    it("marks a background session as waiting AND makes the sound", async () => {
        seed(false)
        ptyData({ id: TERM, data: "thinking..." })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        expect(beeps).toBe(1)
        vi.useRealTimers()
    })

    it("records a bell from a session you are watching", () => {
        seed(true)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        // Was: no status change at all, so the tile said nothing had happened.
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        vi.useRealTimers()
    })

    it("does not raise an in-app notification for a bell you are looking at", () => {
        seed(true)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().notifications).toEqual([])
        vi.useRealTimers()
    })

    it("raises the notification for a bell you are not looking at", () => {
        seed(false)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        expect(useStore.getState().notifications).toHaveLength(1)
        vi.useRealTimers()
    })

    it("produces the same classification from the same bytes either way", () => {
        // The whole point, stated once: watched and unwatched must agree about
        // what the agent did, and differ only about whether you are told.
        seed(true)
        ptyData({ id: TERM, data: "question?" + BEL })
        const watched = useStore.getState().agentStatus[TERM]
        seed(false)
        ptyData({ id: TERM, data: "question?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe(watched)
        vi.useRealTimers()
    })
})
