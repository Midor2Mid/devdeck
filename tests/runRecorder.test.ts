import { describe, it, expect, beforeEach, vi } from "vitest"
import { createRunRecorder, type RecorderState } from "../src/renderer/src/runRecorder"
import { useSettings } from "../src/renderer/src/settings"
import type { RunRecord } from "../src/main/ledger"
import type { BoardTask } from "../src/renderer/src/board"

// The reason the ledger's write sites were lifted out of the store: the question
// they exist to answer - "was this run's cost a receipt?" - is about a window in
// the past, and every interesting case is about what was true DURING that
// window rather than what is live now. Those cases are awkward and slow to set
// up through moveBoardTask/stopPipeline/closePane, and some of them (an exact
// millisecond boundary, a bridge that throws mid-write) are not reachable there
// at all. Here the whole store contract is an object literal.
//
// tests/ledgerSites.test.ts still covers the wiring - that the store calls these
// at the right moments. This file covers the arithmetic.

let appended: RunRecord[] = []
let throwOnAppend = false

function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            ledger: {
                append: (rec: RunRecord): void => {
                    if (throwOnAppend) throw new Error("bridge gone")
                    appended.push(rec)
                }
            },
            usage: {
                window: async (): Promise<{ cost: number; tokens: number }> => ({
                    cost: 1.25,
                    tokens: 500
                })
            }
        }
    }
}

/** The store slice the recorder reads, with nothing in it by default. */
function state(over: Partial<RecorderState> = {}): RecorderState {
    return {
        projects: [{ id: "p1", name: "P1", path: "D:/p1", addedAt: 1 }],
        boardTasks: [],
        races: {},
        pipelineRun: null,
        termAgents: {},
        termCwd: {},
        agentSessions: () => [],
        ...over
    }
}

/** Deterministic ids, so a record can be identified without matching on shape. */
function recorderFor(
    st: RecorderState,
    marks: { taskId: string; dispatchedAt: number }[] = []
): ReturnType<typeof createRunRecorder> {
    let n = 0
    return createRunRecorder(() => st, {
        newId: () => `rec-${++n}`,
        isAgentId: (id) => !!id && id !== "shell",
        markCardRecorded: (taskId, dispatchedAt) => marks.push({ taskId, dispatchedAt })
    })
}

function card(over: Partial<BoardTask> = {}): BoardTask {
    return {
        id: "t1",
        projectId: "p1",
        title: "Fix the login redirect",
        column: "done",
        createdAt: 1,
        dispatchedAt: 1000,
        termId: "term-1",
        agentId: "claude",
        cost: 0.42,
        costTokens: 1200,
        ...over
    }
}

beforeEach(() => {
    appended = []
    throwOnAppend = false
    stubApi()
    useSettings.setState({ usageLog: [] })
})

describe("exclusivity over a window", () => {
    // The boundary costInWindow actually draws: it keeps a transcript record when
    // `t >= from && t <= until`, so one written at the exact instant the previous
    // session ended lands in BOTH windows and is billed twice. A half-open test
    // would call these disjoint and hand the user a doubled receipt.
    it("counts a session that ended on the exact millisecond the window opened", () => {
        useSettings.setState({
            usageLog: [
                { id: "other", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 10, endedAt: 1000 }
            ]
        })

        recorderFor(state()).recordCardRun(card(), 5000)

        expect(appended[0]).toMatchObject({ exclusive: false, reason: "shared" })
    })

    it("is a receipt when that session ended one millisecond earlier", () => {
        useSettings.setState({
            usageLog: [
                { id: "other", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 10, endedAt: 999 }
            ]
        })

        recorderFor(state()).recordCardRun(card(), 5000)

        expect(appended[0]).toMatchObject({ exclusive: true })
        expect(appended[0].reason).toBeUndefined()
    })

    it("counts a session that started on the exact millisecond the window closed", () => {
        useSettings.setState({
            usageLog: [
                { id: "other", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 5000 }
            ]
        })

        recorderFor(state()).recordCardRun(card(), 5000)

        expect(appended[0]).toMatchObject({ exclusive: false, reason: "shared" })
    })

    // The shape a snapshot of live panes could never see: a session that opened
    // before the run and closed after it, entirely invisible by the time the run
    // is filed. It is also the shape that most obviously shares the money.
    it("counts a session that enclosed the whole window and has since closed", () => {
        useSettings.setState({
            usageLog: [
                { id: "other", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 500, endedAt: 9000 }
            ]
        })

        recorderFor(state()).recordCardRun(card(), 5000)

        expect(appended[0]).toMatchObject({ exclusive: false, reason: "shared" })
    })

    it("ignores a session in a different directory, however far it overlaps", () => {
        useSettings.setState({
            usageLog: [
                {
                    id: "other",
                    agentId: "claude",
                    projectId: "p1",
                    cwd: "D:/p1.worktrees/other",
                    startedAt: 500,
                    endedAt: 9000
                }
            ]
        })

        recorderFor(state()).recordCardRun(card(), 5000)

        expect(appended[0].exclusive).toBe(true)
    })

    // Windows is case-insensitive about paths and costInWindow cannot tell two
    // spellings apart either, so neither may this.
    it("folds case when comparing directories", () => {
        useSettings.setState({
            usageLog: [
                { id: "other", agentId: "claude", projectId: "p1", cwd: "d:/P1", startedAt: 1500 }
            ]
        })

        recorderFor(state()).recordCardRun(card(), 5000)

        expect(appended[0].exclusive).toBe(false)
    })

    it("never counts the run's own session against it", () => {
        useSettings.setState({
            usageLog: [
                { id: "term-1", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1000 }
            ]
        })

        recorderFor(state()).recordCardRun(card(), 5000)

        expect(appended[0].exclusive).toBe(true)
    })
})

describe("pipeline windows", () => {
    const run = {
        pipelineId: "pl1",
        name: "Nightly review",
        stepIndex: 0,
        total: 1,
        stepTitle: "Write",
        status: "running" as const,
        startedAt: 1000,
        projectPath: "D:/p1",
        steps: [{ title: "Write", agentId: "claude", status: "done" as const, termId: "step-1" }]
    }

    it("counts a session that started before the run and outlived it", async () => {
        useSettings.setState({
            usageLog: [
                { id: "other", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 200, endedAt: 99_000 }
            ]
        })

        recorderFor(state()).recordPipelineRun(run, "done")

        await vi.waitFor(() => expect(appended).toHaveLength(1))
        expect(appended[0]).toMatchObject({ kind: "pipeline", exclusive: false, reason: "shared" })
    })

    it("does not count its own step sessions against itself", async () => {
        useSettings.setState({
            usageLog: [
                { id: "step-1", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1000 }
            ]
        })

        recorderFor(state()).recordPipelineRun(run, "done")

        await vi.waitFor(() => expect(appended).toHaveLength(1))
        expect(appended[0].exclusive).toBe(true)
    })
})

describe("session windows", () => {
    const live = state({
        termAgents: { "term-9": "claude" },
        termCwd: { "term-9": "D:/p1" },
        agentSessions: () => []
    })

    it("counts a session that began mid-window and is still open", async () => {
        useSettings.setState({
            usageLog: [
                { id: "term-9", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1000 },
                { id: "other", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1200 }
            ]
        })

        recorderFor(live).recordSessionRun("term-9", "claude")

        await vi.waitFor(() => expect(appended).toHaveLength(1))
        expect(appended[0]).toMatchObject({ kind: "session", exclusive: false, reason: "shared" })
    })

    it("is a receipt when nothing else was ever in that directory", async () => {
        useSettings.setState({
            usageLog: [
                { id: "term-9", agentId: "claude", projectId: "p1", cwd: "D:/p1", startedAt: 1000 }
            ]
        })

        recorderFor(live).recordSessionRun("term-9", "claude")

        await vi.waitFor(() => expect(appended).toHaveLength(1))
        expect(appended[0]).toMatchObject({ exclusive: true, cost: 1.25 })
    })
})

describe("a write site that fails", () => {
    // writeRun (runRecorder.ts) swallows the bridge's throw internally, so
    // recordCardRun never actually observes it - which means this cannot tell
    // "guard stamped before the append" from "guard stamped after", since
    // writeRun never throws back to its caller either way. What it does pin:
    // recordCardRun never throws even when the bridge does, and the guard is
    // always stamped. A dispatched card must reach done and be guarded against
    // re-recording whether or not the bridge call behind it works.
    it("never throws when the bridge throws, and still stamps the card's guard", () => {
        throwOnAppend = true
        const marks: { taskId: string; dispatchedAt: number }[] = []

        expect(() => recorderFor(state(), marks).recordCardRun(card(), 5000)).not.toThrow()

        expect(appended).toEqual([])
        expect(marks).toEqual([{ taskId: "t1", dispatchedAt: 1000 }])
    })

    it("refuses a card it has already recorded, and does not re-stamp it", () => {
        const marks: { taskId: string; dispatchedAt: number }[] = []

        recorderFor(state(), marks).recordCardRun(card({ recordedFor: 1000 }), 5000)

        expect(appended).toEqual([])
        expect(marks).toEqual([])
    })
})
