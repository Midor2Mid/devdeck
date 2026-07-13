import { useEffect, useRef, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { THEMES } from "../themes"
import { frameDelay } from "../recPlayback"

interface RecEvent {
    dt: number
    data: string
}
interface Recording {
    label: string
    createdAt: number
    events: RecEvent[]
}
interface RecordingMeta {
    name: string
    path: string
    label: string
    createdAt: number
    events: number
}

const SPEEDS = [1, 2, 4, 8]

function ago(ts: number): string {
    if (!ts) return ""
    const s = Math.round((Date.now() - ts) / 1000)
    if (s < 60) return s + "s ago"
    const m = Math.round(s / 60)
    if (m < 60) return m + "m ago"
    const h = Math.round(m / 60)
    if (h < 24) return h + "h ago"
    return Math.round(h / 24) + "d ago"
}

/**
 * Lists recordings for the active project and replays a chosen one into a
 * read-only xterm with play / pause / restart and speed controls. Playback is
 * driven by each frame's stored inter-event delay (capped), scaled by speed.
 */
export function RecordingsModal(): JSX.Element {
    const close = useStore((s) => s.setRecordingsOpen)
    const activeId = useStore((s) => s.activeId)
    const projectPath = useStore((s) => s.projects.find((p) => p.id === activeId)?.path)

    const [list, setList] = useState<RecordingMeta[]>([])
    const [current, setCurrent] = useState<Recording | null>(null)
    const [playing, setPlaying] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [progress, setProgress] = useState(0)

    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const idxRef = useRef(0)
    const playingRef = useRef(false)
    const speedRef = useRef(1)
    const eventsRef = useRef<RecEvent[]>([])

    useEffect(() => {
        speedRef.current = speed
    }, [speed])

    useEffect(() => {
        if (!projectPath) return
        window.api.rec.list(projectPath).then(setList)
    }, [projectPath])

    const clearTimer = (): void => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
    }

    // Build the player terminal once a recording is loaded.
    useEffect(() => {
        if (!current) return
        const container = containerRef.current
        if (!container) return
        const themeId = useSettings.getState().appearance.theme
        const term = new Terminal({
            fontFamily: useSettings.getState().terminal.fontFamily,
            fontSize: useSettings.getState().terminal.fontSize,
            cursorBlink: false,
            disableStdin: true,
            allowProposedApi: true,
            lineHeight: THEMES[themeId].termLineHeight,
            theme: THEMES[themeId].xterm
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(container)
        termRef.current = term
        fitRef.current = fit
        eventsRef.current = current.events
        idxRef.current = 0
        setProgress(0)
        requestAnimationFrame(() => {
            try {
                fit.fit()
            } catch {
                /* noop */
            }
            startPlayback()
        })
        return () => {
            clearTimer()
            playingRef.current = false
            term.dispose()
            termRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current])

    const tick = (): void => {
        const events = eventsRef.current
        const term = termRef.current
        if (!term) return
        if (idxRef.current >= events.length) {
            playingRef.current = false
            setPlaying(false)
            return
        }
        const ev = events[idxRef.current]
        const delay = frameDelay(idxRef.current, ev.dt, speedRef.current)
        timer.current = setTimeout(() => {
            term.write(ev.data)
            idxRef.current += 1
            setProgress(idxRef.current)
            if (playingRef.current) tick()
        }, delay)
    }

    const startPlayback = (): void => {
        playingRef.current = true
        setPlaying(true)
        tick()
    }

    const togglePlay = (): void => {
        if (playingRef.current) {
            playingRef.current = false
            setPlaying(false)
            clearTimer()
        } else {
            if (idxRef.current >= eventsRef.current.length) {
                termRef.current?.reset()
                idxRef.current = 0
                setProgress(0)
            }
            startPlayback()
        }
    }

    const restart = (): void => {
        clearTimer()
        termRef.current?.reset()
        idxRef.current = 0
        setProgress(0)
        startPlayback()
    }

    const total = eventsRef.current.length || current?.events.length || 1
    const pct = Math.round((progress / total) * 100)

    return (
        <div className="modal-backdrop" onMouseDown={() => close(false)}>
            <div
                className="modal recordings-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="modal-head">
                    <span>{current ? `Replay · ${current.label}` : "Recordings"}</span>
                    <div>
                        {current && (
                            <button className="btn-min" onClick={() => setCurrent(null)}>
                                ← list
                            </button>
                        )}
                        <button className="btn-min" onClick={() => close(false)}>
                            ×
                        </button>
                    </div>
                </div>

                {!current ? (
                    <div className="modal-body recordings-list">
                        {list.length === 0 ? (
                            <div className="muted sidebar-empty">
                                No recordings yet. Hit ⏺ in the terminal toolbar to record a
                                session, then it appears here for replay.
                            </div>
                        ) : (
                            list.map((r) => (
                                <div
                                    key={r.path}
                                    className="recording-row"
                                    onClick={() => window.api.rec.load(r.path).then(setCurrent)}
                                >
                                    <span className="recording-icon">⏺</span>
                                    <span className="recording-label">{r.label}</span>
                                    <span className="recording-meta">
                                        {r.events} frames · {ago(r.createdAt)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="modal-body replay-body">
                        <div className="replay-controls">
                            <button className="icon-action" onClick={togglePlay}>
                                {playing ? "⏸" : "▶"}
                            </button>
                            <button className="icon-action" onClick={restart} data-tip="Restart">
                                ↺
                            </button>
                            <div className="replay-progress">
                                <div className="replay-progress-fill" style={{ transform: "scaleX(" + pct / 100 + ")" }} />
                            </div>
                            <div className="replay-speeds">
                                {SPEEDS.map((sp) => (
                                    <button
                                        key={sp}
                                        className={"btn-min" + (speed === sp ? " on" : "")}
                                        onClick={() => setSpeed(sp)}
                                    >
                                        {sp}×
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div ref={containerRef} className="replay-term" />
                    </div>
                )}
            </div>
        </div>
    )
}
