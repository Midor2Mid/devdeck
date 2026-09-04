import { useEffect, useRef } from "react"
import { RegionBoundary } from "./RegionBoundary"

/**
 * The boundary a modal wraps ITSELF in.
 *
 * A React boundary only catches throws from its DESCENDANTS, so one placed
 * inside a modal's own `return` cannot catch that modal's own render — which is
 * where these crashes actually are (WorktreesModal reads `project.name` off a
 * project that can go away under it, and that throw blanked the whole window).
 * Each modal therefore exports a thin wrapper that renders this, and keeps its
 * real body in a private component alongside. That makes the boundary the
 * body's parent without needing an edit at every App.tsx call site.
 *
 * `overlay` and a Close action are not options here: a crashed modal has taken
 * its own Escape handler and its own close button down with it, so the card has
 * to be the way out or the only escape left is the whole-app reload this
 * boundary exists to avoid.
 *
 * No `resetKey`. Every one of these overlays is mounted inside its own
 * conditional in `App`, so closing the crashed window unmounts the boundary
 * with it and reopening starts clean — which is the honest retry. A resetKey
 * that cleared on any App re-render is the bug RegionBoundary documents.
 */
export function ModalBoundary({
    title,
    description,
    onClose,
    closeLabel = "Close",
    children
}: {
    /** What broke, named the way the user names the window. */
    title: string
    /** What is still true. This copy is read while trusting it, so it must be. */
    description: string
    onClose: () => void
    closeLabel?: string
    children: React.ReactNode
}): JSX.Element {
    return (
        <RegionBoundary
            overlay
            title={title}
            description={description}
            actions={<button onClick={onClose}>{closeLabel}</button>}
        >
            {children}
        </RegionBoundary>
    )
}

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
