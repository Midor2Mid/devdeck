import { describe, it, expect, beforeEach } from "vitest"
import { useStore, SHELL } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { leaf, splitLeaf, collectLeaves } from "../src/renderer/src/layout"
import type { Project } from "../src/preload/index"
import { useToasts } from "../src/renderer/src/toast"

const PROJECT: Project = { id: "p1", name: "proj", path: "D:/proj", addedAt: 0 }

let killed: string[] = []
let created: { id: string; initialCommand?: string; cwd: string }[] = []

/** Only the namespaces this path touches, as in tests/exitRecord.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
                onExit: (): (() => void) => (): void => undefined,
                kill: (id: string): void => {
                    killed.push(id)
                },
                create: (opts: { id: string; initialCommand?: string; cwd: string }): void => {
                    created.push(opts)
                },
                input: (): void => undefined,
                resize: (): void => undefined
            },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: { setActive: (): void => undefined },
            workspace: { save: (): void => undefined },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined },
            rec: { stop: async (): Promise<null> => null }
        }
    }
}

/** One project with one tab holding two panes: an agent and a shell. */
function seed(): void {
    useStore.setState({
        projects: [PROJECT],
        activeId: PROJECT.id,
        tabsByProject: {
            [PROJECT.id]: [
                { id: "tab-1", name: "claude", root: splitLeaf(leaf("A"), "A", "row", "B") }
            ]
        },
        activeTabByProject: { [PROJECT.id]: "tab-1" },
        activePaneByProject: { [PROJECT.id]: "A" },
        termAgents: { A: "claude", B: SHELL },
        termNames: {},
        termCwd: {},
        termShells: {},
        termInit: {},
        closedSessions: []
    })
}

describe("closing a session records an undo entry", () => {
    beforeEach(() => {
        killed = []
        created = []
        stubApi()
        seed()
    })

    it("remembers the pane it just killed", () => {
        useStore.getState().closePane("A")
        const ring = useStore.getState().closedSessions
        expect(killed).toEqual(["A"])
        expect(ring).toHaveLength(1)
        expect(ring[0]).toMatchObject({
            termId: "A",
            projectId: PROJECT.id,
            tabId: "tab-1",
            agentId: "claude",
            isAgent: true
        })
    })

    it("carries the shell's own kind and cwd, not the project default", () => {
        useStore.setState({
            termShells: { B: "gitbash" },
            termCwd: { B: "D:/proj/../worktree" }
        })
        useStore.getState().closePane("B")
        expect(useStore.getState().closedSessions[0]).toMatchObject({
            termId: "B",
            isAgent: false,
            shellKind: "gitbash",
            cwd: "D:/proj/../worktree"
        })
    })

    it("keeps the session's renamed label rather than the tab's", () => {
        useStore.setState({ termNames: { A: "the important one" } })
        useStore.getState().closePane("A")
        expect(useStore.getState().closedSessions[0].name).toBe("the important one")
    })
})

describe("reopenLastClosed", () => {
    beforeEach(() => {
        killed = []
        created = []
        stubApi()
        seed()
        useSettings.setState({
            agents: [
                {
                    id: "claude",
                    name: "Claude",
                    command: "claude",
                    resumeArgs: "--continue",
                    runMode: "agent",
                    badge: "C",
                    apiKeyEnv: "",
                    model: "",
                    modelEnv: "",
                    icon: "",
                    category: ""
                }
            ]
        })
    })

    it("puts the pane back in the tab it came from", () => {
        useStore.getState().closePane("A")
        expect(collectLeaves(useStore.getState().tabsByProject[PROJECT.id][0].root)).toEqual(["B"])

        useStore.getState().reopenLastClosed()
        const panes = collectLeaves(useStore.getState().tabsByProject[PROJECT.id][0].root)
        expect(panes).toHaveLength(2)
        // A new terminal id: the pty is dead, so this is a reopen, not a revival.
        expect(panes).not.toContain("A")
    })

    it("reopens an agent with its resume command", () => {
        useStore.getState().closePane("A")
        useStore.getState().reopenLastClosed()
        const reborn = collectLeaves(useStore.getState().tabsByProject[PROJECT.id][0].root).find(
            (id) => id !== "B"
        )!
        expect(useStore.getState().termAgents[reborn]).toBe("claude")
        expect(useStore.getState().termInit[reborn]).toBe("claude --continue")
    })

    it("consumes the entry, so a second undo does not reopen it twice", () => {
        useStore.getState().closePane("A")
        useStore.getState().reopenLastClosed()
        expect(useStore.getState().closedSessions).toHaveLength(0)
        const before = collectLeaves(useStore.getState().tabsByProject[PROJECT.id][0].root).length
        useStore.getState().reopenLastClosed()
        expect(collectLeaves(useStore.getState().tabsByProject[PROJECT.id][0].root)).toHaveLength(
            before
        )
    })

    it("makes a new tab when the original tab is gone", () => {
        // Closing both panes removes the tab entirely.
        useStore.getState().closePane("A")
        useStore.getState().closePane("B")
        expect(useStore.getState().tabsByProject[PROJECT.id]).toHaveLength(0)

        useStore.getState().reopenLastClosed()
        const tabs = useStore.getState().tabsByProject[PROJECT.id]
        expect(tabs).toHaveLength(1)
        expect(collectLeaves(tabs[0].root)).toHaveLength(1)
    })

    it("does nothing when nothing has been closed", () => {
        useStore.getState().reopenLastClosed()
        expect(useStore.getState().tabsByProject[PROJECT.id]).toHaveLength(1)
        expect(created).toEqual([])
    })
})

// Undo used to belong to the VIEW, not to the close: Tabs had it, Overview and
// Canvas did not - and those two are the cross-project surfaces the product is
// sold on. The safe closer now owns the default name, so a view gets undo by
// doing nothing special, and losing it takes an explicit `closePaneSilent`.
describe("undo belongs to the close, not to the view", () => {
    beforeEach(() => {
        killed = []
        created = []
        useToasts.setState({ toasts: [] })
        stubApi()
        seed()
    })

    it("offers an undo for the ordinary close every view now calls", () => {
        useStore.getState().closePane("A")
        const t = useToasts.getState().toasts
        expect(t).toHaveLength(1)
        expect(t[0].actionLabel).toBe("Undo")
        // And the offer is real: taking it puts the pane back in its tab.
        expect(collectLeaves(useStore.getState().tabsByProject[PROJECT.id][0].root)).toEqual(["B"])
        t[0].onAction!()
        expect(collectLeaves(useStore.getState().tabsByProject[PROJECT.id][0].root)).toHaveLength(2)
    })

    it("names the session in the toast, so it is clear what came back", () => {
        useStore.setState({ termNames: { A: "the important one" } })
        useStore.getState().closePane("A")
        expect(useToasts.getState().toasts[0].text).toContain("the important one")
    })

    it("stays silent for the closes that must not offer one", () => {
        // The multi-pane tab close: an undo that restored one of three would lie.
        useStore.getState().closePaneSilent("A")
        expect(useToasts.getState().toasts).toEqual([])
        // The pane is still recorded, so a later reopen is possible - the only
        // thing withheld is the offer.
        expect(useStore.getState().closedSessions).toHaveLength(1)
    })
})
