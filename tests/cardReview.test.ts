import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { captureBaseline, forgetSignals } from "../src/renderer/src/agentSignals"
import { leaf } from "../src/renderer/src/layout"
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

/** Every directory `git.changes` was asked about, in order. */
let askedFor: string[] = []

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
            git: {
                changes: (cwd: string): Promise<{ path: string }[]> => {
                    askedFor.push(cwd)
                    return gitChanges(cwd)
                }
            }
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

/**
 * A dispatched card in `doing`, its agent session live and quiet.
 *
 * `termCwd` is seeded only for an isolated dispatch: with the board's worktree
 * box off nothing records a termCwd entry at all, which is the case that used
 * to strand a card in doing no matter how much the agent wrote.
 */
function seedSession(opts: { isolated?: boolean } = {}): void {
    const isolated = opts.isolated ?? true
    useStore.setState({
        // Not the terminal view, so isVisible() is false: this is a background
        // session finishing a turn, which is the case the bug bit hardest.
        view: "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: CWD, addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: isolated ? { [TERM]: CWD } : {},
        agentStatus: {},
        // The session must be findable in a project for the cwd fallback to
        // resolve: that is the route sessionCwd takes to the project path.
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
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
        askedFor = []
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
            // Weak on its own - ptyData only arms a timer, so there is little
            // for it to throw. The real protection is the two checks below: the
            // git failure must not surface as an unhandled rejection, and an
            // exception thrown from inside the timer callback would fail this
            // test as an uncaught error rather than as an assertion.
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

    it("advances a dispatch that recorded no termCwd, reading the project path", async () => {
        // M1. Only an ISOLATED dispatch records a termCwd entry - newTab stores
        // one just when a cwd is passed, and the board passes a worktree path
        // only when its worktree box is ticked. Reading termCwd directly made
        // the evidence read bail for every non-isolated card, which then sat in
        // doing forever no matter how much the agent wrote.
        seedSession({ isolated: false })
        await seedBaseline([])
        gitChanges = async (): Promise<{ path: string }[]> => [{ path: "src/new.ts" }]

        ptyData({ id: TERM, data: "wrote a file" })
        await tick(IDLE_MS * 4)

        expect(columnOf("t1")).toBe("review")
        // Two reads, one directory: the baseline capture and the evidence read
        // must resolve the same tree or their path sets are not comparable.
        expect(askedFor).toEqual([CWD, CWD])
    })

    it("does not snap a card dragged back to doing forward again without new work", async () => {
        // L2. A path fresh against the baseline stays fresh for the session's
        // life, so "not done, keep going" was undone by the very next pause -
        // the same move-without-evidence complaint, one level up. Sending a card
        // out of review rebases the baseline so only later work counts.
        await seedBaseline([])
        seedSession()
        gitChanges = async (): Promise<{ path: string }[]> => [{ path: "src/new.ts" }]

        ptyData({ id: TERM, data: "wrote a file" })
        await tick(IDLE_MS * 4)
        expect(columnOf("t1")).toBe("review")

        // "Not done, keep going."
        useStore.getState().moveBoardTask("t1", "doing")
        await tick() // the rebase capture is fire-and-forget

        // Another quiet spell over the same one file: no new work since the drag.
        ptyData({ id: TERM, data: "still thinking" })
        await tick(IDLE_MS * 4)
        expect(columnOf("t1")).toBe("doing")

        // The session is not deaf afterwards, though - a genuinely new file counts.
        gitChanges = async (): Promise<{ path: string }[]> => [
            { path: "src/new.ts" },
            { path: "src/newer.ts" }
        ]
        ptyData({ id: TERM, data: "wrote another" })
        await tick(IDLE_MS * 4)
        expect(columnOf("t1")).toBe("review")
    })
})
