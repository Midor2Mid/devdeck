import { describe, it, expect, beforeEach, vi } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { useSettings, type AgentPreset, type RunMode } from "../src/renderer/src/settings"
import { useConfirm } from "../src/renderer/src/confirm"

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
