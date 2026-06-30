import { useState } from "react"
import { useStore } from "../store"
import type { StepRunStatus } from "../pipeline"

const STATUS_LABEL: Record<string, string> = {
    running: "running",
    waiting: "needs you",
    done: "done",
    stopped: "stopped",
    error: "error"
}

const STEP_ICON: Record<StepRunStatus, string> = {
    pending: "○",
    running: "◐",
    done: "✓",
    failed: "✗",
    skipped: "–"
}

/**
 * Floating indicator for the active pipeline run: current step, progress, and a
 * Stop control. Click it to expand a per-step timeline (status + gate note +
 * jump-to-session). Auto-hides a few seconds after the run finishes.
 */
export function PipelineBar(): JSX.Element | null {
    const run = useStore((s) => s.pipelineRun)
    const stop = useStore((s) => s.stopPipeline)
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const [open, setOpen] = useState(false)
    if (!run) return null

    const pct = Math.round(((run.stepIndex + (run.status === "done" ? 1 : 0)) / run.total) * 100)
    const live = run.status === "running" || run.status === "waiting"

    return (
        <div className={"pipeline-bar k-" + run.status}>
            <span
                className="pipeline-icon"
                onClick={() => setOpen((v) => !v)}
                data-tip={open ? "Collapse steps" : "Show steps"}
            >
                {open ? "▾" : "⇥"}
            </span>
            <div className="pipeline-info" onClick={() => setOpen((v) => !v)}>
                <div className="pipeline-title">
                    {run.name}
                    <span className="pipeline-step-count">
                        {Math.min(run.stepIndex + 1, run.total)}/{run.total}
                    </span>
                    <span className={"pipeline-status s-" + run.status}>
                        {STATUS_LABEL[run.status] ?? run.status}
                    </span>
                </div>
                {!open && (
                    <div className="pipeline-step">
                        {run.stepTitle}
                        {run.gateMsg && <span className="pipeline-gate"> · {run.gateMsg}</span>}
                    </div>
                )}
                <div className="pipeline-progress">
                    <div className="pipeline-progress-fill" style={{ width: pct + "%" }} />
                </div>
                {open && (
                    <div className="pipeline-steps">
                        {run.steps.map((st, i) => (
                            <div key={i} className={"pipeline-step-row st-" + st.status}>
                                <span className="pipeline-step-icon">{STEP_ICON[st.status]}</span>
                                <span className="pipeline-step-name">{st.title}</span>
                                {st.gateMsg && <span className="pipeline-gate">{st.gateMsg}</span>}
                                <span className="spacer" />
                                {st.termId && (
                                    <button
                                        className="btn-min"
                                        data-tip="Jump to this session"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            jumpToTerm(st.termId!)
                                        }}
                                    >
                                        ↗
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <button className="btn-min" onClick={stop} data-tip={live ? "Stop pipeline" : "Dismiss"}>
                {live ? "stop" : "×"}
            </button>
        </div>
    )
}
