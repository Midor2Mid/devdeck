import { useEffect, useState, useCallback } from "react"
import { useStore } from "../store"
import type { ChangeFile } from "../../../preload/index"

/**
 * Review a repo's pending changes (a project or a worktree): see each file's
 * diff, then stage, discard, or commit. Post-hoc review of what the agents
 * wrote, in one place, before it lands as a commit.
 */
function DiffView({ patch }: { patch: string }): JSX.Element {
    if (!patch.trim()) return <div className="diff-empty">No textual diff (binary or no changes).</div>
    const lines = patch.split("\n")
    return (
        <div className="diff">
            {lines.map((ln, i) => {
                let cls = "d-ctx"
                if (ln.startsWith("+++") || ln.startsWith("---")) cls = "d-meta"
                else if (ln.startsWith("@@")) cls = "d-hunk"
                else if (ln.startsWith("diff ") || ln.startsWith("index ") || ln.startsWith("new ") || ln.startsWith("deleted ")) cls = "d-meta"
                else if (ln.startsWith("+")) cls = "d-add"
                else if (ln.startsWith("-")) cls = "d-del"
                return (
                    <div key={i} className={"d-line " + cls}>
                        {ln || " "}
                    </div>
                )
            })}
        </div>
    )
}

export function ChangesModal(): JSX.Element | null {
    const target = useStore((s) => s.changesTarget)
    const close = useStore((s) => s.closeChanges)

    const [files, setFiles] = useState<ChangeFile[]>([])
    const [sel, setSel] = useState<ChangeFile | null>(null)
    const [patch, setPatch] = useState("")
    const [msg, setMsg] = useState("")
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState("")

    const cwd = target?.cwd

    const refresh = useCallback(async () => {
        if (!cwd) return
        const list = await window.api.git.changes(cwd)
        setFiles(list)
        setSel((prev) => list.find((f) => f.path === prev?.path) ?? list[0] ?? null)
    }, [cwd])

    useEffect(() => {
        refresh()
    }, [refresh])

    useEffect(() => {
        if (cwd && sel) window.api.git.fileDiff(cwd, sel.path, sel.staged, sel.untracked).then(setPatch)
        else setPatch("")
    }, [cwd, sel])

    if (!target || !cwd) return null

    const act = async (fn: () => Promise<unknown>, ok: string): Promise<void> => {
        setBusy(true)
        await fn()
        setBusy(false)
        setNote(ok)
        refresh()
    }

    const stagedCount = files.filter((f) => f.staged).length
    const commit = async (): Promise<void> => {
        if (!msg.trim()) return
        setBusy(true)
        const res = await window.api.git.commit(cwd, msg.trim())
        setBusy(false)
        if (res.ok) {
            setMsg("")
            setNote("Committed.")
            refresh()
        } else {
            setNote(res.error || "Commit failed.")
        }
    }

    return (
        <div className="modal-backdrop" onMouseDown={() => close()}>
            <div className="modal changes-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <span>Review changes · {target.label}</span>
                    <div>
                        <button className="btn-min" onClick={refresh}>refresh</button>
                        <button className="btn-min" onClick={() => close()}>×</button>
                    </div>
                </div>

                <div className="changes-body">
                    <div className="ch-files">
                        {files.length === 0 ? (
                            <div className="muted sidebar-empty">Working tree clean — nothing to review.</div>
                        ) : (
                            files.map((f) => (
                                <div
                                    key={f.path}
                                    className={"ch-file" + (sel?.path === f.path ? " sel" : "")}
                                    onClick={() => setSel(f)}
                                >
                                    <span className={"ch-stat s-" + f.label.toLowerCase()}>{f.code.trim() || "??"}</span>
                                    <span className="ch-path" title={f.path}>{f.path}</span>
                                    {f.staged && <span className="ch-staged" title="Staged">●</span>}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="ch-diff">
                        {sel ? (
                            <>
                                <div className="ch-diff-bar">
                                    <span className="ch-diff-name">{sel.path}</span>
                                    <span className="spacer" />
                                    {sel.staged ? (
                                        <button className="btn-min" disabled={busy} onClick={() => act(() => window.api.git.unstage(cwd, sel.path), "Unstaged.")}>
                                            unstage
                                        </button>
                                    ) : (
                                        <button className="btn-min" disabled={busy} onClick={() => act(() => window.api.git.stage(cwd, sel.path), "Staged.")}>
                                            stage
                                        </button>
                                    )}
                                    <button
                                        className="btn-min danger"
                                        disabled={busy}
                                        onClick={() => {
                                            if (confirm(`Discard changes to ${sel.path}? This cannot be undone.`))
                                                act(() => window.api.git.discard(cwd, sel.path, sel.untracked), "Discarded.")
                                        }}
                                    >
                                        discard
                                    </button>
                                </div>
                                <DiffView patch={patch} />
                            </>
                        ) : (
                            <div className="diff-empty">Select a file to see its diff.</div>
                        )}
                    </div>
                </div>

                <div className="ch-commit">
                    <input
                        value={msg}
                        placeholder={`Commit message (${stagedCount || "no"} staged · commits all changes)`}
                        onChange={(e) => setMsg(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && commit()}
                    />
                    <button className="accent" disabled={!msg.trim() || busy || files.length === 0} onClick={commit}>
                        Commit all
                    </button>
                    {note && <span className="ch-note">{note}</span>}
                </div>
            </div>
        </div>
    )
}
