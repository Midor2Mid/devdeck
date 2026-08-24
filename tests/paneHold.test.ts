import { describe, it, expect, beforeAll } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { leaf } from "../src/renderer/src/layout"
import { getLastAt, forgetTail } from "../src/renderer/src/missionTail"

const TERM = "t-hold"

let ptyExit: (e: { id: string; exitCode: number }) => void = () => undefined

/** Only the namespaces this path touches, as in tests/exitRecord.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
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

function seedSession(): void {
    useStore.setState({
        view: "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: {},
        agentStatus: {},
        paneHold: {},
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: {},
        notifications: [],
        activity: []
    })
}

describe("a pane held after its process dies", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    it("is held for restart when the pty exits", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        expect(useStore.getState().paneHold[TERM]).toBe("restart")
    })

    // A clean exit is still an exit: the pane must not silently respawn.
    it("is held on a clean exit too", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 0 })
        expect(useStore.getState().paneHold[TERM]).toBe("restart")
    })

    it("releases the hold when the pane is restarted", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        useStore.getState().releaseHold(TERM)
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })

    it("forgets the hold when the pane is closed", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        useStore.getState().closePane(TERM)
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })

    // The accounting invariant: a restarted agent is new money, and the ledger
    // answers exclusivity from usageLog - an unlogged run lets every overlapping
    // card and pipeline be written as an exclusive receipt over money partly its.
    // markLaunched stamps the session on exactly that path, so its timestamp is
    // the observable proof the accounting ran.
    it("stamps the launch when an agent pane is released", () => {
        seedSession()
        forgetTail(TERM)
        ptyExit({ id: TERM, exitCode: 1 })
        expect(getLastAt(TERM)).toBeUndefined()
        useStore.getState().releaseHold(TERM)
        expect(getLastAt(TERM)).toBeDefined()
    })

    it("does nothing for a pane that is not held", () => {
        seedSession()
        expect(() => useStore.getState().releaseHold(TERM)).not.toThrow()
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })
})
