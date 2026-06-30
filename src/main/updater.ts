import { app, type BrowserWindow } from "electron"
import { autoUpdater } from "electron-updater"

// Auto-update via electron-updater + the GitHub release feed (configured in
// package.json build.publish). autoDownload is off: we surface an available
// update to the renderer and let the user choose to download, then install.
//
// Fetching the release feed needs the releases to be publicly readable - on a
// private repo the check fails (no embedded token, by design) and is reported
// as an error. The flow starts working the day the releases become public.

type Send = (channel: string, payload?: unknown) => void

let wired = false

function wire(send: Send): void {
    if (wired) return
    wired = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on("checking-for-update", () => send("update:status", { state: "checking" }))
    autoUpdater.on("update-available", (info) =>
        send("update:status", { state: "available", version: info.version })
    )
    autoUpdater.on("update-not-available", () => send("update:status", { state: "current" }))
    autoUpdater.on("error", (err) =>
        send("update:status", { state: "error", error: String(err?.message ?? err) })
    )
    autoUpdater.on("download-progress", (p) =>
        send("update:status", { state: "downloading", percent: Math.round(p.percent) })
    )
    autoUpdater.on("update-downloaded", (info) =>
        send("update:status", { state: "ready", version: info.version })
    )
}

export function initUpdater(getWindow: () => BrowserWindow | null): void {
    wire((channel, payload) => {
        const w = getWindow()
        if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
    })
}

export async function check(): Promise<{ ok: boolean; error?: string }> {
    if (!app.isPackaged) {
        return { ok: false, error: "Updates only work in the installed app." }
    }
    try {
        await autoUpdater.checkForUpdates()
        return { ok: true }
    } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e) }
    }
}

export async function download(): Promise<{ ok: boolean; error?: string }> {
    try {
        await autoUpdater.downloadUpdate()
        return { ok: true }
    } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e) }
    }
}

export function install(): void {
    autoUpdater.quitAndInstall()
}
