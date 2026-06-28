import { useStore } from "../store"

const STATUS_LABEL: Record<string, string> = {
    running: "running",
    waiting: "needs you",
    done: "done",
    stopped: "stopped",
    error: "error"
}

/**
 * Floating indicator for the active pipeline run: current step, progress, and a
 * Stop control. Auto-hides a few seconds after the run finishes (handled in the
 * store by clearing pipelineRun).
 */
export function PipelineBar(): JSX.Element | null {
    const run = useStore((s) => s.pipelineRun)
    const stop = useStore((s) => s.stopPipeline)
    if (!run) return null

    const pct = Math.round(((run.stepIndex + (run.status === "done" ? 1 : 0)) / run.total) * 100)
    const live = run.status === "running" || run.status === "waiting"

    return (
        <div className={"pipeline-bar k-" + run.status}>
            <span className="pipeline-icon">⇥</span>
            <div className="pipeline-info">
                <div className="pipeline-title">
                    {run.name}
                    <span className="pipeline-step-count">
                        {Math.min(run.stepIndex + 1, run.total)}/{run.total}
                    </span>
                    <span className={"pipeline-status s-" + run.status}>
                        {STATUS_LABEL[run.status] ?? run.status}
                    </span>
                </div>
                <div className="pipeline-step">
                    {run.stepTitle}
                    {run.gateMsg && <span className="pipeline-gate"> · {run.gateMsg}</span>}
                </div>
                <div className="pipeline-progress">
                    <div className="pipeline-progress-fill" style={{ width: pct + "%" }} />
                </div>
            </div>
            {live ? (
                <button className="btn-min" onClick={stop} data-tip="Stop pipeline">
                    stop
                </button>
            ) : (
                <button className="btn-min" onClick={stop} data-tip="Dismiss">
                    ×
                </button>
            )}
        </div>
    )
}
