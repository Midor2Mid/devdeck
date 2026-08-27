// A tab's terminals are arranged as a binary-ish split tree. Leaves reference a
// terminal by id; split nodes lay their children out in a row or column.

export type SplitDir = "row" | "col"

export type LayoutNode =
    | { kind: "leaf"; termId: string }
    | { kind: "split"; dir: SplitDir; children: LayoutNode[] }

export function leaf(termId: string): LayoutNode {
    return { kind: "leaf", termId }
}

/**
 * Validate a value read off disk as a real layout tree.
 *
 * This belongs at the one door persisted layout comes through (store `init()`),
 * NOT inside the walkers. `collectLeaves` and `firstLeaf` recurse without null
 * checks, so a tab whose `root` is missing or written by an older schema throws
 * on the walk - and that throw used to escape `init()`, leaving the store on its
 * module-load defaults which the next `flush()` wrote over the real workspace.
 * Guarding here drops the one bad tab; guarding in the walkers would spread the
 * check to every future caller and still let the bad value in.
 */
export function isLayoutNode(x: unknown): x is LayoutNode {
    if (!x || typeof x !== "object") return false
    const n = x as { kind?: unknown; termId?: unknown; children?: unknown }
    if (n.kind === "leaf") return typeof n.termId === "string"
    if (n.kind === "split") {
        return Array.isArray(n.children) && n.children.length > 0 && n.children.every(isLayoutNode)
    }
    return false
}

/** Replace the leaf for `targetId` with a split containing it plus a new leaf. */
export function splitLeaf(
    node: LayoutNode,
    targetId: string,
    dir: SplitDir,
    newTermId: string
): LayoutNode {
    if (node.kind === "leaf") {
        if (node.termId !== targetId) return node
        return { kind: "split", dir, children: [leaf(targetId), leaf(newTermId)] }
    }
    return { ...node, children: node.children.map((c) => splitLeaf(c, targetId, dir, newTermId)) }
}

/**
 * Replace the leaf for `targetId` with a split that places `insert` (an arbitrary
 * subtree) beside it. `side` is where `insert` goes relative to the target.
 * Used to drop one tab's whole layout into a pane of another tab (drag-to-split).
 */
export function splitLeafWith(
    node: LayoutNode,
    targetId: string,
    dir: SplitDir,
    side: "before" | "after",
    insert: LayoutNode
): LayoutNode {
    if (node.kind === "leaf") {
        if (node.termId !== targetId) return node
        const children = side === "before" ? [insert, leaf(targetId)] : [leaf(targetId), insert]
        return { kind: "split", dir, children }
    }
    return {
        ...node,
        children: node.children.map((c) => splitLeafWith(c, targetId, dir, side, insert))
    }
}

/** Remove a leaf, collapsing any split left with a single child. Returns null if empty. */
export function removeLeaf(node: LayoutNode, termId: string): LayoutNode | null {
    if (node.kind === "leaf") {
        return node.termId === termId ? null : node
    }
    const children = node.children
        .map((c) => removeLeaf(c, termId))
        .filter((c): c is LayoutNode => c !== null)
    if (children.length === 0) return null
    if (children.length === 1) return children[0]
    return { ...node, children }
}

export function collectLeaves(node: LayoutNode): string[] {
    return node.kind === "leaf" ? [node.termId] : node.children.flatMap(collectLeaves)
}

export function firstLeaf(node: LayoutNode): string {
    return node.kind === "leaf" ? node.termId : firstLeaf(node.children[0])
}

export function hasLeaf(node: LayoutNode, termId: string): boolean {
    return node.kind === "leaf"
        ? node.termId === termId
        : node.children.some((c) => hasLeaf(c, termId))
}
