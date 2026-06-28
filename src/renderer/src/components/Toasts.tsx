import { useEffect } from "react"
import { useStore, type AppNotification } from "../store"

function Toast({ n }: { n: AppNotification }): JSX.Element {
    const dismiss = useStore((s) => s.dismissNotification)
    const jumpToTerm = useStore((s) => s.jumpToTerm)

    useEffect(() => {
        const t = setTimeout(() => dismiss(n.id), 8000)
        return () => clearTimeout(t)
    }, [n.id, dismiss])

    return (
        <div
            className="toast"
            onClick={() => {
                jumpToTerm(n.termId)
                dismiss(n.id)
            }}
        >
            <span className="toast-flag">⚑</span>
            <span className="toast-text">{n.text}</span>
            <span
                className="toast-close"
                data-tip="Dismiss"
                onClick={(e) => {
                    e.stopPropagation()
                    dismiss(n.id)
                }}
            >
                ×
            </span>
        </div>
    )
}

export function Toasts(): JSX.Element {
    const notifications = useStore((s) => s.notifications)
    return (
        <div className="toasts">
            {notifications.map((n) => (
                <Toast key={n.id} n={n} />
            ))}
        </div>
    )
}
