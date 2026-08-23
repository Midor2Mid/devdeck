import { describe, it, expect, beforeAll } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { exitCodeOf, clearExit } from "../src/renderer/src/termExit"
import { leaf } from "../src/renderer/src/layout"

const TERM = "t-exit"

/** The pty handlers the store registers in init() — the way into both streams. */
let ptyData: (e: { id: string; data: string }) => void = () => undefined
let ptyExit: (e: { id: string; exitCode: number }) => void = () => undefined

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
                input: (): void => undefined
            },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                })
            },
            workspace: { load: async (): Promise<null> => null, save: (): void => undefined },
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
