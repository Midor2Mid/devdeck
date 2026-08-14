import { create } from "zustand"
import { applyTheme, applyStyle, THEMES, type ThemeId, type StyleId } from "./themes"
import type { Pipeline, PipelineTrigger } from "./pipeline"
import type { KvRow } from "./components/KeyValueEditor"
import type { SplitDir } from "./layout"
import type { ApiTest } from "./apiTests"
import type { Extractor } from "./apiChain"
import type { BindMode } from "../../preload/index"
import type { RoutingRule } from "./routing"

/**
 * How long a paired device may idle before it's dropped - 0 means never.
 * Typed as the exact policy values (not `number`) so a malformed value can't
 * reach `isExpired` at all from this boundary; `isExpired` itself (guards.ts)
 * also fails closed on a malformed ttlDays at runtime, since a settings.json
 * hand-edited or migrated from an older shape isn't type-checked either.
 */
export type DeviceTtlDays = 7 | 30 | 0

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
    /** Values pulled from the response into chain variables for later requests. */
    extractors?: Extractor[]
}

/** A named folder of saved requests. */
export interface Collection {
    id: string
    name: string
    requests: SavedRequest[]
}

export type ShellKind = "powershell" | "cmd" | "gitbash" | "wsl" | "custom"

/** How a startup command runs when launched. */
export type RunMode = "agent" | "normal"

/**
 * A launchable startup command. In "agent" mode it's an AI CLI session (Claude,
 * Codex, …) with prompts/orchestration/idle detection; in "normal" mode it's a
 * plain shell that auto-runs `command` (a dev server, a build, etc.).
 */
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
    /** "agent" = AI session; "normal" = plain shell that auto-runs the command. */
    runMode: RunMode
    /** Optional emoji/glyph shown on launcher cards and menus. "" = none. */
    icon: string
    /** Optional grouping label for pickers/launcher. "" = ungrouped. */
    category: string
}

/**
 * Only AI-mode presets can run a dispatched task, take a diff handoff, race,
 * or otherwise stand in for "an agent" — a normal-mode preset is a fixed shell
 * command with nothing to send a prompt to. Several call sites (task routing,
 * the diff handoff picker, the race entrants list, the project strip's launch
 * picker) each need this same subset, and independently repeating the filter
 * predicate makes its correctness rest on every copy staying textually
 * identical forever - exactly the kind of drift that reintroduces the bug this
 * distinction exists to prevent. One function, called from all of them.
 */
export function aiModeAgents(agents: AgentPreset[]): AgentPreset[] {
    return agents.filter((a) => a.runMode !== "normal")
}

/**
 * The curated starter set. Ships as the default for a fresh install and is the
 * source for the "Add recommended" action, which merges any of these an existing
 * config is missing. Model-pinned/skip-permissions variants exist to pair with
 * DevDeck features (parallel models via broadcast, skip-permissions in worktrees).
 */
/**
 * The recommended commands a config doesn't have yet — matched by id, or by the
 * same command + run mode, so adding them never creates a duplicate of something
 * the user already renamed. Pure so both the launcher and Settings can ask, and
 * so the dedupe rule is unit-testable.
 */
export function missingRecommended(agents: AgentPreset[]): AgentPreset[] {
    return (
        RECOMMENDED_COMMANDS.filter((r) => {
            const key = `${r.runMode}:${r.command.trim()}`
            return !agents.some((a) => a.id === r.id || `${a.runMode}:${a.command.trim()}` === key)
        })
            // Copies, not the canonical objects: RECOMMENDED_COMMANDS is also
            // DEFAULTS.agents, so handing out live references would let a caller
            // editing "their" preset rewrite the starter set for the whole app.
            .map((r) => ({ ...r }))
    )
}

export const RECOMMENDED_COMMANDS: AgentPreset[] = [
    { id: "claude", name: "Claude", command: "claude", resumeArgs: "--continue", badge: "CLAUDE", apiKeyEnv: "ANTHROPIC_API_KEY", model: "", modelEnv: "ANTHROPIC_MODEL", runMode: "agent", icon: "✳", category: "AI Agents" },
    { id: "claude-opus", name: "Claude Opus", command: "claude", resumeArgs: "--continue", badge: "OPUS", apiKeyEnv: "ANTHROPIC_API_KEY", model: "claude-opus-4-8", modelEnv: "ANTHROPIC_MODEL", runMode: "agent", icon: "✦", category: "AI Agents" },
    { id: "claude-yolo", name: "Claude YOLO", command: "claude --dangerously-skip-permissions", resumeArgs: "", badge: "YOLO", apiKeyEnv: "ANTHROPIC_API_KEY", model: "", modelEnv: "ANTHROPIC_MODEL", runMode: "agent", icon: "⚡", category: "AI Agents" },
    { id: "codex", name: "Codex", command: "codex", resumeArgs: "resume", badge: "CODEX", apiKeyEnv: "OPENAI_API_KEY", model: "", modelEnv: "", runMode: "agent", icon: "◆", category: "AI Agents" },
    { id: "gemini", name: "Gemini", command: "gemini", resumeArgs: "", badge: "GEMINI", apiKeyEnv: "GEMINI_API_KEY", model: "", modelEnv: "", runMode: "agent", icon: "◇", category: "AI Agents" },
    { id: "dev", name: "Dev server", command: "npm run dev", resumeArgs: "", badge: "", apiKeyEnv: "", model: "", modelEnv: "", runMode: "normal", icon: "▶", category: "Dev Servers" },
    { id: "build", name: "Build", command: "npm run build", resumeArgs: "", badge: "", apiKeyEnv: "", model: "", modelEnv: "", runMode: "normal", icon: "⚒", category: "Build & Test" },
    { id: "test", name: "Test", command: "npm test", resumeArgs: "", badge: "", apiKeyEnv: "", model: "", modelEnv: "", runMode: "normal", icon: "✓", category: "Build & Test" }
]

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

/** A per-project saved shell command, launchable as a sidebar chip. */
export interface SavedCommand {
    id: string
    name: string
    command: string
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

/**
 * Flags that hand an agent unattended write/exec authority over the repo.
 * Matched on the command line rather than on a preset id, so a hand-rolled
 * agent carrying one of these is flagged the same as the bundled YOLO preset.
 */
const PERMISSION_BYPASS = [
    "--dangerously-skip-permissions", // Claude Code
    "--yolo", // Gemini CLI / misc
    "--full-auto", // Codex
    "--auto-approve",
    "--dangerously-bypass-approvals-and-sandbox"
]

/** True if this command lets an agent act without asking — show it as risky. */
export function isUnsafeAgent(command: string): boolean {
    const c = command.toLowerCase()
    return PERMISSION_BYPASS.some((f) => c.includes(f))
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
        /** Which interface to bind — see `chooseBind` in main/guards.ts. */
        bind: BindMode
        /** Idle-expiry window for paired devices, in days (0 = never). */
        deviceTtlDays: DeviceTtlDays
        /** Serve over HTTPS/WSS with a self-signed cert. */
        tls: boolean
    }
    /**
     * DevDeck's own MCP server: lets agent CLIs pull context (query the project's
     * database) instead of us pasting it into the prompt. Loopback-only and
     * read-only, but a listening port is still a surface — off by default.
     */
    mcpServer: {
        enabled: boolean
        port: number
        token: string
    }
    network: {
        port: number
    }
    /** Upstream corporate proxy, injected into spawned terminals + child processes. */
    proxy: {
        enabled: boolean
        /** Proxy URL, e.g. http://proxy.corp:8080 (may embed user:pass@). */
        url: string
        /** Comma-separated hosts to bypass (NO_PROXY). */
        noProxy: string
        /** Path to an extra CA cert bundle (NODE_EXTRA_CA_CERTS) for TLS-intercepting proxies. */
        caPath: string
    }
    /** Attention notifications when an agent needs you. */
    notifications: {
        /** Native OS desktop notification (loud "attention" tier). */
        desktop: boolean
        /** Short audible beep on the loud "attention" tier (bell / blocked). */
        sound: boolean
        /** Short beep on the soft "waiting" tier (agent finished a turn). Off by default. */
        waitingSound: boolean
    }
    workspacePresets: WorkspacePreset[]
    usageLog: UsageEvent[]
    /** Recent SQL per DB connection id, most-recent-first. */
    dbQueryHistory: Record<string, string[]>
    /** User-defined launchable shell commands, per project id. */
    projectCommands: Record<string, SavedCommand[]>
    /** Rules that pick which agent preset dispatches a task-board card. */
    routingRules: RoutingRule[]
    /** Agent used when no routing rule matches. "" = fall back to agents[0]. */
    defaultAgentId: string
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
    agents: RECOMMENDED_COMMANDS,
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
        // A brand-new install has no tailnet-down legacy behaviour to preserve,
        // so it gets the private option outright. An existing install migrates
        // to "auto" instead — see the one-way migration in load() below.
        bind: "tailscale",
        deviceTtlDays: 30,
        tls: false
    },
    mcpServer: {
        enabled: false,
        port: 8787,
        token: ""
    },
    network: {
        port: 8899
    },
    proxy: {
        enabled: false,
        url: "",
        noProxy: "",
        caPath: ""
    },
    notifications: {
        desktop: true,
        sound: false,
        waitingSound: false
    },
    workspacePresets: [],
    usageLog: [],
    dbQueryHistory: {},
    projectCommands: {},
    routingRules: [],
    defaultAgentId: ""
}

interface SettingsState extends AppSettings {
    settingsOpen: boolean
    /** Section to land on when opening Settings (null = keep the last one). */
    settingsSection: string | null
    /**
     * The verbatim refusal reason from the last `server:start` attempt (e.g.
     * "No tailnet address found…"), or null when the last attempt succeeded /
     * none has run yet. Not persisted — this is transient UI state, not a
     * setting. Task 5's panel shows this string as-is, unparaphrased.
     */
    remoteBindError: string | null
    flush: () => void
    load: () => Promise<void>
    setTerminal: (patch: Partial<AppSettings["terminal"]>) => void
    setEditor: (patch: Partial<AppSettings["editor"]>) => void
    setAgents: (agents: AgentPreset[]) => void
    /** Merge in the recommended commands not already configured; returns how many. */
    addRecommended: () => number
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
    /**
     * Apply the current remote config immediately (bypassing the debounce
     * `setRemote` uses so a burst of edits — e.g. typing in the Port field —
     * doesn't fire a stop/start pair per keystroke) and update
     * `remoteBindError` from the outcome. The single path both the settings
     * store and an explicit "Restart remote" button use, so there is exactly
     * one place that can leave `remoteBindError` stale or out of order.
     */
    restartServer: () => Promise<void>
    setMcpServer: (patch: Partial<AppSettings["mcpServer"]>) => void
    setNetwork: (patch: Partial<AppSettings["network"]>) => void
    setProxy: (patch: Partial<AppSettings["proxy"]>) => void
    setNotifications: (patch: Partial<AppSettings["notifications"]>) => void
    setWorkspacePresets: (presets: WorkspacePreset[]) => void
    /** Record the start of an agent session (id = the pty/term id). */
    logUsageStart: (id: string, agentId: string, projectId: string) => void
    /** Stamp an agent session as ended. No-op if unknown/already ended. */
    logUsageEnd: (id: string) => void
    /** Record a successfully-run query for a connection (deduped, capped). */
    pushDbQuery: (connId: string, sql: string) => void
    clearDbHistory: (connId: string) => void
    /** Replace a project's saved commands. */
    setProjectCommands: (projectId: string, commands: SavedCommand[]) => void
    setRoutingRules: (rules: RoutingRule[]) => void
    setDefaultAgentId: (id: string) => void
    resetAll: () => void
    openSettings: (section?: string) => void
    closeSettings: () => void
    /** Resolve the configured shell to a launchable file + args (Windows). */
    resolveShell: (kind?: ShellKind) => { file: string; args: string[] }
}

export const useSettings = create<SettingsState>((set, get) => {
    // `load()` is fire-and-forget from App.tsx's mount effect, which also
    // wires `beforeunload -> flush()`. Without this flag, closing the window
    // while that IPC round-trip is still in flight would flush() the
    // still-DEFAULTS in-memory state (load()'s `set()` hasn't run yet) over
    // settings.json, wiping every real setting on disk - not just the legacy
    // remote.token this task was migrating. No save may run until `load()`
    // has actually applied whatever settings.json holds (or confirmed there
    // is none, for a genuinely fresh install).
    let loaded = false
    // I3: a legacy `remote.token` that has NOT yet been confirmed migrated
    // (migrateLegacyToken returned false, or threw) - held here so `writeNow`
    // can re-attach it below. The in-memory `remote` object has no `token`
    // field once constructed (see `load()`), so without this, the very next
    // persist() from ANY unrelated settings change - not just a retried
    // migration - would rewrite settings.json with no token to retry from.
    // Set in `load()`; cleared once migration is confirmed.
    let unmigratedLegacyToken: string | null = null
    // Debounced - accent dragging and rapid edits shouldn't hammer the disk.
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    const writeNow = (): void => {
        if (!loaded) {
            // Should only ever fire for the in-flight window between mount
            // and load() resolving - a save request that lands there is
            // silently dropped rather than wiping settings.json (see the
            // comment above `loaded`), but "silently" made it undiagnosable
            // if that window is ever wider than expected.
            console.warn("[settings] save requested before load() completed - dropped")
            return
        }
        const { terminal, editor, agents, agentIdleMs, snippets, pipelines, triggers, gitAccounts, sshProfiles, environments, activeEnvId, collections, appearance, remote, mcpServer, network, proxy, notifications, workspacePresets, usageLog, dbQueryHistory, projectCommands, routingRules, defaultAgentId } = get()
        // Re-attach an unconfirmed legacy token so it survives THIS write too
        // - not just the one migration flush() was supposed to make happen.
        // Any other setting changing (a theme tweak, a new snippet) calls
        // persist(), and without this, that unrelated save would carry the
        // no-token `remote` shape to disk and the legacy value would be gone
        // for good on the next launch, with nothing left to retry.
        const remoteOut = unmigratedLegacyToken ? { ...remote, token: unmigratedLegacyToken } : remote
        window.api.settings.save({ terminal, editor, agents, agentIdleMs, snippets, pipelines, triggers, gitAccounts, sshProfiles, environments, activeEnvId, collections, appearance, remote: remoteOut, mcpServer, network, proxy, notifications, workspacePresets, usageLog, dbQueryHistory, projectCommands, routingRules, defaultAgentId })
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
    //
    // Stops the old server before attempting the new config, rather than
    // relying solely on server.ts's own internal stop-then-start: that
    // internal stop only runs once the new bind has been validated, so if the
    // new config is refused (e.g. "tailscale" requested, tailnet down), a
    // caller that skipped this explicit stop would leave whatever was already
    // running - potentially a wider bind from before this was an explicit
    // choice - listening while the UI shows the (rejected) new config. Stopping
    // first means a refusal leaves nothing running: fail closed, not stale-open.
    //
    // `applySeq` guards against out-of-order completions: two overlapping
    // stop/start pairs (e.g. two edits close together) can resolve in either
    // order, and only the result belonging to the MOST RECENT attempt should
    // ever land in `remoteBindError` - an older attempt's late-arriving result
    // must not overwrite a newer one's.
    let applySeq = 0
    const doApplyServer = async (): Promise<void> => {
        const mySeq = ++applySeq
        const { enabled, port, bind, deviceTtlDays, tls } = get().remote
        await window.api.server.stop()
        if (!enabled) {
            if (mySeq === applySeq) set({ remoteBindError: null })
            return
        }
        try {
            const result = await window.api.server.start({ port, bind, deviceTtlDays, tls })
            if (mySeq === applySeq) {
                set({ remoteBindError: result.ok ? null : (result.reason ?? "Failed to start.") })
            }
        } catch (err) {
            if (mySeq === applySeq) set({ remoteBindError: (err as Error)?.message ?? String(err) })
        }
    }
    // Debounced: `setRemote` fires on every keystroke in fields like Port, and
    // without this each one would fire its own stop/start pair against the
    // real server. Collapses a burst into the one attempt after edits settle.
    let applyServerTimer: ReturnType<typeof setTimeout> | null = null
    const applyServer = (): void => {
        if (applyServerTimer) clearTimeout(applyServerTimer)
        applyServerTimer = setTimeout(() => void doApplyServer(), 300)
    }

    const applyMcpServer = (): void => {
        const { enabled, port, token } = get().mcpServer
        if (enabled && token) void window.api.mcpsrv.start({ port, token })
        else void window.api.mcpsrv.stop()
    }

    // Push the enabled file-triggers to the main-process watcher.
    const applyTriggers = (): void => {
        window.api.triggers.apply(get().triggers.filter((t) => t.enabled))
    }

    // Reflect the proxy config into the main process's env, so newly-spawned
    // terminals + child processes (npm/git/dotnet) inherit it.
    const applyProxy = (): void => {
        window.api.netproxy.apply(get().proxy)
    }

    return {
        ...DEFAULTS,
        settingsOpen: false,
        settingsSection: null,
        remoteBindError: null,
        flush,

        load: async () => {
            const raw = (await window.api.settings.load()) as Partial<AppSettings> | null
            if (raw) {
                // Pre-Task-4 settings.json shapes carry a plaintext remote.token
                // that no longer exists on AppSettings["remote"] - read it off the
                // raw payload directly. One-way migration: hand it to main once so
                // it becomes the pairing token, then let the write below drop it
                // from settings.json (the new `remote` object below has no token
                // field at all, so the next save can no longer carry it forward).
                const legacyRemote = raw.remote as
                    | (Partial<AppSettings["remote"]> & { token?: string })
                    | undefined
                // Awaited (not fire-and-forget) and gated on the RETURN VALUE,
                // not merely on the promise resolving without throwing: the
                // flush below is what actually erases the plaintext token from
                // disk, on a separate IPC channel from this invoke, and
                // `migrateLegacyToken` can resolve `false` (declined - a
                // *different* pairing token already exists) without throwing
                // at all. Treating "didn't throw" as "migrated" would flush a
                // legacy token that was never actually adopted.
                //
                // The resolved-`false` and thrown cases are NOT the same
                // outcome, and must not be retained alike. A thrown error is a
                // transient, unrecoverable *write* failure - the token is
                // still the live one, worth retrying on the next load, so
                // `unmigratedLegacyToken` (I3) holds onto it: the in-memory
                // `remote` object built below has no `token` field once
                // migration doesn't succeed here, and `writeNow` re-attaches
                // this value to every save until a later load's migration
                // finally confirms. Without it, the NEXT unrelated settings
                // change (not even a retried migration - any save at all)
                // would persist the no-token shape to disk, and a later load
                // would find no token left to retry with at all.
                //
                // A resolved `false`, in contrast, means a *different* pairing
                // token already exists - this legacy token is PERMANENTLY
                // declined and will never adopt on a later load either (see
                // the comment in the `if (!legacyMigrated)` branch below).
                // Retaining it in that case, as a single `legacyMigrated ?
                // null : legacyRemote.token` once did, meant a dead plaintext
                // legacy token got rewritten into settings.json on every save,
                // forever, with no path to removal - and if `remote-devices.json`
                // were ever lost or corrupted, the next launch would find an
                // empty pairing token and silently adopt that stale,
                // possibly-leaked value as the live one again.
                let legacyMigrated = false
                let migrationThrew = false
                if (legacyRemote?.token) {
                    try {
                        legacyMigrated = await window.api.devices.migrateLegacyToken(legacyRemote.token)
                        if (!legacyMigrated) {
                            // Resolved false, not thrown: a *different* pairing
                            // token already exists (e.g. a Settings visit
                            // minted one after an earlier write failure), so
                            // this legacy token is now PERMANENTLY declined -
                            // it will never adopt on a later load either, and
                            // a phone that bookmarked the old URL is locked
                            // out with no signal today. Surfacing it here at
                            // least makes the lockout diagnosable.
                            console.warn(
                                "[settings] legacy remote.token was not migrated - a different pairing token already exists, so this device is permanently declined and any bookmarked phone using the old token will need to re-pair"
                            )
                        }
                    } catch (err) {
                        migrationThrew = true
                        console.error(
                            "[settings] failed to migrate legacy remote.token - leaving it in settings.json until this succeeds:",
                            err
                        )
                    }
                    // Retain the token ONLY on the throw path - a resolved
                    // `false` is a permanent decline, not a retry candidate.
                    unmigratedLegacyToken = migrationThrew ? legacyRemote.token : null
                } else {
                    unmigratedLegacyToken = null
                }
                set({
                    terminal: { ...DEFAULTS.terminal, ...raw.terminal },
                    editor: { ...DEFAULTS.editor, ...raw.editor },
                    agents: (raw.agents?.length ? raw.agents : DEFAULTS.agents).map((a) => ({
                        ...a,
                        apiKeyEnv: a.apiKeyEnv ?? KNOWN_KEY_ENV[a.id] ?? "",
                        model: a.model ?? "",
                        modelEnv: a.modelEnv ?? KNOWN_MODEL_ENV[a.id] ?? "",
                        // Pre-existing presets are all AI agents; new fields default in.
                        runMode: a.runMode ?? "agent",
                        icon: a.icon ?? "",
                        category: a.category ?? ""
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
                    remote: {
                        enabled: legacyRemote?.enabled ?? DEFAULTS.remote.enabled,
                        port: legacyRemote?.port ?? DEFAULTS.remote.port,
                        // An existing install that had actually turned remote
                        // ON migrates to "auto": today's behaviour (bind
                        // wherever it lands) keeps working, and the panel
                        // invites an explicit choice away from it. An install
                        // that has `raw.remote` (so it isn't brand-new) but
                        // never enabled remote has no bind behaviour to
                        // preserve at all - there is nothing "today's
                        // behaviour" even means for it - so it gets the safe
                        // default outright, same as a fresh install. A
                        // genuinely brand-new install (no `raw.remote`,
                        // `legacyRemote` itself undefined) never reaches this
                        // branch either way and keeps DEFAULTS.remote.bind.
                        bind: legacyRemote?.bind ?? (legacyRemote?.enabled ? "auto" : "tailscale"),
                        deviceTtlDays: legacyRemote?.deviceTtlDays ?? DEFAULTS.remote.deviceTtlDays,
                        tls: legacyRemote?.tls ?? DEFAULTS.remote.tls
                    },
                    mcpServer: { ...DEFAULTS.mcpServer, ...raw.mcpServer },
                    network: { ...DEFAULTS.network, ...raw.network },
                    proxy: { ...DEFAULTS.proxy, ...raw.proxy },
                    notifications: { ...DEFAULTS.notifications, ...raw.notifications },
                    workspacePresets: raw.workspacePresets ?? DEFAULTS.workspacePresets,
                    // Fresh process → no pty is actually running, so any event left
                    // open by a previous run is stale. Close it at its start time so
                    // it counts as a launch without inflating "running now".
                    usageLog: (raw.usageLog ?? DEFAULTS.usageLog).map((e) =>
                        e.endedAt ? e : { ...e, endedAt: e.startedAt }
                    ),
                    dbQueryHistory: raw.dbQueryHistory ?? DEFAULTS.dbQueryHistory,
                    projectCommands: raw.projectCommands ?? DEFAULTS.projectCommands,
                    routingRules: raw.routingRules ?? DEFAULTS.routingRules,
                    defaultAgentId: raw.defaultAgentId ?? DEFAULTS.defaultAgentId
                })
                // Only from here on does the in-memory state actually reflect
                // settings.json, so only from here on may a save run at all -
                // see `loaded`'s comment above `writeNow`. Set BEFORE the
                // flush() below (not after), since that flush is itself a
                // save and must not be silently dropped by the same guard.
                loaded = true
                // Scrub the plaintext token from settings.json now rather than
                // waiting on some unrelated future edit to trigger a save — the
                // in-memory `remote` above already has no token field to write
                // back, so this flush is what actually removes it from disk.
                // Only once migration actually succeeded (see above).
                if (legacyMigrated) flush()
            } else {
                // No settings.json at all - a genuinely fresh install. The
                // in-memory DEFAULTS the store already started with ARE the
                // correct "loaded" content, so saves may proceed immediately.
                loaded = true
            }
            applyTheme(get().appearance.theme, get().appearance.accent)
            applyStyle(get().appearance.style)
            applyServer()
            applyMcpServer()
            applyTriggers()
            applyProxy()
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
        addRecommended: () => {
            // missingRecommended already returns copies.
            const missing = missingRecommended(get().agents)
            if (missing.length === 0) return 0
            set((s) => ({ agents: [...s.agents, ...missing] }))
            persist()
            return missing.length
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
            // No token to mint here anymore: auth is per-device now, minted by
            // main (devices.ts) on enrolment, never held in settings.json.
            set((s) => ({ remote: { ...s.remote, ...patch } }))
            applyServer()
            persist()
        },
        restartServer: async () => {
            // Cancel any pending debounced apply so an explicit restart isn't
            // immediately followed - or preceded - by a stale queued one; then
            // run (and await) the real thing through the same path `applyServer`
            // uses, so `remoteBindError` only ever has one writer.
            if (applyServerTimer) {
                clearTimeout(applyServerTimer)
                applyServerTimer = null
            }
            await doApplyServer()
        },
        setMcpServer: (patch) => {
            set((s) => {
                const mcpServer = { ...s.mcpServer, ...patch }
                // Mint a bearer token the first time it's switched on, same as remote.
                if (mcpServer.enabled && !mcpServer.token) mcpServer.token = generateToken()
                return { mcpServer }
            })
            applyMcpServer()
            persist()
        },
        setNetwork: (patch) => {
            set((s) => ({ network: { ...s.network, ...patch } }))
            persist()
        },
        setProxy: (patch) => {
            set((s) => ({ proxy: { ...s.proxy, ...patch } }))
            applyProxy()
            persist()
        },
        setNotifications: (patch) => {
            set((s) => ({ notifications: { ...s.notifications, ...patch } }))
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
        setProjectCommands: (projectId, commands) => {
            set((s) => {
                const next = { ...s.projectCommands }
                if (commands.length) next[projectId] = commands
                else delete next[projectId]
                return { projectCommands: next }
            })
            persist()
        },
        setRoutingRules: (routingRules) => {
            set({ routingRules })
            persist()
        },
        setDefaultAgentId: (defaultAgentId) => {
            set({ defaultAgentId })
            persist()
        },
        resetAll: () => {
            set({ ...DEFAULTS })
            applyTheme(DEFAULTS.appearance.theme, DEFAULTS.appearance.accent)
            applyStyle(DEFAULTS.appearance.style)
            applyServer()
            applyTriggers()
            applyProxy()
            persist()
        },

        openSettings: (section) => set({ settingsOpen: true, settingsSection: section ?? null }),
        closeSettings: () => set({ settingsOpen: false }),

        resolveShell: (kind) => {
            const { shell, customShellPath } = get().terminal
            switch (kind ?? shell) {
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
