import { app, BrowserWindow, ipcMain } from "electron"
import { join } from "path"
import * as ptyMgr from "./pty"
import * as projects from "./projects"
import { httpSend } from "./http"
import * as files from "./files"
import { loadWorkspace, saveWorkspace } from "./workspace"
import * as db from "./db"

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
            sandbox: false
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
    ipcMain.on("pty:create", (e, opts) => ptyMgr.createPty(e.sender, opts))
    ipcMain.on("pty:input", (_e, { id, data }) => ptyMgr.writePty(id, data))
    ipcMain.on("pty:resize", (_e, { id, cols, rows }) => ptyMgr.resizePty(id, cols, rows))
    ipcMain.on("pty:kill", (_e, { id }) => ptyMgr.killPty(id))

    // --- Projects ---
    ipcMain.handle("projects:list", () => projects.listProjects())
    ipcMain.handle("projects:add", () => projects.addProject(mainWindow!))
    ipcMain.handle("projects:remove", (_e, id: string) => projects.removeProject(id))
    ipcMain.handle("projects:setActive", (_e, id: string) => projects.setActive(id))

    // --- Workspace (terminal layout persistence) ---
    ipcMain.handle("workspace:load", () => loadWorkspace())
    ipcMain.on("workspace:save", (_e, data) => saveWorkspace(data))

    // --- API client ---
    ipcMain.handle("http:send", (_e, req) => httpSend(req))

    // --- Database ---
    ipcMain.handle("db:list", (_e, projectId: string) => db.listConnections(projectId))
    ipcMain.handle("db:save", (_e, input) => db.saveConnection(input))
    ipcMain.handle("db:remove", (_e, id: string) => db.removeConnection(id))
    ipcMain.handle("db:test", (_e, input) => db.testConnection(input))
    ipcMain.handle("db:query", (_e, { profileId, sql }) => db.runQuery(profileId, sql))
    ipcMain.handle("db:tables", (_e, profileId: string) => db.listTables(profileId))
    ipcMain.on("db:disconnect", (_e, profileId: string) => db.disconnect(profileId))

    // --- Files (editor) ---
    ipcMain.handle("fs:readDir", (_e, dir: string) => files.readDir(dir))
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
    if (process.platform !== "darwin") app.quit()
})
