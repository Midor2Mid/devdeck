import { useEffect, useState } from "react"
import { useStore, SHELL } from "../store"
import { useSettings } from "../settings"
import { Modal } from "./Modal"
import type { Worktree } from "../../../preload/index"

/**
 * Manage git worktrees for the active project. Spin up an agent (or shell) in a
 * fresh worktree so parallel sessions on one repo don't collide, review a
 * worktree's changes, or remove it when done.
 */
export function WorktreesModal(): JSX.Element {
    const close = useStore((s) => s.setWorktreesOpen)
    const project = useStore((s) => s.activeProject())
    const newAgentInWorktree = useStore((s) => s.newAgentInWorktree)
    const newTab = useStore((s) => s.newTab)
    const openChanges = useStore((s) => s.openChanges)
    const agents = useSettings((s) => s.agents)

    const [list, setList] = useState<Worktree[]>([])
    const [branch, setBranch] = useState("")
    const [agentId, setAgentId] = useState(agents[0]?.id ?? "claude")
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState("")

    const refresh = (): void => {
        if (project) window.api.git.worktrees(project.path).then(setList)
    }
    useEffect(refresh, [project?.path])

    if (!project) {
        return (
            <Modal onClose={() => close(false)} labelledBy="worktrees-modal-title">
                <div className="modal-head"><span id="worktrees-modal-title">Worktrees</span>
                    <button className="btn-min" onClick={() => close(false)}>×</button>
                </div>
                <div className="modal-body"><p className="muted">No project selected.</p></div>
            </Modal>
        )
    }

    const create = async (mode: "agent" | "shell"): Promise<void> => {
        if (!branch.trim() || busy) return
        setBusy(true)
        setErr("")
        if (mode === "agent") {
            const id = await newAgentInWorktree(agentId, branch.trim())
            if (!id) setErr("Couldn't create the worktree (does the branch already have one?).")
            else return // modal closes on success
        } else {
            const res = await window.api.git.worktreeAdd(project.path, branch.trim())
            if (!res.ok || !res.path) setErr(res.error || "git worktree add failed")
            else {
                newTab(SHELL, undefined, res.branch, res.path)
                close(false)
                return
            }
        }
        setBusy(false)
        refresh()
    }

    const remove = async (wt: Worktree): Promise<void> => {
        setBusy(true)
        await window.api.git.worktreeRemove(project.path, wt.path)
        setBusy(false)
        refresh()
    }

    return (
        <Modal onClose={() => close(false)} className="worktrees-modal" labelledBy="worktrees-modal-title">
            <div className="modal-head">
                <span id="worktrees-modal-title">Worktrees · {project.name}</span>
                <button className="btn-min" onClick={() => close(false)}>×</button>
            </div>

            <div className="modal-body">
                <div className="wt-new">
                    <input
                        className="wt-branch"
                        value={branch}
                        placeholder="new branch, e.g. fix/JIRA-1423"
                        onChange={(e) => setBranch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && create("agent")}
                    />
                    <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                        {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    <button className="accent" disabled={!branch.trim() || busy} onClick={() => create("agent")}>
                        + Agent in worktree
                    </button>
                    <button disabled={!branch.trim() || busy} onClick={() => create("shell")}>
                        Shell only
                    </button>
                </div>
                {err && <p className="wt-err">{err}</p>}

                <div className="wt-list">
                    {list.map((wt) => (
                        <div key={wt.path} className="wt-row">
                            <span className="wt-icon">{wt.main ? "★" : "⑂"}</span>
                            <div className="wt-info">
                                <div className="wt-name">
                                    {wt.branch || "(detached)"}
                                    {wt.main && <span className="wt-tag">main</span>}
                                </div>
                                <div className="wt-path" data-tip={wt.path}>{wt.path}</div>
                            </div>
                            <button className="btn-min" onClick={() => openChanges(wt.path, wt.branch || wt.head)}>
                                review
                            </button>
                            {!wt.main && (
                                <button className="btn-min danger" disabled={busy} onClick={() => remove(wt)}>
                                    remove
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <p className="settings-hint">
                    Worktrees live in a sibling <code>{project.name}.worktrees</code> folder.
                    Removing one deletes that folder (its branch is kept).
                </p>
            </div>
        </Modal>
    )
}
