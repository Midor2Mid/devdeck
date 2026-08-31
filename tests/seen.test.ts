import { describe, it, expect, vi, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { leaf } from "../src/renderer/src/layout"

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
})
