import { useEffect, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import type { GitStatus, GitIdentity } from "../../../preload/index"
import { Icon } from "./Icon"

export function DeckStatus(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    const sessions = useStore((s) => s.sessions)
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
        // Each tick spawns two `git` child processes; skip entirely while the
        // window is hidden (nothing to show), and refresh on focus so it's fresh
        // the moment you come back. Cheaper than a fixed always-on 5s poll.
        const tick = (): void => {
            if (document.hidden) return
            window.api.git.status(path).then((g) => on && setGit(g)).catch(() => undefined)
            window.api.git.getIdentity(path).then((i) => on && setIdentity(i)).catch(() => undefined)
        }
        tick()
        const iv = setInterval(tick, 12000)
        const onFocus = (): void => tick()
        window.addEventListener("focus", onFocus)
        document.addEventListener("visibilitychange", onFocus)
        return () => {
            on = false
            clearInterval(iv)
            window.removeEventListener("focus", onFocus)
            document.removeEventListener("visibilitychange", onFocus)
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

    return (
        <div className="deck-status">
            {project ? (
                <span className="sb-item sb-project">{project.name}</span>
            ) : (
                <span className="sb-item muted">No project</span>
            )}
            {git?.isRepo && (
                <>
                    <span className="sb-item" data-tip="Current branch" data-tip-pos="top">
                        <Icon name="gitBranch" size={12} /> {git.branch}
                    </span>
                    {git.changes > 0 && (
                        <span className="sb-item sb-changes" data-tip="Uncommitted changes" data-tip-pos="top">
                            ● {git.changes} change{git.changes === 1 ? "" : "s"}
                        </span>
                    )}
                    <span className="sb-git-id">
                        <span
                            className="sb-item sb-identity"
                            data-tip="Git identity for this repo - click to switch account"
                            data-tip-pos="top"
                            onClick={() => setPickerOpen((v) => !v)}
                        >
                            <Icon name="user" size={12} /> {identity?.name || "set identity"}
                        </span>
                        {pickerOpen && (
                            <>
                                <div className="menu-backdrop" onClick={() => setPickerOpen(false)} />
                                <div className="sb-id-menu">
                                    <div className="group-menu-title">Apply git account</div>
                                    {gitAccounts.length === 0 && (
                                        <div className="muted small" style={{ padding: "4px 8px" }}>
                                            Add accounts in Settings → Git
                                        </div>
                                    )}
                                    {gitAccounts.map((a) => (
                                        <div key={a.id} className="group-menu-item" onClick={() => applyAccount(a)}>
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
            <span className="deck-status-spacer" />
            {attention > 0 && (
                <span className="sb-item sb-attn" data-tip="Agent sessions needing attention" data-tip-pos="top">
                    <Icon name="flag" size={12} /> {attention}
                </span>
            )}
            {remoteEnabled && (
                <span className="sb-item sb-remote" data-tip="Remote access enabled" data-tip-pos="top">
                    <Icon name="broadcast" size={12} /> remote
                </span>
            )}
            {project && (
                <span
                    className="sb-item sb-identity"
                    data-tip="Release board - promote Dev → UAT → PROD"
                    data-tip-pos="top"
                    onClick={() => setReleaseOpen(true)}
                >
                    <Icon name="release" size={12} /> release
                </span>
            )}
            <span className="sb-item muted">DevDeck</span>
        </div>
    )
}
