import { useCallback, useEffect, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { toast } from "../toast"
import type { GitStatus, GitIdentity, PullResult } from "../../../preload/index"
import { Icon } from "./Icon"

/**
 * Facts about the repo you are in: branch, pull, changes, identity, remote.
 *
 * The wants-you count used to live at the end of this row, which put the one
 * number that changes what you do next in the far corner of the window among
 * facts you merely glance at. It is now `DeckWants`, immediately after the view
 * keys. Nothing was duplicated in the move - this file no longer counts.
 */
export function DeckStatus(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    const remoteEnabled = useSettings((s) => s.remote.enabled)
    const openChanges = useStore((s) => s.openChanges)
    const gitAccounts = useSettings((s) => s.gitAccounts)
    const [git, setGit] = useState<GitStatus | null>(null)
    const [identity, setIdentity] = useState<GitIdentity | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [pulling, setPulling] = useState(false)
    const path = project?.path

    /**
     * Drop the change count while keeping the branch, for an IPC read that
     * failed outright.
     *
     * `gitStatus` never rejects, so this is the bridge itself going - and
     * swallowing it left the last count on screen indefinitely, presented as
     * current. The branch is still the branch; only the number is now unknown.
     */
    const forgetChanges = (): void => setGit((prev) => (prev ? { ...prev, changes: null } : prev))

    /** Re-read branch/divergence now (after a pull), outside the poll cadence. */
    const refreshGit = useCallback(() => {
        if (!path) return
        window.api.git.status(path).then(setGit).catch(forgetChanges)
    }, [path])

    useEffect(() => {
        if (!path) {
            setGit(null)
            setIdentity(null)
            return
        }
        // Clear first: without this, switching projects showed the PREVIOUS
        // project's branch and count until the new read landed.
        setGit(null)
        setIdentity(null)
        let on = true
        // Each tick spawns two `git` child processes; skip entirely while the
        // window is hidden (nothing to show), and refresh on focus so it's fresh
        // the moment you come back. Cheaper than a fixed always-on 5s poll.
        const tick = (): void => {
            if (document.hidden) return
            window.api.git.status(path).then((g) => on && setGit(g)).catch(() => on && forgetChanges())
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

    return (
        <div className="deck-status">
            {/* Project name lives in the topbar; version lives in Settings → About.
                The deck keeps only what you actively watch: branch + changes, and
                compact icon indicators for identity and remote access. The whole
                row right-aligns as one group (`justify-content: flex-end`), which
                is why there is no spacer inside it any more - the flag the spacer
                used to push to the far end is now `DeckWants`, up beside the
                view keys. */}
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
                    {/* Three cases, not two. A null count is "couldn't check",
                        and it keeps a chip: the chip disappearing is itself a
                        statement — "nothing to review" — and it was being made
                        on a `git status` that never came back. The unknown chip
                        carries its own glyph (?) as well as its own tone, per
                        DESIGN.md: state must read in form, not colour alone. */}
                    {git.changes === null && project && (
                        <span
                            className="sb-item sb-changes unknown"
                            data-tip="Couldn't read the working tree — click to try the diff"
                            data-tip-pos="top"
                            onClick={() => openChanges(project.path, project.name)}
                        >
                            ? changes
                        </span>
                    )}
                    {git.changes !== null && git.changes > 0 && project && (
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
            {remoteEnabled && (
                <span className="sb-item sb-remote" data-tip="Remote access enabled" data-tip-pos="top">
                    <Icon name="broadcast" size={12} />
                </span>
            )}
        </div>
    )
}
