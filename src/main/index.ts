import { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard } from "electron"
import { join } from "path"
import { mkdirSync, writeFileSync, readFileSync } from "fs"
import * as ptyMgr from "./pty"
import * as projects from "./projects"
import { httpSend } from "./http"
import * as files from "./files"
import { loadWorkspace, saveWorkspace } from "./workspace"
import { loadSettings, saveSettings } from "./settings"
import * as db from "./db"
import * as server from "./server"
import type { RemoteSession, ServerDeps } from "./server"
import { gitStatus, getIdentity, setIdentity, cacheCredential, verifyGitHubToken } from "./git"
import { readMcp, writeMcp, type McpServer } from "./mcp"
import * as skills from "./skills"
import * as browserNet from "./browserNet"
import * as proxy from "./proxy"
import * as aikeys from "./aikeys"
import * as gitpat from "./gitpat"
import * as projectenv from "./projectenv"
import * as netproxy from "./netproxy"
import * as search from "./search"
import * as dotnet from "./dotnet"
import * as system from "./system"
import * as usage from "./usage"
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
import * as updater from "./updater"

let mainWindow: BrowserWindow | null = null

/**
 * Renderer hardening (per the electron-best-practices security checklist):
 *  - Deny every Chromium permission request - DevDeck needs none (no camera /
 *    mic / geolocation / notifications in the desktop renderer).
 *  - Enforce a strict CSP on the app's own file:// content, so a renderer XSS
 *    can't pull in remote scripts or exfiltrate. Scoped to file:// only, so the
 *    embedded <webview> browser keeps working; skipped under the dev server
 *    (vite HMR needs unsafe-inline/eval + ws).
 */
function applySecurity(): void {
    const ses = session.defaultSession
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
    ses.setPermissionCheckHandler(() => false)

    if (process.env["ELECTRON_RENDERER_URL"]) return
    const csp = [
        "default-src 'self'",
        "script-src 'self' blob:", // blob: for Monaco's Vite-bundled web workers
        "style-src 'self' 'unsafe-inline'", // Monaco + inline style attrs
        "img-src 'self' data:", // image-preview tabs, QR codes
        "font-src 'self' data:",
        "connect-src 'self'", // all network egress goes through main via IPC
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'"
    ].join("; ")
    ses.webRequest.onHeadersReceived((details, cb) => {
        // Only the app's own content - never the <webview>'s browsed pages.
        if (!(details.url || "").startsWith("file://")) {
            cb({ responseHeaders: details.responseHeaders })
            return
        }
        cb({
            responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp] }
        })
    })
}

/**
 * Keep the main window pinned to the app; deny popups (open http(s) in the
 * system browser instead). The embedded <webview> browser navigates freely.
 */
function applyNavigationGuards(): void {
    app.on("web-contents-created", (_e, contents) => {
        contents.setWindowOpenHandler(({ url }) => {
            if (/^https?:\/\//i.test(url)) shell.openExternal(url)
            return { action: "deny" }
        })
        contents.on("will-navigate", (event, url) => {
            if (contents.getType() === "webview") return // the browser panel
            const devUrl = process.env["ELECTRON_RENDERER_URL"]
            const ok = url.startsWith("file://") || (!!devUrl && url.startsWith(devUrl))
            if (!ok) event.preventDefault()
        })
    })
}

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
            sandbox: true,
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
        // Merge env, lowest→highest precedence: the project's env vars (decrypted
        // here), then the renderer's extras (model), then the agent API key
        // (decrypted here). Plaintext secrets never leave the main process.
        const env: Record<string, string> = {
            ...(opts.projectId ? projectenv.envMap(opts.projectId) : {}),
            ...(opts.env ?? {})
        }
        if (opts.agentId && opts.keyEnv) {
            const key = aikeys.getKey(opts.agentId)
            if (key) env[opts.keyEnv] = key
        }
        ptyMgr.createPty({ ...opts, env })
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
    ipcMain.handle("projects:setMeta", (_e, { id, meta }) => projects.setMeta(id, meta))
    ipcMain.handle("projects:addPath", (_e, path: string) => projects.addProjectByPath(path))

    // --- Workspace (terminal layout persistence) ---
    ipcMain.handle("workspace:load", () => loadWorkspace())
    ipcMain.on("workspace:save", (_e, data) => saveWorkspace(data))

    // --- Settings ---
    ipcMain.handle("settings:load", () => loadSettings())
    ipcMain.on("settings:save", (_e, data) => saveSettings(data))

    // --- Corporate proxy (mutates process.env; new children inherit it) ---
    ipcMain.on("netproxy:apply", (_e, cfg: netproxy.ProxyConfig) => netproxy.applyProxy(cfg))

    // --- Clipboard (via Electron's module — the renderer's deny-all permission
    //     handler blocks navigator.clipboard, so terminal copy/paste routes here) ---
    ipcMain.handle("clipboard:read", () => clipboard.readText())
    ipcMain.on("clipboard:write", (_e, text: string) => clipboard.writeText(String(text ?? "")))

    // --- API client ---
    ipcMain.handle("http:send", (_e, req) => httpSend(req))

    // --- AI agent keys (encrypted at rest; injected at pty spawn) ---
    ipcMain.handle("ai:setKey", (_e, { agentId, key }: { agentId: string; key: string }) =>
        aikeys.setKey(agentId, key)
    )
    ipcMain.handle("ai:status", () => aikeys.status())
    ipcMain.handle("ai:clearKey", (_e, agentId: string) => aikeys.clearKey(agentId))

    // --- Git PATs (encrypted at rest; cached into Git's credential store on demand) ---
    ipcMain.handle("git:setPat", (_e, { accountId, pat }: { accountId: string; pat: string }) =>
        gitpat.setPat(accountId, pat)
    )
    ipcMain.handle("git:patStatus", () => gitpat.status())
    ipcMain.handle("git:clearPat", (_e, accountId: string) => gitpat.clearPat(accountId))
    ipcMain.handle(
        "git:cacheCredential",
        (_e, { accountId, host, username }: { accountId: string; host: string; username: string }) =>
            cacheCredential(host, username, gitpat.getPat(accountId))
    )
    ipcMain.handle("git:verifyPat", (_e, accountId: string) =>
        verifyGitHubToken(gitpat.getPat(accountId))
    )

    // --- Per-project env vars (encrypted at rest; injected at pty spawn) ---
    ipcMain.handle("projectEnv:get", (_e, projectId: string) => projectenv.getEnv(projectId))
    ipcMain.handle(
        "projectEnv:set",
        (_e, { projectId, pairs }: { projectId: string; pairs: projectenv.EnvPair[] }) =>
            projectenv.setEnv(projectId, pairs)
    )

    // --- App / auto-update (electron-updater + GitHub release feed) ---
    ipcMain.handle("app:version", () => app.getVersion())
    ipcMain.handle("update:check", () => updater.check())
    ipcMain.handle("update:download", () => updater.download())
    ipcMain.handle("update:install", () => updater.install())

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
    ipcMain.handle("server:start", async (_e, cfg) => {
        await server.start(cfg, serverDeps)
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

    // Generic open-file picker (returns "" if cancelled).
    ipcMain.handle(
        "dialog:pickFile",
        async (_e, filters?: { name: string; extensions: string[] }[]) => {
            const res = await dialog.showOpenDialog(mainWindow!, {
                title: "Select a file",
                properties: ["openFile"],
                filters: filters ?? [{ name: "All files", extensions: ["*"] }]
            })
            return res.canceled ? "" : (res.filePaths[0] ?? "")
        }
    )

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

    // --- Cross-project search --- (confined to registered project roots)
    ipcMain.handle("search:code", (_e, { query }: { query: string }) => search.code(query))

    // --- .NET build/test --- (confined to the given project root)
    ipcMain.handle("dotnet:run", (_e, { root, mode }: { root: string; mode: "build" | "test" }) => {
        guardPath(root)
        return dotnet.run(root, mode)
    })

    // --- Ambient system state (Docker + listening ports) ---
    ipcMain.handle("system:info", () => system.info())

    // --- Token usage + cost (parsed from Claude Code's local transcripts) ---
    ipcMain.handle("usage:tokens", (_e, sinceDays?: number) => usage.tokenUsage(sinceDays))

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
    ipcMain.handle("git:commit", (_e, { cwd, message, stagedOnly }) => {
        guardRepo(cwd)
        return changes.commit(cwd, message, !!stagedOnly)
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

    // --- Extend Agent (skills/agents catalog: fetch, install, list, remove) ---
    ipcMain.handle("extend:catalog", () => skills.catalog())
    ipcMain.handle("extend:preview", (_e, { repo, ref }: { repo: string; ref?: string }) => skills.preview(repo, ref))
    ipcMain.handle("extend:install", (_e, { repo, ref, item, scope, projectPath }: { repo: string; ref?: string; item: { kind: "skill" | "agent"; name: string; sourcePath: string }; scope: "global" | "project"; projectPath: string }) => {
        if (scope === "project") guardPath(projectPath)
        return skills.install(repo, ref, item, scope, projectPath)
    })
    ipcMain.handle("extend:list", (_e, projectPath: string) => skills.listInstalled(projectPath))
    ipcMain.handle("extend:remove", (_e, item: { kind: "skill" | "agent"; name: string; scope: "global" | "project"; path: string }) => skills.remove(item))

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

    // --- Network capture proxy (local HTTP forward proxy) ---
    proxy.proxyEvents.on("capture", (c) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("proxy:capture", c)
    })
    ipcMain.handle("proxy:start", (_e, port: number) => proxy.start(port))
    ipcMain.handle("proxy:stop", () => proxy.stop())
    ipcMain.handle("proxy:status", () => proxy.status())
    ipcMain.handle("proxy:list", () => proxy.list())
    ipcMain.handle("proxy:clear", () => proxy.clear())
    ipcMain.on("proxy:setProject", (_e, id: string | null) => proxy.setProject(id))

    // --- Browser network capture (CDP on the webview's webContents) ---
    ipcMain.handle("browser:netAttach", (_e, id: number) => browserNet.attach(id))
    ipcMain.handle("browser:netGet", (_e, id: number) => browserNet.getRecent(id))
    ipcMain.handle("browser:netDetach", (_e, id: number) => browserNet.detach(id))

    // Confine an upload's target dir to an open project (else fall back to temp),
    // and bound the payload — defense-in-depth for these write handlers.
    const MAX_UPLOAD = 25 * 1024 * 1024
    const uploadBase = (projectPath: unknown): string =>
        typeof projectPath === "string" && inProject(projectPath) ? projectPath : app.getPath("temp")

    // --- Browser: save a captured screenshot (data URL) into a project ---
    ipcMain.handle("browser:saveShot", (_e, { projectPath, dataUrl }) => {
        try {
            if (String(dataUrl).length > MAX_UPLOAD) return ""
            const dir = join(uploadBase(projectPath), ".devdeck", "uploads")
            mkdirSync(dir, { recursive: true })
            const file = join(dir, "shot-" + Date.now() + ".png")
            const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, "")
            writeFileSync(file, Buffer.from(b64, "base64"))
            return file
        } catch {
            return ""
        }
    })
    // Save an image dropped/pasted into the composer into the project's uploads
    // dir (preserving its type), so its path can be @-mentioned to an agent.
    ipcMain.handle("fs:saveUpload", (_e, { projectPath, name, dataUrl }) => {
        try {
            if (String(dataUrl).length > MAX_UPLOAD) return ""
            const dir = join(uploadBase(projectPath), ".devdeck", "uploads")
            mkdirSync(dir, { recursive: true })
            const m = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl))
            if (!m) return ""
            const extFromName = /\.[A-Za-z0-9]+$/.exec(String(name || ""))?.[0]
            const extFromMime = "." + (m[1].split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "")
            const stem =
                String(name || "image")
                    .replace(/\.[^.]*$/, "")
                    .replace(/[^\w.-]/g, "_")
                    .slice(0, 40) || "image"
            const file = join(dir, Date.now() + "-" + stem + (extFromName || extFromMime))
            writeFileSync(file, Buffer.from(m[2], "base64"))
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
    // Read an image file as a data URL (for the editor's image-preview tabs).
    const IMG_MIME: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        bmp: "image/bmp",
        svg: "image/svg+xml",
        ico: "image/x-icon",
        avif: "image/avif"
    }
    ipcMain.handle("fs:readDataUrl", (_e, path: string) => {
        guardPath(path)
        const buf = readFileSync(path)
        if (buf.length > 25 * 1024 * 1024) throw new Error("Image too large to preview (>25 MB).")
        const ext = path.split(".").pop()?.toLowerCase() ?? ""
        const mime = IMG_MIME[ext] ?? "application/octet-stream"
        return `data:${mime};base64,${buf.toString("base64")}`
    })
    ipcMain.handle("fs:write", (_e, { path, content }) => {
        guardPath(path)
        return files.writeFileText(path, content)
    })

    // "Save As" export: the user picks the destination via the OS dialog (so no
    // path confinement is needed - the location is user-chosen), then we write it.
    ipcMain.handle(
        "dialog:saveFile",
        async (
            _e,
            {
                defaultName,
                content,
                filters
            }: { defaultName: string; content: string; filters?: { name: string; extensions: string[] }[] }
        ) => {
            const res = await dialog.showSaveDialog(mainWindow!, {
                title: "Export",
                defaultPath: defaultName,
                filters: filters ?? [{ name: "All files", extensions: ["*"] }]
            })
            if (res.canceled || !res.filePath) return ""
            writeFileSync(res.filePath, content, "utf8")
            return res.filePath
        }
    )
}

app.whenReady().then(() => {
    registerIpc()
    applyNavigationGuards()
    applySecurity()
    createWindow()
    updater.initUpdater(() => mainWindow)
    // Best-effort check shortly after launch; failures (e.g. private repo) are
    // reported to the renderer but never block startup.
    setTimeout(() => void updater.check(), 4000)
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on("window-all-closed", () => {
    ptyMgr.killAll()
    db.closeAll()
    server.stop()
    proxy.stop()
    if (process.platform !== "darwin") app.quit()
})
