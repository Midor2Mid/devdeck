import { create } from "zustand"
import { applyTheme, applyStyle, THEMES, type ThemeId, type StyleId } from "./themes"
import type { Pipeline, PipelineTrigger } from "./pipeline"
import type { KvRow } from "./components/KeyValueEditor"
import type { SplitDir } from "./layout"
import type { ApiTest } from "./apiTests"

// A saved project layout. Leaves store the agent + its launch command (not a live
// terminal id) so a preset can be re-opened with fresh sessions.
export type PresetNode =
    | { kind: "leaf"; agentId: string; init?: string }
    | { kind: "split"; dir: SplitDir; children: PresetNode[] }
export interface PresetTab {
    name: string
    root: PresetNode
}
export interface WorkspacePreset {
    id: string
    projectId: string
    name: string
    tabs: PresetTab[]
}

/** A named set of {{variables}} for the API client (e.g. dev / UAT / PROD). */
export interface Environment {
    id: string
    name: string
    vars: KvRow[]
}

export type ApiBodyType = "none" | "json" | "form"
export type AuthType = "none" | "bearer" | "basic" | "apikey"

/** Authentication config for a request. Fields support {{variables}}. */
export interface AuthConfig {
    type: AuthType
    token: string
    username: string
    password: string
    apiKeyName: string
    apiKeyValue: string
    apiKeyIn: "header" | "query"
}

export function defaultAuth(): AuthConfig {
    return {
        type: "none",
        token: "",
        username: "",
        password: "",
        apiKeyName: "",
        apiKeyValue: "",
        apiKeyIn: "header"
    }
}

/** A saved API request (the full editable state of the API client). */
export interface SavedRequest {
    id: string
    name: string
    method: string
    url: string
    params: KvRow[]
    headers: KvRow[]
    bodyType: ApiBodyType
    bodyText: string
    formRows: KvRow[]
    auth: AuthConfig
    /** Assertions evaluated against the response after Send. */
    tests?: ApiTest[]
}

/** A named folder of saved requests. */
export interface Collection {
    id: string
    name: string
    requests: SavedRequest[]
}

export type ShellKind = "powershell" | "cmd" | "gitbash" | "wsl" | "custom"

/** A launchable AI CLI agent (Claude, Codex, Gemini, custom…). */
export interface AgentPreset {
    id: string
    name: string
    command: string
    resumeArgs: string
    badge: string
    /** Env var that, if set, makes this CLI bill pay-as-you-go instead of a subscription. */
    apiKeyEnv: string
    /** Default model to run this agent with (injected at spawn via modelEnv). "" = leave to the CLI. */
    model: string
    /** Env var that carries the model (e.g. ANTHROPIC_MODEL for Claude Code). */
    modelEnv: string
}

/** Default API-key env var per built-in agent (for migrating older saved settings). */
export const KNOWN_KEY_ENV: Record<string, string> = {
    claude: "ANTHROPIC_API_KEY",
    codex: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY"
}

/** Default model env var per built-in agent. Only Claude Code's is well-known. */
export const KNOWN_MODEL_ENV: Record<string, string> = {
    claude: "ANTHROPIC_MODEL"
}

export interface Snippet {
    id: string
    name: string
    body: string
}

export interface GitAccount {
    id: string
    label: string
    name: string
    email: string
    sshCommand: string
    /** Host for HTTPS credential caching (e.g. github.com). The PAT itself is
     *  stored encrypted in the main process, never here. */
    host?: string
    /** HTTPS username paired with the PAT (GitHub ignores it; defaults to x-access-token). */
    username?: string
}

export interface SshProfile {
    id: string
    label: string
    host: string
    user: string
    port: string
    args: string
}

/** Build an `ssh` command line from a profile. */
export function sshCommand(p: SshProfile): string {
    const parts = ["ssh"]
    if (p.port && p.port !== "22") parts.push("-p", p.port)
    if (p.args.trim()) parts.push(p.args.trim())
    parts.push((p.user ? p.user + "@" : "") + p.host)
    return parts.join(" ")
}

/**
 * One agent session, for the usage/activity dashboard. DevDeck spawns the CLI
 * rather than calling an API, so we can't see tokens or dollars — what we *can*
 * record honestly is which agent ran, in which project, and for how long.
 */
export interface UsageEvent {
    id: string
    agentId: string
    projectId: string
    startedAt: number
    endedAt?: number
}

/** Keep the log bounded — the dashboard only needs recent history. */
export const USAGE_LOG_CAP = 1000

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
    agents: AgentPreset[]
    agentIdleMs: number
    snippets: Snippet[]
    pipelines: Pipeline[]
    triggers: PipelineTrigger[]
    gitAccounts: GitAccount[]
    sshProfiles: SshProfile[]
    environments: Environment[]
    activeEnvId: string | null
    collections: Collection[]
    appearance: {
        theme: ThemeId
        style: StyleId
        accent: string
    }
    remote: {
        enabled: boolean
        port: number
        token: string
        /** Serve over HTTPS/WSS with a self-signed cert. */
        tls: boolean
    }
    network: {
        port: number
    }
    workspacePresets: WorkspacePreset[]
    usageLog: UsageEvent[]
    /** Recent SQL per DB connection id, most-recent-first. */
    dbQueryHistory: Record<string, string[]>
}

/** Cap recent queries kept per connection. */
export const DB_HISTORY_CAP = 25

function generateToken(): string {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
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
    agents: [
        { id: "claude", name: "Claude", command: "claude", resumeArgs: "--continue", badge: "CLAUDE", apiKeyEnv: "ANTHROPIC_API_KEY", model: "", modelEnv: "ANTHROPIC_MODEL" },
        { id: "codex", name: "Codex", command: "codex", resumeArgs: "resume", badge: "CODEX", apiKeyEnv: "OPENAI_API_KEY", model: "", modelEnv: "" },
        { id: "gemini", name: "Gemini", command: "gemini", resumeArgs: "", badge: "GEMINI", apiKeyEnv: "GEMINI_API_KEY", model: "", modelEnv: "" }
    ],
    agentIdleMs: 1000,
    snippets: [
        {
            id: "review",
            name: "review",
            body: "Review my recent changes for correctness, bugs, and clarity. Be concise."
        },
        {
            id: "explain",
            name: "explain",
            body: "Explain how this works and call out anything risky or surprising."
        },
        {
            id: "commit",
            name: "commit",
            body: "Stage the changes and commit with a clear conventional-commit message."
        }
    ],
    pipelines: [
        {
            id: "ship",
            name: "Investigate → Fix → Verify",
            steps: [
                {
                    id: "s1",
                    title: "Investigate",
                    agentId: "claude",
                    prompt: "Investigate the issue I just described. Find the root cause and the exact files/lines involved. Don't change anything yet - report findings.",
                    fresh: false
                },
                {
                    id: "s2",
                    title: "Implement the fix",
                    agentId: "claude",
                    prompt: "Now implement the smallest correct fix for the root cause you found. Keep the change focused.",
                    fresh: false
                },
                {
                    id: "s3",
                    title: "Verify",
                    agentId: "claude",
                    prompt: "Run the tests and a typecheck. If anything fails, fix it and re-run until green. Summarize what changed.",
                    fresh: false,
                    // Only finish if the output shows no failures; otherwise re-run.
                    gate: { mode: "absent", pattern: "FAIL", retries: 2, onFail: "stop" }
                }
            ]
        }
    ],
    triggers: [],
    gitAccounts: [],
    sshProfiles: [],
    environments: [],
    activeEnvId: null,
    collections: [],
    appearance: {
        theme: "slate",
        style: "modern",
        accent: "#eba65c"
    },
    remote: {
        enabled: false,
        port: 7420,
        token: "",
        tls: false
    },
    network: {
        port: 8899
    },
    workspacePresets: [],
    usageLog: [],
    dbQueryHistory: {}
}

interface SettingsState extends AppSettings {
    settingsOpen: boolean
    flush: () => void
    load: () => Promise<void>
    setTerminal: (patch: Partial<AppSettings["terminal"]>) => void
    setEditor: (patch: Partial<AppSettings["editor"]>) => void
    setAgents: (agents: AgentPreset[]) => void
    setAgentIdleMs: (ms: number) => void
    setSnippets: (snippets: Snippet[]) => void
    setPipelines: (pipelines: Pipeline[]) => void
    setTriggers: (triggers: PipelineTrigger[]) => void
    setGitAccounts: (accounts: GitAccount[]) => void
    setSshProfiles: (profiles: SshProfile[]) => void
    setEnvironments: (environments: Environment[]) => void
    setActiveEnv: (id: string | null) => void
    activeEnv: () => Environment | undefined
    setCollections: (collections: Collection[]) => void
    agentById: (id: string) => AgentPreset | undefined
    setAppearance: (patch: Partial<AppSettings["appearance"]>) => void
    setRemote: (patch: Partial<AppSettings["remote"]>) => void
    setNetwork: (patch: Partial<AppSettings["network"]>) => void
    setWorkspacePresets: (presets: WorkspacePreset[]) => void
    /** Record the start of an agent session (id = the pty/term id). */
    logUsageStart: (id: string, agentId: string, projectId: string) => void
    /** Stamp an agent session as ended. No-op if unknown/already ended. */
    logUsageEnd: (id: string) => void
    /** Record a successfully-run query for a connection (deduped, capped). */
    pushDbQuery: (connId: string, sql: string) => void
    clearDbHistory: (connId: string) => void
    regenerateToken: () => void
    resetAll: () => void
    openSettings: () => void
    closeSettings: () => void
    /** Resolve the configured shell to a launchable file + args (Windows). */
    resolveShell: () => { file: string; args: string[] }
}

export const useSettings = create<SettingsState>((set, get) => {
    // Debounced - accent dragging and rapid edits shouldn't hammer the disk.
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    const writeNow = (): void => {
        const { terminal, editor, agents, agentIdleMs, snippets, pipelines, triggers, gitAccounts, sshProfiles, environments, activeEnvId, collections, appearance, remote, network, workspacePresets, usageLog, dbQueryHistory } = get()
        window.api.settings.save({ terminal, editor, agents, agentIdleMs, snippets, pipelines, triggers, gitAccounts, sshProfiles, environments, activeEnvId, collections, appearance, remote, network, workspacePresets, usageLog, dbQueryHistory })
    }
    const persist = (): void => {
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(writeNow, 300)
    }
    const flush = (): void => {
        if (persistTimer) {
            clearTimeout(persistTimer)
            persistTimer = null
        }
        writeNow()
    }

    // Reflect the remote config into the actual server (start/stop).
    const applyServer = (): void => {
        const { enabled, port, token, tls } = get().remote
        if (enabled && token) window.api.server.start({ port, token, tls })
        else window.api.server.stop()
    }

    // Push the enabled file-triggers to the main-process watcher.
    const applyTriggers = (): void => {
        window.api.triggers.apply(get().triggers.filter((t) => t.enabled))
    }

    return {
        ...DEFAULTS,
        settingsOpen: false,
        flush,

        load: async () => {
            const raw = (await window.api.settings.load()) as Partial<AppSettings> | null
            if (raw) {
                set({
                    terminal: { ...DEFAULTS.terminal, ...raw.terminal },
                    editor: { ...DEFAULTS.editor, ...raw.editor },
                    agents: (raw.agents?.length ? raw.agents : DEFAULTS.agents).map((a) => ({
                        ...a,
                        apiKeyEnv: a.apiKeyEnv ?? KNOWN_KEY_ENV[a.id] ?? "",
                        model: a.model ?? "",
                        modelEnv: a.modelEnv ?? KNOWN_MODEL_ENV[a.id] ?? ""
                    })),
                    agentIdleMs: raw.agentIdleMs ?? DEFAULTS.agentIdleMs,
                    snippets: raw.snippets ?? DEFAULTS.snippets,
                    pipelines: raw.pipelines ?? DEFAULTS.pipelines,
                    triggers: raw.triggers ?? DEFAULTS.triggers,
                    gitAccounts: raw.gitAccounts ?? DEFAULTS.gitAccounts,
                    sshProfiles: raw.sshProfiles ?? DEFAULTS.sshProfiles,
                    environments: raw.environments ?? DEFAULTS.environments,
                    activeEnvId: raw.activeEnvId ?? DEFAULTS.activeEnvId,
                    collections: raw.collections ?? DEFAULTS.collections,
                    appearance: { ...DEFAULTS.appearance, ...raw.appearance },
                    remote: { ...DEFAULTS.remote, ...raw.remote },
                    network: { ...DEFAULTS.network, ...raw.network },
                    workspacePresets: raw.workspacePresets ?? DEFAULTS.workspacePresets,
                    // Fresh process → no pty is actually running, so any event left
                    // open by a previous run is stale. Close it at its start time so
                    // it counts as a launch without inflating "running now".
                    usageLog: (raw.usageLog ?? DEFAULTS.usageLog).map((e) =>
                        e.endedAt ? e : { ...e, endedAt: e.startedAt }
                    ),
                    dbQueryHistory: raw.dbQueryHistory ?? DEFAULTS.dbQueryHistory
                })
            }
            applyTheme(get().appearance.theme, get().appearance.accent)
            applyStyle(get().appearance.style)
            applyServer()
            applyTriggers()
        },

        setTerminal: (patch) => {
            set((s) => ({ terminal: { ...s.terminal, ...patch } }))
            persist()
        },
        setEditor: (patch) => {
            set((s) => ({ editor: { ...s.editor, ...patch } }))
            persist()
        },
        setAgents: (agents) => {
            set({ agents })
            persist()
        },
        setAgentIdleMs: (ms) => {
            set({ agentIdleMs: ms })
            persist()
        },
        setSnippets: (snippets) => {
            set({ snippets })
            persist()
        },
        setPipelines: (pipelines) => {
            set({ pipelines })
            persist()
        },
        setTriggers: (triggers) => {
            set({ triggers })
            applyTriggers()
            persist()
        },
        setGitAccounts: (gitAccounts) => {
            set({ gitAccounts })
            persist()
        },
        setSshProfiles: (sshProfiles) => {
            set({ sshProfiles })
            persist()
        },
        setEnvironments: (environments) => {
            // Keep the active selection valid if its environment was removed.
            const activeEnvId = environments.some((e) => e.id === get().activeEnvId)
                ? get().activeEnvId
                : null
            set({ environments, activeEnvId })
            persist()
        },
        setActiveEnv: (activeEnvId) => {
            set({ activeEnvId })
            persist()
        },
        activeEnv: () => get().environments.find((e) => e.id === get().activeEnvId),
        setCollections: (collections) => {
            set({ collections })
            persist()
        },
        agentById: (id) => get().agents.find((a) => a.id === id),
        setAppearance: (patch) => {
            set((s) => {
                const appearance = { ...s.appearance, ...patch }
                // Switching theme resets the accent to that theme's default
                // (unless an accent was supplied in the same change).
                if (patch.theme && patch.accent === undefined) {
                    appearance.accent = THEMES[patch.theme].accent
                }
                return { appearance }
            })
            applyTheme(get().appearance.theme, get().appearance.accent)
            applyStyle(get().appearance.style)
            persist()
        },
        setRemote: (patch) => {
            set((s) => {
                const remote = { ...s.remote, ...patch }
                // Auto-generate a token the first time remote access is enabled.
                if (remote.enabled && !remote.token) remote.token = generateToken()
                return { remote }
            })
            applyServer()
            persist()
        },
        setNetwork: (patch) => {
            set((s) => ({ network: { ...s.network, ...patch } }))
            persist()
        },
        setWorkspacePresets: (workspacePresets) => {
            set({ workspacePresets })
            persist()
        },
        logUsageStart: (id, agentId, projectId) => {
            set((s) => ({
                usageLog: [
                    ...s.usageLog.slice(-(USAGE_LOG_CAP - 1)),
                    { id, agentId, projectId, startedAt: Date.now() }
                ]
            }))
            persist()
        },
        logUsageEnd: (id) => {
            set((s) => ({
                usageLog: s.usageLog.map((e) =>
                    e.id === id && !e.endedAt ? { ...e, endedAt: Date.now() } : e
                )
            }))
            persist()
        },
        pushDbQuery: (connId, sql) => {
            const q = sql.trim()
            if (!connId || !q) return
            set((s) => {
                const prev = s.dbQueryHistory[connId] ?? []
                if (prev[0] === q) return s // skip consecutive duplicate
                const next = [q, ...prev.filter((x) => x !== q)].slice(0, DB_HISTORY_CAP)
                return { dbQueryHistory: { ...s.dbQueryHistory, [connId]: next } }
            })
            persist()
        },
        clearDbHistory: (connId) => {
            set((s) => {
                const next = { ...s.dbQueryHistory }
                delete next[connId]
                return { dbQueryHistory: next }
            })
            persist()
        },
        regenerateToken: () => {
            set((s) => ({ remote: { ...s.remote, token: generateToken() } }))
            applyServer()
            persist()
        },
        resetAll: () => {
            set({ ...DEFAULTS })
            applyTheme(DEFAULTS.appearance.theme, DEFAULTS.appearance.accent)
            applyStyle(DEFAULTS.appearance.style)
            applyServer()
            applyTriggers()
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
