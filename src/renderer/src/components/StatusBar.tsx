import { useEffect, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import type { GitStatus, GitIdentity } from "../../../preload/index"

export function StatusBar(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    const sessions = useStore((s) => s.sessions)
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const remoteEnabled = useSettings((s) => s.remote.enabled)
    const setReleaseOpen = useStore((s) => s.setReleaseOpen)
    const gitAccounts = useSettings((s) => s.gitAccounts)
    const [git, setGit] = useState<GitStatus | null>(null)
    const [identity, setIdentity] = useState<GitIdentity | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)

    const path = project?.path

    useEffect(() => {
        if (!path) {
            setGit(null)
            setIdentity(null)
            return
        }
        let on = true
        const tick = (): void => {
            window.api.git.status(path).then((g) => on && setGit(g)).catch(() => undefined)
            window.api.git.getIdentity(path).then((i) => on && setIdentity(i)).catch(() => undefined)
        }
        tick()
        const iv = setInterval(tick, 5000)
        return () => {
            on = false
            clearInterval(iv)
        }
    }, [path])

    const applyAccount = async (acc: (typeof gitAccounts)[number]): Promise<void> => {
        if (!path) return
        const next = await window.api.git.setIdentity(path, {
            name: acc.name,
            email: acc.email,
            sshCommand: acc.sshCommand
        })
        setIdentity(next)
        setPickerOpen(false)
    }

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
                        <span className="sb-git-id">
                            <span
                                className="sb-item sb-identity"
                                title="Git identity for this repo — click to switch account"
                                onClick={() => setPickerOpen((v) => !v)}
                            >
                                ⦿ {identity?.name || "set identity"}
                            </span>
                            {pickerOpen && (
                                <>
                                    <div
                                        className="menu-backdrop"
                                        onClick={() => setPickerOpen(false)}
                                    />
                                    <div className="sb-id-menu">
                                        <div className="group-menu-title">Apply git account</div>
                                        {gitAccounts.length === 0 && (
                                            <div className="muted small" style={{ padding: "4px 8px" }}>
                                                Add accounts in Settings → Git
                                            </div>
                                        )}
                                        {gitAccounts.map((a) => (
                                            <div
                                                key={a.id}
                                                className="group-menu-item"
                                                onClick={() => applyAccount(a)}
                                            >
                                                {a.label}
                                                <span className="muted small"> · {a.email}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </span>
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
                {project && (
                    <span
                        className="sb-item sb-identity"
                        title="Release board — promote Dev → UAT → PROD"
                        onClick={() => setReleaseOpen(true)}
                    >
                        ⬆ release
                    </span>
                )}
                <span className="sb-item muted">DevDeck</span>
            </div>
        </div>
    )
}
