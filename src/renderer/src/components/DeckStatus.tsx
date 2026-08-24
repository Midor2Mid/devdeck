import { useCallback, useEffect, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { toast } from "../toast"
import type { GitStatus, GitIdentity, PullResult } from "../../../preload/index"
import { Icon } from "./Icon"
import { awaitedTermIds, getLastAt } from "../missionTail"
import { exitCodeOf } from "../termExit"
import { wantsYou } from "../tileState"

export function DeckStatus(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    const sessions = useStore((s) => s.sessions)
    const remoteEnabled = useSettings((s) => s.remote.enabled)
    const setReleaseOpen = useStore((s) => s.setReleaseOpen)
    const openChanges = useStore((s) => s.openChanges)
    const gitAccounts = useSettings((s) => s.gitAccounts)
    // Stable slices only — the awaited Set below is derived in the component
    // body, not inside a useStore selector, to avoid the getSnapshot trap (a
    // selector returning a fresh object/array every call blanks the component).
    const boardTasks = useStore((s) => s.boardTasks)
    const pipelineRun = useStore((s) => s.pipelineRun)
    const termAgents = useStore((s) => s.termAgents)
    const [git, setGit] = useState<GitStatus | null>(null)
    const [identity, setIdentity] = useState<GitIdentity | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [pulling, setPulling] = useState(false)
    const path = project?.path

    /** Re-read branch/divergence now (after a pull), outside the poll cadence. */
    const refreshGit = useCallback(() => {
        if (!path) return
        window.api.git.status(path).then(setGit).catch(() => undefined)
    }, [path])

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

    const pull = async (): Promise<void> => {
        if (!path || pulling) return
        setPulling(true)
        const res: PullResult = await window.api.git
            .pull(path)
            .catch((e: Error) => ({ ok: false, error: e.message }))
        setPulling(false)
        toast(res.ok ? (res.summary ?? "Pulled.") : `Pull failed - ${res.error ?? "unknown error"}`)
        refreshGit()
    }

    // The ONE count in the frame for "who wants you". It covers both bell
    // "attention" and finished-a-turn "waiting", because the user's question is
    // "does anything need me", not "which mechanism raised it". The inbox used
    // to render a second, filled-accent badge on this same bar counting exactly
    // this set while the flag here counted only attention - two numbers for one
    // question, 200px apart, disagreeing by construction. Now both this flag and
    // Mission's header count read the same `wantsYou` predicate (tileState.ts),
    // so they cannot drift apart again.
    const now = Date.now()
    const awaited = awaitedTermIds(boardTasks, pipelineRun)
    const attention = sessions().filter((s) =>
        wantsYou(
            {
                status: s.status,
                exitCode: exitCodeOf(s.termId),
                lastAt: getLastAt(s.termId),
                awaited: awaited.has(s.termId),
                alive: !!termAgents[s.termId]
            },
            now
        )
    ).length

    return (
        <div className="deck-status">
            {/* Project name lives in the topbar; version lives in Settings → About.
                The deck keeps only what you actively watch: branch + changes, and
                compact icon indicators for identity / attention / remote / release. */}
            {git?.isRepo && (
                <>
                    <span className="sb-item" data-tip="Current branch" data-tip-pos="top">
                        <Icon name="gitBranch" size={12} /> {git.branch}
                    </span>
                    {/* Only offered when there's an upstream to pull from. The
                        behind-count rides on the button itself rather than adding
                        a second chip — one control carries both the state and the
                        action it invites. */}
                    {git.upstream && (
                        <button
                            type="button"
                            className={"sb-item sb-pull" + (git.behind > 0 ? " behind" : "")}
                            disabled={pulling}
                            aria-label={`Pull latest from ${git.upstream}`}
                            data-tip={
                                pulling
                                    ? `Pulling from ${git.upstream}`
                                    : git.behind > 0
                                      ? `Pull latest — ${git.behind} commit${git.behind === 1 ? "" : "s"} behind ${git.upstream}`
                                      : `Pull latest from ${git.upstream} — up to date`
                            }
                            data-tip-pos="top"
                            onClick={pull}
                        >
                            <Icon name="download" size={12} />
                            {git.behind > 0 && ` ${git.behind}`}
                        </button>
                    )}
                    {git.changes > 0 && project && (
                        <span
                            className="sb-item sb-changes"
                            data-tip="Uncommitted changes — click to review the diff"
                            data-tip-pos="top"
                            onClick={() => openChanges(project.path, project.name)}
                        >
                            ● {git.changes} change{git.changes === 1 ? "" : "s"}
                        </span>
                    )}
                    <span className="sb-git-id">
                        <span
                            className="sb-item sb-identity"
                            data-tip={`Git identity: ${identity?.name || "not set"} — click to switch account`}
                            data-tip-pos="top"
                            onClick={() => setPickerOpen((v) => !v)}
                        >
                            <Icon name="user" size={12} />
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
                <span className="sb-item sb-attn" data-tip="Agent sessions that want you - asking a question, or finished a turn" data-tip-pos="top">
                    <Icon name="flag" size={12} /> {attention}
                </span>
            )}
            {remoteEnabled && (
                <span className="sb-item sb-remote" data-tip="Remote access enabled" data-tip-pos="top">
                    <Icon name="broadcast" size={12} />
                </span>
            )}
            {project && (
                <span
                    className="sb-item sb-identity"
                    data-tip="Release board — promote Dev → UAT → PROD"
                    data-tip-pos="top"
                    onClick={() => setReleaseOpen(true)}
                >
                    <Icon name="release" size={12} />
                </span>
            )}
        </div>
    )
}
