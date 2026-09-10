import { describe, it, expect, beforeAll, vi } from "vitest"
import { useStore, SHELL } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { leaf } from "../src/renderer/src/layout"
import { getLastAt, forgetTail } from "../src/renderer/src/missionTail"

const TERM = "t-hold"

let ptyExit: (e: { id: string; exitCode: number; stale?: boolean }) => void = () => undefined
let ptyData: (e: { id: string; data: string }) => void = () => undefined

/** Only the namespaces this path touches, as in tests/exitRecord.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (fn: (e: { id: string; data: string }) => void): (() => void) => {
                    ptyData = fn
                    return (): void => undefined
                },
                onExit: (
                    fn: (e: { id: string; exitCode: number; stale?: boolean }) => void
                ): (() => void) => {
                    ptyExit = fn
                    return (): void => undefined
                },
                kill: (): void => undefined,
                input: (): void => undefined
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

    // The reordered bail: a plain shell must be RELEASED like any other pane,
    // but must never be accounted for - it costs nothing and has no agent id.
    it("releases a plain shell without stamping a launch", () => {
        seedSession()
        useStore.setState({ termAgents: { [TERM]: SHELL } })
        forgetTail(TERM)
        ptyExit({ id: TERM, exitCode: 1 })
        expect(useStore.getState().paneHold[TERM]).toBe("restart")
        useStore.getState().releaseHold(TERM)
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
        expect(getLastAt(TERM)).toBeUndefined()
    })
})

// I3: main flags an exit "stale" when the id had already been re-spawned
// before the dying process's exit landed - holding this pane would freeze a
// "process exited" bar over a session that is actually live.
describe("a stale exit for an id that has been re-spawned", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    it("does not hold the pane", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1, stale: true })
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })

    // Backstop for whatever the main-side guard misses: any output at all
    // means the id is alive right now, so the hold (and the exit record) must
    // not survive the first byte - placed ahead of the agent-only gate in
    // onPtyData, or a plain shell would never self-heal.
    it("self-heals on the next output even if a hold was set", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        expect(useStore.getState().paneHold[TERM]).toBe("restart")
        ptyData({ id: TERM, data: "$ " })
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })

    it("self-heals a plain shell too, not just an agent pane", () => {
        seedSession()
        useStore.setState({ termAgents: { [TERM]: SHELL } })
        ptyExit({ id: TERM, exitCode: 1 })
        expect(useStore.getState().paneHold[TERM]).toBe("restart")
        ptyData({ id: TERM, data: "$ " })
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })
})

// I1: a resumed/restarted agent must close its crashed run's usage event
// before opening a new one, or the dead gap between crash and resume gets
// billed twice - once as part of the stale event (left open until the pane
// eventually closes), once as part of the new event's own runtime.
describe("releasing a hold accounts for exactly one run at a time", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    it("closes the crashed run's event before opening the resumed one", () => {
        seedSession()
        useSettings.setState({ usageLog: [] })
        vi.useFakeTimers()
        try {
            vi.setSystemTime(1_000) // T0: original run starts
            useSettings.getState().logUsageStart(TERM, "claude", "p1", "/repo")
            vi.setSystemTime(5_000) // T1: crash
            ptyExit({ id: TERM, exitCode: 1 })
            vi.setSystemTime(9_000) // T2: user clicks Resume
            useStore.getState().releaseHold(TERM)
            vi.setSystemTime(20_000) // T3: pane finally closed
            useStore.getState().closePane(TERM)
        } finally {
            vi.useRealTimers()
        }
        const events = useSettings
            .getState()
            .usageLog.filter((e) => e.id === TERM)
            .sort((a, b) => a.startedAt - b.startedAt)
        expect(events).toHaveLength(2)
        // The crashed run ends when Resume is clicked (T2), not when the pane
        // is finally closed (T3) - otherwise it would double-count T1..T2.
        expect(events[0]).toMatchObject({ startedAt: 1_000, endedAt: 9_000 })
        expect(events[1]).toMatchObject({ startedAt: 9_000, endedAt: 20_000 })
    })
})
