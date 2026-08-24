import { describe, it, expect } from "vitest"
import { leaf, splitLeaf } from "../src/renderer/src/layout"
import {
    sessionIndexOrder,
    paneAtIndex,
    pickInDirection,
    toggleZoom,
    validZoom,
    type PaneRect
} from "../src/renderer/src/paneNav"
import type { Tab } from "../src/renderer/src/store"

const rect = (termId: string, x: number, y: number, w: number, h: number): PaneRect => ({
    termId,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h
})

const tab = (id: string, name: string, root: Tab["root"]): Tab => ({ id, name, root })

describe("sessionIndexOrder", () => {
    it("orders by tab, then by pane within a tab", () => {
        const tabs = [
            tab("t1", "one", splitLeaf(leaf("A"), "A", "row", "B")),
            tab("t2", "two", leaf("C"))
        ]
        expect(sessionIndexOrder(tabs)).toEqual(["A", "B", "C"])
    })

    it("keeps split order stable through a nested split", () => {
        let root = splitLeaf(leaf("A"), "A", "row", "B")
        root = splitLeaf(root, "B", "col", "C")
        expect(sessionIndexOrder([tab("t1", "one", root)])).toEqual(["A", "B", "C"])
    })

    it("is empty for a project with no tabs", () => {
        expect(sessionIndexOrder([])).toEqual([])
    })
})

describe("paneAtIndex", () => {
    const tabs = [
        tab("t1", "one", splitLeaf(leaf("A"), "A", "row", "B")),
        tab("t2", "two", leaf("C"))
    ]

    it("maps a 1-based index onto the order", () => {
        expect(paneAtIndex(tabs, 1)).toBe("A")
        expect(paneAtIndex(tabs, 3)).toBe("C")
    })

    // Alt+9 is "the last one", not "the ninth": with 3 sessions open, the key
    // that means "the end" has to land somewhere useful or it is a dead key.
    it("treats index 9 as the last session", () => {
        expect(paneAtIndex(tabs, 9)).toBe("C")
    })

    // ...but a middle index past the end is a no-op rather than a clamp, so
    // Alt+5 with 3 open does not silently mean Alt+3.
    it("returns undefined for an index past the end that is not 9", () => {
        expect(paneAtIndex(tabs, 5)).toBeUndefined()
    })

    it("returns undefined when nothing is open", () => {
        expect(paneAtIndex([], 1)).toBeUndefined()
        expect(paneAtIndex([], 9)).toBeUndefined()
    })
})

describe("pickInDirection", () => {
    // A | B  — the plain case, both directions.
    const twoWide = [rect("A", 0, 0, 100, 100), rect("B", 100, 0, 100, 100)]

    it("moves right to the neighbour", () => {
        expect(pickInDirection(twoWide, "A", "right")).toBe("B")
    })

    it("moves left back again", () => {
        expect(pickInDirection(twoWide, "B", "left")).toBe("A")
    })

    it("stays put at the edge", () => {
        expect(pickInDirection(twoWide, "B", "right")).toBeUndefined()
        expect(pickInDirection(twoWide, "A", "up")).toBeUndefined()
    })

    // A | B     A is full height on the left; B and C are stacked on the right.
    // A | C     Going right from A must pick the one it OVERLAPS most, which is
    //           B (A's whole edge touches both, but B shares A's top half and the
    //           cursor sits nearer it) - a tree walk would just take the first child.
    const lShaped = [
        rect("A", 0, 0, 100, 200),
        rect("B", 100, 0, 100, 100),
        rect("C", 100, 100, 100, 100)
    ]

    it("prefers the most-overlapping neighbour over the merely nearest", () => {
        // From C, going left, A is the only candidate and must be found even
        // though A's centre is far above C's.
        expect(pickInDirection(lShaped, "C", "left")).toBe("A")
    })

    it("moves down within a stacked column, not across it", () => {
        expect(pickInDirection(lShaped, "B", "down")).toBe("C")
        expect(pickInDirection(lShaped, "C", "up")).toBe("B")
    })

    it("ignores a pane that only touches diagonally", () => {
        // A sits top-left, D bottom-right: no shared edge, so right from A finds
        // nothing rather than jumping diagonally.
        const diagonal = [rect("A", 0, 0, 100, 100), rect("D", 100, 100, 100, 100)]
        expect(pickInDirection(diagonal, "A", "right")).toBeUndefined()
    })

    it("picks the nearer of two candidates in the same direction", () => {
        const row = [rect("A", 0, 0, 100, 100), rect("B", 100, 0, 100, 100), rect("C", 200, 0, 100, 100)]
        expect(pickInDirection(row, "A", "right")).toBe("B")
    })

    it("returns undefined when the origin pane is not on screen", () => {
        expect(pickInDirection(twoWide, "ghost", "right")).toBeUndefined()
    })

    it("returns undefined for a single pane", () => {
        expect(pickInDirection([rect("A", 0, 0, 100, 100)], "A", "right")).toBeUndefined()
    })
})

describe("toggleZoom", () => {
    it("zooms a pane when nothing is zoomed", () => {
        expect(toggleZoom(undefined, "A")).toBe("A")
    })

    it("unzooms when the same pane is toggled again", () => {
        expect(toggleZoom("A", "A")).toBeUndefined()
    })

    it("moves the zoom to another pane directly", () => {
        expect(toggleZoom("A", "B")).toBe("B")
    })
})

describe("validZoom", () => {
    // Derived at render rather than synced on every event: a zoom that outlives
    // its pane would blank the stage, and there are three separate ways to
    // orphan one (close the pane, switch tab, switch layout).
    it("holds while the pane is on the tabs stage", () => {
        expect(validZoom("A", "tabs", ["A", "B"])).toBe("A")
    })

    it("drops when the pane is gone", () => {
        expect(validZoom("A", "tabs", ["B", "C"])).toBeUndefined()
    })

    it("drops when the pane is not in the active tab", () => {
        expect(validZoom("A", "tabs", [])).toBeUndefined()
    })

    it("drops outside the tabs layout", () => {
        expect(validZoom("A", "grid", ["A"])).toBeUndefined()
        expect(validZoom("A", "canvas", ["A"])).toBeUndefined()
        expect(validZoom("A", "overview", ["A"])).toBeUndefined()
    })

    it("passes nothing through as nothing", () => {
        expect(validZoom(undefined, "tabs", ["A"])).toBeUndefined()
    })
})
