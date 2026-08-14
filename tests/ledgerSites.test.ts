import { describe, it, expect, beforeEach, vi } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { useConfirm } from "../src/renderer/src/confirm"
import { leaf } from "../src/renderer/src/layout"
import type { RunRecord } from "../src/main/ledger"
import type { Entrant, Race } from "../src/renderer/src/race"

// The four write sites of the run ledger. These are money paths: every
// assertion here is about a number a user could later add up, so the tests
// care as much about `exclusive` (may this cost be summed?) as about `cost`.

let appended: RunRecord[] = []

/** The slice of window.api the write sites touch. `over` replaces whole namespaces. */
function stubApi(over: Record<string, unknown> = {}): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            ledger: {
                append: (rec: RunRecord): void => {
                    appended.push(rec)
                },
                read: async (): Promise<RunRecord[]> => [],
                clear: async (): Promise<void> => undefined
            },
            usage: {
                window: async (): Promise<Record<string, number | string>> => ({
                    label: "",
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheCreate: 0,
                    tokens: 500,
                    cost: 1.25
                })
            },
            workspace: { save: (): void => undefined },
            settings: { save: (): void => undefined },
            projects: { setActive: async (): Promise<void> => undefined },
            pty: { kill: (): void => undefined, input: (): void => undefined },
            git: {
                status: async (): Promise<{ changes: number }> => ({ changes: 0 }),
                changes: async (): Promise<{ path: string }[]> => [],
                landFrom: async (): Promise<{ ok: boolean }> => ({ ok: true }),
                worktreeRemove: async (): Promise<{ ok: boolean }> => ({ ok: true })
            },
            ...over
        }
    }
}

function entrant(over: Partial<Entrant> = {}): Entrant {
    return {
        agentId: "claude",
        agentName: "Claude",
        worktree: "D:/p1.worktrees/claude",
        branch: "race/claude",
        baseHead: "abc",
        status: "passed",
        ...over
    }
}

function race(over: Partial<Race> = {}): Race {
    return {
        cardId: "c1",
        projectId: "p1",
        projectPath: "D:/p1",
        title: "Fix the login redirect",
        gateCommand: "npm test",
        startedAt: 1000,
        entrants: [
            entrant({ cost: 1, costTokens: 10, added: 5, removed: 2 }),
            entrant({ agentId: "codex", agentName: "Codex", status: "failed", cost: 0.5, costTokens: 5 })
        ],
        ...over
    }
}

beforeEach(() => {
    appended = []
    stubApi()
    useConfirm.setState({ current: null })
    useSettings.setState({ usageLog: [] })
    useStore.setState({
        projects: [{ id: "p1", name: "P1", path: "D:/p1", addedAt: 1 }],
        activeId: "p1",
        boardTasks: [],
        tabsByProject: {},
        activeTabByProject: {},
        activePaneByProject: {},
        termAgents: {},
        termCwd: {},
        termNames: {},
        agentStatus: {},
        races: {},
        raceCardId: null,
        pipelineRun: null,
        activity: []
    })
})

describe("card records", () => {
    const dispatched = {
        id: "t1",
        projectId: "p1",
        title: "Fix the login redirect",
        column: "review" as const,
        createdAt: 500,
        dispatchedAt: 1000,
        termId: "term-1",
        cost: 0.42,
        costTokens: 1200
    }

    it("records a run when a dispatched card reaches done", () => {
        useStore.setState({ boardTasks: [dispatched], termAgents: { "term-1": "claude" } })

        useStore.getState().moveBoardTask("t1", "done")

        expect(appended).toHaveLength(1)
        expect(appended[0]).toMatchObject({
            kind: "card",
            projectId: "p1",
            projectName: "P1",
            label: "Fix the login redirect",
            startedAt: 1000,
            agentIds: ["claude"],
            cost: 0.42,
            tokens: 1200,
            exclusive: true,
            outcome: "done"
        })
        // The record's end is the same instant stamped on the card, not a second read.
        expect(appended[0].endedAt).toBe(useStore.getState().boardTasks[0].endedAt)
    })

    it("records nothing for a card that was never dispatched", () => {
        useStore.setState({
            boardTasks: [{ id: "t2", projectId: "p1", title: "By hand", column: "todo", createdAt: 1 }]
        })

        useStore.getState().moveBoardTask("t2", "done")

        expect(appended).toEqual([])
    })

    it("records nothing when a card moves back out of done", () => {
        useStore.setState({ boardTasks: [{ ...dispatched, column: "done", endedAt: 2000 }] })

        useStore.getState().moveBoardTask("t1", "doing")

        expect(appended).toEqual([])
    })

    // Moving out of done clears endedAt and cost and lets the card accrue again,
    // so a second record would cover [dispatchedAt, laterEnd] - a window that
    // CONTAINS the first one's, not a delta from it. Two summable rows, one spend,
    // reachable by an ordinary drag.
    it("records once when a card is reopened and finished again", () => {
        useStore.setState({
            boardTasks: [{ ...dispatched, id: "t-reopen" }],
            termAgents: { "term-1": "claude" }
        })

        useStore.getState().moveBoardTask("t-reopen", "done")
        useStore.getState().moveBoardTask("t-reopen", "doing")
        useStore.setState({
            boardTasks: [{ ...useStore.getState().boardTasks[0], cost: 0.9, costTokens: 2000 }]
        })
        useStore.getState().moveBoardTask("t-reopen", "done")

        expect(appended).toHaveLength(1)
        expect(appended[0].cost).toBe(0.42)
    })

    // The guard has to be exactly as durable as the thing it guards. A quit
    // empties any renderer-module set, while workspace.json brings the card back
    // with dispatchedAt and termId intact - so the guard rides on the card.
    it("stamps the guard onto the card, where it survives a restart", () => {
        useStore.setState({ boardTasks: [dispatched], termAgents: { "term-1": "claude" } })

        useStore.getState().moveBoardTask("t1", "done")

        expect(useStore.getState().boardTasks[0].recordedFor).toBe(1000)
    })

    it("records nothing for a card restored from disk that was already recorded", () => {
        // Exactly what workspace.json hands back after a quit and reopen.
        useStore.setState({
            boardTasks: [
                { ...dispatched, id: "t-restart", column: "done", endedAt: 2000, recordedFor: 1000 }
            ],
            termAgents: { "term-1": "claude" }
        })

        useStore.getState().moveBoardTask("t-restart", "doing")
        useStore.setState({
            boardTasks: [{ ...useStore.getState().boardTasks[0], cost: 0.9, costTokens: 2000 }]
        })
        useStore.getState().moveBoardTask("t-restart", "done")

        expect(appended).toEqual([])
    })

    it("records again for a restored card that was re-dispatched since", () => {
        useStore.setState({
            boardTasks: [
                {
                    ...dispatched,
                    id: "t-restart-redis",
                    column: "doing",
                    dispatchedAt: 9000,
                    endedAt: undefined,
                    recordedFor: 1000
                }
            ],
            termAgents: { "term-1": "claude" }
        })

        useStore.getState().moveBoardTask("t-restart-redis", "done")

        expect(appended).toHaveLength(1)
        expect(appended[0].startedAt).toBe(9000)
    })

    it("records again when the card is genuinely re-dispatched", () => {
        useStore.setState({ boardTasks: [{ ...dispatched, id: "t-redis" }] })
        useStore.getState().moveBoardTask("t-redis", "done")

        // A re-dispatch stamps a fresh dispatchedAt: a new run, a new window.
        useStore.setState({
            boardTasks: [
                { ...dispatched, id: "t-redis", column: "doing", dispatchedAt: 9000, endedAt: undefined, cost: 0.2 }
            ]
        })
        useStore.getState().moveBoardTask("t-redis", "done")

        expect(appended).toHaveLength(2)
        expect(appended.map((r) => r.startedAt)).toEqual([1000, 9000])
    })

    it("marks the cost as an attribution when another session shared the directory", () => {
        // The card ran in the project's own tree, and a second agent session
        // occupied that same directory during the card's window - costInWindow
        // cannot tell them apart. The second session has since CLOSED: what
        // makes the cost an attribution is that it overlapped the window, not
        // that it happens to still be on screen when the card is filed.
        useSettings.setState({
            usageLog: [
                { id: "term-1", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1000, endedAt: 1500 },
                { id: "term-2", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1100, endedAt: 1400 }
            ]
        })
        useStore.setState({ boardTasks: [{ ...dispatched, id: "t-shared" }] })

        useStore.getState().moveBoardTask("t-shared", "done")

        expect(appended[0].exclusive).toBe(false)
    })

    // The ordinary two-card case, with no unusual steps: dispatch A into a
    // project, dispatch B into the same project, let both agents finish and both
    // panes close, then tidy both cards into done. A snapshot of live panes sees
    // nothing in the directory either time and calls BOTH exclusive - so the
    // total shows roughly twice the money that was actually spent, presented as
    // two receipts with "0 excluded".
    it("marks both cards as attributions when they shared a directory and both panes have closed", () => {
        useSettings.setState({
            usageLog: [
                { id: "term-a", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1000, endedAt: 3000 },
                { id: "term-b", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1500, endedAt: 3500 }
            ]
        })
        useStore.setState({
            boardTasks: [
                { ...dispatched, id: "t-a", termId: "term-a", dispatchedAt: 1000 },
                { ...dispatched, id: "t-b", termId: "term-b", dispatchedAt: 1500 }
            ],
            // Both agents finished and both panes are gone, which is the normal
            // state of the board by the time cards get dragged to done.
            termAgents: {},
            tabsByProject: {}
        })

        useStore.getState().moveBoardTask("t-a", "done")
        useStore.getState().moveBoardTask("t-b", "done")

        expect(appended.map((r) => r.exclusive)).toEqual([false, false])
    })

    // Two cards in one project that never actually overlapped are two separate
    // receipts. The rule is overlap, not "this project has had two agents in it".
    it("stays exclusive when another session in the directory did not overlap the window", () => {
        useSettings.setState({
            usageLog: [
                { id: "term-1", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1000, endedAt: 2000 },
                { id: "term-old", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 10, endedAt: 900 }
            ]
        })
        useStore.setState({
            boardTasks: [{ ...dispatched, id: "t-solo", endedAt: undefined }]
        })

        useStore.getState().moveBoardTask("t-solo", "done")

        expect(appended[0].exclusive).toBe(true)
    })

    it("is exclusive in its own worktree even with another session in the project", () => {
        useSettings.setState({
            usageLog: [
                {
                    id: "term-1",
                    agentId: "claude",
                    projectId: "p1",
                    cwd: "D:/p1.worktrees/t1",
                    startedAt: 1000
                },
                { id: "term-2", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1000 }
            ]
        })
        useStore.setState({
            boardTasks: [{ ...dispatched, id: "t-wt", worktree: "D:/p1.worktrees/t1" }]
        })

        useStore.getState().moveBoardTask("t-wt", "done")

        expect(appended[0].exclusive).toBe(true)
    })

    // usageLog cannot see a pane restored from a previous launch: the restore
    // path never calls logUsageStart, so there is no event for it at all. A live
    // agent pane in the directory therefore still has to demote the record on
    // its own, as a second, additive test.
    it("marks the cost as an attribution for a live pane that never logged a start", () => {
        useStore.setState({
            boardTasks: [{ ...dispatched, id: "t-restored" }],
            termAgents: { "term-1": "claude", "term-2": "claude" },
            tabsByProject: { p1: [{ id: "tab1", name: "Tab", root: leaf("term-2") }] }
        })

        useStore.getState().moveBoardTask("t-restored", "done")

        expect(appended[0].exclusive).toBe(false)
    })

    // An event written before `cwd` existed names no directory, so it cannot be
    // ruled out of this one. Fail closed: it demotes the record.
    it("treats a usage event with no recorded directory as possibly sharing", () => {
        useSettings.setState({
            usageLog: [{ id: "term-legacy", agentId: "claude", projectId: "p1", startedAt: 1000 }]
        })
        useStore.setState({ boardTasks: [{ ...dispatched, id: "t-legacy" }] })

        useStore.getState().moveBoardTask("t-legacy", "done")

        expect(appended[0].exclusive).toBe(false)
    })

    it("never presents an unpriced card as a summable zero", () => {
        useStore.setState({
            boardTasks: [{ ...dispatched, id: "t-unpriced", cost: undefined, costTokens: undefined }],
            termAgents: { "term-1": "claude" }
        })

        useStore.getState().moveBoardTask("t-unpriced", "done")

        expect(appended[0]).toMatchObject({ cost: 0, tokens: 0, exclusive: false })
    })
})

describe("race records", () => {
    it("records one landed run before the race is deleted", async () => {
        useStore.setState({ races: { c1: race() } })

        await useStore.getState().landRaceWinner("c1", "claude")

        expect(useStore.getState().races.c1).toBeUndefined()
        expect(appended).toHaveLength(1)
        expect(appended[0]).toMatchObject({
            kind: "race",
            projectId: "p1",
            projectName: "P1",
            label: "Fix the login redirect",
            startedAt: 1000,
            agentIds: ["claude", "codex"],
            // Summed entrant costs: each entrant is priced from its own worktree.
            cost: 1.5,
            tokens: 15,
            exclusive: true,
            outcome: "landed",
            winner: "claude",
            eliminated: 1,
            added: 5,
            removed: 2
        })
    })

    it("records an abandoned run with every entrant eliminated", async () => {
        useStore.setState({ races: { c1: race() } })

        const done = useStore.getState().abandonRace("c1")
        await vi.waitFor(() => expect(useConfirm.getState().current).not.toBeNull())
        useConfirm.getState().answer(true)
        await done

        expect(appended).toHaveLength(1)
        expect(appended[0]).toMatchObject({
            kind: "race",
            cost: 1.5,
            exclusive: true,
            outcome: "abandoned",
            eliminated: 2
        })
        expect(appended[0].winner).toBeUndefined()
    })

    it("records nothing when the user cancels the abandon confirm", async () => {
        useStore.setState({ races: { c1: race() } })

        const done = useStore.getState().abandonRace("c1")
        await vi.waitFor(() => expect(useConfirm.getState().current).not.toBeNull())
        useConfirm.getState().answer(false)
        await done

        expect(appended).toEqual([])
        expect(useStore.getState().races.c1).toBeDefined()
    })

    // Landing closes every entrant's pane before deleting the race, so the race
    // is still in state when those panes close - which is what lets the session
    // site recognise them as owned. One record for the race, not one per entrant.
    it("writes one record for the race, not one per entrant pane it closes", async () => {
        useSettings.setState({
            usageLog: [
                { id: "e-claude", agentId: "claude", projectId: "p1", startedAt: 1000 },
                { id: "e-codex", agentId: "codex", projectId: "p1", startedAt: 1000 }
            ]
        })
        useStore.setState({
            races: {
                c1: race({
                    entrants: [
                        entrant({ termId: "e-claude", cost: 1, costTokens: 10 }),
                        entrant({
                            agentId: "codex",
                            agentName: "Codex",
                            status: "failed",
                            termId: "e-codex",
                            cost: 0.5,
                            costTokens: 5
                        })
                    ]
                })
            }
        })

        await useStore.getState().landRaceWinner("c1", "claude")
        await new Promise((r) => setTimeout(r, 20))

        expect(appended.map((r) => r.kind)).toEqual(["race"])
        expect(appended[0].cost).toBe(1.5)
    })

    // The same ordering as landing, asserted separately because it is a different
    // teardown path: abandon also closes every entrant's pane before deleting the
    // race, which is what lets the session site see those panes as owned.
    it("writes one record when abandoning a race with live entrant panes", async () => {
        useSettings.setState({
            usageLog: [{ id: "a-claude", agentId: "claude", projectId: "p1", startedAt: 1000 }]
        })
        useStore.setState({
            races: { c1: race({ entrants: [entrant({ termId: "a-claude", cost: 1, costTokens: 10 })] }) }
        })

        const done = useStore.getState().abandonRace("c1")
        await vi.waitFor(() => expect(useConfirm.getState().current).not.toBeNull())
        useConfirm.getState().answer(true)
        await done
        await new Promise((r) => setTimeout(r, 20))

        expect(appended.map((r) => r.kind)).toEqual(["race"])
        expect(appended[0]).toMatchObject({ outcome: "abandoned", cost: 1 })
    })

    it("does not break landing when the ledger throws", async () => {
        stubApi({
            ledger: {
                append: (): void => {
                    throw new Error("bridge gone")
                }
            }
        })
        useStore.setState({ races: { c1: race() } })

        await expect(useStore.getState().landRaceWinner("c1", "claude")).resolves.toBeUndefined()
        expect(useStore.getState().races.c1).toBeUndefined()
    })
})

describe("pipeline records", () => {
    const run = {
        pipelineId: "pl1",
        name: "Nightly review",
        stepIndex: 1,
        total: 2,
        stepTitle: "Review",
        status: "running" as const,
        startedAt: 1000,
        projectPath: "D:/p1",
        steps: [
            { title: "Write", agentId: "claude", status: "done" as const },
            { title: "Review", agentId: "codex", status: "running" as const }
        ]
    }

    it("records the spend the bar used to discard when a run is stopped", async () => {
        useStore.setState({ pipelineRun: run })

        useStore.getState().stopPipeline()

        await vi.waitFor(() => expect(appended).toHaveLength(1))
        expect(appended[0]).toMatchObject({
            kind: "pipeline",
            projectId: "p1",
            projectName: "P1",
            label: "Nightly review",
            startedAt: 1000,
            agentIds: ["claude", "codex"],
            cost: 1.25,
            tokens: 500,
            exclusive: true,
            outcome: "stopped"
        })
    })

    it("records one run per run, however many terminal transitions it makes", async () => {
        // A distinct start instant: the de-dupe is keyed per run, not per call,
        // and the run above has already been recorded.
        useStore.setState({ pipelineRun: { ...run, startedAt: 7000 } })

        useStore.getState().stopPipeline()
        await vi.waitFor(() => expect(appended).toHaveLength(1))
        useStore.getState().stopPipeline()
        useStore.getState().stopPipeline()

        await new Promise((r) => setTimeout(r, 20))
        expect(appended).toHaveLength(1)
    })

    it("marks the cost as an attribution when the price could not be read", async () => {
        stubApi({
            usage: {
                window: async (): Promise<never> => {
                    throw new Error("no transcripts")
                }
            }
        })
        useStore.setState({ pipelineRun: { ...run, pipelineId: "pl2" } })

        useStore.getState().stopPipeline()

        await vi.waitFor(() => expect(appended).toHaveLength(1))
        expect(appended[0]).toMatchObject({ cost: 0, tokens: 0, exclusive: false })
    })
})

describe("session records", () => {
    beforeEach(() => {
        useStore.setState({
            tabsByProject: { p1: [{ id: "tab1", name: "Tab", root: leaf("term-9") }] },
            activeTabByProject: { p1: "tab1" },
            termAgents: { "term-9": "claude" }
        })
    })

    it("records what a closed agent pane cost, which usageLog omits", async () => {
        useSettings.setState({
            usageLog: [{ id: "term-9", agentId: "claude", projectId: "p1", startedAt: 4000 }]
        })

        useStore.getState().closePane("term-9")

        await vi.waitFor(() => expect(appended).toHaveLength(1))
        expect(appended[0]).toMatchObject({
            kind: "session",
            projectId: "p1",
            projectName: "P1",
            startedAt: 4000,
            agentIds: ["claude"],
            cost: 1.25,
            tokens: 500,
            exclusive: true
        })
        // usageLog still gets its end stamp - the ledger is additional, not a replacement.
        expect(useSettings.getState().usageLog[0].endedAt).toBeGreaterThan(0)
    })

    it("records nothing for a session whose window cannot be bounded", async () => {
        // No usageLog entry (e.g. a pane restored from a previous launch): there
        // is no start instant, so there is no window to price.
        useStore.getState().closePane("term-9")

        await new Promise((r) => setTimeout(r, 20))
        expect(appended).toEqual([])
    })

    // A session record for an owned pane describes the same money as its parent's
    // record, and both would be honestly exclusive - so a total that summed them
    // would double count a race. The parent's record is the better one (it has an
    // outcome, a winner, a diffstat), so the session record is the one to drop.
    it("records nothing for a race entrant's pane, whose race records it instead", async () => {
        useSettings.setState({
            usageLog: [{ id: "term-9", agentId: "claude", projectId: "p1", startedAt: 4000 }]
        })
        useStore.setState({
            races: { c1: race({ entrants: [entrant({ termId: "term-9", cost: 1 })] }) }
        })

        useStore.getState().closePane("term-9")

        await new Promise((r) => setTimeout(r, 20))
        expect(appended).toEqual([])
    })

    it("records nothing for a dispatched card's pane", async () => {
        useSettings.setState({
            usageLog: [{ id: "term-9", agentId: "claude", projectId: "p1", startedAt: 4000 }]
        })
        useStore.setState({
            boardTasks: [
                {
                    id: "t1",
                    projectId: "p1",
                    title: "Fix the login redirect",
                    column: "doing",
                    createdAt: 1,
                    dispatchedAt: 1000,
                    termId: "term-9"
                }
            ]
        })

        useStore.getState().closePane("term-9")

        await new Promise((r) => setTimeout(r, 20))
        expect(appended).toEqual([])
    })

    // The ordering that matters: a pipeline never closes its step sessions, and
    // `pipelineRun` - the only place step term ids live - is nulled seconds after
    // the run ends. So the pane almost always closes with no live run to
    // recognise it, and the claim made when the run was recorded is the only
    // thing standing between that pane and a duplicate of the pipeline's spend.
    it("records nothing for a pipeline step's pane closed after the run is gone", async () => {
        useStore.setState({
            pipelineRun: {
                pipelineId: "pl-late",
                name: "Nightly review",
                stepIndex: 0,
                total: 1,
                stepTitle: "Write",
                status: "running",
                startedAt: 9000,
                projectPath: "D:/p1",
                steps: [{ title: "Write", agentId: "claude", status: "done", termId: "term-9" }]
            }
        })
        useStore.getState().stopPipeline()
        await vi.waitFor(() => expect(appended).toHaveLength(1))

        // The run object is gone, exactly as it is a few seconds after any run ends.
        useStore.setState({ pipelineRun: null })
        useSettings.setState({
            usageLog: [{ id: "term-9", agentId: "claude", projectId: "p1", startedAt: 9000 }]
        })
        useStore.getState().closePane("term-9")

        await new Promise((r) => setTimeout(r, 20))
        expect(appended).toHaveLength(1)
        expect(appended[0].kind).toBe("pipeline")
    })

    // Re-dispatching a card overwrites its termId, so the previous pane ends up
    // owned by no card at all - and its window overlaps the record the earlier
    // dispatch already produced.
    it("records nothing for the pane a re-dispatch displaced", async () => {
        useSettings.setState({
            agents: [
                {
                    id: "claude-ai",
                    name: "Claude",
                    command: "claude",
                    runMode: "agent",
                    resumeArgs: "",
                    badge: "",
                    apiKeyEnv: "",
                    model: "",
                    modelEnv: "",
                    icon: "",
                    category: ""
                }
            ],
            routingRules: [],
            defaultAgentId: "claude-ai",
            usageLog: [{ id: "old-term", agentId: "claude-ai", projectId: "p1", startedAt: 4000 }]
        })
        useStore.setState({
            tabsByProject: { p1: [{ id: "tab-old", name: "old", root: leaf("old-term") }] },
            activeTabByProject: { p1: "tab-old" },
            termAgents: { "old-term": "claude-ai" },
            boardTasks: [
                {
                    id: "t1",
                    projectId: "p1",
                    title: "Fix the login redirect",
                    column: "doing",
                    createdAt: 1,
                    dispatchedAt: 1000,
                    termId: "old-term"
                }
            ]
        })

        // Deliberately not awaited: dispatch ends with a 2.8s wait for the agent
        // CLI to boot, long after the termId this test is about has been swapped.
        void useStore.getState().dispatchBoardTask("t1", { worktree: false })
        await vi.waitFor(() => expect(useConfirm.getState().current).not.toBeNull())
        useConfirm.getState().answer(true)
        await vi.waitFor(() =>
            expect(useStore.getState().boardTasks[0].termId).not.toBe("old-term")
        )

        useStore.getState().closePane("old-term")

        await new Promise((r) => setTimeout(r, 20))
        expect(appended).toEqual([])
    })

    it("records nothing for a plain shell pane", async () => {
        useStore.setState({ termAgents: {} })
        useSettings.setState({
            usageLog: [{ id: "term-9", agentId: "shell", projectId: "p1", startedAt: 4000 }]
        })

        useStore.getState().closePane("term-9")

        await new Promise((r) => setTimeout(r, 20))
        expect(appended).toEqual([])
    })
})
