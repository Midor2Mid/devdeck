import { create } from "zustand"

// A reusable right-click context menu, decoupled from the main store (like
// confirm.ts). Call `contextMenu(event, items)` from any onContextMenu handler;
// <ContextMenuLayer/> (mounted once in App) renders it at the cursor.

export interface MenuItem {
    label?: string
    onClick?: () => void
    danger?: boolean
    disabled?: boolean
    /** Render a divider instead of an item. */
    separator?: boolean
}

interface MenuState {
    open: boolean
    x: number
    y: number
    items: MenuItem[]
    show: (x: number, y: number, items: MenuItem[]) => void
    close: () => void
}

export const useContextMenu = create<MenuState>((set) => ({
    open: false,
    x: 0,
    y: 0,
    items: [],
    show: (x, y, items) => set({ open: true, x, y, items }),
    close: () => set({ open: false, items: [] })
}))

/** Open a context menu at the event's cursor with the given items. */
export function contextMenu(
    e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number },
    items: MenuItem[]
): void {
    e.preventDefault()
    e.stopPropagation()
    useContextMenu.getState().show(e.clientX, e.clientY, items)
}
