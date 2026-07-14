import { useState } from "react"
import type { DragEvent } from "react"
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
    // Peek of the agent's latest output, surfaced in the hover tooltip.
    // Fetched lazily on hover — no always-on timer for an invisible tip.
    const [peek, setPeek] = useState("")

    const commit = (): void => {
        renameSession(session.termId, text)
        setRenaming(false)
    }

    const keyClass =
        "deck-key" +
        (active ? " active" : "") +
        (compressed ? " compressed" : "") +
        (dragPayload ? " drop-active" : "") +
        (over ? " drag-over" : "")

    // Handlers shared by both renderings of the key (button and, while
    // renaming, div) — the key stays a drop target in either state.
    const handleClick = (): void => jumpToTerm(session.termId)
    const handleMouseEnter = (): void => setPeek(getTail(session.termId))
    const handleDragOver = (e: DragEvent): void => {
        if (dragPayload) {
            e.preventDefault()
            setOver(true)
        }
    }
    const handleDragLeave = (): void => setOver(false)
    const handleDrop = (e: DragEvent): void => {
        if (!dragPayload) return
        e.preventDefault()
        window.api.pty.input(session.termId, dragPayload)
        jumpToTerm(session.termId)
        setDragPayload(null)
        setOver(false)
    }
    const tip = dragPayload
        ? "Drop to insert into this session"
        : `${session.sessionName} · ${session.projectName} - ${session.status}` +
          (peek ? `\n${peek}` : "")

    const dot = <span className={"tab-dot claude status-" + session.status} />
    const badge = <span className="agent-badge sm">{session.badge}</span>
    const attention = session.status === "attention" && <span className="claude-attn">!</span>

    // While renaming, the key holds an <input>, which must not be nested
    // inside a <button> — render the container as a plain <div> for that
    // state only. The normal key is a real button (keyboard focus,
    // focus-visible ring, press feedback).
    if (renaming && !compressed) {
        return (
            <div
                className={keyClass}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                data-tip={tip}
                data-tip-pos="top"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {dot}
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
                {badge}
                {attention}
            </div>
        )
    }

    return (
        <button
            type="button"
            className={keyClass}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            data-tip={tip}
            data-tip-pos="top"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {dot}
            {!compressed && (
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
            )}
            {badge}
            {attention}
        </button>
    )
}
