import { app } from "electron"
import { join } from "path"
import { readFileSync } from "fs"
import { atomicWrite } from "./atomic"

// Opaque settings blob - shape is owned by the renderer; main just persists it.
function storeFile(): string {
    return join(app.getPath("userData"), "settings.json")
}

/**
 * Where the settings blob lives.
 *
 * Exported for `diagnostics.ts`, which must distinguish "settings.json is not
 * there yet" from "settings.json is there and could not be read" - `loadSettings`
 * collapses both into `null`, which is fine for a loader whose caller falls back
 * to defaults and fatal for a record whose whole job is not to guess.
 */
export function settingsPath(): string {
    return storeFile()
}

export function loadSettings(): unknown {
    try {
        return JSON.parse(readFileSync(storeFile(), "utf8"))
    } catch {
        return null
    }
}

export function saveSettings(data: unknown): void {
    try {
        atomicWrite(storeFile(), JSON.stringify(data, null, 2))
    } catch (err) {
        console.error("[settings] failed to save:", err)
    }
}
