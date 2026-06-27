import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "../store"

interface Props {
    onClose: () => void
}

/**
 * Compose a rich prompt and send it to the focused (last-active) agent session.
 * Supports @file mentions with autocomplete from the active project's files.
 */
export function PromptComposer({ onClose }: Props): JSX.Element {
    const activeProject = useStore((s) => s.activeProject())
    const lastAgent = useStore((s) => s.lastAgentTermId)
    const sendToAgent = useStore((s) => s.sendToAgent)
    const agentSessions = useStore((s) => s.agentSessions)
    const draft = useStore((s) => (s.activeId ? s.composerDrafts[s.activeId] ?? "" : ""))
    const setComposerDraft = useStore((s) => s.setComposerDraft)

    const [files, setFiles] = useState<string[]>([])
    const [token, setToken] = useState<{ start: number; query: string } | null>(null)
    const [sel, setSel] = useState(0)
    const ref = useRef<HTMLTextAreaElement>(null)

    // Draft is persisted per project (survives project switch + restart).
    const text = draft
    const setText = (value: string): void => {
        if (activeProject) setComposerDraft(activeProject.id, value)
    }

    const target = agentSessions().find((s) => s.termId === lastAgent)

    useEffect(() => {
        if (activeProject) {
            window.api.fs.allFiles(activeProject.path).then(setFiles).catch(() => setFiles([]))
        }
        ref.current?.focus()
    }, [activeProject])

    const suggestions = useMemo(() => {
        if (!token) return []
        const q = token.query.toLowerCase()
        return files.filter((f) => f.toLowerCase().includes(q)).slice(0, 8)
    }, [token, files])

    // Detect an active @token (from the last '@' with no whitespace before the caret).
    const detectToken = (value: string, caret: number): void => {
        const upto = value.slice(0, caret)
        const at = upto.lastIndexOf("@")
        if (at === -1) {
            setToken(null)
            return
        }
        const frag = upto.slice(at + 1)
        if (/\s/.test(frag)) {
            setToken(null)
            return
        }
        setToken({ start: at, query: frag })
        setSel(0)
    }

    const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
        setText(e.target.value)
        detectToken(e.target.value, e.target.selectionStart)
    }

    const accept = (path: string): void => {
        if (!token) return
        const caret = ref.current?.selectionStart ?? text.length
        const next = text.slice(0, token.start) + "@" + path + " " + text.slice(caret)
        setText(next)
        setToken(null)
        requestAnimationFrame(() => {
            const pos = token.start + path.length + 2
            ref.current?.setSelectionRange(pos, pos)
            ref.current?.focus()
        })
    }

    const send = (): void => {
        const body = text.trim()
        if (!body || !lastAgent) return
        sendToAgent(body + "\r")
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
            send()
            return
        }
        if (e.key === "Escape") onClose()
    }

    return (
        <div className="composer">
            <div className="composer-head">
                <span className="muted small">
                    {target ? (
                        <>
                            → {target.tabName} <span className="agent-badge sm">{target.badge}</span>
                        </>
                    ) : (
                        "No agent session — start one to send a prompt"
                    )}
                </span>
                <span className="muted small">@ file · Ctrl+Enter send · Esc close</span>
            </div>
            <div className="composer-body">
                <textarea
                    ref={ref}
                    className="composer-input"
                    placeholder="Write a prompt… use @ to mention a file"
                    value={text}
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                />
                {suggestions.length > 0 && (
                    <div className="mention-pop">
                        {suggestions.map((f, i) => (
                            <div
                                key={f}
                                className={"mention-item" + (i === sel ? " active" : "")}
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    accept(f)
                                }}
                            >
                                {f}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="composer-foot">
                <button onClick={onClose}>Cancel</button>
                <button className="accent" onClick={send} disabled={!text.trim() || !lastAgent}>
                    Send ▸
                </button>
            </div>
        </div>
    )
}
