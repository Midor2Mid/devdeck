import { describe, it, expect } from "vitest"
import { recordMru, orderByMru, previousProjectId } from "../src/renderer/src/projectMru"

describe("recordMru", () => {
    it("prepends a new id", () => {
        expect(recordMru([], "a")).toEqual(["a"])
        expect(recordMru(["a", "b"], "c")).toEqual(["c", "a", "b"])
    })

    it("moves an existing id to the front without duplicates", () => {
        expect(recordMru(["a", "b", "c"], "b")).toEqual(["b", "a", "c"])
        expect(recordMru(["a", "b", "c"], "c")).toEqual(["c", "a", "b"])
    })

    it("keeps the front id in place when re-recorded", () => {
        expect(recordMru(["a", "b"], "a")).toEqual(["a", "b"])
    })

    it("does not mutate the input array", () => {
        const mru = ["a", "b"]
        recordMru(mru, "b")
        expect(mru).toEqual(["a", "b"])
    })
})

describe("orderByMru", () => {
    it("sorts known ids by mru rank", () => {
        expect(orderByMru(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"])
    })

    it("puts unknown ids last, preserving input order among them", () => {
        expect(orderByMru(["x", "b", "y", "a"], ["a", "b"])).toEqual(["a", "b", "x", "y"])
    })

    it("leaves order untouched when the mru is empty", () => {
        expect(orderByMru(["a", "b", "c"], [])).toEqual(["a", "b", "c"])
    })

    it("ignores mru entries not present in ids", () => {
        expect(orderByMru(["b", "a"], ["ghost", "a", "b"])).toEqual(["a", "b"])
    })

    it("does not mutate the input array", () => {
        const ids = ["b", "a"]
        orderByMru(ids, ["a"])
        expect(ids).toEqual(["b", "a"])
    })
})

describe("previousProjectId", () => {
    it("returns the first mru entry that isn't the current id", () => {
        expect(previousProjectId(["a", "b", "c"], "a")).toBe("b")
        expect(previousProjectId(["a", "b"], "b")).toBe("a")
    })

    it("returns the front entry when current is null", () => {
        expect(previousProjectId(["a", "b"], null)).toBe("a")
    })

    it("returns null when there is no other project", () => {
        expect(previousProjectId([], "a")).toBeNull()
        expect(previousProjectId(["a"], "a")).toBeNull()
        expect(previousProjectId([], null)).toBeNull()
    })
})
