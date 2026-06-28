import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"

interface Props {
    onClose: () => void
}

interface Suggestion {
    key: string
    label: string
    insert: string
}

/**
 * Compose a rich prompt and send it to the focused (last-active) agent session.
 * `@` autocompletes project files; `/` autocompletes user-defined snippets.
 */
export function PromptComposer({ onClose }: Props): JSX.Element {
    const activeProject = useStore((s) => s.activeProject())
    const lastAgent = useStore((s) => s.lastAgentTermId)
    const sendToAgent = useStore((s) => s.sendToAgent)
    const agentSessions = useStore((s) => s.agentSessions)
    const draft = useStore((s) => (s.activeId ? s.composerDrafts[s.activeId] ?? "" : ""))
    const setComposerDraft = useStore((s) => s.setComposerDraft)
    const snippets = useSettings((s) => s.snippets)

    const [files, setFiles] = useState<string[]>([])
    const [token, setToken] = useState<{ start: number; query: string; trigger: "@" | "/" } | null>(
        null
    )
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

    // Detect a trigger word (@file or /snippet) at the caret - the whitespace-
    // delimited word the caret is in, if it starts with @ or /.
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
                        "No agent session - start one to send a prompt"
                    )}
                </span>
                <span className="muted small">@ file · / snippet · Ctrl+Enter send · Esc close</span>
            </div>
            <div className="composer-body">
                <textarea
                    ref={ref}
                    className="composer-input"
                    placeholder="Write a prompt… @ to mention a file, / for a snippet"
                    value={text}
                    onChange={onChange}
                    onKeyDown={onKeyDown}
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
                <button className="accent" onClick={send} disabled={!text.trim() || !lastAgent}>
                    Send ▸
                </button>
            </div>
        </div>
    )
}
