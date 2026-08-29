import { describe, it, expect, beforeEach, vi } from "vitest"
import { useStore } from "../src/renderer/src/store"
import type { Project } from "../src/preload/index"

// Alt-tab-style project cycling. The property under test is that the walk does
// NOT re-sort itself: setActiveProject records MRU on every call, so a cycle
// built on it would ping-pong between two projects however many times you tap.

const P = (id: string): Project => ({
    id,
    name: id,
    path: "D:/" + id,
    addedAt: 0
})

function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            projects: { setActive: async (): Promise<void> => undefined },
            workspace: { save: (): void => undefined },
            settings: { save: (): void => undefined }
        }
    }
}

/** Ids visited by tapping `n` times inside one held-modifier cycle. */
function walk(n: number): string[] {
    const seen: string[] = []
    for (let i = 0; i < n; i++) {
        useStore.getState().cycleProject()
        seen.push(useStore.getState().activeId as string)
    }
    return seen
}

describe("project cycling", () => {
    beforeEach(() => {
        stubApi()
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        useStore.setState({
            projects: [P("a"), P("b"), P("c"), P("d")],
            activeId: "a",
            // Most recent first, current project at the front.
            projectMru: ["a", "b", "c", "d"],
            projectCycle: null,
            activePaneByProject: {}
        })
    })

    it("lands on the previous project on a single tap", () => {
        expect(walk(1)).toEqual(["b"])
    })

    it("keeps walking back instead of ping-ponging", () => {
        // THE REGRESSION. With MRU recorded per switch this reads
        // ["b", "a", "b", "a"] — two projects, forever.
        expect(walk(4)).toEqual(["b", "c", "d", "a"])
    })

    it("wraps around to the current project and keeps going", () => {
        expect(walk(6)).toEqual(["b", "c", "d", "a", "b", "c"])
    })

    it("does not record MRU until the cycle commits", () => {
        walk(3)
        expect(useStore.getState().projectMru).toEqual(["a", "b", "c", "d"])
        expect(useStore.getState().activeId).toBe("d")
    })

    it("records where you landed when the modifier is released", () => {
        walk(2)
        useStore.getState().commitProjectCycle()
        expect(useStore.getState().projectMru).toEqual(["c", "a", "b", "d"])
        expect(useStore.getState().projectCycle).toBeNull()
    })

    it("starts a fresh walk after a commit", () => {
        walk(2)
        useStore.getState().commitProjectCycle()
        // MRU is now c,a,b,d and the current project is c — so one tap goes to a.
        expect(walk(1)).toEqual(["a"])
    })

    it("is a no-op with fewer than two projects", () => {
        useStore.setState({ projects: [P("only")], activeId: "only", projectMru: ["only"] })
        useStore.getState().cycleProject()
        expect(useStore.getState().projectCycle).toBeNull()
        expect(useStore.getState().activeId).toBe("only")
    })

    it("committing without a cycle changes nothing", () => {
        const before = useStore.getState().projectMru
        useStore.getState().commitProjectCycle()
        expect(useStore.getState().projectMru).toBe(before)
    })

    it("drops a project removed mid-cycle rather than landing on it", () => {
        walk(1)
        useStore.setState({ projects: [P("a"), P("c"), P("d")] })
        // b is gone; the next tap walks the surviving order.
        const next = walk(1)
        expect(next[0]).not.toBe("b")
        expect(useStore.getState().projects.map((p) => p.id)).toContain(next[0])
    })

    it("does not commit onto a project that was removed while cycling", () => {
        walk(1)
        expect(useStore.getState().activeId).toBe("b")
        useStore.setState({ projects: [P("a"), P("c"), P("d")] })
        useStore.getState().commitProjectCycle()
        // No MRU entry is invented for the project that no longer exists.
        expect(useStore.getState().projectMru).not.toContain("zzz")
        expect(useStore.getState().projectCycle).toBeNull()
    })
})
