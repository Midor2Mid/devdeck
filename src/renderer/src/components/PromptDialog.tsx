import { useEffect, useState } from "react"
import { usePrompt } from "../prompt"

// Renders the active text-prompt request (if any). Mount once in App.
// Mirrors ConfirmDialog and reuses its modal classes.
export function PromptDialog(): JSX.Element | null {
    const current = usePrompt((s) => s.current)
    const answer = usePrompt((s) => s.answer)
    const [value, setValue] = useState("")

    // Seed the input whenever a new prompt opens.
    useEffect(() => {
        setValue(current?.initialValue ?? "")
    }, [current])

    useEffect(() => {
        if (!current) return
        const h = (e: KeyboardEvent): void => {
            if (e.key === "Escape") answer(null)
        }
        window.addEventListener("keydown", h)
        return () => window.removeEventListener("keydown", h)
    }, [current, answer])

    if (!current) return null

    const submit = (): void => answer(value.trim())

    return (
        <div className="switcher-backdrop" onMouseDown={() => answer(null)}>
            <div className="confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
                {current.title && <div className="confirm-title">{current.title}</div>}
                {current.message && <div className="confirm-message">{current.message}</div>}
                <input
                    className="prompt-input"
                    autoFocus
                    value={value}
                    placeholder={current.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") submit()
                    }}
                />
                <div className="confirm-actions">
                    <button onClick={() => answer(null)}>Cancel</button>
                    <button className="accent" onClick={submit}>
                        {current.confirmLabel ?? "OK"}
                    </button>
                </div>
            </div>
        </div>
    )
}
