import { describe, it, expect, beforeAll } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { exitCodeOf, clearExit } from "../src/renderer/src/termExit"
import { leaf } from "../src/renderer/src/layout"

const TERM = "t-exit"

/** The pty handlers the store registers in init() — the way into both streams. */
let ptyData: (e: { id: string; data: string }) => void = () => undefined
let ptyExit: (e: { id: string; exitCode: number }) => void = () => undefined

// at the top of the file, beside the other module-level captures
let sentInput: { id: string; data: string }[] = []

/** Only the namespaces this path touches, as in tests/cardReview.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (fn: (e: { id: string; data: string }) => void): (() => void) => {
                    ptyData = fn
                    return (): void => undefined
                },
                onExit: (fn: (e: { id: string; exitCode: number }) => void): (() => void) => {
                    ptyExit = fn
                    return (): void => undefined
                },
                kill: (): void => undefined,
                input: (id: string, data: string): void => {
                    sentInput.push({ id, data })
                }
            },
            // Desktop notifications are main's now (src/main/notify.ts); the
            // renderer only subscribes to a click on one. `init()` throws without
            // it, and these stubs are untyped casts, so nothing else would notice.
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
            // CLI-declared attention signals (src/shared/attention.ts). Subscribed
            // unconditionally in init(), like onData, so a stub without it throws.
            attention: { onDeclared: (): (() => void) => (): void => undefined },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                })
            },
            workspace: {
                // `Loaded<unknown>`: "missing" is a fresh install, which is what
                // these suites want. Returning null here would now leave the store
                // gated and silently non-persisting.
                load: async () => ({ ok: false as const, reason: "missing" as const }),
                save: (): void => undefined
            },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

/** One live agent session in one project, the way Mission would see it. */
function seedSession(): void {
    useStore.setState({
        view: "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: {},
        agentStatus: {},
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: {},
        notifications: [],
        activity: []
    })
}

describe("the exit code reaching the store", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    it("records the code the pty reported", () => {
        clearExit(TERM)
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        expect(exitCodeOf(TERM)).toBe(1)
    })

    // A pane re-run in place produces output again. The corpse has to stop
    // being a corpse, or the tile says EXITED over a live agent.
    it("clears the code once the session produces output again", () => {
        clearExit(TERM)
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        ptyData({ id: TERM, data: "back from the dead\n" })
        expect(exitCodeOf(TERM)).toBeUndefined()
    })

    it("clears the code when the session closes", () => {
        clearExit(TERM)
        seedSession()
        ptyExit({ id: TERM, exitCode: 0 })
        useStore.getState().closePane(TERM)
        expect(exitCodeOf(TERM)).toBeUndefined()
    })
})

describe("replying to a session from a tile", () => {
    it("sends the text plus one carriage return, once", () => {
        seedSession()
        sentInput = []
        useStore.getState().replySession(TERM, "use the other branch")
        expect(sentInput).toEqual([{ id: TERM, data: "use the other branch\r" }])
    })

    it("sends nothing for an empty or whitespace-only reply", () => {
        seedSession()
        sentInput = []
        useStore.getState().replySession(TERM, "   ")
        expect(sentInput).toEqual([])
    })

    it("trims the reply", () => {
        seedSession()
        sentInput = []
        useStore.getState().replySession(TERM, "  ship it  ")
        expect(sentInput).toEqual([{ id: TERM, data: "ship it\r" }])
    })
})
