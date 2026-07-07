import { describe, it, expect } from "vitest"
import { deriveDeckStrips, nextSession, COMPRESS_THRESHOLD } from "../src/renderer/src/deck"
import type { AnySession } from "../src/renderer/src/store"

function sess(over: Partial<AnySession>): AnySession {
    return {
        termId: "t",
        projectId: "p",
        projectName: "P",
        projectPath: "",
        tabName: "tab",
        sessionName: "s",
        agentId: "claude",
        badge: "CL",
        isAgent: true,
        status: "idle",
        ...over
    }
}

describe("deriveDeckStrips", () => {
    it("groups agent sessions by project in first-seen order", () => {
        const strips = deriveDeckStrips([
            sess({ termId: "a", projectId: "p1", projectName: "One" }),
            sess({ termId: "b", projectId: "p2", projectName: "Two" }),
            sess({ termId: "c", projectId: "p1", projectName: "One" })
        ])
        expect(strips.map((s) => s.projectId)).toEqual(["p1", "p2"])
        expect(strips[0].keys.map((k) => k.termId)).toEqual(["a", "c"])
    })

    it("marks a strip compressed only past the threshold", () => {
        const many = Array.from({ length: COMPRESS_THRESHOLD + 1 }, (_, i) =>
            sess({ termId: "k" + i, projectId: "p1" })
        )
        expect(deriveDeckStrips(many)[0].compressed).toBe(true)
        expect(deriveDeckStrips(many.slice(0, COMPRESS_THRESHOLD))[0].compressed).toBe(false)
    })

    it("prepends an empty strip for the active (cold) project when it has no keys", () => {
        const strips = deriveDeckStrips([sess({ projectId: "p1" })], { id: "cold", name: "Cold" })
        expect(strips[0]).toMatchObject({ projectId: "cold", keys: [] })
        expect(strips).toHaveLength(2)
    })

    it("does not duplicate the active project when it already has keys", () => {
        const strips = deriveDeckStrips([sess({ projectId: "p1", projectName: "One" })], {
            id: "p1",
            name: "One"
        })
        expect(strips).toHaveLength(1)
    })
})

describe("nextSession", () => {
    const list = [sess({ termId: "a" }), sess({ termId: "b" }), sess({ termId: "c" })]
    it("cycles forward and wraps", () => {
        expect(nextSession(list, "a", 1)).toBe("b")
        expect(nextSession(list, "c", 1)).toBe("a")
    })
    it("cycles backward and wraps", () => {
        expect(nextSession(list, "a", -1)).toBe("c")
    })
    it("returns first when current is unknown, null when fewer than two", () => {
        expect(nextSession(list, null, 1)).toBe("a")
        expect(nextSession([sess({ termId: "a" })], "a", 1)).toBeNull()
    })
})
