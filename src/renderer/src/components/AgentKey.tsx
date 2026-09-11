import { useState } from "react"
import type { DragEvent } from "react"
import { useStore } from "../store"
import type { AnySession } from "../store"
import { deckKeyStatusLabel, shortSessionLabel } from "../deck"
import { useKeyStatus } from "../keyStatus"
import { getTail } from "../missionTail"
import { declaredFor, saidTip } from "../declaredSignal"

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
    const seen = useStore((s) => s.seen)
    // The provenance axis - a stable slice, read per session through
    // `declaredFor`. It changes the TOOLTIP and nothing else on this surface;
    // see the tip below for why.
    const declared = useStore((s) => s.declared)
    const dragPayload = useStore((s) => s.dragPayload)
    const setDragPayload = useStore((s) => s.setDragPayload)
    // Carries the `paneHold` subscription that repaints this key when its
    // process goes away - see useKeyStatus.
    const keyStatusOf = useKeyStatus()
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

    // What this key may claim. `session.status` is what the agent last DID; it
    // survives the process that did it, so a restored or exited session came
    // back as `idle` - the resting form of a live agent - on the one surface
    // that is always on screen. Derived through `hasProcess`, the same
    // predicate behind Mission's "N running" and its NOT RUNNING chip, so the
    // deck cannot disagree with the tile about the same session again.
    const keyStatus = keyStatusOf(session)

    const keyClass =
        "deck-key" +
        (active ? " active" : "") +
        (compressed ? " compressed" : "") +
        (keyStatus === "waiting" ? " key-waiting" : "") +
        // Acknowledged, not resolved: the status is untouched, so the key keeps
        // saying `waiting` and only its FORM changes.
        (seen[session.termId] ? " key-seen" : "") +
        (keyStatus === "attention" ? " key-attn" : "") +
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
    // WHY THE DECK KEY GAINS NO VISIBLE PROVENANCE MARK, only a tooltip line.
    // The dot has five forms and DESIGN.md forbids a sixth; the key has 6px, a
    // name and a badge, and the frame's mark budget was just cut from ~14 to 6.
    // Provenance changes nothing this key reports - not the status, not the
    // count, not what clicking it does - so on the one surface that is ALWAYS on
    // screen it would have to earn a permanent mark, and it cannot. It is
    // evidence you consult when you DOUBT a signal, which is on demand.
    // Mission's tile and Overview's heads have room for the word; this has room
    // for the answer to a hover.
    const said = declaredFor(declared, session.termId, keyStatus)
    const tip = dragPayload
        ? "Drop to insert into this session"
        : `${session.sessionName} · ${session.projectName} - ${deckKeyStatusLabel(keyStatus)}` +
          (said ? `\n${saidTip(said)}` : "") +
          (said?.message ? `\n“${said.message}”` : "") +
          (peek ? `\n${peek}` : "")

    const dot = <span className={"tab-dot claude status-" + keyStatus} />
    // Compression takes the name away, and the badge names the agent, not the
    // session — so a compressed key carries the name's distinguishing tail
    // inside the same pill. Only when compressed: the expanded key already
    // shows the whole name, and repeating its tail beside it says nothing.
    const ord = compressed ? shortSessionLabel(session.sessionName, session.badge) : ""
    const badge = (
        <span className="agent-badge sm">
            {session.badge}
            {ord && <span className="deck-key-ord">{ord}</span>}
        </span>
    )
    // Rendered outside the `!compressed` guard below, deliberately: attention is
    // the one thing a key must still be able to say when it has lost its name.
    const attention = keyStatus === "attention" && <span className="claude-attn">!</span>

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
