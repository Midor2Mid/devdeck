import { contextBridge, ipcRenderer } from "electron"

// Each terminal pane registers its own pty:data/pty:exit listener; raise the
// cap so many open terminals don't trip Node's MaxListenersExceededWarning.
ipcRenderer.setMaxListeners(200)

export interface Project {
    id: string
    name: string
    path: string
    addedAt: number
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
            ipcRenderer.invoke("projects:setActive", id)
    },
    workspace: {
        load: (): Promise<unknown> => ipcRenderer.invoke("workspace:load"),
        save: (data: unknown): void => ipcRenderer.send("workspace:save", data)
    },
    http: {
        send: (req: HttpRequest): Promise<HttpResponse> => ipcRenderer.invoke("http:send", req)
    },
    fs: {
        readDir: (dir: string): Promise<DirEntry[]> => ipcRenderer.invoke("fs:readDir", dir),
        read: (path: string): Promise<string> => ipcRenderer.invoke("fs:read", path),
        write: (path: string, content: string): Promise<void> =>
            ipcRenderer.invoke("fs:write", { path, content })
    }
}

contextBridge.exposeInMainWorld("api", api)

export type DevDeckApi = typeof api
