import { describe, it, expect, beforeEach, vi } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { useSettings, type AgentPreset, type RunMode } from "../src/renderer/src/settings"
import { useConfirm } from "../src/renderer/src/confirm"
import { baselineOf, forgetSignals } from "../src/renderer/src/agentSignals"
import { getLastAt } from "../src/renderer/src/missionTail"

/** A minimal, valid AgentPreset — only the fields a given test cares about need overriding. */
function agentPreset(over: { id: string; name: string; runMode: RunMode }): AgentPreset {
    return {
        command: "claude",
        resumeArgs: "",
        badge: "",
        apiKeyEnv: "",
        model: "",
        modelEnv: "",
        icon: "",
        category: "",
        ...over
    }
}

// dispatchBoardTask must refuse rather than proceed when routing cannot name an
// agent (e.g. no AI-mode preset is configured). Before this fix it fell through
// to a confirm dialog reading "Start  on ..." with a blank name, and on confirm
// opened a bare shell tab, moved the card to "doing", and 2.8s later pasted the
// raw card title into that shell as a literal command.
describe("dispatchBoardTask with no AI-mode agent to route to", () => {
    beforeEach(() => {
        useSettings.setState({
            agents: [{ ...useSettings.getState().agents[0], id: "shell-only", runMode: "normal" }],
            routingRules: [],
            defaultAgentId: ""
        })
        useStore.setState({
            projects: [{ id: "p1", name: "P1", path: "/tmp/p1", addedAt: Date.now() }],
            boardTasks: [
                {
                    id: "t1",
                    projectId: "p1",
                    title: "Fix the login redirect",
                    column: "todo",
                    createdAt: Date.now()
                }
            ],
            activity: []
        })
    })

    it("refuses without opening the confirm dialog or moving the card", async () => {
        await useStore.getState().dispatchBoardTask("t1", { worktree: false })

        const task = useStore.getState().boardTasks.find((t) => t.id === "t1")
        expect(task?.column).toBe("todo")
        expect(task?.termId).toBeUndefined()

        const activity = useStore.getState().activity
        expect(activity[0]?.kind).toBe("attention")
        expect(activity[0]?.label).toMatch(/no ai agent preset/i)
    })
})

// The invariant Task 4 spent a whole fix round establishing: routing only ever
// targets an AI-mode preset. Its correctness rests on dispatchBoardTask's own
// aiAgents filter staying in step with what routeAgent is handed - these two
// tests are the coverage that invariant had none of before this fix pass.
describe("dispatchBoardTask with a rule targeting a normal-mode preset", () => {
    beforeEach(() => {
        useConfirm.setState({ current: null })
        useSettings.setState({
            agents: [
                agentPreset({ id: "shell", name: "Shell Preset", runMode: "normal" }),
                agentPreset({ id: "claude-ai", name: "Claude", runMode: "agent" })
            ],
            // "always" would fire on any card - but its target is normal-mode, so
            // routeAgent must skip it exactly like a rule naming a deleted agent.
            routingRules: [{ id: "r1", enabled: true, kind: "always", pattern: "", agentId: "shell" }],
            defaultAgentId: ""
        })
        useStore.setState({
            projects: [{ id: "p1", name: "P1", path: "/tmp/p1", addedAt: Date.now() }],
            boardTasks: [
                {
                    id: "t1",
                    projectId: "p1",
                    title: "Fix the login redirect",
                    column: "todo",
                    createdAt: Date.now()
                }
            ],
            activity: []
        })
    })

    it("skips the rule and falls through to the AI-mode agent, not the normal-mode target", async () => {
        const dispatched = useStore.getState().dispatchBoardTask("t1", { worktree: false })
        await vi.waitFor(() => expect(useConfirm.getState().current).not.toBeNull())

        // The confirm dialog names whichever agent will actually run - if the rule's
        // normal-mode target were trusted, this would read "Start Shell Preset on...".
        const message = useConfirm.getState().current?.message ?? ""
        expect(message).toContain("Claude")
        expect(message).not.toContain("Shell Preset")

        useConfirm.getState().answer(false) // cancel - no spawn, no worktree created
        await dispatched

        const task = useStore.getState().boardTasks.find((t) => t.id === "t1")
        expect(task?.column).toBe("todo")
        expect(task?.termId).toBeUndefined()
    })
})

describe("dispatchBoardTask with opts.agentId naming a normal-mode preset", () => {
    beforeEach(() => {
        useConfirm.setState({ current: null })
        useSettings.setState({
            agents: [
                agentPreset({ id: "shell", name: "Shell Preset", runMode: "normal" }),
                agentPreset({ id: "claude-ai", name: "Claude", runMode: "agent" })
            ],
            routingRules: [],
            defaultAgentId: "claude-ai"
        })
        useStore.setState({
            projects: [{ id: "p1", name: "P1", path: "/tmp/p1", addedAt: Date.now() }],
            boardTasks: [
                {
                    id: "t1",
                    projectId: "p1",
                    title: "Fix the login redirect",
                    column: "todo",
                    createdAt: Date.now()
                }
            ],
            activity: []
        })
    })

    it("does not trust a normal-mode opts.agentId and falls through to the router instead", async () => {
        // The board's override menu only ever offers AI-mode presets today, so this
        // caller doesn't exist yet - but the trust check must not rely on that being
        // true forever, only on the same AI-mode subset routeAgent itself uses.
        const dispatched = useStore
            .getState()
            .dispatchBoardTask("t1", { worktree: false, agentId: "shell" })
        await vi.waitFor(() => expect(useConfirm.getState().current).not.toBeNull())

        const message = useConfirm.getState().current?.message ?? ""
        expect(message).toContain("Claude")
        expect(message).not.toContain("Shell Preset")

        useConfirm.getState().answer(false)
        await dispatched
    })
})

// The wiring the whole-branch review found untested: dispatch is the ONLY path
// that writes task.termId, so it is the only launch the card's evidence
// baseline is ever read against. Commenting the capture out left every suite
// green - the card then compared a later `git status` against nothing, and
// "unknown" meant no card could advance at all.
describe("dispatching a card", () => {
    /** Only the namespaces the dispatch path touches. */
    function stubApi(dirty: string[]): void {
        ;(globalThis as unknown as { window: unknown }).window = {
            api: {
                projects: { setActive: async (): Promise<void> => undefined },
                git: { changes: async (): Promise<{ path: string }[]> => dirty.map((path) => ({ path })) },
                pty: {
                    // `buffer` is what whenReady falls back to on its deadline:
                    // an empty one means the session never spoke.
                    buffer: async (): Promise<{ buffer: string; exitCode: number | undefined }> => ({
                        buffer: "",
                        exitCode: undefined
                    }),
                    input: (): void => undefined, kill: (): void => undefined
                },
                workspace: { save: (): void => undefined },
                settings: { save: (): void => undefined },
                ledger: { append: (): void => undefined }
            }
        }
    }

    beforeEach(() => {
        useConfirm.setState({ current: null })
        stubApi(["already-dirty.ts"])
        useSettings.setState({
            agents: [agentPreset({ id: "claude-ai", name: "Claude", runMode: "agent" })],
            routingRules: [],
            defaultAgentId: "claude-ai",
            usageLog: []
        })
        useStore.setState({
            activeId: "p1",
            projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
            tabsByProject: {},
            termAgents: {},
            termCwd: {},
            boardTasks: [
                {
                    id: "t1",
                    projectId: "p1",
                    title: "Fix the login redirect",
                    column: "todo",
                    createdAt: Date.now()
                }
            ],
            activity: []
        })
    })

    it("captures the baseline for the session it stamps on the card", async () => {
        const dispatched = useStore.getState().dispatchBoardTask("t1", { worktree: false })
        await vi.waitFor(() => expect(useConfirm.getState().current).not.toBeNull())
        useConfirm.getState().answer(true)

        await vi.waitFor(() =>
            expect(useStore.getState().boardTasks.find((t) => t.id === "t1")?.column).toBe("doing")
        )
        const termId = useStore.getState().boardTasks.find((t) => t.id === "t1")?.termId
        expect(termId).toBeTruthy()

        // Fire-and-forget, so it lands a tick after the card does.
        await vi.waitFor(() => expect(baselineOf(termId!)).toBeDefined())
        // The dirt that was already there must be IN the baseline - that is the
        // whole point of taking one. Without it the first quiet spell reads
        // already-dirty.ts as the agent's work and files the card.
        expect(baselineOf(termId!)).toEqual(new Set(["already-dirty.ts"]))

        // The stall clock is stamped too: launch is when silence starts being
        // measurable, whether or not this session is ever a card's.
        expect(getLastAt(termId!)).toBeTruthy()

        forgetSignals(termId!)
        await dispatched
    })
})
