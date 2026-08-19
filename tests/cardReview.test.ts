import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { captureBaseline, forgetSignals } from "../src/renderer/src/agentSignals"
import type { BoardColumn } from "../src/renderer/src/board"

// The live bug this file pins. The agent idle timer used to move a dispatched
// card doing -> review the moment an agent stopped emitting output for
// `agentIdleMs` - 1000ms by default, 300ms at the floor. An agent that pauses
// to think, or sits in a slow tool call, had its card filed as ready for
// review. Pausing is not finishing.
//
// The card now moves only on EVIDENCE: a path dirty now that was not dirty when
// the session started (agentSignals' baseline). No evidence, no move - the card
// stays in "doing", which is the honest reading. The status transition beside it
// (waiting/idle) is deliberately untouched: waitForIdle and the mobile client
// read those values.

const TERM = "t-term"
const CWD = "/repo"
const IDLE_MS = 20

/**
 * The current `git.changes` behaviour. A module-level indirection rather than a
 * fixed stub because these tests need to answer the *baseline capture* call and
 * the *post-idle* call differently - that difference is the whole subject.
 */
let gitChanges: (cwd: string) => Promise<{ path: string }[]> = async () => []

/** The pty data handler the store registers in init() - the way into onPtyData. */
let ptyData: (e: { id: string; data: string }) => void = () => undefined

/** Only the namespaces this path touches, as in tests/ledgerSites.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (fn: (e: { id: string; data: string }) => void): (() => void) => {
                    ptyData = fn
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
            git: { changes: (cwd: string): Promise<{ path: string }[]> => gitChanges(cwd) }
        }
    }
}

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

const columnOf = (id: string): BoardColumn | undefined =>
    useStore.getState().boardTasks.find((t) => t.id === id)?.column

/** Seed the session's baseline the way a real launch does - via captureBaseline. */
async function seedBaseline(paths: string[]): Promise<void> {
    gitChanges = async (): Promise<{ path: string }[]> => paths.map((path) => ({ path }))
    captureBaseline(TERM, CWD)
    await tick()
}

/** A dispatched card in `doing`, its agent session live and quiet. */
function seedSession(): void {
    useStore.setState({
        // Not the terminal view, so isVisible() is false: this is a background
        // session finishing a turn, which is the case the bug bit hardest.
        view: "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: CWD, addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: { [TERM]: CWD },
        agentStatus: {},
        activePaneByProject: {},
        notifications: [],
        activity: [],
        boardTasks: [
            {
                id: "t1",
                projectId: "p1",
                title: "Fix the login redirect",
                column: "doing",
                termId: TERM,
                createdAt: Date.now()
            }
        ]
    })
}

describe("a dispatched card reaching review", () => {
    beforeAll(async () => {
        stubApi()
        // init() is what registers onPtyData; the store guards it with a
        // module-level flag, so this runs once for the file.
        await useStore.getState().init()
    })

    beforeEach(() => {
        useSettings.setState({
            agentIdleMs: IDLE_MS,
            notifications: { desktop: false, sound: false, waitingSound: false }
        })
        seedSession()
    })

    afterEach(() => {
        forgetSignals(TERM)
    })

    it("moves when the agent produced a file that was not dirty before", async () => {
        await seedBaseline([])
        seedSession()
        gitChanges = async (): Promise<{ path: string }[]> => [{ path: "src/new.ts" }]

        ptyData({ id: TERM, data: "working on it\n" })
        await tick(IDLE_MS * 4)

        expect(columnOf("t1")).toBe("review")
        // The status transition is out of scope for this change, but it must
        // still happen - a background session that finished a turn is "waiting".
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
    })

    it("leaves the card in doing when nothing changed", async () => {
        await seedBaseline([])
        seedSession()
        gitChanges = async (): Promise<{ path: string }[]> => []

        ptyData({ id: TERM, data: "still thinking\n" })
        await tick(IDLE_MS * 4)

        expect(columnOf("t1")).toBe("doing")
        // The pause is still reported as a pause: only the card move is re-keyed.
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
    })

    it("leaves the card in doing when the tree was already dirty", async () => {
        // THE REGRESSION. The repo had old.ts dirty before the agent started and
        // it is the only dirty path afterwards - the agent produced nothing. Old
        // code moved the card anyway, because a 1s silence was the only trigger.
        await seedBaseline(["old.ts"])
        seedSession()
        gitChanges = async (): Promise<{ path: string }[]> => [{ path: "old.ts" }]

        ptyData({ id: TERM, data: "hmm\n" })
        await tick(IDLE_MS * 4)

        expect(columnOf("t1")).toBe("doing")
    })

    it("leaves the card in doing when git fails, and does not throw", async () => {
        await seedBaseline([])
        seedSession()
        gitChanges = async (): Promise<{ path: string }[]> => {
            throw new Error("git status failed")
        }

        const rejections: unknown[] = []
        const onRejection = (reason: unknown): void => {
            rejections.push(reason)
        }
        process.on("unhandledRejection", onRejection)
        try {
            // The handler runs inside a pty data callback: it must not throw,
            // and the failure must not escape as an unhandled rejection either.
            expect(() => ptyData({ id: TERM, data: "output\n" })).not.toThrow()
            await tick(IDLE_MS * 4)
        } finally {
            process.off("unhandledRejection", onRejection)
        }

        expect(rejections).toEqual([])
        expect(columnOf("t1")).toBe("doing")
    })

    it("does not move a card the user moved while the git read was in flight", async () => {
        await seedBaseline([])
        seedSession()

        // A deferred git read, so the interleaving is real rather than assumed:
        // the test only drags the card once git.changes has genuinely been
        // entered, and only resolves it afterwards.
        let release: (files: { path: string }[]) => void = () => undefined
        let readStarted: () => void = () => undefined
        const inFlight = new Promise<void>((r) => {
            readStarted = r
        })
        gitChanges = (): Promise<{ path: string }[]> => {
            readStarted()
            return new Promise((r) => {
                release = r
            })
        }

        ptyData({ id: TERM, data: "output\n" })
        await inFlight
        expect(columnOf("t1")).toBe("doing")

        // The user drags it straight to done while the read is still pending.
        useStore.getState().moveBoardTask("t1", "done")
        expect(columnOf("t1")).toBe("done")

        // Evidence arrives late. It must not drag the card back to review.
        release([{ path: "src/new.ts" }])
        await tick(IDLE_MS)

        expect(columnOf("t1")).toBe("done")
    })
})
