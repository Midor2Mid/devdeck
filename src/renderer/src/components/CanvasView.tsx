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
    const canvasLinks = useStore((s) => s.canvasLinks)
    const toggleCanvasLink = useStore((s) => s.toggleCanvasLink)
    const [linkSrc, setLinkSrc] = useState<string | null>(null)
    const agentOf = useStore((s) => s.agentOf)
    const agentStatus = useStore((s) => s.agentStatus)
    const setActiveTab = useStore((s) => s.setActiveTab)
    const setTermLayout = useStore((s) => s.setTermLayout)
    const focusPane = useStore((s) => s.focusPane)
    const closePane = useStore((s) => s.closePane)

    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
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
        // World coords are scaled by zoom, so convert screen delta back to world delta.
        const onMove = (ev: MouseEvent): void =>
            setDrag({
                termId,
                x: start.bx + (ev.clientX - start.mx) / zoom,
                y: start.by + (ev.clientY - start.my) / zoom
            })
        const onUp = (ev: MouseEvent): void => {
            window.removeEventListener("mousemove", onMove)
            window.removeEventListener("mouseup", onUp)
            setCanvasPos(termId, {
                x: start.bx + (ev.clientX - start.mx) / zoom,
                y: start.by + (ev.clientY - start.my) / zoom
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

    const onWheel = (e: React.WheelEvent): void => {
        if (!(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        setZoom((z) => Math.max(0.4, Math.min(2, z * (e.deltaY < 0 ? 1.1 : 0.9))))
    }
    const resetView = (): void => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }

    // Resolved position for each pane (drag override wins) — shared by cards + links.
    const posMap: Record<string, { x: number; y: number }> = {}
    panes.forEach((p, i) => {
        posMap[p.termId] = drag && drag.termId === p.termId ? { x: drag.x, y: drag.y } : posOf(p.termId, i)
    })

    return (
        <div
            className="canvas-surface"
            ref={surfaceRef}
            onMouseDown={startPan}
            onWheel={onWheel}
            onDoubleClick={(e) => {
                if (!(e.target as HTMLElement).closest(".canvas-card")) resetView()
            }}
        >
            <div
                className="canvas-world"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
                <svg className="canvas-links" width="12000" height="12000">
                    {canvasLinks.map((l, idx) => {
                        const pa = posMap[l.a]
                        const pb = posMap[l.b]
                        if (!pa || !pb) return null
                        const x1 = pa.x + W / 2
                        const y1 = pa.y + H / 2
                        const x2 = pb.x + W / 2
                        const y2 = pb.y + H / 2
                        return (
                            <g key={idx} onClick={() => toggleCanvasLink(l.a, l.b)}>
                                <line className="canvas-link-hit" x1={x1} y1={y1} x2={x2} y2={y2} />
                                <line className="canvas-link" x1={x1} y1={y1} x2={x2} y2={y2} />
                            </g>
                        )
                    })}
                </svg>
                {panes.map((p, i) => {
                    const pos = posMap[p.termId]
                    const isAgent = agentOf(p.termId) !== SHELL
                    return (
                        <div
                            key={p.termId}
                            className={"canvas-card" + (linkSrc === p.termId ? " linking" : "")}
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
                                    className={"grid-card-open" + (linkSrc ? " arm" : "")}
                                    title={
                                        linkSrc === p.termId
                                            ? "Click another card to link (or here to cancel)"
                                            : linkSrc
                                              ? "Link to this card"
                                              : "Start a connector from this card"
                                    }
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => {
                                        if (linkSrc && linkSrc !== p.termId) {
                                            toggleCanvasLink(linkSrc, p.termId)
                                            setLinkSrc(null)
                                        } else {
                                            setLinkSrc(linkSrc === p.termId ? null : p.termId)
                                        }
                                    }}
                                >
                                    ⚯
                                </span>
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
            <div className="canvas-hint muted small">
                drag header to move · ⚯ to connect cards · drag bg to pan · Ctrl+scroll zoom ({Math.round(zoom * 100)}%) · dbl-click reset
            </div>
        </div>
    )
}
