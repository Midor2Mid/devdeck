import { useEffect, useState, useCallback, useMemo } from "react"
import { useStore } from "../store"
import { useSettings, aiModeAgents } from "../settings"
import { Modal } from "./Modal"
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
    const aiOnDiff = useStore((s) => s.aiOnDiff)
    const openPr = useStore((s) => s.openPr)

    // `null` until the first read resolves, and again whenever one fails — an
    // empty array here is rendered as "Working tree clean", so it must mean
    // exactly that and nothing else.
    const [files, setFiles] = useState<ChangeFile[] | null>(null)
    const [readError, setReadError] = useState("")
    const [sel, setSel] = useState<ChangeFile | null>(null)
    const [patch, setPatch] = useState("")
    const [msg, setMsg] = useState("")
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState("")
    // Select the stable array and filter in a memo — filtering *inside* the
    // selector returns a fresh array every render, which zustand reads as a new
    // value and spins into an infinite update loop (React #185).
    const agents = useSettings((s) => s.agents)
    // Only AI-mode presets can take a diff; normal-mode ones are plain commands.
    const aiAgents = useMemo(() => aiModeAgents(agents), [agents])
    const [handoffTo, setHandoffTo] = useState("")
    // Settings load async, so the first render can precede the agent list; fall
    // back to the first agent until an explicit pick is made.
    const handoffAgent = aiAgents.some((a) => a.id === handoffTo) ? handoffTo : (aiAgents[0]?.id ?? "")

    const cwd = target?.cwd

    const refresh = useCallback(async () => {
        if (!cwd) return
        // A failed read (transient lock, missing git, timeout) rejects rather
        // than resolving empty (see main/changes.ts's listChanges). Catching it
        // to [] put the words "Working tree clean - nothing to review" in front
        // of a user whose tree the app had just failed to read.
        let list: ChangeFile[]
        try {
            list = await window.api.git.changes(cwd)
        } catch (e) {
            // Electron wraps a rejected handler as "Error invoking remote method
            // 'git:changes': Error: fatal: ...". The user needs git's sentence,
            // not the plumbing that carried it.
            const raw = (e as Error).message || "git status failed"
            setReadError(raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, ""))
            setFiles(null)
            // Drop the selection too. Leaving it put a stale diff - with live
            // stage / unstage / DISCARD buttons acting on it - beside a panel
            // saying the tree could not be read.
            setSel(null)
            setPatch("")
            return
        }
        setReadError("")
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

    // Everything below reads a list. `null` (unread) is not an empty tree, so it
    // is kept distinct above and flattened here only for arithmetic - the empty
    // STATE is rendered from `files === null` separately.
    const fileList = files ?? []
    // A tree we could not read must not disable the actions. `fileList.length
    // === 0` alone made an unreadable tree behave exactly like a clean one - the
    // same collapse this change exists to remove, one `??` further down. The AI
    // actions and the commit read the tree themselves; let them try.
    const nothingToActOn = files !== null && files.length === 0
    const stagedCount = fileList.filter((f) => f.staged).length
    const commit = async (): Promise<void> => {
        if (!msg.trim()) return
        setBusy(true)
        // Staging anything is taken as "commit exactly this"; with nothing staged
        // we keep the stage-everything behaviour.
        const res = await window.api.git.commit(cwd, msg.trim(), stagedCount > 0)
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
        <Modal onClose={() => close()} className="changes-modal" labelledBy="changes-modal-title">
            <div className="modal-head">
                <span id="changes-modal-title">Review changes · {target.label}</span>
                <div>
                    <button className="btn-min" onClick={refresh}>refresh</button>
                    <button className="btn-min" onClick={() => close()}>×</button>
                </div>
            </div>

            <div className="changes-body">
                <div className="ch-files">
                    {files === null ? (
                        <div className="muted sidebar-empty">
                            {readError
                                ? `Couldn't read the working tree - ${readError}`
                                : "Reading the working tree…"}
                        </div>
                    ) : files.length === 0 ? (
                        <div className="muted sidebar-empty">Working tree clean - nothing to review.</div>
                    ) : (
                        files.map((f) => (
                            <div
                                key={f.path}
                                className={"ch-file" + (sel?.path === f.path ? " sel" : "")}
                                onClick={() => setSel(f)}
                            >
                                <span className={"ch-stat s-" + f.label.toLowerCase()}>{f.code.trim() || "??"}</span>
                                <span className="ch-path" data-tip={f.path}>{f.path}</span>
                                {f.staged && <span className="ch-staged" data-tip="Staged">●</span>}
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

            <div className="ch-ai">
                <span className="ch-ai-label">AI</span>
                <button className="btn-min" disabled={nothingToActOn} onClick={() => aiOnDiff(cwd, "review", handoffAgent)} data-tip="Have an agent review this diff">Review</button>
                <button className="btn-min" disabled={nothingToActOn} onClick={() => aiOnDiff(cwd, "explain", handoffAgent)}>Explain</button>
                <button className="btn-min" disabled={nothingToActOn} onClick={() => aiOnDiff(cwd, "commit", handoffAgent)}>Commit msg</button>
                <button className="btn-min" disabled={nothingToActOn} onClick={() => aiOnDiff(cwd, "pr", handoffAgent)}>PR description</button>
                {/* Hand the diff to a *different* agent than the one that wrote it —
                    a second opinion from another model, not the same one re-reading
                    its own work. The prompt says so when the agents differ. */}
                {aiAgents.length > 1 && (
                    <label className="ch-ai-agent" data-tip="Which agent gets the diff">
                        with
                        <select value={handoffAgent} onChange={(e) => setHandoffTo(e.target.value)}>
                            {aiAgents.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <span className="spacer" style={{ flex: 1 }} />
                <button className="btn-min" onClick={() => openPr(cwd, target.label)} data-tip="Push branch and open a pull request">
                    Open PR ↗
                </button>
            </div>

            <div className="ch-commit">
                <input
                    value={msg}
                    placeholder={
                        stagedCount > 0
                            ? `Commit message (${stagedCount} staged file${stagedCount === 1 ? "" : "s"} only)`
                            : files === null
                              ? "Commit message (commits everything git finds)"
                              : `Commit message (commits all ${fileList.length} changed file${fileList.length === 1 ? "" : "s"})`
                    }
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commit()}
                />
                <button className="accent" disabled={!msg.trim() || busy || nothingToActOn} onClick={commit}>
                    {stagedCount > 0 ? `Commit staged (${stagedCount})` : "Commit all"}
                </button>
                {note && <span className="ch-note">{note}</span>}
            </div>
        </Modal>
    )
}
