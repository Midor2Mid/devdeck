import { describe, it, expect } from "vitest"
import {
    pushClosed,
    restorePlan,
    reopenCommand,
    CLOSED_RING_CAP,
    type ClosedSession
} from "../src/renderer/src/closedSessions"

const closed = (over: Partial<ClosedSession> = {}): ClosedSession => ({
    termId: "t-1",
    projectId: "p1",
    tabId: "tab-1",
    tabName: "claude",
    name: "claude",
    agentId: "claude",
    isAgent: true,
    closedAt: 1,
    ...over
})

describe("pushClosed", () => {
    it("puts the newest closure first", () => {
        const ring = pushClosed(pushClosed([], closed({ termId: "a" })), closed({ termId: "b" }))
        expect(ring.map((c) => c.termId)).toEqual(["b", "a"])
    })

    it("drops the oldest past the cap", () => {
        let ring: ClosedSession[] = []
        for (let i = 0; i < CLOSED_RING_CAP + 3; i++) {
            ring = pushClosed(ring, closed({ termId: "t" + i, closedAt: i }))
        }
        expect(ring).toHaveLength(CLOSED_RING_CAP)
        // The three oldest are gone, the newest is still at the front.
        expect(ring[0].termId).toBe("t" + (CLOSED_RING_CAP + 2))
        expect(ring.some((c) => c.termId === "t0")).toBe(false)
    })

    it("never records the same dead terminal twice", () => {
        // closePane can be reached twice for one pane (the tab-close path closes
        // each of its panes), and two undo entries for one pane would reopen it
        // twice.
        const ring = pushClosed(pushClosed([], closed({ termId: "a" })), closed({ termId: "a" }))
        expect(ring).toHaveLength(1)
    })
})

describe("restorePlan", () => {
    it("reopens into the original tab when it is still open", () => {
        expect(restorePlan(closed({ tabId: "tab-1" }), [{ id: "tab-1" }, { id: "tab-2" }])).toEqual({
            kind: "same-tab",
            tabId: "tab-1"
        })
    })

    it("makes a new tab when the original one is gone", () => {
        expect(restorePlan(closed({ tabId: "tab-1" }), [{ id: "tab-2" }])).toEqual({
            kind: "new-tab"
        })
    })

    it("makes a new tab when the project has nothing open", () => {
        expect(restorePlan(closed(), [])).toEqual({ kind: "new-tab" })
    })
})

describe("reopenCommand", () => {
    it("resumes an agent whose preset knows how", () => {
        expect(reopenCommand(closed(), { command: "claude", resumeArgs: "--continue" })).toBe(
            "claude --continue"
        )
    })

    // Undefined means "let the launcher use the preset's own command" - a cold
    // start. Said explicitly because the alternative (guessing a resume flag)
    // would put an unsupported argument in front of the user's agent.
    it("starts an agent cold when its preset has no resume", () => {
        expect(reopenCommand(closed(), { command: "claude" })).toBeUndefined()
    })

    it("starts an agent cold when its preset is gone entirely", () => {
        expect(reopenCommand(closed(), undefined)).toBeUndefined()
    })

    it("re-runs a shell's startup command", () => {
        const shell = closed({ isAgent: false, agentId: "shell", initialCommand: "npm run dev" })
        expect(reopenCommand(shell, undefined)).toBe("npm run dev")
    })

    it("gives a plain shell no command at all", () => {
        expect(reopenCommand(closed({ isAgent: false, agentId: "shell" }), undefined)).toBeUndefined()
    })

    // A shell must never be resumed with an agent's flags, even if a preset with
    // that id exists (an agent renamed to a shell id, or a stale entry).
    it("ignores resumeArgs for a shell", () => {
        const shell = closed({ isAgent: false, agentId: "shell" })
        expect(reopenCommand(shell, { command: "claude", resumeArgs: "--continue" })).toBeUndefined()
    })
})
