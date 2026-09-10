import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import { useStore, clearActed } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { leaf } from "../src/renderer/src/layout"
import { forgetTail } from "../src/renderer/src/missionTail"
import { wantsYou } from "../src/renderer/src/tileState"
import type { DeclaredSignal } from "../src/shared/attention"

const TERM = "t-declared"
const BEL = "\x07"

let ptyData: (e: { id: string; data: string; replay?: boolean }) => void = () => undefined
let declare: (s: DeclaredSignal) => void = () => undefined
let ptyWrites: { id: string; data: string }[] = []

/** Only the namespaces this path touches, as in tests/visibilityGate.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (
                    fn: (e: { id: string; data: string; replay?: boolean }) => void
                ): (() => void) => {
                    ptyData = fn
                    return (): void => undefined
                },
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (id: string, data: string): void => {
                    ptyWrites.push({ id, data })
                }
            },
            notify: {
                state: async (): Promise<{ supported: boolean; error: string | null }> => ({
                    supported: true,
                    error: null
                }),
                attention: async (): Promise<{ supported: boolean; error: string | null }> => ({
                    supported: true,
                    error: null
                }),
                onActivate: (): (() => void) => (): void => undefined
            },
            attention: {
                onDeclared: (fn: (s: DeclaredSignal) => void): (() => void) => {
                    declare = fn
                    return (): void => undefined
                }
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
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

function seed(watching = false): void {
    forgetTail(TERM)
    useStore.setState({
        view: watching ? "terminal" : "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: {},
        agentStatus: {},
        declared: {},
        paneHold: {},
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: watching ? { p1: TERM } : {},
        notifications: [],
        activity: [],
        boardTasks: [],
        seen: {},
        answered: {}
    })
    clearActed(TERM)
    ptyWrites = []
}

const sig = (over: Partial<DeclaredSignal> = {}): DeclaredSignal => ({
    termId: TERM,
    state: "attention",
    matchedBy: "session-env",
    at: Date.now(),
    event: "Notification",
    ...over
})

describe("a declared signal is recorded as declared", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
        useSettings.setState({
            agentIdleMs: 50,
            notifications: { desktop: false, sound: false, waitingSound: false }
        })
    })

    beforeEach(() => {
        seed()
        vi.useRealTimers()
    })

    it("sets the status the agent stated, with no bell and no waiting for silence", () => {
        declare(sig({ state: "attention", message: "May I edit store.ts?" }))
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
    })

    it("keeps the provenance beside it, so a surface can tell stated from guessed", () => {
        declare(sig({ message: "May I edit store.ts?", event: "Notification" }))
        const d = useStore.getState().declared[TERM]
        expect(d?.state).toBe("attention")
        expect(d?.event).toBe("Notification")
        expect(d?.message).toBe("May I edit store.ts?")
    })

    it("leaves no such record for an INFERRED bell - that is the distinction", () => {
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        expect(useStore.getState().declared[TERM]).toBeUndefined()
    })

    it("feeds the SAME wants-you predicate the deck and Mission already read", () => {
        declare(sig({ state: "waiting" }))
        const status = useStore.getState().agentStatus[TERM]
        expect(
            wantsYou(
                {
                    status,
                    prompt: null,
                    exitCode: undefined,
                    lastAt: Date.now(),
                    awaited: false,
                    alive: true,
                    held: undefined
                },
                Date.now()
            )
        ).toBe(true)
    })

    it("writes nothing to any pty", () => {
        declare(sig({ state: "attention" }))
        declare(sig({ state: "waiting" }))
        declare(sig({ state: "working" }))
        expect(ptyWrites).toEqual([])
    })
})

// The inference defects qa and two agents found, each aimed at a session whose
// agent has DECLARED its state. A statement about a session outranks a guess
// about the same session, and none of these bytes is allowed to speak over it.
describe("a declared hand-over outranks every inferred signal", () => {
    beforeEach(() => {
        seed()
        vi.useRealTimers()
    })

    it("survives the agent's own follow-up output", () => {
        declare(sig({ state: "attention" }))
        ptyData({ id: TERM, data: "one more line of thinking\r\n" })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
    })

    it("survives a remount's replay and its refit repaint", () => {
        declare(sig({ state: "waiting", event: "Stop" }))
        ptyData({ id: TERM, data: "the whole scrollback\r\n", replay: true })
        ptyData({ id: TERM, data: "the whole scrollback\r\n" })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
    })

    it("cannot be turned into attention by a BEL in a replayed transcript", () => {
        declare(sig({ state: "waiting", event: "Stop" }))
        ptyData({ id: TERM, data: "answered long ago?" + BEL, replay: true })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        expect(useStore.getState().notifications).toEqual([])
    })

    it("is not promoted by CONTINUED output, which is the inference's own bar", () => {
        // The case the two mechanisms genuinely disagree about, and the reason
        // the gate in `setStatus` is not redundant with the output gate beside
        // it. DevDeck's own `waiting` is PROVISIONAL - it is inferred from
        // silence, so the session's own continued output legitimately refutes
        // it, and two chunks carrying new characters promote it back to
        // `working` (see `spokeSinceHandback`). A DECLARED `waiting` is not an
        // inference and cannot be refuted by the same evidence: the agent
        // stated the turn ended, and a byte is not a retraction. Only the
        // user's answer, or the agent's next statement, ends it.
        declare(sig({ state: "waiting", event: "Stop" }))
        ptyData({ id: TERM, data: "first new line of a resumed turn\r\n" })
        ptyData({ id: TERM, data: "second new line, quite different\r\n" })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
    })

    it("is not escalated to the loud tier by a LIVE bell", () => {
        // A real BEL, not an OSC terminator - the guard has to be tested with
        // the thing it guards against. Plenty of agent CLIs ring on finishing a
        // turn, and DevDeck's BEL heuristic cannot tell that ring from a
        // question: it reads both as `attention`, the loud tier, which spends
        // the accent and fires a desktop notification. A session whose agent
        // STATED it handed back is a hand-back, and the statement is what the
        // user is shown - so the whole branch is skipped, notification
        // included, not merely its status write.
        declare(sig({ state: "waiting", event: "Stop" }))
        ptyData({ id: TERM, data: "done." + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        expect(useStore.getState().notifications).toEqual([])
    })

    it("does not desynchronise the bell reader while it suppresses it", () => {
        // The defect the fix could have re-manufactured. `hasBell` carries
        // per-session OSC parser state and is only correct if it sees every
        // live byte in order. Here an OSC title-set is OPENED in a chunk the
        // declaration suppresses, the declaration is then spent, and the
        // sequence's BEL terminator arrives in the next chunk. If the
        // suppressed chunk had skipped the reader, that terminator would be
        // read as a bell - a false question, manufactured by the code meant to
        // remove false questions.
        declare(sig({ state: "waiting", event: "Stop" }))
        ptyData({ id: TERM, data: "\x1b]0;claude - repo" })
        useStore.getState().notePaneInput(TERM)
        ptyData({ id: TERM, data: BEL + "still going\r\n" })
        expect(useStore.getState().agentStatus[TERM]).not.toBe("attention")
        expect(useStore.getState().notifications).toEqual([])
    })

    it("still lets a bell through once the user has answered the declaration", () => {
        // The other direction of the same gate, and what stops it wedging: an
        // act spends the declaration, so the session is back on DevDeck's own
        // reading and a genuine bell after that is a genuine new question.
        declare(sig({ state: "waiting", event: "Stop" }))
        useStore.getState().notePaneInput(TERM)
        ptyData({ id: TERM, data: "one more thing?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
    })

    it("is not aged into waiting by the silence clock", async () => {
        vi.useFakeTimers()
        declare(sig({ state: "attention" }))
        ptyData({ id: TERM, data: "still printing\r\n" })
        await vi.advanceTimersByTimeAsync(400)
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        vi.useRealTimers()
    })

    it("is not cleared by a glance", () => {
        declare(sig({ state: "attention" }))
        useStore.getState().jumpToTerm(TERM)
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        expect(useStore.getState().declared[TERM]?.state).toBe("attention")
    })
})

describe("what a declaration is spent by", () => {
    beforeEach(() => {
        seed()
        vi.useRealTimers()
    })

    it("a newer declaration replaces it", () => {
        declare(sig({ state: "attention" }))
        declare(sig({ state: "working", event: "UserPromptSubmit" }))
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        expect(useStore.getState().declared[TERM]?.event).toBe("UserPromptSubmit")
    })

    it("the user answering it hands the session back to the screen classifier", () => {
        declare(sig({ state: "attention" }))
        useStore.getState().replySession(TERM, "yes")
        ptyData({ id: TERM, data: "ok, editing store.ts\r\n" })
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
    })

    it("typing into the pane is the same act", () => {
        declare(sig({ state: "attention" }))
        useStore.getState().notePaneInput(TERM)
        ptyData({ id: TERM, data: "ok, editing store.ts\r\n" })
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
    })

    it("a declared WORKING blocks nothing - it is not a hand-over", async () => {
        // The one new failure mode this feature could introduce: a session that
        // declares the start of a turn and never declares its end must still
        // fall back to DevDeck's own reading, not to silence.
        vi.useFakeTimers()
        declare(sig({ state: "working", event: "UserPromptSubmit" }))
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        ptyData({ id: TERM, data: "thinking...\r\n" })
        await vi.advanceTimersByTimeAsync(400)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        vi.useRealTimers()
    })

    it("closing the session forgets it", () => {
        declare(sig({ state: "attention" }))
        useStore.getState().closePaneSilent(TERM)
        expect(useStore.getState().declared[TERM]).toBeUndefined()
    })
})

describe("a hook DevDeck could not attribute", () => {
    beforeEach(() => {
        seed()
        vi.useRealTimers()
    })

    it("changes no session's status, and says so in the activity feed", () => {
        declare(sig({ termId: null, matchedBy: "none", cwd: "C:/repos/web-api" }))
        expect(useStore.getState().agentStatus[TERM]).toBeUndefined()
        expect(useStore.getState().declared[TERM]).toBeUndefined()
        const rows = useStore.getState().activity
        expect(rows.length).toBe(1)
        expect(rows[0].termId).toBe("")
        expect(rows[0].label).toContain("C:/repos/web-api")
        // …and counts it, which is the fact a Settings diagnostic needs and the
        // feed cannot give (the feed is capped and clearable).
        expect(useStore.getState().unmatchedHooks).toBe(1)
    })
})
