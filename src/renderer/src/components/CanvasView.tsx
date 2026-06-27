import { useRef, useState } from "react"
import { useStore, SHELL } from "../store"
import { SplitView } from "./SplitView"

export interface CanvasPane {
    termId: string
    tabName: string
    tabId: string
}

interface Props {
    panes: CanvasPane[]
    projectId: string
    cwd: string
}

const W = 440
const H = 290
const GAP = 30

/** Free-form spatial board: drag terminal cards anywhere, pan the surface. */
export function CanvasView({ panes, projectId, cwd }: Props): JSX.Element {
    const canvasPos = useStore((s) => s.canvasPos)
    const setCanvasPos = useStore((s) => s.setCanvasPos)
    const agentOf = useStore((s) => s.agentOf)
    const agentStatus = useStore((s) => s.agentStatus)
    const setActiveTab = useStore((s) => s.setActiveTab)
    const setTermLayout = useStore((s) => s.setTermLayout)
    const focusPane = useStore((s) => s.focusPane)
    const closePane = useStore((s) => s.closePane)

    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [drag, setDrag] = useState<{ termId: string; x: number; y: number } | null>(null)
    const surfaceRef = useRef<HTMLDivElement>(null)

    const posOf = (termId: string, i: number): { x: number; y: number } =>
        canvasPos[termId] ?? {
            x: (i % 3) * (W + GAP) + 24,
            y: Math.floor(i / 3) * (H + GAP) + 24
        }

    const startCardDrag = (e: React.MouseEvent, termId: string, i: number): void => {
        e.stopPropagation()
        const base = drag && drag.termId === termId ? drag : posOf(termId, i)
        const start = { mx: e.clientX, my: e.clientY, bx: base.x, by: base.y }
        const onMove = (ev: MouseEvent): void =>
            setDrag({ termId, x: start.bx + (ev.clientX - start.mx), y: start.by + (ev.clientY - start.my) })
        const onUp = (ev: MouseEvent): void => {
            window.removeEventListener("mousemove", onMove)
            window.removeEventListener("mouseup", onUp)
            setCanvasPos(termId, {
                x: start.bx + (ev.clientX - start.mx),
                y: start.by + (ev.clientY - start.my)
            })
            setDrag(null)
        }
        window.addEventListener("mousemove", onMove)
        window.addEventListener("mouseup", onUp)
    }

    const startPan = (e: React.MouseEvent): void => {
        if ((e.target as HTMLElement).closest(".canvas-card")) return
        const start = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
        const onMove = (ev: MouseEvent): void =>
            setPan({ x: start.px + (ev.clientX - start.mx), y: start.py + (ev.clientY - start.my) })
        const onUp = (): void => {
            window.removeEventListener("mousemove", onMove)
            window.removeEventListener("mouseup", onUp)
        }
        window.addEventListener("mousemove", onMove)
        window.addEventListener("mouseup", onUp)
    }

    return (
        <div className="canvas-surface" ref={surfaceRef} onMouseDown={startPan}>
            <div className="canvas-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
                {panes.map((p, i) => {
                    const pos = drag && drag.termId === p.termId ? drag : posOf(p.termId, i)
                    const isAgent = agentOf(p.termId) !== SHELL
                    return (
                        <div
                            key={p.termId}
                            className="canvas-card"
                            style={{ left: pos.x, top: pos.y, width: W, height: H }}
                        >
                            <div
                                className="grid-card-head canvas-drag"
                                onMouseDown={(e) => startCardDrag(e, p.termId, i)}
                            >
                                <span
                                    className={
                                        "tab-dot " +
                                        (isAgent
                                            ? "claude status-" + (agentStatus[p.termId] ?? "idle")
                                            : "shell")
                                    }
                                />
                                <span className="grid-card-name">{p.tabName}</span>
                                <span
                                    className="grid-card-open"
                                    title="Open in tabs view"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => {
                                        setActiveTab(projectId, p.tabId)
                                        focusPane(projectId, p.termId)
                                        setTermLayout("tabs")
                                    }}
                                >
                                    ↗
                                </span>
                                <span
                                    className="tab-close"
                                    title="Close"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => closePane(p.termId)}
                                >
                                    ×
                                </span>
                            </div>
                            <div className="grid-card-body">
                                <SplitView
                                    node={{ kind: "leaf", termId: p.termId }}
                                    projectId={projectId}
                                    cwd={cwd}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>
            <div className="canvas-hint muted small">drag a card's header to move · drag the background to pan</div>
        </div>
    )
}
