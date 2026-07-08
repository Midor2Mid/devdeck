import { useEffect, useState } from "react"
import { useStore } from "../store"
import type { DotnetResult } from "../../../preload/index"

/**
 * Run `dotnet build`/`test` for the active project and show MSBuild diagnostics
 * as a clickable list — click a diagnostic to open it at its line in the editor.
 * Opened with Ctrl+Shift+B.
 */
export function DotnetPanel(): JSX.Element {
    const close = useStore((s) => s.setDotnetOpen)
    const activeProject = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const openInEditor = useStore((s) => s.openInEditor)

    const [mode, setMode] = useState<"build" | "test">("build")
    const [result, setResult] = useState<DotnetResult | null>(null)
    const [running, setRunning] = useState(false)

    const run = (m: "build" | "test"): void => {
        if (!activeProject) return
        setMode(m)
        setRunning(true)
        setResult(null)
        window.api.dotnet
            .run(activeProject.path, m)
            .then(setResult)
            .catch(() =>
                setResult({ ok: false, ran: false, summary: "Failed to run dotnet.", diagnostics: [] })
            )
            .finally(() => setRunning(false))
    }

    // Auto-run a build once on open; Esc closes.
    useEffect(() => {
        if (activeProject) run("build")
        const h = (e: KeyboardEvent): void => {
            if (e.key === "Escape") close(false)
        }
        window.addEventListener("keydown", h)
        return () => window.removeEventListener("keydown", h)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const errors = result?.diagnostics.filter((d) => d.severity === "error").length ?? 0
    const warnings = result?.diagnostics.filter((d) => d.severity === "warning").length ?? 0

    const openDiag = (absPath: string, line: number): void => {
        if (!activeProject) return
        openInEditor(activeProject.id, absPath, line)
        close(false)
    }

    return (
        <div className="switcher-backdrop" onMouseDown={() => close(false)}>
            <div className="dotnet-panel" onMouseDown={(e) => e.stopPropagation()}>
                <div className="dotnet-head">
                    <div className="dotnet-modes">
                        <button
                            className={mode === "build" ? "on" : ""}
                            onClick={() => run("build")}
                            disabled={running}
                        >
                            Build
                        </button>
                        <button
                            className={mode === "test" ? "on" : ""}
                            onClick={() => run("test")}
                            disabled={running}
                        >
                            Test
                        </button>
                    </div>
                    <span className="dotnet-target muted small">
                        {activeProject ? activeProject.name : "No project"}
                    </span>
                    <button
                        className="dotnet-run accent"
                        onClick={() => run(mode)}
                        disabled={running || !activeProject}
                    >
                        {running ? "Running…" : "Re-run"}
                    </button>
                </div>

                <div className="dotnet-status">
                    {running ? (
                        <span className="muted">dotnet {mode}…</span>
                    ) : result ? (
                        <span className={result.ok ? "dotnet-ok" : "dotnet-fail"}>
                            {result.summary}
                            {result.ran && result.diagnostics.length > 0
                                ? ` · ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`
                                : ""}
                        </span>
                    ) : null}
                </div>

                <div className="dotnet-list">
                    {result && result.ran && result.diagnostics.length === 0 && !running && (
                        <div className="muted switcher-empty">No errors or warnings.</div>
                    )}
                    {result?.diagnostics.map((d, i) => (
                        <div
                            key={i}
                            className={"dotnet-diag " + d.severity}
                            onClick={() => openDiag(d.absPath, d.line)}
                        >
                            <span className={"dotnet-dot " + d.severity} />
                            <span className="dotnet-loc">
                                {d.file}({d.line}
                                {d.col ? "," + d.col : ""})
                            </span>
                            <span className="dotnet-code">{d.code}</span>
                            <span className="dotnet-msg">{d.message}</span>
                        </div>
                    ))}
                </div>

                <div className="switcher-foot muted small">
                    click a diagnostic to open it · Esc close
                </div>
            </div>
        </div>
    )
}
