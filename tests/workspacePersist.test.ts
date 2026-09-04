import { describe, it, expect } from "vitest"
import { leaf, pruneNeverStarted, collectLeaves, type LayoutNode } from "../src/renderer/src/layout"

/**
 * A tab whose spawn failed was persisted like any other, so the next launch
 * restored it and retried the same doomed spawn. While a bad cwd could kill the
 * main process (node-pty throws asynchronously, outside every guard) that turned
 * one crash into a permanent one. pty.ts now reports `started: false` for a
 * session nothing was ever spawned for, and this is the filter that consumes it.
 */

const tab = (id: string, root: LayoutNode): { id: string; name: string; root: LayoutNode } => ({
    id,
    name: id,
    root
})

const split = (...children: LayoutNode[]): LayoutNode => ({ kind: "split", dir: "row", children })

describe("pruneNeverStarted", () => {
    it("drops a tab whose only pane never started", () => {
        const tabs = [tab("t1", leaf("dead")), tab("t2", leaf("alive"))]
        const out = pruneNeverStarted(tabs, new Set(["dead"]))
        expect(out.map((t) => t.id)).toEqual(["t2"])
    })

    it("keeps the tab and collapses the split when only one pane never started", () => {
        const tabs = [tab("t1", split(leaf("dead"), leaf("alive")))]
        const out = pruneNeverStarted(tabs, new Set(["dead"]))
        expect(out).toHaveLength(1)
        expect(collectLeaves(out[0].root)).toEqual(["alive"])
    })

    it("keeps a session that ran and exited — restoring the arrangement is the feature", () => {
        // "Dead" is not "never started". A shell you ran and exited must come back.
        const tabs = [tab("t1", leaf("ranThenExited"))]
        const out = pruneNeverStarted(tabs, new Set(["somethingElse"]))
        expect(out.map((t) => t.id)).toEqual(["t1"])
    })

    it("returns the same array when nothing never-started is known", () => {
        const tabs = [tab("t1", leaf("a"))]
        expect(pruneNeverStarted(tabs, new Set())).toBe(tabs)
    })

    it("does not mutate the tabs it was given", () => {
        const root = split(leaf("dead"), leaf("alive"))
        const tabs = [tab("t1", root)]
        pruneNeverStarted(tabs, new Set(["dead"]))
        expect(collectLeaves(root)).toEqual(["dead", "alive"])
    })

    it("drops every tab when a whole project failed to start", () => {
        const tabs = [tab("t1", leaf("d1")), tab("t2", split(leaf("d2"), leaf("d3")))]
        expect(pruneNeverStarted(tabs, new Set(["d1", "d2", "d3"]))).toEqual([])
    })
})
