import { create } from "zustand"

// Session-scoped chain variables: values extracted from responses (see
// apiChain.ts) that merge over the active environment for {{var}} substitution.
// Intentionally not persisted - chained tokens/ids are runtime state.

interface ChainState {
    vars: Record<string, string>
    set: (name: string, value: string) => void
    remove: (name: string) => void
    clear: () => void
}

export const useChainVars = create<ChainState>((set) => ({
    vars: {},
    set: (name, value) => set((s) => ({ vars: { ...s.vars, [name]: value } })),
    remove: (name) =>
        set((s) => {
            const vars = { ...s.vars }
            delete vars[name]
            return { vars }
        }),
    clear: () => set({ vars: {} })
}))
