import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { groupTargets, presetSelection, type Preset } from "../broadcast"
import { confirm } from "../confirm"

interface Props {
    onClose: () => void
}

interface Suggestion {
    key: string
    label: string
    insert: string
}

/**
 * Compose a rich prompt and fire it at one or many agent sessions. `@`
 * autocompletes project files; `/` autocompletes user snippets. Targets are
 * picked via checkboxes (grouped by project); the selection defaults to the
 * focused agent on each open and is not persisted.
 */
export function PromptComposer({ onClose }: Props): JSX.Element {
    const activeProject = useStore((s) => s.activeProject())
    const lastAgent = useStore((s) => s.lastAgentTermId)
    const broadcast = useStore((s) => s.broadcast)
    const agentSessions = useStore((s) => s.agentSessions)
    const draft = useStore((s) => (s.activeId ? s.composerDrafts[s.activeId] ?? "" : ""))
    const setComposerDraft = useStore((s) => s.setComposerDraft)
    const snippets = useSettings((s) => s.snippets)

    const [files, setFiles] = useState<string[]>([])
    const [token, setToken] = useState<{ start: number; query: string; trigger: "@" | "/" } | null>(
        null
    )
    const [sel, setSel] = useState(0)
    const [dragging, setDragging] = useState(false)
    // Fire targets — seeded once (on open) from the focused agent. The composer
    // is mounted fresh each open, so this reseeds and is never persisted.
    const [selected, setSelected] = useState<Set<string>>(() =>
        lastAgent ? new Set([lastAgent]) : new Set()
    )
    const ref = useRef<HTMLTextAreaElement>(null)

    const text = draft
    const setText = (value: string): void => {
        if (activeProject) setComposerDraft(activeProject.id, value)
    }

    const sessions = agentSessions()
    const groups = groupTargets(sessions)
    const selectedCount = selected.size
    const singleTarget =
        selectedCount === 1 ? sessions.find((s) => selected.has(s.termId)) : undefined

    useEffect(() => {
        if (activeProject) {
            window.api.fs.allFiles(activeProject.path).then(setFiles).catch(() => setFiles([]))
        }
        ref.current?.focus()
    }, [activeProject])

    const suggestions = useMemo<Suggestion[]>(() => {
        if (!token) return []
        const q = token.query.toLowerCase()
        if (token.trigger === "@") {
            return files
                .filter((f) => f.toLowerCase().includes(q))
                .slice(0, 8)
                .map((f) => ({ key: f, label: f, insert: "@" + f + " " }))
        }
        return snippets
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 8)
            .map((s) => ({
                key: s.id,
                label: "/" + s.name + " - " + s.body.slice(0, 48),
                insert: s.body + " "
            }))
    }, [token, files, snippets])

    const detectToken = (value: string, caret: number): void => {
        let i = caret - 1
        while (i >= 0 && !/\s/.test(value[i])) i--
        const start = i + 1
        const word = value.slice(start, caret)
        if (word[0] === "@" || word[0] === "/") {
            setToken({ start, query: word.slice(1), trigger: word[0] as "@" | "/" })
            setSel(0)
        } else {
            setToken(null)
        }
    }

    const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
        setText(e.target.value)
        detectToken(e.target.value, e.target.selectionStart)
    }

    const accept = (item: Suggestion): void => {
        if (!token) return
        const caret = ref.current?.selectionStart ?? text.length
        const next = text.slice(0, token.start) + item.insert + text.slice(caret)
        setText(next)
        setToken(null)
        requestAnimationFrame(() => {
            const pos = token.start + item.insert.length
            ref.current?.setSelectionRange(pos, pos)
            ref.current?.focus()
        })
    }

    // Drop or paste an image → save it into the project's uploads dir and append
    // an @-mention of its path, so the agent can read the image. Mirrors the
    // mobile client's attach flow.
    const attachImage = async (file: File): Promise<void> => {
        if (!activeProject || !file.type.startsWith("image/")) return
        const dataUrl = await new Promise<string>((res, rej) => {
            const r = new FileReader()
            r.onload = () => res(String(r.result))
            r.onerror = () => rej(r.error)
            r.readAsDataURL(file)
        })
        const saved = await window.api.fs.saveUpload(activeProject.path, file.name, dataUrl)
        if (!saved) return
        const rel = saved.startsWith(activeProject.path)
            ? saved.slice(activeProject.path.length).replace(/^[\\/]/, "").replace(/\\/g, "/")
            : saved
        // Read the freshest draft so several dropped images don't clobber each other.
        const cur = useStore.getState().composerDrafts[activeProject.id] ?? ""
        setComposerDraft(activeProject.id, (cur && !cur.endsWith(" ") ? cur + " " : cur) + "@" + rel + " ")
    }

    const onDrop = (e: React.DragEvent): void => {
        setDragging(false)
        const imgs = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))
        if (imgs.length) {
            e.preventDefault()
            imgs.forEach((f) => void attachImage(f))
        }
    }
    const onDragOver = (e: React.DragEvent): void => {
        if ([...e.dataTransfer.types].includes("Files")) {
            e.preventDefault()
            if (!dragging) setDragging(true)
        }
    }
    const onDragLeave = (e: React.DragEvent): void => {
        // Ignore leaves into child nodes; only clear when the pointer exits the box.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
    }
    const onPaste = (e: React.ClipboardEvent): void => {
        const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"))
        const f = item?.getAsFile()
        if (f) {
            e.preventDefault()
            void attachImage(f)
        }
    }

    const toggle = (termId: string): void =>
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(termId)) next.delete(termId)
            else next.add(termId)
            return next
        })

    // Presets read a fresh session list so idle/all reflect the current moment.
    const applyPreset = (preset: Preset): void =>
        setSelected(presetSelection(agentSessions(), preset, activeProject?.id ?? null))

    const send = async (): Promise<void> => {
        const body = text.trim()
        const ids = [...selected]
        if (!body || ids.length === 0) return
        if (ids.length >= 3) {
            const ok = await confirm({
                title: "Send to multiple agents",
                message: `Send this prompt to ${ids.length} agent sessions?`,
                confirmLabel: "Send to " + ids.length
            })
            if (!ok) return
        }
        broadcast(ids, body + "\r")
        setText("")
        onClose()
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (suggestions.length) {
            if (e.key === "ArrowDown") {
                e.preventDefault()
                setSel((i) => (i + 1) % suggestions.length)
                return
            }
            if (e.key === "ArrowUp") {
                e.preventDefault()
                setSel((i) => (i - 1 + suggestions.length) % suggestions.length)
                return
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                accept(suggestions[sel])
                return
            }
            if (e.key === "Escape") {
                setToken(null)
                return
            }
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void send()
            return
        }
        if (e.key === "Escape") onClose()
    }

    return (
        <div className="composer">
            <div className="composer-head">
                <span className="muted small">
                    {sessions.length === 0 ? (
                        "No agent session - start one to send a prompt"
                    ) : selectedCount === 0 ? (
                        "Select at least one agent"
                    ) : singleTarget ? (
                        <>
                            → {singleTarget.tabName}{" "}
                            <span className="agent-badge sm">{singleTarget.badge}</span>
                        </>
                    ) : (
                        <>
                            → <b>{selectedCount} agents</b>
                        </>
                    )}
                </span>
                <span className="muted small">
                    @ file · / snippet · drop/paste image · Ctrl+Enter send · Esc close
                </span>
            </div>

            {sessions.length > 0 && (
                <div className="composer-targets">
                    <div className="composer-presets">
                        <button className="composer-preset" onClick={() => applyPreset("all")}>
                            All
                        </button>
                        <button className="composer-preset" onClick={() => applyPreset("project")}>
                            This project
                        </button>
                        <button className="composer-preset" onClick={() => applyPreset("idle")}>
                            Idle
                        </button>
                        <button className="composer-preset" onClick={() => applyPreset("none")}>
                            None
                        </button>
                        <span className="muted small composer-count">{selectedCount} selected</span>
                    </div>
                    {groups.map((g) => (
                        <div key={g.projectId} className="composer-target-group">
                            <div className="composer-target-group-title">{g.projectName}</div>
                            {g.sessions.map((s) => (
                                <label key={s.termId} className="composer-target">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(s.termId)}
                                        onChange={() => toggle(s.termId)}
                                    />
                                    <span className={"tab-dot claude status-" + s.status} />
                                    <span className="composer-target-name">{s.sessionName}</span>
                                    <span className="agent-badge sm">{s.badge}</span>
                                </label>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            <div className="composer-body">
                <textarea
                    ref={ref}
                    className={"composer-input" + (dragging ? " dropping" : "")}
                    placeholder="Write a prompt… @ to mention a file, / for a snippet, drop or paste an image"
                    value={text}
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onPaste={onPaste}
                />
                {suggestions.length > 0 && (
                    <div className="mention-pop">
                        {suggestions.map((item, i) => (
                            <div
                                key={item.key}
                                className={"mention-item" + (i === sel ? " active" : "")}
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    accept(item)
                                }}
                            >
                                {item.label}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="composer-foot">
                <button onClick={onClose}>Cancel</button>
                <button
                    className="accent"
                    onClick={() => void send()}
                    disabled={!text.trim() || selectedCount === 0}
                >
                    Send ▸
                </button>
            </div>
        </div>
    )
}
