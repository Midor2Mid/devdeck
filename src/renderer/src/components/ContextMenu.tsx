import { useEffect, useRef, type KeyboardEvent } from "react"
import { useContextMenu } from "../contextmenu"

/**
 * Renders the active context menu at the cursor; a backdrop dismisses it.
 * Keyboard: focus lands on the first item on open; ArrowUp/ArrowDown move
 * (wrapping), Home/End jump, Enter/Space activate, Escape closes.
 */
export function ContextMenuLayer(): JSX.Element | null {
    const { open, x, y, items, close } = useContextMenu()
    const menuRef = useRef<HTMLDivElement | null>(null)

    // On open, focus the first enabled menuitem so arrow keys work immediately
    // (fall back to the menu itself so Escape still dismisses).
    useEffect(() => {
        if (!open) return
        const first = menuRef.current?.querySelector<HTMLElement>(
            "[role=\"menuitem\"]:not([aria-disabled])"
        )
        ;(first ?? menuRef.current)?.focus()
    }, [open, items])

    if (!open) return null

    // Keep the menu on-screen (rough estimate; good enough without measuring).
    const left = Math.min(x, window.innerWidth - 220)
    const top = Math.min(y, window.innerHeight - (items.length * 30 + 12))

    const enabledItems = (): HTMLElement[] =>
        Array.from(
            menuRef.current?.querySelectorAll<HTMLElement>(
                "[role=\"menuitem\"]:not([aria-disabled])"
            ) ?? []
        )

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === "Escape") {
            e.preventDefault()
            e.stopPropagation()
            close()
            return
        }
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            const active = document.activeElement as HTMLElement | null
            // Item onClick handlers invoke the action and close the menu.
            if (active?.getAttribute("role") === "menuitem") active.click()
            return
        }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return
        e.preventDefault()
        const els = enabledItems()
        if (els.length === 0) return
        const i = els.indexOf(document.activeElement as HTMLElement)
        let next = 0
        if (e.key === "End") next = els.length - 1
        else if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % els.length
        else if (e.key === "ArrowUp") next = i < 0 ? els.length - 1 : (i - 1 + els.length) % els.length
        els[next].focus()
    }

    return (
        <>
            <div
                className="ctx-backdrop"
                onClick={close}
                onContextMenu={(e) => {
                    e.preventDefault()
                    close()
                }}
            />
            <div
                ref={menuRef}
                className="ctx-menu"
                style={{ left: Math.max(4, left), top: Math.max(4, top) }}
                role="menu"
                tabIndex={-1}
                onKeyDown={onKeyDown}
            >
                {items.map((it, i) =>
                    it.separator ? (
                        <div key={i} className="ctx-sep" role="separator" />
                    ) : (
                        <div
                            key={i}
                            role="menuitem"
                            tabIndex={-1}
                            aria-disabled={it.disabled || undefined}
                            className={
                                "ctx-item" +
                                (it.danger ? " danger" : "") +
                                (it.disabled ? " disabled" : "")
                            }
                            onClick={() => {
                                if (it.disabled) return
                                it.onClick?.()
                                close()
                            }}
                        >
                            {it.label}
                        </div>
                    )
                )}
            </div>
        </>
    )
}
