import { useEffect, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import type { GitStatus } from "../../../preload/index"

export function StatusBar(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    const sessions = useStore((s) => s.sessions)
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const remoteEnabled = useSettings((s) => s.remote.enabled)
    const [git, setGit] = useState<GitStatus | null>(null)

    const path = project?.path

    useEffect(() => {
        if (!path) {
            setGit(null)
            return
        }
        let on = true
        const tick = (): void => {
            window.api.git.status(path).then((g) => on && setGit(g)).catch(() => undefined)
        }
        tick()
        const iv = setInterval(tick, 5000)
        return () => {
            on = false
            clearInterval(iv)
        }
    }, [path])

    // Count active agents needing attention across all projects.
    const attention = sessions().filter((s) => s.status === "attention").length
    void tabsByProject
    void agentStatus

    return (
        <div className="statusbar">
            <div className="sb-left">
                {project ? (
                    <span className="sb-item sb-project">{project.name}</span>
                ) : (
                    <span className="sb-item muted">No project</span>
                )}
                {git?.isRepo && (
                    <>
                        <span className="sb-item" title="Current branch">
                            ⎇ {git.branch}
                        </span>
                        {git.changes > 0 && (
                            <span className="sb-item sb-changes" title="Uncommitted changes">
                                ● {git.changes} change{git.changes === 1 ? "" : "s"}
                            </span>
                        )}
                    </>
                )}
            </div>
            <div className="sb-right">
                {attention > 0 && (
                    <span className="sb-item sb-attn" title="Agent sessions needing attention">
                        ⚑ {attention}
                    </span>
                )}
                {remoteEnabled && (
                    <span className="sb-item sb-remote" title="Remote access enabled">
                        ● remote
                    </span>
                )}
                <span className="sb-item muted">DevDeck 0.1.0</span>
            </div>
        </div>
    )
}
