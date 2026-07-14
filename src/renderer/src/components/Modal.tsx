import { useEffect, useRef } from "react"

/** Shared modal shell: backdrop-close, Escape-close, role=dialog + aria-modal,
 *  autofocus + focus trap, focus restore on unmount. Replaces the hand-rolled
 *  backdrop+div pattern across the app's modals. */
export function Modal({
    onClose,
    className = "",
    labelledBy,
    backdrop = "modal",
    children
}: {
    onClose: () => void
    className?: string
    labelledBy?: string
    /** Backdrop style: "modal" (centered) or "switcher" (centered-but-top). */
    backdrop?: "modal" | "switcher"
    children: React.ReactNode
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    // Keep the latest onClose in a ref so the focus/keyboard effect runs only
    // once on mount - an inline `onClose={() => ...}` prop must not re-trigger
    // autofocus (which would steal focus mid-typing) on every render.
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose
    useEffect(() => {
        const prev = document.activeElement as HTMLElement | null
        const el = ref.current
        // autofocus the first focusable, else the dialog itself
        const focusables = (): HTMLElement[] =>
            el
                ? Array.from(
                      el.querySelectorAll<HTMLElement>(
                          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
                      )
                  ).filter((n) => n.offsetParent !== null)
                : []
        const first = focusables()[0]
        ;(first ?? el)?.focus()
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                e.stopPropagation()
                onCloseRef.current()
                return
            }
            if (e.key === "Tab" && el) {
                const f = focusables()
                if (f.length === 0) {
                    e.preventDefault()
                    return
                }
                const active = document.activeElement as HTMLElement
                if (e.shiftKey && active === f[0]) {
                    e.preventDefault()
                    f[f.length - 1].focus()
                } else if (!e.shiftKey && active === f[f.length - 1]) {
                    e.preventDefault()
                    f[0].focus()
                }
            }
        }
        el?.addEventListener("keydown", onKey)
        return () => {
            el?.removeEventListener("keydown", onKey)
            prev?.focus?.()
        }
    }, [])
    return (
        <div className={backdrop === "switcher" ? "switcher-backdrop" : "modal-backdrop"} onMouseDown={onClose}>
            <div
                ref={ref}
                className={"modal " + className}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                tabIndex={-1}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    )
}
