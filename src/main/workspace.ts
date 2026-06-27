import { app } from "electron"
import { join } from "path"
import { readFileSync } from "fs"
import { atomicWrite } from "./atomic"

// Opaque per-project terminal layout (tabs + split trees + active selections).
// Shape is owned by the renderer; main just persists whatever JSON it is given.
function storeFile(): string {
    return join(app.getPath("userData"), "workspace.json")
}

export function loadWorkspace(): unknown {
    try {
        return JSON.parse(readFileSync(storeFile(), "utf8"))
    } catch {
        return null
    }
}

export function saveWorkspace(data: unknown): void {
    try {
        atomicWrite(storeFile(), JSON.stringify(data, null, 2))
    } catch (err) {
        console.error("[workspace] failed to save:", err)
    }
}
