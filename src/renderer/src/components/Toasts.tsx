import { useEffect } from "react"
import { useStore, type AppNotification } from "../store"
import { useToasts, type ToastItem } from "../toast"

function ActionToast({ t }: { t: ToastItem }): JSX.Element {
    const dismiss = useToasts((s) => s.dismiss)
    useEffect(() => {
        const timer = setTimeout(() => dismiss(t.id), 6000)
        return () => clearTimeout(timer)
    }, [t.id, dismiss])
    return (
        <div className="toast">
            <span className="toast-text">{t.text}</span>
            {t.actionLabel && (
                <button
                    className="toast-action"
                    onClick={() => {
                        t.onAction?.()
                        dismiss(t.id)
                    }}
                >
                    {t.actionLabel}
                </button>
            )}
            <span className="toast-close" data-tip="Dismiss" onClick={() => dismiss(t.id)}>
                ×
            </span>
        </div>
    )
}

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
    const toasts = useToasts((s) => s.toasts)
    return (
        <div className="toasts">
            {toasts.map((t) => (
                <ActionToast key={t.id} t={t} />
            ))}
            {notifications.map((n) => (
                <Toast key={n.id} n={n} />
            ))}
        </div>
    )
}
