import { contextBridge, ipcRenderer, webUtils } from "electron"
// Type-only imports from main: erased at bundle time (isolatedModules + no
// runtime value pulled in), so this doesn't drag main's Electron/native-module
// side effects into the preload bundle. Importing the canonical shapes here -
// rather than restating them by hand - is what makes a field rename in
// ServerConfig/BindMode/RemoteDevice actually surface as a typecheck error at
// this boundary, instead of `ipcRenderer.invoke`'s untyped channel quietly
// letting the two sides drift (the exact gap that hid Task 3's regression).
import type { BindMode } from "../main/guards"
import type { FolderState, RelocateResult } from "../main/projects"
import type { MenuCommand } from "../main/index"
import type { RunExclusionReason, RunKind, RunRecord } from "../main/ledger"
import type { PublicRemoteDevice } from "../main/devices"
import type { ServerConfig, ServerStartResult } from "../main/server"
import type { NotifyState } from "../main/notify"
import type { Loaded } from "../shared/loaded"
import type { ProbeReport, ProbeRequest, ProbeResult, ProbeState } from "../shared/probe"
import type {
    DiagnosticsAgent,
    DiagnosticsAgents,
    DiagnosticsError,
    DiagnosticsRecord,
    DiagnosticsReport,
    DiagnosticsResult
} from "../shared/diagnostics"
import type { DecisionSnapshot, DecisionView } from "../shared/decision"

// Re-exported as `RemoteDevice`: the renderer never sees (and never needs to
// know about) the internal `RemoteDevice` shape that also carries
// `userAgent` - `PublicRemoteDevice` (what every IPC call below actually
// returns) is the only shape that should exist on this side of the bridge.
export type { BindMode, PublicRemoteDevice as RemoteDevice }
// The folder probe's three states, defined once in main. `ok`, `missing` and
// `unchecked` are three different things and a renderer that treats the last
// two as one is the defect this type exists to prevent - read the type's own
// comment in main/projects.ts before rendering any of them.
export type { FolderState, RelocateResult }
// The application menu's one command shape. Type-only, so importing it from
// main/index does not drag main into the preload bundle.
export type { MenuCommand }
// `Loaded<T>` crosses the bridge intact: the renderer has to distinguish "no
// workspace yet" from "there is one and we could not read it" to know whether
// saving over it is safe. Collapsing the two is what destroyed workspaces.
export type { Loaded }
// The ledger's record shape is defined once, in main, and travels across the
// bridge unchanged - restating it here is exactly how a renamed field stops
// being an error anywhere.
export type { RunKind, RunRecord, RunExclusionReason }
// A pending permission prompt, as the renderer sees it. Deliberately from
// `shared/`, NOT from `main/decisions`: that module imports `main/pty`, and a
// value import anywhere along that path would drag the native pty binding into
// the preload bundle. It would typecheck and then fail at runtime.
export type { DecisionView, DecisionSnapshot }
// Whether this machine can show a desktop notification, and why the last one
// failed. From main, because main is the only process that can answer it: the
// renderer's own `Notification` is denied by `setPermissionCheckHandler` and
// drops silently (main/notify.ts). Settings reads this so the toggle cannot
// claim a delivery nobody made.
export type { NotifyState }
// The probe's contract, from `shared/` for the same reason: `main/shellPath.ts`
// spawns a shell, and a value import along that path would drag child_process
// wiring into the preload bundle. `unknown` and `blank` are first-class answers
// here - see the type's own comments before rendering any of the four.
export type { ProbeReport, ProbeRequest, ProbeResult, ProbeState }
// The diagnostics record's shape, from `shared/` for the same reason: building
// it reads settings and walks the PATH, and a value import along that path would
// drag `child_process` into the preload bundle. `DiagnosticsResult` is a union
// on purpose - "I could not read my own log" is an answer, not an empty record,
// and the copy control has to render it differently.
export type {
    DiagnosticsAgent,
    DiagnosticsAgents,
    DiagnosticsError,
    DiagnosticsRecord,
    DiagnosticsReport,
    DiagnosticsResult
}

// Each terminal pane registers its own pty:data/pty:exit listener; raise the
// cap so many open terminals don't trip Node's MaxListenersExceededWarning.
ipcRenderer.setMaxListeners(200)

export interface Project {
    id: string
    name: string
    path: string
    addedAt: number
    group?: string
    emoji?: string
    color?: string
}
export interface ProjectStore {
    projects: Project[]
    activeId: string | null
    /**
     * True when `projects.json` exists but could not be read.
     *
     * Main latches this (`main/projects.ts`) and refuses to save over a store
     * it could not read, so every mutator becomes a silent no-op for the
     * session. It was absent from this interface, which is why no renderer code
     * read it: the flag arrived over IPC and the type said it did not exist.
     * Without it an unreadable store is indistinguishable from a fresh install
     * - the user is shown "you have no projects" and every add silently fails.
     */
    unreadable?: boolean
}
export interface DirEntry {
    name: string
    path: string
    isDir: boolean
}
export interface SearchHit {
    projectId: string
    projectName: string
    /** Path relative to the project root, forward-slashed. */
    file: string
    /** Absolute path, for opening in the editor. */
    absPath: string
    line: number
    /** The matching line (clamped). */
    text: string
}
export interface DockerContainer {
    name: string
    status: string
    ports: string
}
export interface ListenPort {
    port: number
    pid: number
}
export interface SystemInfo {
    dockerAvailable: boolean
    docker: DockerContainer[]
    ports: ListenPort[]
}
export interface UsageBucket {
    label: string
    input: number
    output: number
    cacheRead: number
    cacheCreate: number
    tokens: number
    /** Estimated USD. */
    cost: number
}
export interface UsageSummary {
    sinceDays: number
    total: UsageBucket
    byModel: UsageBucket[]
    byProject: UsageBucket[]
    byDay: UsageBucket[]
}
export interface PtyCreateOpts {
    id: string
    cwd?: string
    initialCommand?: string
    shell?: { file: string; args: string[] }
    cols?: number
    rows?: number
    /** Non-secret env to inject (e.g. the model var). */
    env?: Record<string, string>
    /** Agent this terminal runs; main injects that agent's stored API key. */
    agentId?: string
    /** Env var name to inject the decrypted API key under (e.g. ANTHROPIC_API_KEY). */
    keyEnv?: string
    /** Project this terminal belongs to; main injects that project's env vars. */
    projectId?: string
}
export interface ProjectEnvPair {
    key: string
    value: string
    enabled: boolean
}
export interface RemoteSession {
    termId: string
    projectId: string
    projectName: string
    projectPath: string
    tabName: string
    badge: string
    isAgent: boolean
    status: "working" | "idle" | "attention" | "waiting"
}
export interface ServerStatus {
    running: boolean
    /**
     * The interface actually bound — a Tailscale address, or "0.0.0.0" meaning
     * every interface including the LAN. Distinct from the lists below, which are
     * merely *available*: the bind is decided once at start, so these diverge if
     * Tailscale comes up later.
     */
    boundHost: string | null
    tailscale: string[]
    lan: string[]
}
export interface UpdateStatus {
    state: "checking" | "available" | "current" | "downloading" | "ready" | "error"
    version?: string
    percent?: number
    error?: string
}
export interface GitStatus {
    isRepo: boolean
    branch: string
    /** Uncommitted entries, or **null when the count could not be read**. Unknown is not zero. */
    changes: number | null
    /** Tracking branch (e.g. "origin/main"), empty when the branch has no upstream. */
    upstream: string
    /** Commits the local branch is ahead / behind its upstream (0 when unknown). */
    ahead: number
    behind: number
}
/** Outcome of a fast-forward pull. */
export interface PullResult {
    ok: boolean
    summary?: string
    error?: string
}
export interface GitIdentity {
    name: string
    email: string
    sshCommand: string
}
/** Result of a pipeline command gate. `exitCode: -1` = never launched, or timed out. */
export interface CheckResult {
    exitCode: number
    output: string
    timedOut: boolean
    error?: string
    ms: number
}
export interface McpServer {
    name: string
    command: string
    args: string[]
    env: Record<string, string>
    /** Set for HTTP-transport servers (DevDeck's own); empty for stdio. */
    url?: string
    headers?: Record<string, string>
}
export type ExtendScope = "global" | "project"
export type ItemKind = "skill" | "agent"
export interface CatalogEntry {
    id: string
    name: string
    description: string
    repo: string
    ref?: string
    kinds: ItemKind[]
    vetted: true
}
export interface DiscoveredItem {
    kind: ItemKind
    name: string
    description: string
    sourcePath: string
    files: string[]
    content: string
    extraFiles: { path: string; text: string | null }[]
}
export interface InstalledItem {
    kind: ItemKind
    name: string
    scope: ExtendScope
    path: string
}

export interface PipelineTrigger {
    id: string
    enabled: boolean
    pipelineId: string
    projectPath: string
    glob: string
    debounceMs: number
}

export type WorkProvider = "jira" | "azure"
export interface WorkItem {
    provider: WorkProvider
    key: string
    title: string
    type: string
    status: string
    url: string
    description: string
}
export interface WorkConfigPublic {
    jira: { enabled: boolean; baseUrl: string; email: string; jql: string; insecureTLS: boolean; hasToken: boolean }
    azure: { enabled: boolean; orgUrl: string; project: string; wiql: string; insecureTLS: boolean; hasToken: boolean }
    proxy: string
    effectiveProxy: string
}
export interface WorkConfigInput {
    jira: { enabled: boolean; baseUrl: string; email: string; jql: string; insecureTLS: boolean; token?: string }
    azure: { enabled: boolean; orgUrl: string; project: string; wiql: string; insecureTLS: boolean; pat?: string }
    proxy: string
}
export interface WorkFetchResult {
    items: WorkItem[]
    errors: { provider: WorkProvider; message: string }[]
}

export interface Worktree {
    path: string
    branch: string
    head: string
    main: boolean
}

export interface RemoteInfo {
    host: "azure" | "github" | "other"
    branch: string
    orgUrl?: string
    org?: string
    project?: string
    repo?: string
    owner?: string
    webCreateUrl?: string
}
export interface WorktreeAddResult {
    ok: boolean
    path?: string
    branch?: string
    error?: string
}
export interface ChangeFile {
    path: string
    code: string
    staged: boolean
    untracked: boolean
    label: string
}

const api = {
    pty: {
        create: (opts: PtyCreateOpts): void => ipcRenderer.send("pty:create", opts),
        input: (id: string, data: string): void => ipcRenderer.send("pty:input", { id, data }),
        resize: (id: string, cols: number, rows: number): void =>
            ipcRenderer.send("pty:resize", { id, cols, rows }),
        kill: (id: string): void => ipcRenderer.send("pty:kill", { id }),
        buffer: (id: string): Promise<{ buffer: string; exitCode: number | undefined }> =>
            ipcRenderer.invoke("pty:buffer", id),
        onData: (
            cb: (p: {
                id: string
                data: string
                /**
                 * True only for the buffer main RESENDS when a pane attaches to
                 * a session that already had output - a transcript, not news.
                 *
                 * Typed here rather than left to a cast in the renderer because
                 * `global.d.ts` binds `window.api` to this object, so the
                 * typecheck is what finds a consumer of the stream that has not
                 * been told the difference. Undefined on a live chunk, and on
                 * anything sent by a main older than this field, so the safe
                 * reading of a missing flag is "live".
                 */
                replay?: boolean
            }) => void
        ): (() => void) => {
            const handler = (
                _e: unknown,
                p: { id: string; data: string; replay?: boolean }
            ): void => cb(p)
            ipcRenderer.on("pty:data", handler)
            return () => ipcRenderer.removeListener("pty:data", handler)
        },
        onExit: (
            cb: (p: {
                id: string
                exitCode: number
                stale?: boolean
                /** False only when no process was ever spawned at this id. */
                started?: boolean
            }) => void
        ): (() => void) => {
            const handler = (
                _e: unknown,
                p: { id: string; exitCode: number; stale?: boolean; started?: boolean }
            ): void => cb(p)
            ipcRenderer.on("pty:exit", handler)
            return () => ipcRenderer.removeListener("pty:exit", handler)
        }
    },
    /**
     * Permission prompts, as classified by MAIN — the only classifier there is.
     * The renderer used to run its own detector over its own copy of the tail;
     * two answers to one question is the defect class remedy 13 was about.
     */
    decisions: {
        /** One session's current decision, or null. */
        forTerm: (termId: string): Promise<DecisionView | null> =>
            ipcRenderer.invoke("decisions:for", termId),
        /**
         * Main's whole current answer, pushed whenever it re-derives them.
         * Carries the snapshot rather than a bare ping: a ping would cost one
         * `invoke` per session per tick, and those replies can land out of order.
         */
        onChanged: (fn: (snapshot: DecisionSnapshot) => void): (() => void) => {
            const handler = (_e: unknown, snapshot: DecisionSnapshot): void => fn(snapshot)
            ipcRenderer.on("decisions:changed", handler)
            return () => ipcRenderer.removeListener("decisions:changed", handler)
        }
    },
    projects: {
        list: (): Promise<ProjectStore> => ipcRenderer.invoke("projects:list"),
        add: (): Promise<ProjectStore> => ipcRenderer.invoke("projects:add"),
        remove: (id: string): Promise<ProjectStore> => ipcRenderer.invoke("projects:remove", id),
        setActive: (id: string): Promise<ProjectStore> =>
            ipcRenderer.invoke("projects:setActive", id),
        setGroup: (id: string, group: string): Promise<ProjectStore> =>
            ipcRenderer.invoke("projects:setGroup", { id, group }),
        setMeta: (id: string, meta: { emoji?: string; color?: string }): Promise<ProjectStore> =>
            ipcRenderer.invoke("projects:setMeta", { id, meta }),
        addPath: (path: string): Promise<ProjectStore> =>
            ipcRenderer.invoke("projects:addPath", path),
        /**
         * The absolute path behind a dropped `File`.
         *
         * The drop handler read `File.path` for two years. Electron removed
         * that property in 32 and this app is on 43, so the read was
         * `undefined`, the guard below it was always false, and every folder
         * drop silently did nothing while the dashed outline animated - a
         * promised feature failing quietly, which is worse than not having one.
         * `webUtils.getPathForFile` is the documented replacement and is
         * callable only from the preload, which is why this crosses the bridge
         * as a function rather than the renderer reading a property.
         *
         * Returns "" rather than throwing for anything that is not a real
         * filesystem File (a Blob-backed one, a synthetic drop): the caller has
         * to distinguish "no path" from a path anyway, and an exception here
         * would take the whole drop handler down with it.
         */
        /**
         * Every known project's folder state, keyed by project id.
         *
         * A project MISSING from the returned map has not been probed, which is
         * not the same as `ok` - render nothing for it. Takes no argument by
         * design; main probes its own store.
         */
        probe: (): Promise<Record<string, FolderState>> => ipcRenderer.invoke("projects:probe"),
        /** Re-point a project at a folder the user picks, keeping its id. */
        relocate: (id: string): Promise<RelocateResult> =>
            ipcRenderer.invoke("projects:relocate", id),
        pathForFile: (file: File): string => {
            try {
                return webUtils.getPathForFile(file)
            } catch {
                return ""
            }
        }
    },
    /**
     * The application menu, which lives in main and acts in the renderer.
     *
     * Two directions, one purpose: the renderer pushes its MRU order so File ->
     * Open Recent can be in recency order at all (main only knows when a
     * project was added), and main pushes back the one command a menu click
     * cannot perform for itself. Without this channel Open Recent could not be
     * built, which is why the first version of the menu shipped without it.
     */
    menu: {
        setRecent: (list: { id: string; name: string }[]): void =>
            ipcRenderer.send("menu:setRecent", list),
        onCommand: (cb: (cmd: MenuCommand) => void): (() => void) => {
            const handler = (_e: unknown, cmd: MenuCommand): void => cb(cmd)
            ipcRenderer.on("menu:command", handler)
            return () => ipcRenderer.removeListener("menu:command", handler)
        }
    },
    workspace: {
        load: (): Promise<Loaded<unknown>> => ipcRenderer.invoke("workspace:load"),
        save: (data: unknown): void => ipcRenderer.send("workspace:save", data)
    },
    settings: {
        load: (): Promise<unknown> => ipcRenderer.invoke("settings:load"),
        save: (data: unknown): void => ipcRenderer.send("settings:save", data)
    },
    server: {
        start: (cfg: ServerConfig): Promise<ServerStartResult> => ipcRenderer.invoke("server:start", cfg),
        stop: (): Promise<boolean> => ipcRenderer.invoke("server:stop"),
        status: (): Promise<ServerStatus> => ipcRenderer.invoke("server:status")
    },
    /** Paired-device management for the remote server (see main/devices.ts). */
    devices: {
        list: (ttlDays: number): Promise<PublicRemoteDevice[]> =>
            ipcRenderer.invoke("devices:list", ttlDays),
        rename: (id: string, name: string): Promise<void> =>
            ipcRenderer.invoke("devices:rename", { id, name }),
        /** Throws if the write fails — a revoked device must never look successfully gone when it isn't. */
        revoke: (id: string): Promise<void> => ipcRenderer.invoke("devices:revoke", id),
        /** Throws if the write fails — the panel must never display (or QR-encode) a token that isn't actually the one live in the store. */
        pairingToken: (): Promise<string> => ipcRenderer.invoke("devices:pairingToken"),
        /** Throws if the write fails — regenerating is meant to invalidate a leaked token, and a swallowed failure would report success while the leaked one stayed live. */
        regeneratePairingToken: (): Promise<string> =>
            ipcRenderer.invoke("devices:regeneratePairingToken"),
        /**
         * One-way: adopts a legacy plaintext remote.token as the pairing token.
         * Resolves `true` only when this call actually seeded it (or it was
         * already migrated to this exact value) — `false` (a *different*
         * pairing token already exists, or an empty token was passed) is not
         * an error, but it means the caller must NOT erase the legacy value
         * from settings.json, since nothing was actually migrated.
         */
        migrateLegacyToken: (token: string): Promise<boolean> =>
            ipcRenderer.invoke("devices:migrateLegacyToken", token)
    },
    /**
     * DevDeck's own MCP server — exposes DevDeck's panels as tools so an agent CLI
     * can pull context (query the project DB, list tables) instead of us pasting it
     * in. Loopback-only, bearer-token guarded, read-only, off by default.
     */
    mcpsrv: {
        start: (cfg: {
            port: number
            token: string
        }): Promise<{ ok: boolean; error?: string; running: boolean; port: number | null }> =>
            ipcRenderer.invoke("mcpsrv:start", cfg),
        stop: (): Promise<{ running: boolean; port: number | null }> =>
            ipcRenderer.invoke("mcpsrv:stop"),
        status: (): Promise<{ running: boolean; port: number | null }> =>
            ipcRenderer.invoke("mcpsrv:status"),
        /** Fresh random bearer token (caller persists it in settings). */
        newToken: (): Promise<string> => ipcRenderer.invoke("mcpsrv:token"),
        /**
         * Write DevDeck's entry into this project's .mcp.json. The token is NOT
         * written — the header references `${DEVDECK_MCP_TOKEN}`, which DevDeck
         * injects into agent terminals, so the file stays safe to commit.
         */
        register: (cwd: string, port: number): Promise<McpServer[]> =>
            ipcRenderer.invoke("mcpsrv:register", { cwd, port }),
        unregister: (cwd: string): Promise<McpServer[]> =>
            ipcRenderer.invoke("mcpsrv:unregister", cwd)
    },
    /** Ground-truth checks for pipeline command gates: run it, read the exit code. */
    checks: {
        run: (cwd: string, command: string, timeoutMs?: number): Promise<CheckResult> =>
            ipcRenderer.invoke("checks:run", { cwd, command, timeoutMs })
    },
    netproxy: {
        /** Apply the corporate-proxy config to the main env (new children inherit it). */
        apply: (cfg: { enabled: boolean; url: string; noProxy: string; caPath: string }): void =>
            ipcRenderer.send("netproxy:apply", cfg)
    },
    clipboard: {
        readText: (): Promise<string> => ipcRenderer.invoke("clipboard:read"),
        /**
         * Copy text, and say whether it landed.
         *
         * `true` means main wrote the text and read the same text back out. It
         * used to be fire-and-forget, which made every "Copied" message in the
         * app a claim with nothing behind it - and this bridge exists precisely
         * BECAUSE `navigator.clipboard.writeText` is blocked by the renderer's
         * deny-all permission handler, which is how four of those messages came
         * to be lying in 0.10.0. A caller that shows a confirmation must await
         * this; a caller that does not care may still ignore it.
         */
        writeText: (text: string): Promise<boolean> =>
            ipcRenderer.invoke("clipboard:write", text)
    },
    mobile: {
        syncSessions: (sessions: RemoteSession[]): void =>
            ipcRenderer.send("mobile:sessions", sessions),
        onNew: (cb: (p: { projectId: string }) => void): (() => void) => {
            const handler = (_e: unknown, p: { projectId: string }): void => cb(p)
            ipcRenderer.on("mobile:new", handler)
            return () => ipcRenderer.removeListener("mobile:new", handler)
        }
    },
    app: {
        version: (): Promise<string> => ipcRenderer.invoke("app:version")
    },
    projectEnv: {
        get: (projectId: string): Promise<ProjectEnvPair[]> =>
            ipcRenderer.invoke("projectEnv:get", projectId),
        set: (projectId: string, pairs: ProjectEnvPair[]): Promise<void> =>
            ipcRenderer.invoke("projectEnv:set", { projectId, pairs })
    },
    update: {
        check: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("update:check"),
        download: (): Promise<{ ok: boolean; error?: string }> =>
            ipcRenderer.invoke("update:download"),
        install: (): Promise<void> => ipcRenderer.invoke("update:install"),
        onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
            const h = (_e: unknown, s: UpdateStatus): void => cb(s)
            ipcRenderer.on("update:status", h)
            return () => ipcRenderer.removeListener("update:status", h)
        }
    },
    ai: {
        setKey: (agentId: string, key: string): Promise<void> =>
            ipcRenderer.invoke("ai:setKey", { agentId, key }),
        status: (): Promise<Record<string, boolean>> => ipcRenderer.invoke("ai:status"),
        clearKey: (agentId: string): Promise<void> => ipcRenderer.invoke("ai:clearKey", agentId)
    },
    search: {
        code: (query: string): Promise<SearchHit[]> => ipcRenderer.invoke("search:code", { query })
    },
    system: {
        info: (): Promise<SystemInfo> => ipcRenderer.invoke("system:info")
    },
    probe: {
        /**
         * Which agent CLIs are on the PATH a pane will actually have.
         *
         * Pass every preset; non-`agent` ones are skipped and simply have no
         * entry in `results` (a shell line has no binary to look up). The
         * login-shell PATH is read once per app process, so calling this on
         * mount is cheap - `refresh: true` is the design's `Re-check` control
         * and is the only thing that re-spawns a shell.
         */
        commands: (requests: ProbeRequest[], refresh?: boolean): Promise<ProbeReport> =>
            ipcRenderer.invoke("probe:commands", { requests, refresh })
    },
    /**
     * The diagnostics record - what a stranger pastes into a human's inbox.
     *
     * Nothing here transmits anything: `record()` builds a blob in main and
     * hands it back, and the clipboard is the only place it goes. There is no
     * endpoint, no upload and no issue link anywhere in this path.
     */
    diagnostics: {
        /**
         * Report a caught error. Fire-and-forget, like `ledger.append`, because
         * this is called from inside an error boundary that has already failed
         * once and must not be made to await anything.
         *
         * **This is not a file write.** Three bounded strings go over the wire;
         * main decides the origin, the timestamp, the caps, the redaction, the
         * dedupe key, the file, the line format and how many reports per second
         * it will accept. There is no path or content parameter to steer, and
         * the channel is rate-limited - a renderer in a loop cannot make main
         * write unboundedly, it just fills a capped, deduped log.
         */
        report: (report: DiagnosticsReport): void =>
            ipcRenderer.send("diagnostics:report", report),
        /**
         * The whole record, plus the exact text to put on the clipboard.
         *
         * `{ ok: false, reason: "unreadable" }` is a real answer and is NOT an
         * empty record: it means the log exists and DevDeck could not read it,
         * which is the state where the copy control must refuse rather than
         * offer to copy nothing and succeed. An `ok` record with no errors is a
         * healthy app and copies fine.
         *
         * `record.incomplete` is a list of sentences about what is partial or
         * missing. It is required to be rendered - a record that dropped
         * something and looks whole is the failure this feature exists to
         * remove. An empty array means nothing was left out.
         */
        record: (): Promise<DiagnosticsResult> => ipcRenderer.invoke("diagnostics:record")
    },
    usage: {
        tokens: (sinceDays?: number): Promise<UsageSummary> =>
            ipcRenderer.invoke("usage:tokens", sinceDays),
        /** What a project's agent work cost between two epoch-ms instants. */
        window: (projectPath: string, from: number, to: number): Promise<UsageBucket> =>
            ipcRenderer.invoke("usage:window", { projectPath, from, to })
    },
    ledger: {
        /**
         * Record one finished run. Deliberately fire-and-forget: this is called
         * from inside a card/pipeline/session's own completion path, where an
         * awaited (and therefore rejectable) call would put the ledger between
         * the user and their work.
         */
        append: (rec: RunRecord): void => ipcRenderer.send("ledger:append", rec),
        /** Stored runs, newest first. */
        read: (limit?: number): Promise<RunRecord[]> => ipcRenderer.invoke("ledger:read", limit)
    },
    fs: {
        readDir: (dir: string): Promise<DirEntry[]> => ipcRenderer.invoke("fs:readDir", dir),
        allFiles: (root: string): Promise<string[]> => ipcRenderer.invoke("fs:allFiles", root),
        /** Content plus the mtime it was read at - pass that back to `write`. */
        read: (path: string): Promise<{ content: string; mtimeMs: number }> =>
            ipcRenderer.invoke("fs:read", path),
        readDataUrl: (path: string): Promise<string> => ipcRenderer.invoke("fs:readDataUrl", path),
        /**
         * Write a file, refusing if it changed since `baseMtimeMs` (from `read`).
         * Omit or pass 0 to create a new file, or to force an overwrite the user
         * has explicitly confirmed.
         */
        write: (path: string, content: string, baseMtimeMs = 0): Promise<void> =>
            ipcRenderer.invoke("fs:write", { path, content, baseMtimeMs }),
        /** Save an image (data URL) into the project's uploads dir; returns its path. */
        saveUpload: (projectPath: string, name: string, dataUrl: string): Promise<string> =>
            ipcRenderer.invoke("fs:saveUpload", { projectPath, name, dataUrl }),
        /** Open-file dialog; returns the chosen path, or "" if cancelled. */
        pickFile: (filters?: { name: string; extensions: string[] }[]): Promise<string> =>
            ipcRenderer.invoke("dialog:pickFile", filters),
        /** Save-As dialog + write; returns the chosen path, or "" if cancelled. */
        saveFile: (
            defaultName: string,
            content: string,
            filters?: { name: string; extensions: string[] }[]
        ): Promise<string> =>
            ipcRenderer.invoke("dialog:saveFile", { defaultName, content, filters })
    },
    git: {
        status: (cwd: string): Promise<GitStatus> => ipcRenderer.invoke("git:status", cwd),
        getIdentity: (cwd: string): Promise<GitIdentity> =>
            ipcRenderer.invoke("git:getIdentity", cwd),
        setIdentity: (cwd: string, identity: GitIdentity): Promise<GitIdentity> =>
            ipcRenderer.invoke("git:setIdentity", { cwd, identity }),
        /** Fast-forward the current branch from its upstream (`git pull --ff-only`). */
        pull: (cwd: string): Promise<PullResult> => ipcRenderer.invoke("git:pull", cwd),
        // Worktrees
        worktrees: (repoPath: string): Promise<Worktree[]> =>
            ipcRenderer.invoke("git:worktrees", repoPath),
        worktreeAdd: (repoPath: string, branch: string, base?: string): Promise<WorktreeAddResult> =>
            ipcRenderer.invoke("git:worktreeAdd", { repoPath, branch, base }),
        worktreeRemove: (repoPath: string, path: string, deleteBranch?: string): Promise<{ ok: boolean; error?: string }> =>
            ipcRenderer.invoke("git:worktreeRemove", { repoPath, path, deleteBranch }),
        // Change review
        changes: (cwd: string): Promise<ChangeFile[]> => ipcRenderer.invoke("git:changes", cwd),
        fileDiff: (cwd: string, path: string, staged: boolean, untracked: boolean): Promise<string> =>
            ipcRenderer.invoke("git:fileDiff", { cwd, path, staged, untracked }),
        stage: (cwd: string, path: string): Promise<boolean> =>
            ipcRenderer.invoke("git:stage", { cwd, path }),
        unstage: (cwd: string, path: string): Promise<boolean> =>
            ipcRenderer.invoke("git:unstage", { cwd, path }),
        discard: (cwd: string, path: string, untracked: boolean): Promise<boolean> =>
            ipcRenderer.invoke("git:discard", { cwd, path, untracked }),
        /** `stagedOnly` commits just the index, leaving unstaged files out. */
        commit: (
            cwd: string,
            message: string,
            stagedOnly?: boolean
        ): Promise<{ ok: boolean; error?: string }> =>
            ipcRenderer.invoke("git:commit", { cwd, message, stagedOnly }),
        fullDiff: (cwd: string): Promise<string> => ipcRenderer.invoke("git:fullDiff", cwd),
        // Personal access tokens (encrypted at rest; plaintext never returns here)
        setPat: (accountId: string, pat: string): Promise<void> =>
            ipcRenderer.invoke("git:setPat", { accountId, pat }),
        patStatus: (): Promise<Record<string, boolean>> => ipcRenderer.invoke("git:patStatus"),
        /** Resolves false when the token could not actually be removed from disk. */
        clearPat: (accountId: string): Promise<boolean> =>
            ipcRenderer.invoke("git:clearPat", accountId),
        cacheCredential: (
            accountId: string,
            host: string,
            username: string
        ): Promise<{ ok: boolean; error?: string }> =>
            ipcRenderer.invoke("git:cacheCredential", { accountId, host, username }),
        verifyPat: (accountId: string): Promise<{ ok: boolean; login?: string; error?: string }> =>
            ipcRenderer.invoke("git:verifyPat", accountId)
    },
    pr: {
        remoteInfo: (cwd: string, target: string): Promise<RemoteInfo> =>
            ipcRenderer.invoke("pr:remoteInfo", { cwd, target }),
        push: (cwd: string, branch: string): Promise<{ ok: boolean; error?: string }> =>
            ipcRenderer.invoke("pr:push", { cwd, branch }),
        createAzure: (opts: {
            orgUrl: string
            project: string
            repo: string
            source: string
            target: string
            title: string
            description: string
        }): Promise<{ ok: boolean; url?: string; error?: string }> =>
            ipcRenderer.invoke("pr:createAzure", opts)
    },
    browser: {
        saveShot: (projectPath: string, dataUrl: string): Promise<string> =>
            ipcRenderer.invoke("browser:saveShot", { projectPath, dataUrl }),
        netAttach: (id: number): Promise<void> => ipcRenderer.invoke("browser:netAttach", id),
        netGet: (id: number): Promise<{ method: string; url: string; status: number; type: string; failed: boolean }[]> =>
            ipcRenderer.invoke("browser:netGet", id),
        netDetach: (id: number): Promise<void> => ipcRenderer.invoke("browser:netDetach", id)
    },
    mcp: {
        list: (projectPath: string): Promise<McpServer[]> => ipcRenderer.invoke("mcp:list", projectPath),
        save: (projectPath: string, servers: McpServer[]): Promise<void> =>
            ipcRenderer.invoke("mcp:save", { projectPath, servers })
    },
    extend: {
        catalog: (): Promise<CatalogEntry[]> => ipcRenderer.invoke("extend:catalog"),
        preview: (repo: string, ref?: string): Promise<DiscoveredItem[]> =>
            ipcRenderer.invoke("extend:preview", { repo, ref }),
        install: (
            repo: string,
            ref: string | undefined,
            item: { kind: ItemKind; name: string; sourcePath: string },
            scope: ExtendScope,
            projectPath: string
        ): Promise<InstalledItem> => ipcRenderer.invoke("extend:install", { repo, ref, item, scope, projectPath }),
        list: (projectPath: string): Promise<{ global: InstalledItem[]; project: InstalledItem[] }> =>
            ipcRenderer.invoke("extend:list", projectPath),
        remove: (item: InstalledItem, projectPath: string): Promise<void> =>
            ipcRenderer.invoke("extend:remove", { item, projectPath })
    },
    shell: {
        open: (url: string): Promise<void> => ipcRenderer.invoke("shell:open", url)
    },
    work: {
        getConfig: (): Promise<WorkConfigPublic> => ipcRenderer.invoke("work:getConfig"),
        saveConfig: (input: WorkConfigInput): Promise<WorkConfigPublic> =>
            ipcRenderer.invoke("work:saveConfig", input),
        test: (provider: WorkProvider): Promise<{ ok: boolean; count?: number; error?: string }> =>
            ipcRenderer.invoke("work:test", provider),
        items: (): Promise<WorkFetchResult> => ipcRenderer.invoke("work:items")
    },
    triggers: {
        apply: (list: PipelineTrigger[]): Promise<void> => ipcRenderer.invoke("triggers:apply", list),
        onFired: (cb: (p: { triggerId: string }) => void): (() => void) => {
            const h = (_e: unknown, p: { triggerId: string }): void => cb(p)
            ipcRenderer.on("trigger:fired", h)
            return () => ipcRenderer.removeListener("trigger:fired", h)
        }
    },
    env: {
        check: (names: string[]): Promise<Record<string, boolean>> =>
            ipcRenderer.invoke("env:check", names)
    },
    notify: {
        /** Can main deliver a desktop notification here, and did the last one fail? */
        state: (): Promise<NotifyState> => ipcRenderer.invoke("notify:state"),
        /**
         * Raise one attention notification and get the state back afterwards.
         *
         * `body` is composed by the renderer on purpose: it is the same
         * sentence the in-app inbox entry carries, so the toast is a second
         * CHANNEL for one fact rather than a second statement of it.
         */
        attention: (p: { termId: string; body: string }): Promise<NotifyState> =>
            ipcRenderer.invoke("notify:attention", p),
        /** A click on a toast, forwarded by main after it has raised the window. */
        onActivate: (cb: (termId: string) => void): (() => void) => {
            const h = (_e: unknown, p: { termId: string }): void => cb(p.termId)
            ipcRenderer.on("notify:activate", h)
            return () => ipcRenderer.removeListener("notify:activate", h)
        }
    }
}

contextBridge.exposeInMainWorld("api", api)

export type DevDeckApi = typeof api
