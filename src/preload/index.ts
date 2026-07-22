import { contextBridge, ipcRenderer } from "electron"

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
export interface Diag {
    file: string
    line: number
    col: number
    severity: "error" | "warning"
    code: string
    message: string
}
export interface DotnetResult {
    /** Did the build/test succeed (no errors)? */
    ok: boolean
    /** Did we actually run dotnet (false = no project / no SDK)? */
    ran: boolean
    summary: string
    diagnostics: (Diag & { absPath: string })[]
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
export interface HttpRequest {
    method: string
    url: string
    headers?: Record<string, string>
    body?: string
}
export interface HttpResponse {
    ok: boolean
    status?: number
    statusText?: string
    headers?: Record<string, string>
    body?: string
    timeMs: number
    error?: string
}

export type DbKind = "postgres" | "mysql" | "sqlite" | "sqlserver"
export interface ConnProfile {
    id: string
    projectId: string
    name: string
    kind: DbKind
    host: string
    port: number
    database: string
    user: string
    ssl?: boolean
}
export interface ConnInput extends Omit<ConnProfile, "id"> {
    id?: string
    password?: string
}
export interface QueryResult {
    ok: boolean
    columns?: string[]
    rows?: Record<string, unknown>[]
    rowCount?: number
    command?: string
    timeMs: number
    error?: string
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
    changes: number
}
export interface GitIdentity {
    name: string
    email: string
    sshCommand: string
}
export interface McpServer {
    name: string
    command: string
    args: string[]
    env: Record<string, string>
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

export interface RecEvent {
    dt: number
    data: string
}
export interface Recording {
    label: string
    createdAt: number
    events: RecEvent[]
}
export interface RecordingMeta {
    name: string
    path: string
    label: string
    createdAt: number
    events: number
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

export interface WorklogCommit {
    sha: string
    subject: string
    when: string
}
export interface WorklogRepo {
    name: string
    path: string
    branch: string
    changes: number
    commits: WorklogCommit[]
}

export interface ReleaseStage {
    id: string
    name: string
    ref: string
}
export interface ReleaseConfig {
    stages: ReleaseStage[]
    checklist: string[]
}
export interface ReleaseCommit {
    sha: string
    subject: string
    author: string
    when: string
}
export interface StageStatus {
    id: string
    name: string
    ref: string
    found: boolean
    commit: ReleaseCommit | null
    aheadOfNext: number
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
export interface NetCapture {
    id: string
    ts: number
    projectId: string | null
    method: string
    url: string
    host: string
    path: string
    scheme: "http" | "https"
    status: number
    statusText: string
    reqHeaders: Record<string, string>
    resHeaders: Record<string, string>
    reqBody: string
    resBody: string
    reqBodyTruncated: boolean
    resBodyTruncated: boolean
    bytesOut: number
    bytesIn: number
    timeMs: number
    tunneled: boolean
    error?: string
}
export interface ProxyStatus {
    running: boolean
    port: number
}

const api = {
    pty: {
        create: (opts: PtyCreateOpts): void => ipcRenderer.send("pty:create", opts),
        input: (id: string, data: string): void => ipcRenderer.send("pty:input", { id, data }),
        resize: (id: string, cols: number, rows: number): void =>
            ipcRenderer.send("pty:resize", { id, cols, rows }),
        kill: (id: string): void => ipcRenderer.send("pty:kill", { id }),
        onData: (cb: (p: { id: string; data: string }) => void): (() => void) => {
            const handler = (_e: unknown, p: { id: string; data: string }): void => cb(p)
            ipcRenderer.on("pty:data", handler)
            return () => ipcRenderer.removeListener("pty:data", handler)
        },
        onExit: (cb: (p: { id: string; exitCode: number }) => void): (() => void) => {
            const handler = (_e: unknown, p: { id: string; exitCode: number }): void => cb(p)
            ipcRenderer.on("pty:exit", handler)
            return () => ipcRenderer.removeListener("pty:exit", handler)
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
            ipcRenderer.invoke("projects:addPath", path)
    },
    workspace: {
        load: (): Promise<unknown> => ipcRenderer.invoke("workspace:load"),
        save: (data: unknown): void => ipcRenderer.send("workspace:save", data)
    },
    settings: {
        load: (): Promise<unknown> => ipcRenderer.invoke("settings:load"),
        save: (data: unknown): void => ipcRenderer.send("settings:save", data)
    },
    server: {
        start: (cfg: { port: number; token: string; tls?: boolean }): Promise<boolean> =>
            ipcRenderer.invoke("server:start", cfg),
        stop: (): Promise<boolean> => ipcRenderer.invoke("server:stop"),
        status: (): Promise<ServerStatus> => ipcRenderer.invoke("server:status")
    },
    netproxy: {
        /** Apply the corporate-proxy config to the main env (new children inherit it). */
        apply: (cfg: { enabled: boolean; url: string; noProxy: string; caPath: string }): void =>
            ipcRenderer.send("netproxy:apply", cfg)
    },
    clipboard: {
        readText: (): Promise<string> => ipcRenderer.invoke("clipboard:read"),
        writeText: (text: string): void => ipcRenderer.send("clipboard:write", text)
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
    http: {
        send: (req: HttpRequest): Promise<HttpResponse> => ipcRenderer.invoke("http:send", req)
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
    db: {
        list: (projectId: string): Promise<ConnProfile[]> =>
            ipcRenderer.invoke("db:list", projectId),
        save: (input: ConnInput): Promise<ConnProfile[]> => ipcRenderer.invoke("db:save", input),
        remove: (id: string): Promise<void> => ipcRenderer.invoke("db:remove", id),
        test: (input: ConnInput): Promise<QueryResult> => ipcRenderer.invoke("db:test", input),
        query: (profileId: string, sql: string): Promise<QueryResult> =>
            ipcRenderer.invoke("db:query", { profileId, sql }),
        tables: (profileId: string): Promise<string[]> =>
            ipcRenderer.invoke("db:tables", profileId),
        disconnect: (profileId: string): void => ipcRenderer.send("db:disconnect", profileId),
        pickFile: (): Promise<string> => ipcRenderer.invoke("db:pickFile")
    },
    search: {
        code: (query: string): Promise<SearchHit[]> => ipcRenderer.invoke("search:code", { query })
    },
    dotnet: {
        run: (root: string, mode: "build" | "test"): Promise<DotnetResult> =>
            ipcRenderer.invoke("dotnet:run", { root, mode })
    },
    system: {
        info: (): Promise<SystemInfo> => ipcRenderer.invoke("system:info")
    },
    usage: {
        tokens: (sinceDays?: number): Promise<UsageSummary> =>
            ipcRenderer.invoke("usage:tokens", sinceDays)
    },
    fs: {
        readDir: (dir: string): Promise<DirEntry[]> => ipcRenderer.invoke("fs:readDir", dir),
        allFiles: (root: string): Promise<string[]> => ipcRenderer.invoke("fs:allFiles", root),
        read: (path: string): Promise<string> => ipcRenderer.invoke("fs:read", path),
        readDataUrl: (path: string): Promise<string> => ipcRenderer.invoke("fs:readDataUrl", path),
        write: (path: string, content: string): Promise<void> =>
            ipcRenderer.invoke("fs:write", { path, content }),
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
        commit: (cwd: string, message: string): Promise<{ ok: boolean; error?: string }> =>
            ipcRenderer.invoke("git:commit", { cwd, message }),
        fullDiff: (cwd: string): Promise<string> => ipcRenderer.invoke("git:fullDiff", cwd),
        // Personal access tokens (encrypted at rest; plaintext never returns here)
        setPat: (accountId: string, pat: string): Promise<void> =>
            ipcRenderer.invoke("git:setPat", { accountId, pat }),
        patStatus: (): Promise<Record<string, boolean>> => ipcRenderer.invoke("git:patStatus"),
        clearPat: (accountId: string): Promise<void> =>
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
    proxy: {
        start: (port: number): Promise<ProxyStatus> => ipcRenderer.invoke("proxy:start", port),
        stop: (): Promise<ProxyStatus> => ipcRenderer.invoke("proxy:stop"),
        status: (): Promise<ProxyStatus> => ipcRenderer.invoke("proxy:status"),
        list: (): Promise<NetCapture[]> => ipcRenderer.invoke("proxy:list"),
        clear: (): Promise<void> => ipcRenderer.invoke("proxy:clear"),
        setProject: (id: string | null): void => ipcRenderer.send("proxy:setProject", id),
        onCapture: (cb: (c: NetCapture) => void): (() => void) => {
            const handler = (_e: unknown, c: NetCapture): void => cb(c)
            ipcRenderer.on("proxy:capture", handler)
            return () => ipcRenderer.removeListener("proxy:capture", handler)
        }
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
        remove: (item: InstalledItem): Promise<void> => ipcRenderer.invoke("extend:remove", item)
    },
    shell: {
        open: (url: string): Promise<void> => ipcRenderer.invoke("shell:open", url)
    },
    worklog: {
        collect: (repos: { name: string; path: string }[], sinceISO: string): Promise<WorklogRepo[]> =>
            ipcRenderer.invoke("worklog:collect", { repos, sinceISO })
    },
    release: {
        config: (repo: string): Promise<ReleaseConfig> => ipcRenderer.invoke("release:config", repo),
        saveConfig: (repo: string, config: ReleaseConfig): Promise<ReleaseConfig> =>
            ipcRenderer.invoke("release:saveConfig", { repo, config }),
        status: (repo: string, stages: ReleaseStage[]): Promise<StageStatus[]> =>
            ipcRenderer.invoke("release:status", { repo, stages }),
        pending: (repo: string, target: string, source: string): Promise<ReleaseCommit[]> =>
            ipcRenderer.invoke("release:pending", { repo, target, source }),
        tag: (repo: string, name: string, ref: string): Promise<{ ok: boolean; error?: string }> =>
            ipcRenderer.invoke("release:tag", { repo, name, ref })
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
    rec: {
        start: (termId: string): Promise<void> => ipcRenderer.invoke("rec:start", termId),
        stop: (termId: string, projectPath: string, label: string): Promise<RecordingMeta | null> =>
            ipcRenderer.invoke("rec:stop", { termId, projectPath, label }),
        active: (termId: string): Promise<boolean> => ipcRenderer.invoke("rec:active", termId),
        list: (projectPath: string): Promise<RecordingMeta[]> => ipcRenderer.invoke("rec:list", projectPath),
        load: (path: string): Promise<Recording> => ipcRenderer.invoke("rec:load", path)
    },
    env: {
        check: (names: string[]): Promise<Record<string, boolean>> =>
            ipcRenderer.invoke("env:check", names)
    }
}

contextBridge.exposeInMainWorld("api", api)

export type DevDeckApi = typeof api
