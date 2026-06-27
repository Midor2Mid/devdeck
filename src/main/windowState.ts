import { app, type BrowserWindow, type Rectangle } from "electron"
import { join } from "path"
import { readFileSync, writeFileSync } from "fs"

interface WindowState extends Partial<Rectangle> {
    maximized?: boolean
}

function file(): string {
    return join(app.getPath("userData"), "window.json")
}

export function loadWindowState(): WindowState {
    try {
        return JSON.parse(readFileSync(file(), "utf8")) as WindowState
    } catch {
        return {}
    }
}

/** Save bounds + maximized state; call on window close. */
export function saveWindowState(win: BrowserWindow): void {
    try {
        const state: WindowState = win.isMaximized()
            ? { ...win.getNormalBounds(), maximized: true }
            : { ...win.getBounds(), maximized: false }
        writeFileSync(file(), JSON.stringify(state), "utf8")
    } catch {
        /* ignore */
    }
}
