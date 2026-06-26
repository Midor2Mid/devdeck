import { app } from "electron"
import { join } from "path"
import { readFileSync, writeFileSync } from "fs"

// Opaque settings blob — shape is owned by the renderer; main just persists it.
function storeFile(): string {
    return join(app.getPath("userData"), "settings.json")
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
        writeFileSync(storeFile(), JSON.stringify(data, null, 2), "utf8")
    } catch (err) {
        console.error("[settings] failed to save:", err)
    }
}
