import { create } from "zustand"

// Transient toasts, decoupled from the main store (like confirm.ts). Supports an
// optional action button - used for "X deleted · Undo" on reversible deletes, so
// destructive actions don't need a blocking confirm dialog.

export interface ToastItem {
    id: string
    text: string
    actionLabel?: string
    onAction?: () => void
}

interface ToastState {
    toasts: ToastItem[]
    push: (t: Omit<ToastItem, "id">) => string
    dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set) => ({
    toasts: [],
    push: (t) => {
        const id = crypto.randomUUID()
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
        return id
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

/** Show a plain transient toast. */
export function toast(text: string): void {
    useToasts.getState().push({ text })
}

/** Show a toast with an Undo action; `onUndo` runs if the user clicks Undo. */
export function undoToast(text: string, onUndo: () => void): void {
    useToasts.getState().push({ text, actionLabel: "Undo", onAction: onUndo })
}
