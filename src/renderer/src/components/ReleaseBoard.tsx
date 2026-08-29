import { useEffect, useState, useCallback } from "react"
import { useStore, SHELL } from "../store"
import { Modal } from "./Modal"
import type { ReleaseConfig, ReleaseStage, ReleaseCommit, StageStatus } from "../../../preload/index"

/**
 * Release / promotion board. Shows each deploy stage (Dev → UAT → PROD) mapped
 * to a git ref, what commit sits there, and how many commits are waiting to be
 * promoted to the next stage. Promotion is explicit: it generates the git
 * commands (send to a terminal or copy) or tags the release - it never pushes.
 */
export function ReleaseBoard(): JSX.Element {
    const close = useStore((s) => s.setReleaseOpen)
    const project = useStore((s) => s.activeProject())
    const newTab = useStore((s) => s.newTab)
    const whenReady = useStore((s) => s.whenReady)

    const [cfg, setCfg] = useState<ReleaseConfig | null>(null)
    const [status, setStatus] = useState<StageStatus[]>([])
    const [loading, setLoading] = useState(false)
    const [edit, setEdit] = useState(false)
    const [promoteIdx, setPromoteIdx] = useState<number | null>(null)

    const repo = project?.path

    const refresh = useCallback(
        async (config: ReleaseConfig) => {
            if (!repo) return
            setLoading(true)
            setStatus(await window.api.release.status(repo, config.stages))
            setLoading(false)
        },
        [repo]
    )

    useEffect(() => {
        if (!repo) return
        window.api.release.config(repo).then((c) => {
            setCfg(c)
            refresh(c)
        })
    }, [repo, refresh])

    const saveCfg = async (next: ReleaseConfig): Promise<void> => {
        if (!repo) return
        setCfg(next)
        await window.api.release.saveConfig(repo, next)
        refresh(next)
    }

    if (!project || !repo) {
        return (
            <Modal onClose={() => close(false)} labelledBy="release-modal-title">
                <div className="modal-head"><span id="release-modal-title">Release board</span>
                    <button className="btn-min" onClick={() => close(false)}>×</button>
                </div>
                <div className="modal-body"><p className="muted">Select a project first.</p></div>
            </Modal>
        )
    }

    return (
        <Modal onClose={() => close(false)} className="release-modal" labelledBy="release-modal-title">
            <div className="modal-head">
                <span id="release-modal-title">Release board · {project.name}</span>
                <div>
                    <button className="btn-min" onClick={() => cfg && refresh(cfg)}>refresh</button>
                    <button className="btn-min" onClick={() => setEdit((v) => !v)}>{edit ? "done" : "edit stages"}</button>
                    <button className="btn-min" onClick={() => close(false)}>×</button>
                </div>
            </div>

            <div className="modal-body release-body">
                {edit && cfg ? (
                    <StageEditor cfg={cfg} onSave={saveCfg} />
                ) : loading ? (
                    <div className="muted sidebar-empty">Reading refs…</div>
                ) : (
                    <div className="lanes">
                        {status.map((s, i) => (
                            <div key={s.id} className="lane-wrap">
                                <div className={"lane" + (s.found ? "" : " missing")}>
                                    <div className="lane-name">{s.name}</div>
                                    <div className="lane-ref">{s.ref}</div>
                                    {s.commit ? (
                                        <div className="lane-commit">
                                            <span className="lc-sha">{s.commit.sha}</span>
                                            <span className="lc-subj">{s.commit.subject}</span>
                                            <span className="lc-meta">{s.commit.author} · {s.commit.when}</span>
                                        </div>
                                    ) : (
                                        <div className="lane-missing">ref not found - edit stages</div>
                                    )}
                                </div>
                                {i < status.length - 1 && (
                                    <button
                                        className={"promote-arrow" + (s.aheadOfNext > 0 ? " hot" : "")}
                                        onClick={() => setPromoteIdx(promoteIdx === i ? null : i)}
                                        data-tip={s.aheadOfNext > 0 ? `${s.aheadOfNext} commit(s) ready to promote` : "Up to date"}
                                    >
                                        <span className="pa-count">{s.aheadOfNext || "✓"}</span>
                                        <span className="pa-tip">▸</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {!edit && promoteIdx !== null && cfg && status[promoteIdx] && status[promoteIdx + 1] && (
                    <PromotePanel
                        repo={repo}
                        checklist={cfg.checklist}
                        source={cfg.stages[promoteIdx]}
                        target={cfg.stages[promoteIdx + 1]}
                        onSendTerminal={(cmds) => {
                            const id = newTab(SHELL, undefined, `promote ${cfg.stages[promoteIdx].name}→${cfg.stages[promoteIdx + 1].name}`)
                            // The shell's first byte, not a 500ms guess: a shell
                            // that took longer had these commands written into a
                            // pty that was not reading yet, and writePty drops
                            // that silently.
                            if (id) void whenReady(id).then(() => window.api.pty.input(id, cmds))
                            close(false)
                        }}
                        onTagged={() => cfg && refresh(cfg)}
                    />
                )}
            </div>
        </Modal>
    )
}

function PromotePanel({
    repo,
    checklist,
    source,
    target,
    onSendTerminal,
    onTagged
}: {
    repo: string
    checklist: string[]
    source: ReleaseStage
    target: ReleaseStage
    onSendTerminal: (cmds: string) => void
    onTagged: () => void
}): JSX.Element {
    const [commits, setCommits] = useState<ReleaseCommit[]>([])
    const [checked, setChecked] = useState<Set<number>>(new Set())
    const [tagName, setTagName] = useState("")
    const [msg, setMsg] = useState("")

    useEffect(() => {
        window.api.release.pending(repo, target.ref, source.ref).then(setCommits)
        const d = new Date()
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
        setTagName(`${target.name.toLowerCase()}-${stamp}`)
        setChecked(new Set())
        setMsg("")
    }, [repo, source.ref, target.ref, target.name])

    const allChecked = checklist.length === 0 || checked.size === checklist.length
    const cmds = `git checkout ${target.ref} && git merge --ff-only ${source.ref} && git push`

    const tag = async (): Promise<void> => {
        const r = await window.api.release.tag(repo, tagName, source.ref)
        setMsg(r.ok ? `✓ tagged ${tagName} at ${source.ref}` : `✗ ${r.error}`)
        if (r.ok) onTagged()
    }

    return (
        <div className="promote-panel">
            <div className="promote-head">
                Promote <b>{source.name}</b> → <b>{target.name}</b>
                <span className="muted"> · {commits.length} commit(s)</span>
            </div>

            <div className="promote-cols">
                <div className="promote-commits">
                    {commits.length === 0 ? (
                        <div className="muted small">Nothing to promote - {target.name} is up to date.</div>
                    ) : (
                        commits.map((c) => (
                            <div key={c.sha} className="pc-row">
                                <span className="lc-sha">{c.sha}</span>
                                <span className="pc-subj">{c.subject}</span>
                                <span className="lc-meta">{c.when}</span>
                            </div>
                        ))
                    )}
                </div>

                <div className="promote-side">
                    <div className="promote-check-title">Pre-flight</div>
                    {checklist.map((item, i) => (
                        <label key={i} className="promote-check">
                            <input
                                type="checkbox"
                                checked={checked.has(i)}
                                onChange={(e) => {
                                    const next = new Set(checked)
                                    if (e.target.checked) next.add(i)
                                    else next.delete(i)
                                    setChecked(next)
                                }}
                            />
                            {item}
                        </label>
                    ))}

                    <div className="promote-actions">
                        <button
                            className="accent"
                            disabled={!allChecked || commits.length === 0}
                            data-tip={allChecked ? "" : "Tick the pre-flight items first"}
                            onClick={() => onSendTerminal(cmds)}
                        >
                            ▸ Send commands to terminal
                        </button>
                        <button
                            className="btn-min"
                            disabled={!allChecked || commits.length === 0}
                            onClick={() => { navigator.clipboard.writeText(cmds); setMsg("Commands copied.") }}
                        >
                            copy commands
                        </button>
                        <div className="promote-tag">
                            <input value={tagName} onChange={(e) => setTagName(e.target.value)} />
                            <button className="btn-min" disabled={!allChecked} onClick={tag}>tag {source.name}</button>
                        </div>
                        {msg && <div className="promote-msg">{msg}</div>}
                    </div>
                    <p className="settings-hint">
                        DevDeck never pushes for you - it hands you the exact commands (review,
                        then run) or tags the release. Real deploys still go through your pipeline.
                    </p>
                </div>
            </div>
        </div>
    )
}

function StageEditor({ cfg, onSave }: { cfg: ReleaseConfig; onSave: (c: ReleaseConfig) => void }): JSX.Element {
    const [stages, setStages] = useState<ReleaseStage[]>(cfg.stages)
    const [checklist, setChecklist] = useState<string[]>(cfg.checklist)

    const upd = (i: number, patch: Partial<ReleaseStage>): void =>
        setStages(stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

    return (
        <div className="stage-editor">
            <div className="se-title">Stages (ordered low → high; promote moves upward)</div>
            {stages.map((s, i) => (
                <div key={s.id} className="se-row">
                    <input className="se-name" value={s.name} placeholder="Name" onChange={(e) => upd(i, { name: e.target.value })} />
                    <input className="se-ref" value={s.ref} placeholder="git ref (branch/tag)" onChange={(e) => upd(i, { ref: e.target.value })} />
                    <button className="row-remove" onClick={() => setStages(stages.filter((_, idx) => idx !== i))}>×</button>
                </div>
            ))}
            <button className="btn-min" onClick={() => setStages([...stages, { id: crypto.randomUUID(), name: "Stage", ref: "" }])}>+ Add stage</button>

            <div className="se-title" style={{ marginTop: 16 }}>Pre-flight checklist</div>
            {checklist.map((c, i) => (
                <div key={i} className="se-row">
                    <input className="se-name" style={{ flex: 1 }} value={c} onChange={(e) => setChecklist(checklist.map((x, idx) => (idx === i ? e.target.value : x)))} />
                    <button className="row-remove" onClick={() => setChecklist(checklist.filter((_, idx) => idx !== i))}>×</button>
                </div>
            ))}
            <button className="btn-min" onClick={() => setChecklist([...checklist, "New check"])}>+ Add check</button>

            <button className="accent" style={{ display: "block", marginTop: 16 }} onClick={() => onSave({ stages, checklist })}>
                Save
            </button>
        </div>
    )
}
