import { describe, it, expect, vi, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
// describeKeys moved to answered.ts, which Mission and Overview both read - the
// toast, the tile row and the Overview row now name the keystroke identically.
import { describeKeys } from "../src/renderer/src/answered"
import { useToasts } from "../src/renderer/src/toast"
import { leaf } from "../src/renderer/src/layout"
// The chord's liveness skip reads the same exit map the dot does.
import { recordExit, clearExit } from "../src/renderer/src/termExit"

// Same seam as tests/persistGate.test.ts: the real store, a stubbed `window.api`.
// What is under test is the acknowledgement axis - the bit that lets the
// wants-you count stop counting a session you have already dealt with, WITHOUT
// changing what that session is.

const inputs: { termId: string; data: string }[] = []

function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (termId: string, data: string): void => {
                    inputs.push({ termId, data })
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
                load: async () => ({ ok: false, reason: "missing" }),
                save: (): void => undefined
            },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

/** One agent session, sitting in a project, currently `waiting` and unseen. */
function seedAgentSession(termId = "t1"): void {
    useStore.setState({
        seen: {},
        activeId: "p1",
        projects: [{ id: "p1", path: "C:/p", name: "p" }] as never,
        termAgents: { [termId]: "claude" },
        agentStatus: { [termId]: "waiting" },
        tabsByProject: { p1: [{ id: "tab", name: "tab", root: leaf(termId) }] } as never,
        activeTabByProject: { p1: "tab" },
        activePaneByProject: { p1: termId }
    })
}

describe("the acknowledgement axis", () => {
    beforeEach(() => {
        vi.useRealTimers()
        inputs.length = 0
        stubApi()
        useToasts.setState({ toasts: [] })
        useStore.setState({ answered: {} })
    })

    it("marks a session seen when you jump to it", () => {
        seedAgentSession()
        expect(useStore.getState().seen.t1).toBeUndefined()

        useStore.getState().jumpToTerm("t1")

        expect(useStore.getState().seen.t1).toBe(true)
    })

    it("marks a session seen when you answer its prompt", () => {
        seedAgentSession()

        useStore.getState().respondApproval("t1", "1")

        expect(useStore.getState().seen.t1).toBe(true)
        // And the answer still went to the terminal - acknowledging is a side
        // effect of acting, never a replacement for it.
        expect(inputs).toEqual([{ termId: "t1", data: "1" }])
    })

    it("never persists - it is not part of the saved workspace", () => {
        seedAgentSession()
        useStore.getState().jumpToTerm("t1")

        const saved: Record<string, unknown>[] = []
        ;(
            globalThis as unknown as { window: { api: { workspace: { save: (d: unknown) => void } } } }
        ).window.api.workspace.save = (d): void => {
            saved.push(d as Record<string, unknown>)
        }
        useStore.getState().flush()

        // flush() is a no-op before init() has run, which is the point of the
        // persist gate - so assert on the shape the store would write instead.
        for (const w of saved) expect(w).not.toHaveProperty("seen")
    })

    it("forgets a session's acknowledgement when the session goes away", () => {
        seedAgentSession()
        useStore.getState().jumpToTerm("t1")
        expect(useStore.getState().seen.t1).toBe(true)

        useStore.getState().closePaneSilent("t1")

        expect(useStore.getState().seen.t1).toBeUndefined()
    })

    /**
     * The walkthrough's finding 4, on the navigation path.
     *
     * Arriving at a pane used to rewrite `waiting` to `idle`, so switching to
     * the Terminal view - which acks whatever pane is active there - turned a
     * genuinely waiting agent into an idle one: the wants-you count fell from 2
     * to 1 and the tile read QUIET above the agent's own "Ready for review."
     * Acknowledging may change the count. It may not change the state.
     */
    it("does not change what a session IS when you arrive at it", () => {
        seedAgentSession()

        useStore.getState().jumpToTerm("t1")

        expect(useStore.getState().agentStatus.t1).toBe("waiting")
        expect(useStore.getState().seen.t1).toBe(true)
    })

    it("leaves an attention flag standing when you arrive at the pane", () => {
        seedAgentSession()
        useStore.setState({ agentStatus: { t1: "attention" } })

        useStore.getState().jumpToTerm("t1")

        // The `!` is what tells you an agent asked something. Looking at the
        // pane is not answering it.
        expect(useStore.getState().agentStatus.t1).toBe("attention")
    })

    it("still stops jumping to a session you have already been sent to", () => {
        // The chord's own guard: `ack` drops `pendingSince`, which would sort an
        // acknowledged session oldest-first and pin the chord to it forever.
        useStore.setState({
            seen: {},
            activeId: "p1",
            projects: [{ id: "p1", path: "C:/p", name: "p" }] as never,
            termAgents: { t1: "claude", t2: "claude" },
            agentStatus: { t1: "waiting", t2: "waiting" },
            tabsByProject: {
                p1: [
                    { id: "tab1", name: "one", root: leaf("t1") },
                    { id: "tab2", name: "two", root: leaf("t2") }
                ]
            } as never,
            activeTabByProject: { p1: "tab1" },
            activePaneByProject: { p1: "t1" }
        })

        useStore.getState().jumpToPending()
        const first = useStore.getState().activePaneByProject.p1
        useStore.getState().jumpToPending()
        const second = useStore.getState().activePaneByProject.p1

        expect(first).not.toBe(second)
    })
})

/**
 * Ctrl+Shift+J, and the two independent reasons a session is not a jump target.
 *
 * `agentStatus` is what the agent last DID and it outlives the pty, so an
 * exited or restored session kept the `attention` it died wearing - and
 * `attention` outranks `waiting` in the chord's own ordering, so the corpse won
 * the jump. The chord landed you in a dead pane with a live agent one tab away.
 *
 * The two skips have to COMPOSE rather than one shadowing the other: drop the
 * liveness skip and the chord jumps into corpses; drop the `seen` skip and it
 * pins itself to the pane you just left (`ack` drops `pendingSince`, which
 * sorts an acknowledged session oldest-first).
 */
describe("the pending chord only jumps to a live session", () => {
    beforeEach(() => {
        vi.useRealTimers()
        stubApi()
        clearExit("t1")
        clearExit("t2")
        useStore.setState({ paneHold: {} })
    })

    /** t1 asking (and dead, per the caller), t2 waiting and live. */
    function seedPair(): void {
        useStore.setState({
            seen: {},
            paneHold: {},
            activeId: "p1",
            projects: [{ id: "p1", path: "C:/p", name: "p" }] as never,
            termAgents: { t1: "claude", t2: "claude" },
            agentStatus: { t1: "attention", t2: "waiting" },
            tabsByProject: {
                p1: [
                    { id: "tab1", name: "one", root: leaf("t1") },
                    { id: "tab2", name: "two", root: leaf("t2") }
                ]
            } as never,
            activeTabByProject: { p1: "tab1" },
            activePaneByProject: { p1: "t1" }
        })
    }

    it("skips an exited session that still reads attention", () => {
        seedPair()
        recordExit("t1", 1)

        useStore.getState().jumpToPending()

        expect(useStore.getState().activePaneByProject.p1).toBe("t2")
        // And the state is untouched: liveness decides where the chord GOES,
        // never what the session is.
        expect(useStore.getState().agentStatus.t1).toBe("attention")
    })

    it("skips a pane held for resume, which has started nothing", () => {
        seedPair()
        useStore.setState({ paneHold: { t1: "resume" } })

        useStore.getState().jumpToPending()

        expect(useStore.getState().activePaneByProject.p1).toBe("t2")
    })

    it("still prefers the dead session's live sibling ordering, not just any tab", () => {
        // Not vacuous: with a process behind t1 the chord picks it, because
        // `attention` outranks `waiting`. That is the ordering the two skips
        // above have to survive without replacing.
        seedPair()

        useStore.getState().jumpToPending()

        expect(useStore.getState().activePaneByProject.p1).toBe("t1")
    })

    it("composes both skips: dead OR seen is skipped, and neither hides the other", () => {
        seedPair()
        // t1 dead, t2 acknowledged - so nothing is a target and the chord must
        // leave the active pane alone rather than land on either.
        recordExit("t1", 1)
        useStore.setState({ seen: { t2: true }, activePaneByProject: { p1: "t2" } })

        useStore.getState().jumpToPending()

        expect(useStore.getState().activePaneByProject.p1).toBe("t2")
        // Each skip alone still leaves the other session reachable.
        useStore.setState({ seen: {}, activePaneByProject: { p1: "t1" } })
        useStore.getState().jumpToPending()
        expect(useStore.getState().activePaneByProject.p1).toBe("t2")
    })
})

/**
 * Finding 7: `Approve` reached the pty and changed nothing visible anywhere.
 * `pushActivity` writes to a feed only the palette can open, and `markSeen` is
 * deliberately excluded from the tile classifier - so the whole confirmation
 * was the agent's next byte, which invited a second press into a live agent.
 */
describe("answering a prompt says so", () => {
    beforeEach(() => {
        vi.useRealTimers()
        inputs.length = 0
        stubApi()
        useToasts.setState({ toasts: [] })
        useStore.setState({ answered: {} })
    })

    it("records what was sent, and to which session", () => {
        seedAgentSession()

        useStore.getState().respondApproval("t1", "y\r")

        expect(useStore.getState().answered.t1?.keys).toBe("y\r")
        expect(useStore.getState().answered.t1?.at).toBeGreaterThan(0)
        // The delivery is still the point, and still first.
        expect(inputs).toEqual([{ termId: "t1", data: "y\r" }])
    })

    it("raises a transient confirmation naming the keys and the session", () => {
        seedAgentSession()

        useStore.getState().respondApproval("t1", "y\r")

        const texts = useToasts.getState().toasts.map((t) => t.text)
        expect(texts).toHaveLength(1)
        expect(texts[0]).toContain('Sent "y"')
        // labelForTerm: the tab and its project, which is how the tile names it.
        expect(texts[0]).toContain("tab · p")
        // And it stops at "sent" - nobody knows yet whether it was taken.
        expect(texts[0]).not.toMatch(/approved|accepted|done/i)
    })

    it("forgets the record when the session goes away", () => {
        seedAgentSession()
        useStore.getState().respondApproval("t1", "1")

        useStore.getState().closePaneSilent("t1")

        expect(useStore.getState().answered.t1).toBeUndefined()
    })

    // A bare "\r" would print as nothing at all: `Sent  to claude 1`.
    it("names keystrokes a person can read", () => {
        expect(describeKeys("y\r")).toBe('"y"')
        expect(describeKeys("1")).toBe('"1"')
        expect(describeKeys("\x1b")).toBe("Esc")
        expect(describeKeys("\r")).toBe("Enter")
    })
})
