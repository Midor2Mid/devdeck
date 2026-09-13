import { useCallback, useEffect, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { toast } from "../toast"
import type { GitStatus, GitIdentity, PullResult } from "../../../preload/index"
import { Icon } from "./Icon"
import { sessionDir, worktreeLeaf } from "../worktree"

/**
 * Facts about the repo you are in: branch, pull, changes, identity, remote.
 *
 * The wants-you count used to live at the end of this row, which put the one
 * number that changes what you do next in the far corner of the window among
 * facts you merely glance at. It is now `DeckWants`, immediately after the view
 * keys. Nothing was duplicated in the move - this file no longer counts.
 *
 * WHICH DIRECTORY THIS ROW IS ABOUT. The focused session's, not the active
 * project's. It polled `git.status(project.path)` until 2026-09-14, so with an
 * agent focused in `repo.worktrees/fix-JIRA-1423` the always-on-screen row made
 * three false statements at once: the branch chip said `main`, `● N changes`
 * counted the main tree's changes, and clicking it opened a diff of a tree that
 * agent never touched. The store already knew better - `termCwd[termId] ||
 * project.path` is the session's own directory, and `newAgentInWorktree` writes
 * it - so this is one changed data source, not a new axis.
 *
 * Clicking a deck key is therefore now also switching branch, which is the whole
 * property this buys: the switch was always one act (the session IS in the
 * worktree), what was missing is that the frame lied about which.
 *
 * `git.getIdentity` is the one thing that stays on the PROJECT path: git config
 * lives in the common dir and is shared across worktrees, so a per-worktree
 * identity chip would name a distinction the repo does not have.
 *
 * `termCwd` records where a session STARTED, not where its shell is now. A user
 * who types `cd ../other.worktrees/x` inside a pane is told the launch
 * directory's branch, and the copy says "started in" precisely so the chip does
 * not claim more than it knows. There is deliberately no visual state for that:
 * marking every session as possibly-stale is noise for a case nobody has been
 * observed doing.
 */
export function DeckStatus(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    // Two STABLE slices, derived outside the selector. `useStore(s =>
    // s.termCwd[s.activePaneByProject[...]])` would be fine, but anything that
    // built an object or an array here is the getSnapshot loop that neither the
    // build nor the typecheck catches.
    const termCwd = useStore((s) => s.termCwd)
    const activePaneByProject = useStore((s) => s.activePaneByProject)
    const remoteEnabled = useSettings((s) => s.remote.enabled)
    const openChanges = useStore((s) => s.openChanges)
    const gitAccounts = useSettings((s) => s.gitAccounts)
    const [git, setGit] = useState<GitStatus | null>(null)
    const [identity, setIdentity] = useState<GitIdentity | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [pulling, setPulling] = useState(false)
    // The project path still drives the identity chip and is the fallback for a
    // session with no override (and for no session at all).
    const projectPath = project?.path
    const pane = project ? activePaneByProject[project.id] : undefined
    // `path` is what every repo fact on this row is about, and it is now the
    // focused session's directory.
    const path = projectPath ? sessionDir(pane ? termCwd[pane] : undefined, projectPath) : undefined
    const leaf = path && projectPath ? worktreeLeaf(path, projectPath) : null
    // What the chips are about, in words, for a tooltip and a permanent label.
    const where = leaf ? "the worktree this session started in" : "the project folder"

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
        if (!path || !projectPath) {
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
            // The PROJECT path, not the session's: see the identity note above.
            window.api.git
                .getIdentity(projectPath)
                .then((i) => on && setIdentity(i))
                .catch(() => undefined)
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
        // Clearing on `path` covers switching project AND moving focus between a
        // worktree session and one in the project's own tree - both change what
        // this row is about, and showing the previous answer while the new read
        // lands is the same stale claim either way.
    }, [path, projectPath])

    const applyAccount = async (acc: (typeof gitAccounts)[number]): Promise<void> => {
        if (!projectPath) return
        const next = await window.api.git.setIdentity(projectPath, {
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
                    {/* The classification tier's SHAPE (bare uppercase,
                        letter-spaced, 10px) but --muted rather than the tier's
                        --faint: --faint on --bg-2 measures 4.25 Slate / 4.25
                        Sumi / 4.13 Washi, under the 4.5 text floor for a 10px
                        label on the row you never look away from. --muted is
                        6.98 / 5.49 / 4.46; Washi's 4.46 misses by 0.04, which is
                        a pre-existing property of --muted on that ground and is
                        not to be patched with a literal.

                        Shown ONLY in a worktree. On the project's own tree the
                        label is absent entirely - the marker only ever adds, so
                        its presence is the signal and the word says it. No
                        legend to learn, no accent, no sixth dot form. */}
                    {leaf && (
                        <span className="sb-item sb-worktree" aria-label="This session is in a git worktree">
                            WORKTREE
                        </span>
                    )}
                    <span
                        className="sb-item"
                        aria-label={`Current branch - ${where}`}
                        data-tip={`Current branch — ${where}`}
                        data-tip-pos="top"
                    >
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
                                      : leaf
                                        ? `Pull latest into ${git.branch} from ${git.upstream}`
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
                    {git.changes === null && project && path && (
                        <span
                            className="sb-item sb-changes unknown"
                            data-tip={
                                leaf
                                    ? "Couldn't read this worktree — click to try the diff"
                                    : "Couldn't read the working tree — click to try the diff"
                            }
                            data-tip-pos="top"
                            onClick={() => openChanges(path, leaf ?? project.name)}
                        >
                            ? changes
                        </span>
                    )}
                    {git.changes !== null && git.changes > 0 && project && path && (
                        <span
                            className="sb-item sb-changes"
                            data-tip={
                                leaf
                                    ? "Uncommitted changes in this worktree — click to review the diff"
                                    : "Uncommitted changes — click to review the diff"
                            }
                            data-tip-pos="top"
                            onClick={() => openChanges(path, leaf ?? project.name)}
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
