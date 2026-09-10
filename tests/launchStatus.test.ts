import { describe, it, expect, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { forgetSignals } from "../src/renderer/src/agentSignals"
import { leaf } from "../src/renderer/src/layout"

/**
 * S5 of the 2026-09-09 verification: a session whose pty never speaks read
 * `WORKING`, with a pulsing dot, indefinitely.
 *
 * Every launch path wrote `agentStatus[termId] = "working"` at spawn time, so
 * the app opened by claiming activity it had no evidence for — and unlike the
 * glance blip nothing self-healed it: the reclassification to `waiting` is
 * armed by output, and there was none. qa watched it for 12s on the key and on
 * the Mission tile after a pty produced no bytes at all.
 *
 * `working` is a claim about the agent ("mid-turn", per tileState rule 8). At
 * launch DevDeck has one fact — a process was asked for — and no evidence
 * whatever about what it is doing. `idle` is the app's only no-claim status:
 * it wants nothing (`wantsYou` is false), it spends no accent, and its tile
 * says `QUIET <ago>` off the launch stamp `markLaunched` already records, which
 * is exactly the true statement — this session has been silent for that long.
 *
 * Per launch path, deliberately, the way tests/launchBaseline.test.ts is: FOUR
 * sites wrote the optimistic status, and the fourth is invisible to a grep for
 * `agentStatus:` because it mutates a copied record instead of spreading one -
 * so a single newTab test would have pinned a quarter of the defect.
 */

/** Only the namespaces a launch touches. */
function stubApi(): void {
    ;(globalThis as unknown as { window: Record<string, unknown> }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (): void => undefined
            },
            // CLI-declared attention signals (src/shared/attention.ts). Subscribed
            // unconditionally in init(), like onData, so a stub without it throws.
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
                load: async () => ({ ok: false as const, reason: "missing" as const }),
                save: (): void => undefined
            },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

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

/** Let the baseline read's promise chain settle so it cannot leak. */
async function settle(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

describe("a launched session claims nothing until its pty speaks", () => {
    beforeEach(() => {
        stubApi()
        seedProject()
    })

    it("does not read WORKING on the deck's + path", async () => {
        const termId = useStore.getState().newTab("claude") as string
        await settle()

        // Was "working": the pulsing clay dot, on a session that has produced
        // nothing and may never produce anything.
        expect(useStore.getState().agentStatus[termId]).not.toBe("working")
        expect(useStore.getState().agentStatus[termId]).toBe("idle")
        forgetSignals(termId)
    })

    it("does not read WORKING on the split path", async () => {
        const first = useStore.getState().newTab("claude") as string
        await settle()
        forgetSignals(first)

        useStore.getState().splitActive("row", "claude")
        const pane = useStore.getState().activePaneByProject.p1 as string
        expect(pane).not.toBe(first)
        await settle()

        expect(useStore.getState().agentStatus[pane]).toBe("idle")
        forgetSignals(pane)
    })

    it("does not read WORKING on the reopen-last-closed path", async () => {
        useStore.setState({
            tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf("t-old") }] } as never,
            activeTabByProject: { p1: "tab1" },
            closedSessions: [
                {
                    termId: "t-dead",
                    projectId: "p1",
                    tabId: "tab1",
                    tabName: "claude 1",
                    name: "claude 2",
                    agentId: "claude",
                    isAgent: true,
                    closedAt: Date.now()
                }
            ]
        })

        useStore.getState().reopenLastClosed()
        const pane = useStore.getState().activePaneByProject.p1 as string
        await settle()

        expect(useStore.getState().agentStatus[pane]).toBe("idle")
        forgetSignals(pane)
    })

    it("does not read WORKING on the workspace-preset path", async () => {
        // The fourth site, and the one a grep for `agentStatus:` misses: this
        // path mutates a copied record rather than spreading one, so it was
        // written in a different shape and had to be found by reading.
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

        expect(useStore.getState().agentStatus[pane]).toBe("idle")
        forgetSignals(pane)
    })

    it("leaves a plain shell out of agentStatus entirely", async () => {
        const termId = useStore.getState().newTab("shell") as string
        await settle()

        // Not `idle` either: a shell is not an agent, and a status for it would
        // put a plain terminal into every "which agents are running" count.
        expect(useStore.getState().agentStatus[termId]).toBeUndefined()
    })
})
