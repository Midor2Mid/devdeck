import { create } from "zustand"

// A tiny promise-based text-prompt system, decoupled from the main store.
// Call `prompt({ title })` anywhere and await a string (or null if cancelled);
// <PromptDialog/> (mounted once in App) renders the input. Mirrors confirm.ts.

export interface PromptOptions {
    title?: string
    message?: string
    placeholder?: string
    confirmLabel?: string
    initialValue?: string
}

interface PromptRequest extends PromptOptions {
    resolve: (value: string | null) => void
}

interface PromptState {
    current: PromptRequest | null
    ask: (opts: PromptOptions) => Promise<string | null>
    answer: (value: string | null) => void
}

export const usePrompt = create<PromptState>((set, get) => ({
    current: null,
    ask: (opts) =>
        new Promise<string | null>((resolve) => {
            set({ current: { ...opts, resolve } })
        }),
    answer: (value) => {
        const cur = get().current
        if (cur) cur.resolve(value)
        set({ current: null })
    }
}))

/** Await a text prompt. Resolves the entered string, or null if cancelled. */
export function prompt(opts: PromptOptions): Promise<string | null> {
    return usePrompt.getState().ask(opts)
}
