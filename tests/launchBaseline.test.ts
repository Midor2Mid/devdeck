import { describe, it, expect, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { baselineOf, forgetSignals } from "../src/renderer/src/agentSignals"
import { leaf } from "../src/renderer/src/layout"

/**
 * Finding 1 of the 2026-09-09 verification: the conflict map was dark on the
 * launch path everyone uses.
 *
 * `captureBaseline` had exactly two callers and both were the board-dispatch
 * path, on the argument that a baseline for any other session was "a baseline
 * nothing could ever consult". `buildOwnership` consults every agent session's
 * baseline now, so that argument is false: a session started from the deck's
 * `+` got none, `newPathsSince` honestly reported no evidence, and Mission's
 * IN-FLIGHT CHANGES section hid itself. qa watched six deck-launched agents in
 * one working tree, two of which created a file after all six had started, and
 * Mission said nothing through three polls over 40 seconds.
 *
 * These tests are per launch path, deliberately: the previous fix was pinned by
 * a JSDoc sentence, and four of the five paths were the ones it missed.
 */

const DIRTY = ["README.md", "package.json"]

/** Only the namespaces a launch touches. `git.changes` is the baseline read. */
function stubApi(): void {
    ;(globalThis as unknown as { window: Record<string, unknown> }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (): void => undefined
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
            git: { changes: async (): Promise<{ path: string }[]> => DIRTY.map((path) => ({ path })) }
        }
    }
}

/** One project, already dirty - the precondition of the whole feature. */
function seedProject(): void {
    useStore.setState({
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "C:/repo", addedAt: Date.now() }],
        tabsByProject: {},
        activeTabByProject: {},
        activePaneByProject: {},
        termAgents: {},
        termCwd: {},
        termNames: {},
        termShells: {},
        termInit: {},
        agentStatus: {},
        paneHold: {},
        closedSessions: [],
        activity: []
    })
}

/** Let `captureBaseline`'s promise chain settle. */
async function settle(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

describe("every agent launch path records the dirty set it inherited", () => {
    beforeEach(() => {
        stubApi()
        seedProject()
    })

    it("captures a baseline for a session started from the deck's +", async () => {
        const termId = useStore.getState().newTab("claude")
        expect(termId).toBeTruthy()
        await settle()

        // Not "some files": the exact set the tree was dirty with when this
        // session started, which is what makes a later file NEW.
        expect([...(baselineOf(termId as string) ?? [])].sort()).toEqual([...DIRTY].sort())
        forgetSignals(termId as string)
    })

    it("does not capture one for a plain shell tab", async () => {
        const termId = useStore.getState().newTab("shell")
        await settle()

        // A shell is not an agent and owns nothing; a baseline for it would put
        // the user's own editing into the ownership map.
        expect(baselineOf(termId as string)).toBeUndefined()
    })

    it("captures a baseline for a session opened by splitting a pane", async () => {
        const first = useStore.getState().newTab("claude") as string
        await settle()
        forgetSignals(first)

        useStore.getState().splitActive("row", "claude")
        const pane = useStore.getState().activePaneByProject.p1 as string
        expect(pane).not.toBe(first)
        await settle()

        expect(baselineOf(pane)).toBeDefined()
        forgetSignals(pane)
    })

    it("captures a baseline for a session restored from a workspace preset", async () => {
        // Presets live in the settings store; drive the real path with one.
        const { useSettings } = await import("../src/renderer/src/settings")
        useSettings.setState({
            workspacePresets: [
                {
                    id: "wp1",
                    projectId: "p1",
                    name: "two agents",
                    tabs: [{ name: "claude 1", root: { kind: "leaf", agentId: "claude" } }]
                }
            ] as never
        })

        useStore.getState().openWorkspacePreset("wp1")
        const pane = useStore.getState().activePaneByProject.p1 as string
        await settle()

        expect(baselineOf(pane)).toBeDefined()
        forgetSignals(pane)
    })

    it("captures a baseline when a restored session is finally started", async () => {
        // The resume path: the pane exists from a previous run with nothing
        // behind it, and `releaseHold` is what actually starts the agent. Its
        // baselines died with the process, so this is the only chance to take
        // one.
        useStore.setState({
            termAgents: { t9: "claude" },
            paneHold: { t9: "resume" },
            tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf("t9") }] } as never,
            activeTabByProject: { p1: "tab1" },
            activePaneByProject: { p1: "t9" }
        })

        useStore.getState().releaseHold("t9")
        await settle()

        expect(baselineOf("t9")).toBeDefined()
        forgetSignals("t9")
    })

    it("does not re-baseline a session that already has one", async () => {
        // A restart reuses the termId, and the evidence the session has already
        // accumulated must survive it - overwriting here would re-inherit the
        // files this session created and make a real conflict silent.
        useStore.setState({
            termAgents: { t8: "claude" },
            paneHold: { t8: "restart" },
            tabsByProject: { p1: [{ id: "tab2", name: "claude 2", root: leaf("t8") }] } as never,
            activeTabByProject: { p1: "tab2" },
            activePaneByProject: { p1: "t8" }
        })
        useStore.getState().releaseHold("t8")
        await settle()
        const first = baselineOf("t8")
        expect(first).toBeDefined()

        // It crashed and was restarted, and the tree is dirtier now.
        useStore.setState({ paneHold: { t8: "restart" } })
        useStore.getState().releaseHold("t8")
        await settle()

        expect(baselineOf("t8")).toBe(first)
        forgetSignals("t8")
    })
})
