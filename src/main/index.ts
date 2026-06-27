import { app, BrowserWindow, ipcMain, dialog } from "electron"
import { join } from "path"
import * as ptyMgr from "./pty"
import * as projects from "./projects"
import { httpSend } from "./http"
import * as files from "./files"
import { loadWorkspace, saveWorkspace } from "./workspace"
import { loadSettings, saveSettings } from "./settings"
import * as db from "./db"
import * as server from "./server"
import type { RemoteSession, ServerDeps } from "./server"
import { gitStatus } from "./git"

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: "#181825",
        title: "DevDeck",
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webviewTag: true
        }
    })

    // electron-vite injects ELECTRON_RENDERER_URL in dev (vite dev server).
    if (process.env["ELECTRON_RENDERER_URL"]) {
        mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
    } else {
        mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
    }
}

function registerIpc(): void {
    // --- Terminals (fire-and-forget streaming) ---
    // Broadcast all pty output to the window; the WS server subscribes separately.
    ptyMgr.ptyEvents.on("data", (d) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("pty:data", d)
    })
    ptyMgr.ptyEvents.on("exit", (d) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("pty:exit", d)
    })
    ipcMain.on("pty:create", (e, opts) => {
        ptyMgr.createPty(opts)
        // Replay the buffer to the requesting window (per-client re-attach).
        const buf = ptyMgr.getBuffer(opts.id)
        if (buf && !e.sender.isDestroyed()) e.sender.send("pty:data", { id: opts.id, data: buf })
    })
    ipcMain.on("pty:input", (_e, { id, data }) => ptyMgr.writePty(id, data))
    ipcMain.on("pty:resize", (_e, { id, cols, rows }) => ptyMgr.resizePty(id, cols, rows))
    ipcMain.on("pty:kill", (_e, { id }) => ptyMgr.killPty(id))

    // --- Projects ---
    ipcMain.handle("projects:list", () => projects.listProjects())
    ipcMain.handle("projects:add", () => projects.addProject(mainWindow!))
    ipcMain.handle("projects:remove", (_e, id: string) => projects.removeProject(id))
    ipcMain.handle("projects:setActive", (_e, id: string) => projects.setActive(id))
    ipcMain.handle("projects:setGroup", (_e, { id, group }) => projects.setGroup(id, group))

    // --- Workspace (terminal layout persistence) ---
    ipcMain.handle("workspace:load", () => loadWorkspace())
    ipcMain.on("workspace:save", (_e, data) => saveWorkspace(data))

    // --- Settings ---
    ipcMain.handle("settings:load", () => loadSettings())
    ipcMain.on("settings:save", (_e, data) => saveSettings(data))

    // --- API client ---
    ipcMain.handle("http:send", (_e, req) => httpSend(req))

    // --- Remote / mobile server ---
    // Session metadata lives in the renderer; it pushes a snapshot here, and the
    // server reads that snapshot + relays new-session requests back to the renderer.
    let latestSessions: RemoteSession[] = []
    const serverDeps: ServerDeps = {
        getSessions: () => latestSessions,
        requestNewSession: (projectId) => {
            if (mainWindow && !mainWindow.isDestroyed())
                mainWindow.webContents.send("mobile:new", { projectId })
        }
    }
    ipcMain.on("mobile:sessions", (_e, sessions: RemoteSession[]) => {
        latestSessions = sessions
        if (server.isRunning()) server.broadcastSessions(serverDeps)
    })
    ipcMain.handle("server:start", (_e, cfg) => {
        server.start(cfg, serverDeps)
        return server.isRunning()
    })
    ipcMain.handle("server:stop", () => {
        server.stop()
        return false
    })
    ipcMain.handle("server:status", () => ({
        running: server.isRunning(),
        ...server.localAddresses()
    }))

    // --- Database ---
    ipcMain.handle("db:list", (_e, projectId: string) => db.listConnections(projectId))
    ipcMain.handle("db:save", (_e, input) => db.saveConnection(input))
    ipcMain.handle("db:remove", (_e, id: string) => db.removeConnection(id))
    ipcMain.handle("db:test", (_e, input) => db.testConnection(input))
    ipcMain.handle("db:query", (_e, { profileId, sql }) => db.runQuery(profileId, sql))
    ipcMain.handle("db:tables", (_e, profileId: string) => db.listTables(profileId))
    ipcMain.on("db:disconnect", (_e, profileId: string) => db.disconnect(profileId))
    ipcMain.handle("db:pickFile", async () => {
        const res = await dialog.showOpenDialog(mainWindow!, {
            title: "Select a SQLite database file",
            properties: ["openFile"],
            filters: [
                { name: "SQLite", extensions: ["db", "sqlite", "sqlite3", "db3"] },
                { name: "All files", extensions: ["*"] }
            ]
        })
        return res.canceled ? "" : (res.filePaths[0] ?? "")
    })

    // --- Files (editor) ---
    ipcMain.handle("fs:readDir", (_e, dir: string) => files.readDir(dir))
    ipcMain.handle("fs:allFiles", (_e, root: string) => files.allFiles(root))

    // --- Git ---
    ipcMain.handle("git:status", (_e, cwd: string) => gitStatus(cwd))

    // --- Environment (what spawned terminals inherit) ---
    // Report which of the requested env vars are set, so the UI can warn that an
    // agent CLI would bill pay-as-you-go API usage instead of a subscription.
    ipcMain.handle("env:check", (_e, names: string[]) => {
        const out: Record<string, boolean> = {}
        for (const n of names) out[n] = !!process.env[n]
        return out
    })
    ipcMain.handle("fs:read", (_e, path: string) => files.readFileText(path))
    ipcMain.handle("fs:write", (_e, { path, content }) => files.writeFileText(path, content))
}

app.whenReady().then(() => {
    registerIpc()
    createWindow()
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on("window-all-closed", () => {
    ptyMgr.killAll()
    db.closeAll()
    server.stop()
    if (process.platform !== "darwin") app.quit()
})
