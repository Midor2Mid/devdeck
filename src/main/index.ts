import { app, BrowserWindow, ipcMain, dialog, shell } from "electron"
import { join } from "path"
import { mkdirSync, writeFileSync } from "fs"
import * as ptyMgr from "./pty"
import * as projects from "./projects"
import { httpSend } from "./http"
import * as files from "./files"
import { loadWorkspace, saveWorkspace } from "./workspace"
import { loadSettings, saveSettings } from "./settings"
import * as db from "./db"
import * as server from "./server"
import type { RemoteSession, ServerDeps } from "./server"
import { gitStatus, getIdentity, setIdentity } from "./git"
import { readMcp, writeMcp, type McpServer } from "./mcp"
import * as browserNet from "./browserNet"
import * as recorder from "./recorder"
import * as triggers from "./triggers"
import type { PipelineTrigger } from "./triggers"
import * as worktrees from "./worktrees"
import * as changes from "./changes"
import * as work from "./work"
import * as release from "./release"
import * as worklog from "./worklog"
import * as pr from "./pr"
import { loadWindowState, saveWindowState } from "./windowState"

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    const saved = loadWindowState()
    mainWindow = new BrowserWindow({
        width: saved.width ?? 1400,
        height: saved.height ?? 900,
        x: saved.x,
        y: saved.y,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: "#1b1a18",
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

    if (saved.maximized) mainWindow.maximize()

    // electron-vite injects ELECTRON_RENDERER_URL in dev (vite dev server).
    if (process.env["ELECTRON_RENDERER_URL"]) {
        mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
    } else {
        mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
    }

    mainWindow.on("close", () => {
        if (mainWindow) saveWindowState(mainWindow)
    })
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
    // --- Pipeline file-triggers ---
    triggers.onTriggerFired((triggerId) => {
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send("trigger:fired", { triggerId })
    })
    ipcMain.handle("triggers:apply", (_e, list: PipelineTrigger[]) => {
        // Confine each watch to an open project root.
        const ok = (list ?? []).filter((t) => inProject(t.projectPath))
        triggers.applyTriggers(ok)
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
    // Confine all filesystem access to within an added project (defense in depth).
    const inProject = (p: string): boolean =>
        files.isWithinRoots(
            p,
            projects.listProjects().projects.map((x) => x.path)
        )
    const guardPath = (p: string): void => {
        if (!inProject(p)) throw new Error("Path is outside any open project.")
    }
    ipcMain.handle("fs:readDir", (_e, dir: string) => {
        guardPath(dir)
        return files.readDir(dir)
    })
    ipcMain.handle("fs:allFiles", (_e, root: string) => {
        guardPath(root)
        return files.allFiles(root)
    })

    // --- Git ---
    ipcMain.handle("git:status", (_e, cwd: string) => gitStatus(cwd))
    ipcMain.handle("git:getIdentity", (_e, cwd: string) => getIdentity(cwd))
    ipcMain.handle("git:setIdentity", (_e, { cwd, identity }) => setIdentity(cwd, identity))

    // A repo path is allowed if it's an open project, or inside an open
    // project's managed worktree sibling folder.
    const repoRoots = (): string[] => projects.listProjects().projects.map((x) => x.path)
    const isAllowedRepo = (cwd: string): boolean => {
        const roots = repoRoots()
        if (files.isWithinRoots(cwd, roots)) return true
        return files.isWithinRoots(cwd, roots.map((r) => worktrees.worktreeBase(r)))
    }
    const guardRepo = (cwd: string): void => {
        if (!isAllowedRepo(cwd)) throw new Error("Path is outside any open project.")
    }

    // --- Git worktrees ---
    ipcMain.handle("git:worktrees", (_e, repoPath: string) => {
        guardPath(repoPath)
        return worktrees.listWorktrees(repoPath)
    })
    ipcMain.handle("git:worktreeAdd", (_e, { repoPath, branch, base }) => {
        guardPath(repoPath)
        return worktrees.addWorktree(repoPath, branch, base)
    })
    ipcMain.handle("git:worktreeRemove", (_e, { repoPath, path, deleteBranch }) => {
        guardPath(repoPath)
        return worktrees.removeWorktree(repoPath, path, deleteBranch)
    })

    // --- Worklog / standup ---
    ipcMain.handle("worklog:collect", (_e, { repos, sinceISO }) => {
        const ok = (repos ?? []).filter((r: { path: string }) => inProject(r.path))
        return worklog.collect(ok, sinceISO)
    })

    // --- Release / promotion board ---
    ipcMain.handle("release:config", (_e, repo: string) => {
        guardPath(repo)
        return release.loadConfig(repo)
    })
    ipcMain.handle("release:saveConfig", (_e, { repo, config }) => {
        guardPath(repo)
        return release.saveConfig(repo, config)
    })
    ipcMain.handle("release:status", (_e, { repo, stages }) => {
        guardRepo(repo)
        return release.status(repo, stages)
    })
    ipcMain.handle("release:pending", (_e, { repo, target, source }) => {
        guardRepo(repo)
        return release.pending(repo, target, source)
    })
    ipcMain.handle("release:tag", (_e, { repo, name, ref }) => {
        guardRepo(repo)
        return release.createTag(repo, name, ref)
    })

    // --- Git changes (diff review) ---
    ipcMain.handle("git:changes", (_e, cwd: string) => {
        guardRepo(cwd)
        return changes.listChanges(cwd)
    })
    ipcMain.handle("git:fileDiff", (_e, { cwd, path, staged, untracked }) => {
        guardRepo(cwd)
        return changes.fileDiff(cwd, path, { staged: !!staged, untracked: !!untracked })
    })
    ipcMain.handle("git:stage", (_e, { cwd, path }) => {
        guardRepo(cwd)
        return changes.stageFile(cwd, path)
    })
    ipcMain.handle("git:unstage", (_e, { cwd, path }) => {
        guardRepo(cwd)
        return changes.unstageFile(cwd, path)
    })
    ipcMain.handle("git:discard", (_e, { cwd, path, untracked }) => {
        guardRepo(cwd)
        return changes.discardFile(cwd, path, !!untracked)
    })
    ipcMain.handle("git:commit", (_e, { cwd, message }) => {
        guardRepo(cwd)
        return changes.commitAll(cwd, message)
    })
    ipcMain.handle("git:fullDiff", (_e, cwd: string) => {
        guardRepo(cwd)
        return changes.fullDiff(cwd)
    })

    // --- Pull requests (push + Azure API / web fallback) ---
    ipcMain.handle("pr:remoteInfo", (_e, { cwd, target }) => {
        guardRepo(cwd)
        return pr.remoteInfo(cwd, target)
    })
    ipcMain.handle("pr:push", (_e, { cwd, branch }) => {
        guardRepo(cwd)
        return pr.pushBranch(cwd, branch)
    })
    ipcMain.handle("pr:createAzure", (_e, opts) => work.createAzurePr(opts))

    // --- Open a URL in the system browser ---
    ipcMain.handle("shell:open", (_e, url: string) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    })

    // --- Work items (Jira / Azure DevOps) ---
    ipcMain.handle("work:getConfig", () => work.getConfig())
    ipcMain.handle("work:saveConfig", (_e, input: work.WorkConfigInput) => work.saveConfig(input))
    ipcMain.handle("work:test", (_e, provider: work.Provider) => work.testProvider(provider))
    ipcMain.handle("work:items", () => work.fetchItems())

    // --- MCP (per-project .mcp.json) ---
    ipcMain.handle("mcp:list", (_e, projectPath: string) => {
        guardPath(projectPath)
        return readMcp(projectPath)
    })
    ipcMain.handle("mcp:save", (_e, { projectPath, servers }: { projectPath: string; servers: McpServer[] }) => {
        guardPath(projectPath)
        writeMcp(projectPath, servers)
    })

    // --- Terminal record & replay ---
    ipcMain.handle("rec:start", (_e, termId: string) => recorder.startRecording(termId))
    ipcMain.handle(
        "rec:stop",
        (_e, { termId, projectPath, label }: { termId: string; projectPath: string; label: string }) => {
            guardPath(projectPath)
            return recorder.stopRecording(termId, projectPath, label)
        }
    )
    ipcMain.handle("rec:active", (_e, termId: string) => recorder.isRecording(termId))
    ipcMain.handle("rec:list", (_e, projectPath: string) => {
        guardPath(projectPath)
        return recorder.listRecordings(projectPath)
    })
    ipcMain.handle("rec:load", (_e, path: string) => {
        guardPath(path)
        return recorder.loadRecording(path)
    })

    // --- Browser network capture (CDP on the webview's webContents) ---
    ipcMain.handle("browser:netAttach", (_e, id: number) => browserNet.attach(id))
    ipcMain.handle("browser:netGet", (_e, id: number) => browserNet.getRecent(id))
    ipcMain.handle("browser:netDetach", (_e, id: number) => browserNet.detach(id))

    // --- Browser: save a captured screenshot (data URL) into a project ---
    ipcMain.handle("browser:saveShot", (_e, { projectPath, dataUrl }) => {
        try {
            const base = projectPath || app.getPath("temp")
            const dir = join(base, ".devdeck", "uploads")
            mkdirSync(dir, { recursive: true })
            const file = join(dir, "shot-" + Date.now() + ".png")
            const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, "")
            writeFileSync(file, Buffer.from(b64, "base64"))
            return file
        } catch {
            return ""
        }
    })

    // --- Environment (what spawned terminals inherit) ---
    // Report which of the requested env vars are set, so the UI can warn that an
    // agent CLI would bill pay-as-you-go API usage instead of a subscription.
    ipcMain.handle("env:check", (_e, names: string[]) => {
        const out: Record<string, boolean> = {}
        for (const n of names) out[n] = !!process.env[n]
        return out
    })
    ipcMain.handle("fs:read", (_e, path: string) => {
        guardPath(path)
        return files.readFileText(path)
    })
    ipcMain.handle("fs:write", (_e, { path, content }) => {
        guardPath(path)
        return files.writeFileText(path, content)
    })
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
