import { describe, it, expect } from "vitest"
import {
    leaf,
    splitLeaf,
    removeLeaf,
    collectLeaves,
    firstLeaf,
    hasLeaf
} from "../src/renderer/src/layout"

describe("layout tree", () => {
    it("splits a leaf into a 2-pane split", () => {
        const r = splitLeaf(leaf("A"), "A", "row", "B")
        expect(r.kind).toBe("split")
        expect(collectLeaves(r)).toEqual(["A", "B"])
    })

    it("nests splits", () => {
        let r = splitLeaf(leaf("A"), "A", "row", "B")
        r = splitLeaf(r, "B", "col", "C")
        expect(collectLeaves(r).sort()).toEqual(["A", "B", "C"])
    })

    it("collapses a split with one remaining child on remove", () => {
        const r = splitLeaf(leaf("A"), "A", "row", "B")
        const after = removeLeaf(r, "B")
        expect(after).toEqual(leaf("A"))
    })

    it("removes from a 3-way split keeping a split", () => {
        let r = splitLeaf(leaf("A"), "A", "row", "B")
        r = splitLeaf(r, "B", "row", "C")
        const after = removeLeaf(r, "B")
        expect(after && collectLeaves(after).sort()).toEqual(["A", "C"])
    })

    it("returns null when the last leaf is removed", () => {
        expect(removeLeaf(leaf("A"), "A")).toBeNull()
    })

    it("firstLeaf + hasLeaf", () => {
        const r = splitLeaf(leaf("A"), "A", "row", "B")
        expect(firstLeaf(r)).toBe("A")
        expect(hasLeaf(r, "B")).toBe(true)
        expect(hasLeaf(r, "Z")).toBe(false)
    })

    it("does not mutate the input tree", () => {
        const original = leaf("A")
        splitLeaf(original, "A", "row", "B")
        expect(original).toEqual(leaf("A"))
    })
})
