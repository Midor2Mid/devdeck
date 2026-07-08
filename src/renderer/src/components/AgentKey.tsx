import { useEffect, useState } from "react"
import { useStore } from "../store"
import type { AnySession } from "../store"
import { getTail } from "../missionTail"

export function AgentKey({
    session,
    active,
    compressed
}: {
    session: AnySession
    active: boolean
    compressed: boolean
}): JSX.Element {
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const renameSession = useStore((s) => s.renameSession)
    const dragPayload = useStore((s) => s.dragPayload)
    const setDragPayload = useStore((s) => s.setDragPayload)
    const [renaming, setRenaming] = useState(false)
    const [text, setText] = useState("")
    const [over, setOver] = useState(false)
    // Live peek of the agent's latest output, surfaced in the hover tooltip.
    const [peek, setPeek] = useState("")
    useEffect(() => {
        const iv = setInterval(() => setPeek(getTail(session.termId)), 1500)
        return () => clearInterval(iv)
    }, [session.termId])

    const commit = (): void => {
        renameSession(session.termId, text)
        setRenaming(false)
    }

    return (
        <div
            className={
                "deck-key" +
                (active ? " active" : "") +
                (compressed ? " compressed" : "") +
                (dragPayload ? " drop-active" : "") +
                (over ? " drag-over" : "")
            }
            onClick={() => jumpToTerm(session.termId)}
            data-tip={
                dragPayload
                    ? "Drop to insert into this session"
                    : `${session.sessionName} · ${session.projectName} - ${session.status}` +
                      (peek ? `\n${peek}` : "")
            }
            data-tip-pos="top"
            onDragOver={(e) => {
                if (dragPayload) {
                    e.preventDefault()
                    setOver(true)
                }
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
                if (!dragPayload) return
                e.preventDefault()
                window.api.pty.input(session.termId, dragPayload)
                jumpToTerm(session.termId)
                setDragPayload(null)
                setOver(false)
            }}
        >
            <span className={"tab-dot claude status-" + session.status} />
            {!compressed &&
                (renaming ? (
                    <input
                        className="session-rename"
                        autoFocus
                        value={text}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setText(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commit()
                            else if (e.key === "Escape") setRenaming(false)
                        }}
                    />
                ) : (
                    <span
                        className="deck-key-name"
                        onDoubleClick={(e) => {
                            e.stopPropagation()
                            setText(session.sessionName)
                            setRenaming(true)
                        }}
                        data-tip="Double-click to rename this session"
                    >
                        {session.sessionName}
                    </span>
                ))}
            <span className="agent-badge sm">{session.badge}</span>
            {session.status === "attention" && <span className="claude-attn">!</span>}
        </div>
    )
}
