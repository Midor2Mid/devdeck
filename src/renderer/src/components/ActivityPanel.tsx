import { useStore, type ActivityKind } from "../store"

const ICON: Record<ActivityKind, string> = {
    start: "▸",
    attention: "⚑",
    close: "×",
    record: "⏺",
    pipeline: "⇥"
}

function ago(ts: number): string {
    const s = Math.round((Date.now() - ts) / 1000)
    if (s < 60) return s + "s ago"
    const m = Math.round(s / 60)
    if (m < 60) return m + "m ago"
    const h = Math.round(m / 60)
    return h + "h ago"
}

export function ActivityPanel(): JSX.Element {
    const activity = useStore((s) => s.activity)
    const close = useStore((s) => s.setActivityOpen)
    const clear = useStore((s) => s.clearActivity)
    const jumpToTerm = useStore((s) => s.jumpToTerm)

    return (
        <div className="drawer-backdrop" onMouseDown={() => close(false)}>
            <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
                <div className="drawer-head">
                    <span>Activity</span>
                    <div>
                        <button className="btn-min" onClick={clear} data-tip="Clear">
                            clear
                        </button>
                        <button className="btn-min" onClick={() => close(false)} data-tip="Close">
                            ×
                        </button>
                    </div>
                </div>
                <div className="drawer-body">
                    {activity.length === 0 ? (
                        <div className="muted sidebar-empty">
                            No activity yet. Agent sessions starting, needing attention, or closing
                            will show here.
                        </div>
                    ) : (
                        activity.map((e) => (
                            <div
                                key={e.id}
                                className={"activity-row k-" + e.kind}
                                onClick={() => {
                                    jumpToTerm(e.termId)
                                    close(false)
                                }}
                            >
                                <span className="activity-icon">{ICON[e.kind]}</span>
                                <span className="activity-label">{e.label}</span>
                                <span className="activity-time">{ago(e.ts)}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
