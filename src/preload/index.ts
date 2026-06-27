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
export interface PtyCreateOpts {
    id: string
    cwd?: string
    initialCommand?: string
    shell?: { file: string; args: string[] }
    cols?: number
    rows?: number
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

export type DbKind = "postgres" | "mysql" | "sqlite"
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
    status: "working" | "idle" | "attention"
}
export interface ServerStatus {
    running: boolean
    tailscale: string[]
    lan: string[]
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
            ipcRenderer.invoke("projects:setGroup", { id, group })
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
        start: (cfg: { port: number; token: string }): Promise<boolean> =>
            ipcRenderer.invoke("server:start", cfg),
        stop: (): Promise<boolean> => ipcRenderer.invoke("server:stop"),
        status: (): Promise<ServerStatus> => ipcRenderer.invoke("server:status")
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
    fs: {
        readDir: (dir: string): Promise<DirEntry[]> => ipcRenderer.invoke("fs:readDir", dir),
        allFiles: (root: string): Promise<string[]> => ipcRenderer.invoke("fs:allFiles", root),
        read: (path: string): Promise<string> => ipcRenderer.invoke("fs:read", path),
        write: (path: string, content: string): Promise<void> =>
            ipcRenderer.invoke("fs:write", { path, content })
    },
    git: {
        status: (cwd: string): Promise<GitStatus> => ipcRenderer.invoke("git:status", cwd),
        getIdentity: (cwd: string): Promise<GitIdentity> =>
            ipcRenderer.invoke("git:getIdentity", cwd),
        setIdentity: (cwd: string, identity: GitIdentity): Promise<GitIdentity> =>
            ipcRenderer.invoke("git:setIdentity", { cwd, identity })
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
    env: {
        check: (names: string[]): Promise<Record<string, boolean>> =>
            ipcRenderer.invoke("env:check", names)
    }
}

contextBridge.exposeInMainWorld("api", api)

export type DevDeckApi = typeof api
