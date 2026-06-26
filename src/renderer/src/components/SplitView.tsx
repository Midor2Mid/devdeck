import { Allotment } from "allotment"
import { type LayoutNode, collectLeaves } from "../layout"
import { TerminalPane } from "./TerminalPane"
import { useStore } from "../store"

/** Stable React key for a subtree: its terminal ids in order. */
function nodeKey(node: LayoutNode): string {
    return node.kind === "leaf" ? node.termId : "s:" + collectLeaves(node).join(",")
}

interface Props {
    node: LayoutNode
    projectId: string
    cwd: string
}

/** Recursively renders a tab's layout tree: leaves are terminals, splits nest Allotment. */
export function SplitView({ node, projectId, cwd }: Props): JSX.Element {
    const activePane = useStore((s) => s.activePaneByProject[projectId])
    const initialCommand = useStore((s) =>
        node.kind === "leaf" ? s.termInit[node.termId] : undefined
    )
    const focusPane = useStore((s) => s.focusPane)

    if (node.kind === "leaf") {
        return (
            <TerminalPane
                termId={node.termId}
                initialCommand={initialCommand}
                cwd={cwd}
                focused={node.termId === activePane}
                onFocus={(id) => focusPane(projectId, id)}
            />
        )
    }

    return (
        <Allotment vertical={node.dir === "col"} proportionalLayout>
            {node.children.map((child) => (
                <Allotment.Pane key={nodeKey(child)} minSize={120}>
                    <SplitView node={child} projectId={projectId} cwd={cwd} />
                </Allotment.Pane>
            ))}
        </Allotment>
    )
}
