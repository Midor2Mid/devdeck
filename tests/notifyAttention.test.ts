import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { useStore, clearActed } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { leaf } from "../src/renderer/src/layout"
import { forgetTail } from "../src/renderer/src/missionTail"

/**
 * The Desktop-notifications toggle, from the renderer's side.
 *
 * It had never delivered anything and had never said so: DevDeck's own
 * `setPermissionCheckHandler(() => false)` denies renderer notifications, and
 * Chromium answers a denied notification by constructing the object and
 * dropping it silently — measured 2026-09-10, and the reason `try/catch` around
 * `new Notification(...)` was the one signal that could not fire. The delivery
 * now goes to main over IPC (src/main/notify.ts).
 *
 * So the two things worth asserting are a PRESENCE and an ABSENCE: the IPC call
 * carries the same sentence the in-app inbox entry does, and the renderer
 * constructs no `Notification` of its own. A global spy records the second,
 * because a path that quietly does nothing cannot be told from a path that is
 * gone.
 */
const TERM = "t-notify"
const BEL = "\x07"

let ptyData: (e: { id: string; data: string }) => void = () => undefined
let activate: (termId: string) => void = () => undefined
let sent: { termId: string; body: string }[] = []
let constructedInRenderer = 0
/** What main answers `notify:attention` and `notify:state` with. */
let mainState = { supported: true, error: null as string | null }

function stubApi(): void {
    ;(globalThis as unknown as { window: Record<string, unknown> }).window = {
        // A recording constructor for the soft tier's beep, and nothing else -
        // this file is about the loud tier.
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
            notify: {
                state: async (): Promise<{ supported: boolean; error: string | null }> => mainState,
                attention: async (p: {
                    termId: string
                    body: string
                }): Promise<{ supported: boolean; error: string | null }> => {
                    sent.push(p)
                    return mainState
                },
                onActivate: (cb: (termId: string) => void): (() => void) => {
                    activate = cb
                    return (): void => undefined
                }
            },
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
    // The renderer path that never worked. If any of it comes back, this
    // records it and the absence assertions below fail.
    ;(globalThis as unknown as { Notification: unknown }).Notification = class {
        constructor() {
            constructedInRenderer++
        }
    }
}

/** One agent session. `watching` decides whether its pane is visible. */
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
        answered: {},
        notifyState: null
    })
    clearActed(TERM)
    sent = []
    constructedInRenderer = 0
    mainState = { supported: true, error: null }
}

/** Let the `.then` on the IPC promise run. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe("desktop notifications reach the user through main", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    beforeEach(() => {
        useSettings.setState({
            agentIdleMs: 50,
            notifications: { desktop: true, sound: false, waitingSound: true }
        })
    })

    it("sends the bell to main, and constructs no Notification in the renderer", () => {
        seed(false)
        ptyData({ id: TERM, data: "Do you want to proceed? [y/n]" + BEL })
        expect(sent).toHaveLength(1)
        expect(sent[0].termId).toBe(TERM)
        // The one sentence, one construction: the toast says exactly what the
        // in-app inbox entry raised by the same bell says.
        expect(sent[0].body).toBe(useStore.getState().notifications[0].text)
        expect(constructedInRenderer).toBe(0)
    })

    it("sends nothing when the toggle is off", () => {
        seed(false)
        useSettings.setState({
            notifications: { desktop: false, sound: false, waitingSound: true }
        })
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(sent).toEqual([])
        expect(useStore.getState().notifications).toHaveLength(1)
    })

    /**
     * The scoping the renderer path intended, unchanged: the loud tier only,
     * only a NEW question, and only when the session's pane is not the one in
     * front of you. Moving the delivery to main must not widen any of them.
     */
    it("sends nothing for a bell on the pane you are already looking at", () => {
        seed(true)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        expect(sent).toEqual([])
    })

    it("sends nothing for a second bell on a session already asking", () => {
        seed(false)
        ptyData({ id: TERM, data: "first question?" + BEL })
        expect(sent).toHaveLength(1)
        ptyData({ id: TERM, data: "still there?" + BEL })
        expect(sent).toHaveLength(1)
    })

    it("sends nothing for the soft tier - a session that merely handed back", async () => {
        seed(false)
        ptyData({ id: TERM, data: "Refactored 4 files. Ready for review." })
        await new Promise((r) => setTimeout(r, 120))
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        expect(sent).toEqual([])
    })

    /**
     * The honesty half. An attempt main could not make is recorded, so the
     * toggle in Settings stops reading `on` over a channel that delivers
     * nothing — which is the exact state this whole path was in until it was
     * measured.
     */
    it("records what main reports, so the toggle can stop claiming it works", async () => {
        seed(false)
        mainState = { supported: false, error: null }
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        await settle()
        expect(useStore.getState().notifyState).toEqual({ supported: false, error: null })
    })

    it("carries a Windows refusal back to the settings surface", async () => {
        seed(false)
        mainState = { supported: true, error: "Notification failed to show" }
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        await settle()
        expect(useStore.getState().notifyState?.error).toBe("Notification failed to show")
    })

    it("asks main whether notifications work here", async () => {
        seed(false)
        mainState = { supported: false, error: "no" }
        await useStore.getState().refreshNotifyState()
        expect(useStore.getState().notifyState).toEqual({ supported: false, error: "no" })
    })

    /**
     * Clicking the toast has to land on the session it named - that is the
     * product's promise ("which agent needs me"), not just "something
     * happened". Main raises the window and forwards the id; this is the
     * renderer half of that.
     */
    it("jumps to the session when a toast is clicked", () => {
        seed(false)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().seen[TERM]).toBeUndefined()
        activate(TERM)
        expect(useStore.getState().seen[TERM]).toBe(true)
        expect(useStore.getState().view).toBe("terminal")
    })
})
