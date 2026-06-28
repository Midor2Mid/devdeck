import { create } from "zustand"

// A tiny promise-based confirmation system, decoupled from the main store.
// Call `confirm({ message })` anywhere and await a boolean; <ConfirmDialog/>
// (mounted once in App) renders the prompt. Keeps destructive actions safe
// without per-component modal boilerplate.

export interface ConfirmOptions {
    title?: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
    resolve: (ok: boolean) => void
}

interface ConfirmState {
    current: ConfirmRequest | null
    ask: (opts: ConfirmOptions) => Promise<boolean>
    answer: (ok: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
    current: null,
    ask: (opts) =>
        new Promise<boolean>((resolve) => {
            set({ current: { ...opts, resolve } })
        }),
    answer: (ok) => {
        const cur = get().current
        if (cur) cur.resolve(ok)
        set({ current: null })
    }
}))

/** Await a yes/no confirmation. Resolves true if confirmed. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
    return useConfirm.getState().ask(opts)
}
