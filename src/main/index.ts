import { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard } from "electron"
import { join } from "path"
import { mkdirSync, readFileSync } from "fs"
import * as ptyMgr from "./pty"
import * as projects from "./projects"
import { httpSend } from "./http"
import * as files from "./files"
import { atomicWrite } from "./atomic"
import { loadWorkspace, saveWorkspace } from "./workspace"
import { loadSettings, saveSettings } from "./settings"
import * as db from "./db"
import * as server from "./server"
import type { RemoteSession, ServerConfig, ServerDeps, ServerStartResult } from "./server"
import * as devices from "./devices"
import { clearDecision, decisionFor, publishDecisions, startDecisionRefresh } from "./decisions"
import type { DecisionSnapshot } from "../shared/decision"
import {
    gitStatus,
    getIdentity,
    setIdentity,
    cacheCredential,
    verifyGitHubToken,
    pullLatest
} from "./git"
import { readMcp, writeMcp, registerDevdeck, unregisterDevdeck, type McpServer } from "./mcp"
import * as mcpserver from "./mcpserver"
import * as mcptools from "./mcptools"
import * as checks from "./checks"
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
import * as ledger from "./ledger"
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
import { closePrompt } from "./closePrompt"

let mainWindow: BrowserWindow | null = null
/** Latched once the user has confirmed a close, or a quit is already running. */
let quitDecided = false
/** Latched by `teardown()`, so the two paths into it cannot both run it. */
let tornDown = false

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

    mainWindow.on("close", (e) => {
        // Main is the only process that can refuse a close, and until now it was
        // the only one that did not know whether anything was running. `Ctrl+W`
        // on a pane the user thought was a tab took the whole window, and every
        // agent in it, with no way back.
        if (!quitDecided) {
            const prompt = closePrompt(ptyMgr.liveAgents())
            // `showMessageBoxSync` blocks, so a second close cannot arrive
            // mid-question; and a confirmed close latches `quitDecided`, so the
            // app can never be made unquittable by this handler.
            if (prompt && mainWindow) {
                const choice = dialog.showMessageBoxSync(mainWindow, {
                    type: "warning",
                    message: prompt.message,
                    detail: prompt.detail,
                    buttons: prompt.buttons,
                    defaultId: 0,
                    cancelId: 0,
                    noLink: true
                })
                if (choice === 0) {
                    e.preventDefault()
                    return
                }
            }
            quitDecided = true
        }
        if (mainWindow) saveWindowState(mainWindow)
    })
}

function registerIpc(): void {
    // --- Terminals (fire-and-forget streaming) ---
    // Broadcast all pty output to the window; the WS server subscribes separately.
    ptyMgr.ptyEvents.on("data", (d) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("pty:data", d)
    })
    ptyMgr.ptyEvents.on("exit", (d: { id: string; exitCode: number; stale?: boolean }) => {
        // A session that ended is not waiting on an answer any more, so its
        // decision goes with it — otherwise a card minted seconds before the
        // exit stays tappable and fires a keystroke at a dead pty. `stale` is a
        // restart's predecessor dying late: that id is live again under a new
        // process, and clearing it would drop the new screen's decision.
        if (!d.stale) clearDecision(d.id)
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
    // Read-only: a held pane fetches its own corpse rather than being pushed it
    // through pty:data, which the renderer treats as proof of life.
    ipcMain.handle("pty:buffer", (_e, id: string) => ptyMgr.bufferOf(id))

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
    const sendDecisions = (snapshot: DecisionSnapshot): void => {
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send("decisions:changed", snapshot)
    }
    // Main re-reads the screens on its own clock, not only when the renderer
    // pushes. A status push cannot be the only trigger: a session already
    // flagged attention whose pane is off screen takes no status transition
    // when more output arrives (store.ts's pty handler), so nothing would push,
    // and the tile would keep offering the answer to the PREVIOUS question —
    // on the one surface whose Approve button does not re-check the screen
    // before typing. See REFRESH_MS for why one second.
    // The phone is on the same clock as the tile. `publishDecisions` only calls
    // back when the decision snapshot actually changed, so this rebroadcasts
    // the session list exactly when a card should appear, change or clear --
    // not once a second. Without it the desktop got the fix above and the phone
    // did not: a pane already in attention takes no status transition when the
    // agent asks its NEXT question, so nothing would push, and the phone would
    // keep showing the previous question's buttons. Tapping one is refused
    // ("moved-on", decisions.ts), so this is staleness, not a hole -- but a
    // button that fails is exactly what the remote card exists to replace.
    const onDecisionsChanged = (snapshot: DecisionSnapshot): void => {
        sendDecisions(snapshot)
        if (server.isRunning()) server.broadcastSessions(serverDeps)
    }
    startDecisionRefresh(() => latestSessions, onDecisionsChanged)
    // This snapshot is NOT only the remote server's input any more: it is the
    // status half of what main needs to classify permission prompts, and the
    // desktop's own Mission Control tile reads main's answer. So the renderer
    // pushes it whether or not the remote server is on — see App.tsx, where the
    // `remote.enabled` gate on this call had to go for exactly that reason.
    ipcMain.on("mobile:sessions", (_e, sessions: RemoteSession[]) => {
        latestSessions = sessions
        // Forced: the renderer asked, so it gets an answer even if nothing
        // changed. A renderer that just reloaded has an empty cache, and
        // deduplicating its first push would leave it that way.
        publishDecisions(sessions, sendDecisions, true)
        if (server.isRunning()) server.broadcastSessions(serverDeps)
    })
    ipcMain.handle("decisions:for", (_e, id: string) => decisionFor(String(id)))
    ipcMain.handle("server:start", async (_e, cfg: ServerConfig): Promise<ServerStartResult> => {
        try {
            await server.start(cfg, serverDeps)
            return { ok: server.isRunning() }
        } catch (err) {
            // chooseBind's refusal (e.g. "tailscale" requested, no tailnet) lands
            // here as a rejected promise from server.start() — surface the reason
            // verbatim rather than letting it become an unhandled rejection the
            // panel can't show.
            return { ok: false, reason: (err as Error)?.message ?? String(err) }
        }
    })
    ipcMain.handle("server:stop", () => {
        server.stop()
        return false
    })
    ipcMain.handle("server:status", () => ({
        running: server.isRunning(),
        boundHost: server.boundAddress(),
        ...server.localAddresses()
    }))

    // --- Paired remote devices ---
    // `devices:list` returns RemoteDevice[] only — devices.ts's toPublic()
    // builds each record field-by-field so a device token can never ride
    // along, and `expireForTest` (a test-only escape hatch that could keep a
    // device alive past its idle window) is deliberately not wired to any
    // handler here.
    ipcMain.handle("devices:list", (_e, ttlDays: number) => devices.listDevices(ttlDays))
    ipcMain.handle("devices:rename", (_e, { id, name }: { id: string; name: string }) =>
        devices.renameDevice(id, name)
    )
    // Revocation intentionally lets a write failure throw across IPC rather
    // than reporting success on a device that's still paired — see the
    // comment on revokeDevice itself. The store write must land before the
    // socket close: closing first and then having the write fail would leave
    // the device still paired (able to re-pair the same cookie's dead session
    // notwithstanding) while its live connection is already gone — the write
    // is the actual security boundary, the socket close is what makes it take
    // effect immediately instead of on the device's next connection attempt.
    ipcMain.handle("devices:revoke", (_e, id: string) => {
        devices.revokeDevice(id)
        server.closeDeviceSockets(id)
    })
    ipcMain.handle("devices:pairingToken", () => devices.pairingToken())
    ipcMain.handle("devices:regeneratePairingToken", () => devices.regeneratePairingToken())
    // One-way settings migration: a legacy plaintext remote.token becomes the
    // pairing token once, then the renderer drops it from settings.json - but
    // only once devices.setPairingToken's return value confirms that actually
    // happened (see its own comment): a resolved promise alone isn't proof.
    ipcMain.handle("devices:migrateLegacyToken", (_e, token: string) => devices.setPairingToken(token))

    // --- MCP server (DevDeck's own tools, exposed to agent CLIs) ---
    // Every dep reads fresh on each tool call so an agent always sees the current
    // state — the projects open now, the requests saved now — not a snapshot from
    // when the server started.
    const mcpDeps: mcptools.McpDeps = {
        projects: () =>
            projects.listProjects().projects.map((p) => ({ id: p.id, name: p.name, path: p.path })),
        // Saved requests live in settings.json under `collections`; flatten them
        // and tag each with its collection name so the agent can tell them apart.
        savedRequests: () => {
            const raw = loadSettings() as
                | { collections?: { name?: string; requests?: mcptools.McpSavedRequest[] }[] }
                | undefined
            const out: mcptools.McpSavedRequest[] = []
            for (const c of raw?.collections ?? []) {
                for (const r of c.requests ?? []) {
                    if (r && typeof r.id === "string") out.push({ ...r, collection: c.name })
                }
            }
            return out
        },
        httpSend: (req) => httpSend(req),
        browserPages: () => browserNet.attachedPages(),
        consoleLog: (id, limit) => browserNet.getConsole(id, limit),
        networkLog: (id, limit) => browserNet.getRecent(id, limit)
    }
    ipcMain.handle("mcpsrv:start", async (_e, cfg: { port: number; token: string }) => {
        const res = await mcpserver.start(cfg, mcpDeps)
        return { ...res, ...mcpserver.status() }
    })
    ipcMain.handle("mcpsrv:stop", async () => {
        await mcpserver.stop()
        return mcpserver.status()
    })
    ipcMain.handle("mcpsrv:status", () => mcpserver.status())

    // --- Pipeline ground-truth checks (command gates) ---
    // This channel spawns a shell, so it gets the same confinement every other
    // path-taking channel has. Reaching it needs a renderer XSS, which already
    // owns window.api wholesale - this is hygiene, not a wall, and it is here
    // because "runs a command in a directory you name" should never be the one
    // channel that doesn't say which directories are allowed.
    ipcMain.handle("checks:run", (_e, { cwd, command, timeoutMs }) => {
        guardRepo(cwd)
        return checks.runCheck(cwd, command, allowedRepoRoots(), timeoutMs)
    })
    ipcMain.handle("mcpsrv:token", () => mcpserver.generateToken())
    ipcMain.handle("mcpsrv:register", (_e, { cwd, port }) => {
        guardRepo(cwd)
        registerDevdeck(cwd, port)
        return readMcp(cwd)
    })
    ipcMain.handle("mcpsrv:unregister", (_e, cwd: string) => {
        guardRepo(cwd)
        unregisterDevdeck(cwd)
        return readMcp(cwd)
    })

    // --- Database ---
    // A SQLite "connection" is a file path, so creating or testing one is a
    // file read - the one path-taking channel that had no confinement, and
    // therefore the way around the confinement on all the others. Allowed if
    // the file is inside an open project, or if the user personally picked it
    // in the dialog (db:pickFile records that in the main process, where a
    // renderer cannot add to it). Not narrowed to project roots alone: a
    // database in D:\data is an ordinary thing to point DevDeck at, and
    // removing that would be a worse bug than the one being fixed.
    const dbInputRefusal = (input: { kind?: string; database?: string }): string | null => {
        if (!input || input.kind !== "sqlite") return null
        const file = String(input.database ?? "")
        if (!file) return "A SQLite connection needs a database file."
        if (inProject(file) || db.isApprovedDbFile(file)) return null
        return "That database file is outside every open project - use Browse to choose it."
    }
    ipcMain.handle("db:list", (_e, projectId: string) => db.listConnections(projectId))
    ipcMain.handle("db:save", (_e, input) => {
        const refusal = dbInputRefusal(input)
        if (refusal) throw new Error(refusal)
        return db.saveConnection(input)
    })
    ipcMain.handle("db:remove", (_e, id: string) => db.removeConnection(id))
    // A refusal here is RETURNED, not thrown: db:test's contract has always
    // been that a connection failure comes back as `{ ok: false, error }`, and
    // the panel renders exactly that. Rejecting instead would have made the
    // one input a user can plausibly get wrong - a path - the one that skips
    // the error banner.
    ipcMain.handle("db:test", (_e, input) => {
        const refusal = dbInputRefusal(input)
        if (refusal) return { ok: false, error: refusal, timeMs: 0 }
        return db.testConnection(input)
    })
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
        const picked = res.canceled ? "" : (res.filePaths[0] ?? "")
        // The dialog IS the boundary: this is the moment the user chose a file
        // outside their projects, and it is a choice the renderer cannot forge.
        if (picked) db.approveDbFile(picked)
        return picked
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
    ipcMain.handle(
        "usage:window",
        (_e, { projectPath, from, to }: { projectPath: string; from: number; to: number }) =>
            usage.costInWindow(projectPath, from, to)
    )

    // --- Run ledger (durable record of what each run cost) ---
    // Append is `on`, not `handle`: the renderer writes a record at the moment a
    // card completes or a pipeline finishes, and must not have to await - or
    // handle a rejection from - the thing that only records what already happened.
    // appendRun swallows and logs its own failures.
    // Validated on the way in with the same predicate readRuns applies on the way
    // out: this store is append-only, so a malformed line is permanent, and a
    // renderer bug handing over `undefined` would write the literal "undefined".
    ipcMain.on("ledger:append", (_e, rec: unknown) => {
        if (ledger.isValidRunRecord(rec)) ledger.appendRun(rec)
        else console.error("[ledger] refused a record that is not a RunRecord")
    })
    ipcMain.handle("ledger:read", (_e, limit?: unknown) => {
        // Clamped: readRuns slices from the newest end, so a negative limit would
        // quietly return the OLDEST rows instead of the requested newest ones.
        const n =
            typeof limit === "number" && Number.isFinite(limit)
                ? Math.max(0, Math.floor(limit))
                : undefined
        return ledger.readRuns(n)
    })
    // No ledger:clear channel. clearRuns exists (the tests use it), but wiring it
    // end-to-end put a one-call wipe of an append-only history on the bridge with
    // no caller and no confirm behind it - a surface that can only ever be used
    // by accident.

    // --- Git ---
    ipcMain.handle("git:status", (_e, cwd: string) => gitStatus(cwd))
    ipcMain.handle("git:getIdentity", (_e, cwd: string) => getIdentity(cwd))
    ipcMain.handle("git:setIdentity", (_e, { cwd, identity }) => setIdentity(cwd, identity))

    // A repo path is allowed if it's an open project, or inside an open
    // project's managed worktree sibling folder.
    const repoRoots = (): string[] => projects.listProjects().projects.map((x) => x.path)
    /** Every directory a repo operation may touch, as one list - open projects
        plus their managed worktree siblings. Handed whole to callees that have
        to re-check for themselves (checks.runCheck), so the allowed set is
        defined in exactly one place. */
    const allowedRepoRoots = (): string[] => {
        const roots = repoRoots()
        return [...roots, ...roots.map((r) => worktrees.worktreeBase(r))]
    }
    const isAllowedRepo = (cwd: string): boolean =>
        files.isWithinRoots(cwd, allowedRepoRoots())
    const guardRepo = (cwd: string): void => {
        if (!isAllowedRepo(cwd)) throw new Error("Path is outside any open project.")
    }

    ipcMain.handle("git:pull", (_e, cwd: string) => {
        guardRepo(cwd)
        return pullLatest(cwd)
    })

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
        // The user pressed Save. A refusal here has to reach them - writing
        // nothing and reporting success is the failure this guard exists to stop.
        if (!writeMcp(projectPath, servers)) {
            throw new Error(
                ".mcp.json in this project could not be read, so it was not overwritten. " +
                    "Fix or move the file, then save again."
            )
        }
    })

    // --- Extend Agent (skills/agents catalog: fetch, install, list, remove) ---
    ipcMain.handle("extend:catalog", () => skills.catalog())
    ipcMain.handle("extend:preview", (_e, { repo, ref }: { repo: string; ref?: string }) => skills.preview(repo, ref))
    ipcMain.handle("extend:install", (_e, { repo, ref, item, scope, projectPath }: { repo: string; ref?: string; item: { kind: "skill" | "agent"; name: string; sourcePath: string }; scope: "global" | "project"; projectPath: string }) => {
        if (scope === "project") guardPath(projectPath)
        return skills.install(repo, ref, item, scope, projectPath)
    })
    // The only two path-taking handlers in this file that had no containment
    // call at all. An empty projectPath is the legitimate "no project open"
    // case, where only the global scope is in play.
    ipcMain.handle("extend:list", (_e, projectPath: string) => {
        if (projectPath) guardPath(projectPath)
        return skills.listInstalled(projectPath)
    })
    ipcMain.handle(
        "extend:remove",
        (
            _e,
            {
                item,
                projectPath
            }: {
                item: { kind: "skill" | "agent"; name: string; scope: "global" | "project"; path: string }
                projectPath: string
            }
        ) => {
            if (item.scope === "project") guardPath(projectPath)
            return skills.remove(item, projectPath)
        }
    )

    // --- Terminal record & replay ---
    // `projectPath` is guarded and captured at *start*: the recorder then owns
    // the destination, `rec:stop` needs nothing from the renderer, and a quit
    // can flush a recording the renderer is no longer around to place.
    ipcMain.handle("rec:start", (_e, { termId, projectPath }: { termId: string; projectPath: string }) => {
        guardPath(projectPath)
        return recorder.startRecording(termId, projectPath)
    })
    ipcMain.handle("rec:stop", (_e, { termId, label }: { termId: string; label: string }) =>
        recorder.stopRecording(termId, label)
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
            atomicWrite(file, Buffer.from(b64, "base64"))
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
            atomicWrite(file, Buffer.from(m[2], "base64"))
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
    // `baseMtimeMs` is the version the caller read; 0 means create-or-force.
    // Without it the editor wrote a stale in-memory string over whatever an
    // agent had since written to the same file.
    ipcMain.handle("fs:write", (_e, { path, content, baseMtimeMs }) => {
        guardPath(path)
        return files.writeFileText(path, content, baseMtimeMs ?? 0)
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
            // The user chose this path in a Save dialog: a half-written export is
            // worse here than anywhere, because they will not look at it again.
            atomicWrite(res.filePath, content)
            return res.filePath
        }
    )
}

/**
 * One DevDeck per machine.
 *
 * Every store in this app is `load(); mutate; save()` from the main process, so
 * a second launch is a second writer to all of them - two instances interleave
 * reads and writes and the loser's changes vanish, silently. The unique temp
 * name in atomicWrite stops them renaming over each other mid-write; this stops
 * them existing at the same time.
 *
 * A second launch raises the window you already have, which is also what
 * double-clicking the icon should do. If two instances are ever wanted
 * deliberately, this is the one line to remove.
 */
if (!app.requestSingleInstanceLock()) {
    app.quit()
} else {
    app.on("second-instance", () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
    })
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

/**
 * Everything that must happen before the process goes, exactly once.
 *
 * This used to live only in `window-all-closed`, which is one of several ways
 * DevDeck stops: an `app.quit()` from the updater, an OS shutdown, a quit from
 * anywhere that is not the last window closing, all skipped it - leaving pty
 * trees alive, sqlite handles open, and the WS server bound.
 */
function teardown(): void {
    if (tornDown) return
    tornDown = true
    // First, because it is the only step whose failure loses user data.
    recorder.flushAll()
    ptyMgr.killAll()
    db.closeAll()
    server.stop()
    void mcpserver.stop()
    proxy.stop()
}

app.on("before-quit", () => {
    // The close handler asks the question; this one never does. A quit already
    // under way has been decided, and a second dialog here would ask it twice.
    quitDecided = true
    teardown()
})

app.on("window-all-closed", () => {
    teardown()
    if (process.platform !== "darwin") app.quit()
})
