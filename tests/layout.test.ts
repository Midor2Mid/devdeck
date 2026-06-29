import { describe, it, expect } from "vitest"
import {
    leaf,
    splitLeaf,
    splitLeafWith,
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

    describe("splitLeafWith (drag-to-split: graft a subtree)", () => {
        it("inserts a subtree after the target leaf", () => {
            const r = splitLeafWith(leaf("A"), "A", "row", "after", leaf("B"))
            expect(r).toEqual({
                kind: "split",
                dir: "row",
                children: [leaf("A"), leaf("B")]
            })
        })

        it("honors the 'before' side and direction", () => {
            const r = splitLeafWith(leaf("A"), "A", "col", "before", leaf("B"))
            expect(r).toEqual({
                kind: "split",
                dir: "col",
                children: [leaf("B"), leaf("A")]
            })
        })

        it("grafts a multi-pane subtree (a whole tab's tree)", () => {
            const tabTree = splitLeaf(leaf("B"), "B", "row", "C") // B|C
            const r = splitLeafWith(leaf("A"), "A", "col", "after", tabTree)
            expect(collectLeaves(r)).toEqual(["A", "B", "C"])
            // A is split (col) against the grafted B|C subtree
            expect(r.kind === "split" && r.dir).toBe("col")
        })

        it("targets a leaf nested inside an existing split", () => {
            const base = splitLeaf(leaf("A"), "A", "row", "B") // A|B
            const r = splitLeafWith(base, "B", "col", "after", leaf("X"))
            expect(collectLeaves(r)).toEqual(["A", "B", "X"])
            expect(hasLeaf(r, "X")).toBe(true)
        })
    })
})
