import { useContextMenu } from "../contextmenu"

/** Renders the active context menu at the cursor; a backdrop dismisses it. */
export function ContextMenuLayer(): JSX.Element | null {
    const { open, x, y, items, close } = useContextMenu()
    if (!open) return null

    // Keep the menu on-screen (rough estimate; good enough without measuring).
    const left = Math.min(x, window.innerWidth - 220)
    const top = Math.min(y, window.innerHeight - (items.length * 30 + 12))

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
            <div className="ctx-menu" style={{ left: Math.max(4, left), top: Math.max(4, top) }}>
                {items.map((it, i) =>
                    it.separator ? (
                        <div key={i} className="ctx-sep" />
                    ) : (
                        <div
                            key={i}
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
