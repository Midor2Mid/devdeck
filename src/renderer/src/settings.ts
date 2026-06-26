import { create } from "zustand"

export type ShellKind = "powershell" | "cmd" | "gitbash" | "wsl" | "custom"

export interface AppSettings {
    terminal: {
        shell: ShellKind
        customShellPath: string
        fontFamily: string
        fontSize: number
    }
    editor: {
        fontSize: number
        tabSize: number
        wordWrap: boolean
        minimap: boolean
    }
    claude: {
        command: string
        continueArgs: string
        attentionIdleMs: number
    }
    appearance: {
        accent: string
    }
}

export const DEFAULT_ACCENT = "#b8895c"

const DEFAULTS: AppSettings = {
    terminal: {
        shell: "powershell",
        customShellPath: "",
        fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
        fontSize: 13
    },
    editor: {
        fontSize: 13,
        tabSize: 4,
        wordWrap: false,
        minimap: false
    },
    claude: {
        command: "claude",
        continueArgs: "--continue",
        attentionIdleMs: 1000
    },
    appearance: {
        accent: DEFAULT_ACCENT
    }
}

interface SettingsState extends AppSettings {
    settingsOpen: boolean
    load: () => Promise<void>
    setTerminal: (patch: Partial<AppSettings["terminal"]>) => void
    setEditor: (patch: Partial<AppSettings["editor"]>) => void
    setClaude: (patch: Partial<AppSettings["claude"]>) => void
    setAppearance: (patch: Partial<AppSettings["appearance"]>) => void
    resetAll: () => void
    openSettings: () => void
    closeSettings: () => void
    /** Resolve the configured shell to a launchable file + args (Windows). */
    resolveShell: () => { file: string; args: string[] }
}

/** Apply the single accent color to the CSS custom properties. */
export function applyAccent(hex: string): void {
    document.documentElement.style.setProperty("--accent", hex)
    document.documentElement.style.setProperty("--accent-soft", hex)
}

export const useSettings = create<SettingsState>((set, get) => {
    const persist = (): void => {
        const { terminal, editor, claude, appearance } = get()
        window.api.settings.save({ terminal, editor, claude, appearance })
    }

    return {
        ...DEFAULTS,
        settingsOpen: false,

        load: async () => {
            const raw = (await window.api.settings.load()) as Partial<AppSettings> | null
            if (raw) {
                set({
                    terminal: { ...DEFAULTS.terminal, ...raw.terminal },
                    editor: { ...DEFAULTS.editor, ...raw.editor },
                    claude: { ...DEFAULTS.claude, ...raw.claude },
                    appearance: { ...DEFAULTS.appearance, ...raw.appearance }
                })
            }
            applyAccent(get().appearance.accent)
        },

        setTerminal: (patch) => {
            set((s) => ({ terminal: { ...s.terminal, ...patch } }))
            persist()
        },
        setEditor: (patch) => {
            set((s) => ({ editor: { ...s.editor, ...patch } }))
            persist()
        },
        setClaude: (patch) => {
            set((s) => ({ claude: { ...s.claude, ...patch } }))
            persist()
        },
        setAppearance: (patch) => {
            set((s) => ({ appearance: { ...s.appearance, ...patch } }))
            applyAccent(get().appearance.accent)
            persist()
        },
        resetAll: () => {
            set({ ...DEFAULTS })
            applyAccent(DEFAULTS.appearance.accent)
            persist()
        },

        openSettings: () => set({ settingsOpen: true }),
        closeSettings: () => set({ settingsOpen: false }),

        resolveShell: () => {
            const { shell, customShellPath } = get().terminal
            switch (shell) {
                case "cmd":
                    return { file: "cmd.exe", args: [] }
                case "gitbash":
                    return {
                        file: customShellPath || "C:\\Program Files\\Git\\bin\\bash.exe",
                        args: ["-i", "-l"]
                    }
                case "wsl":
                    return { file: "wsl.exe", args: [] }
                case "custom":
                    return { file: customShellPath, args: [] }
                default:
                    return { file: "powershell.exe", args: ["-NoLogo"] }
            }
        }
    }
})
