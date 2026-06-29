import { useState } from "react"
import { Allotment } from "allotment"
import { type LayoutNode, type SplitDir, collectLeaves } from "../layout"
import { TerminalPane } from "./TerminalPane"
import { useStore } from "../store"

/** Stable React key for a subtree: its terminal ids in order. */
function nodeKey(node: LayoutNode): string {
    return node.kind === "leaf" ? node.termId : "s:" + collectLeaves(node).join(",")
}

/** 4-way directional drop target shown over a pane while a tab is being dragged. */
function PaneDropZones({
    onDrop
}: {
    onDrop: (dir: SplitDir, side: "before" | "after") => void
}): JSX.Element {
    const [zone, setZone] = useState<string | null>(null)
    const mk = (key: string, dir: SplitDir, side: "before" | "after", cls: string): JSX.Element => (
        <div
            className={"drop-zone " + cls + (zone === key ? " on" : "")}
            onDragOver={(e) => {
                e.preventDefault()
                setZone(key)
            }}
            onDragLeave={() => setZone((z) => (z === key ? null : z))}
            onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDrop(dir, side)
                setZone(null)
            }}
        />
    )
    return (
        <div className="drop-zones">
            {mk("l", "row", "before", "dz-left")}
            {mk("r", "row", "after", "dz-right")}
            {mk("t", "col", "before", "dz-top")}
            {mk("b", "col", "after", "dz-bottom")}
        </div>
    )
}

interface Props {
    node: LayoutNode
    projectId: string
    cwd: string
    /** The tab this tree belongs to (set only for the Tabs layout) - enables drag-to-split. */
    tabId?: string
}

/** Recursively renders a tab's layout tree: leaves are terminals, splits nest Allotment. */
export function SplitView({ node, projectId, cwd, tabId }: Props): JSX.Element {
    const activePane = useStore((s) => s.activePaneByProject[projectId])
    const initialCommand = useStore((s) =>
        node.kind === "leaf" ? s.termInit[node.termId] : undefined
    )
    const focusPane = useStore((s) => s.focusPane)
    const draggingTabId = useStore((s) => s.draggingTabId)
    const moveTabToPane = useStore((s) => s.moveTabToPane)

    if (node.kind === "leaf") {
        // Show drop zones only when dragging a *different* tab onto this tab's panes.
        const showZones = !!draggingTabId && !!tabId && draggingTabId !== tabId
        const termId = node.termId
        return (
            <div className="pane-host">
                <TerminalPane
                    termId={termId}
                    initialCommand={initialCommand}
                    cwd={cwd}
                    focused={termId === activePane}
                    onFocus={(id) => focusPane(projectId, id)}
                />
                {showZones && (
                    <PaneDropZones
                        onDrop={(dir, side) =>
                            moveTabToPane(projectId, draggingTabId as string, termId, dir, side)
                        }
                    />
                )}
            </div>
        )
    }

    return (
        <Allotment vertical={node.dir === "col"} proportionalLayout>
            {node.children.map((child) => (
                <Allotment.Pane key={nodeKey(child)} minSize={120}>
                    <SplitView node={child} projectId={projectId} cwd={cwd} tabId={tabId} />
                </Allotment.Pane>
            ))}
        </Allotment>
    )
}
