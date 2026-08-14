import { describe, it, expect, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"

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
