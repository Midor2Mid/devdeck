import { useEffect } from "react"
import { useConfirm } from "../confirm"

// Renders the active confirmation request (if any). Mount once in App.
export function ConfirmDialog(): JSX.Element | null {
    const current = useConfirm((s) => s.current)
    const answer = useConfirm((s) => s.answer)

    useEffect(() => {
        if (!current) return
        const h = (e: KeyboardEvent): void => {
            if (e.key === "Escape") answer(false)
            else if (e.key === "Enter") answer(true)
        }
        window.addEventListener("keydown", h)
        return () => window.removeEventListener("keydown", h)
    }, [current, answer])

    if (!current) return null

    return (
        <div className="switcher-backdrop" onMouseDown={() => answer(false)}>
            <div className="confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
                {current.title && <div className="confirm-title">{current.title}</div>}
                <div className="confirm-message">{current.message}</div>
                <div className="confirm-actions">
                    <button onClick={() => answer(false)}>{current.cancelLabel ?? "Cancel"}</button>
                    <button
                        className={current.danger ? "danger-btn" : "accent"}
                        autoFocus
                        onClick={() => answer(true)}
                    >
                        {current.confirmLabel ?? "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    )
}
