import { collectLeaves } from "./layout"
import type { Tab } from "./store"

export type PaneDir = "left" | "right" | "up" | "down"

/** A pane's on-screen box, in the same frame getBoundingClientRect reports. */
export interface PaneRect {
    termId: string
    left: number
    top: number
    right: number
    bottom: number
}

// Sub-pixel slack: rects come from layout, and a shared edge can read as
// 199.99 vs 200.01. One pixel is far below any real gap between panes.
const SLACK = 1

/** Every pane in a project, in the order the tab bar reads left to right. */
export function sessionIndexOrder(tabs: Tab[]): string[] {
    return tabs.flatMap((t) => collectLeaves(t.root))
}

/**
 * The pane a 1-based index selects, or undefined when the index selects nothing.
 *
 * 9 means "the last one" whatever the count, so the key at the end of the row is
 * never dead. Any other index past the end is a no-op rather than a clamp: Alt+5
 * with three sessions open must not quietly mean Alt+3, or the keys stop being
 * positions and start being guesses.
 */
export function paneAtIndex(tabs: Tab[], index: number): string | undefined {
    const order = sessionIndexOrder(tabs)
    if (!order.length) return undefined
    if (index === 9) return order[order.length - 1]
    return order[index - 1]
}

/**
 * The pane to focus when moving `dir` from `fromId`, or undefined to stay put.
 *
 * Geometry, deliberately, rather than a walk of the layout tree. In a nested
 * split the tree's shape and the screen's shape disagree: "right of A" is a
 * question about pixels, and a tree walk answers a question about siblings,
 * which is how you end up two panes away from where you were looking.
 *
 * A candidate must lie in that direction AND share more than a seam of the
 * perpendicular edge, so a pane touching only at a corner is not "right of"
 * anything. Among candidates, nearest along the axis wins; ties go to the one
 * sharing the most edge, then to the topmost/leftmost so the choice is stable.
 */
export function pickInDirection(
    rects: PaneRect[],
    fromId: string,
    dir: PaneDir
): string | undefined {
    const from = rects.find((r) => r.termId === fromId)
    if (!from) return undefined

    const horizontal = dir === "left" || dir === "right"
    const scored = rects
        .filter((r) => r.termId !== fromId)
        .map((r) => {
            // Distance along the axis of travel, and how much of the
            // perpendicular edge the two panes share.
            const gap =
                dir === "right"
                    ? r.left - from.right
                    : dir === "left"
                      ? from.left - r.right
                      : dir === "down"
                        ? r.top - from.bottom
                        : from.top - r.bottom
            const overlap = horizontal
                ? Math.min(from.bottom, r.bottom) - Math.max(from.top, r.top)
                : Math.min(from.right, r.right) - Math.max(from.left, r.left)
            return { r, gap, overlap }
        })
        .filter((c) => c.gap >= -SLACK && c.overlap > SLACK)

    if (!scored.length) return undefined
    scored.sort(
        (a, b) =>
            a.gap - b.gap ||
            b.overlap - a.overlap ||
            a.r.top - b.r.top ||
            a.r.left - b.r.left
    )
    return scored[0].r.termId
}

/** Toggle a pane's zoom: the same pane clears it, another pane takes it over. */
export function toggleZoom(zoomed: string | undefined, paneId: string): string | undefined {
    return zoomed === paneId ? undefined : paneId
}

/**
 * The zoom that actually applies, given what is on screen. Derived at render
 * rather than cleared on every event: a pane can be orphaned three separate ways
 * (closed, its tab switched away, the layout changed), and a zoom pointing at a
 * pane the stage is not showing would blank the stage. Deriving it means there is
 * no stale state to miss.
 */
export function validZoom(
    zoomed: string | undefined,
    layout: string,
    visiblePanes: string[]
): string | undefined {
    if (!zoomed || layout !== "tabs") return undefined
    return visiblePanes.includes(zoomed) ? zoomed : undefined
}
