import { app } from "electron"
import { join } from "path"
import { atomicWrite } from "./atomic"
import { readJson } from "./readJson"
import type { Loaded } from "../shared/loaded"

// Opaque per-project terminal layout (tabs + split trees + active selections).
// Shape is owned by the renderer; main just persists whatever JSON it is given.
function storeFile(): string {
    return join(app.getPath("userData"), "workspace.json")
}

/**
 * Returns `{ ok: false, reason: "unreadable" }` rather than `null` when the file
 * exists but cannot be read. The renderer keys its persistence gate off that
 * distinction: on `unreadable` it must refuse to save, because saving would
 * write module-load defaults over a workspace that is still on disk.
 */
export function loadWorkspace(): Loaded<unknown> {
    return readJson<unknown>(storeFile())
}

export function saveWorkspace(data: unknown): void {
    try {
        atomicWrite(storeFile(), JSON.stringify(data, null, 2))
    } catch (err) {
        console.error("[workspace] failed to save:", err)
    }
}
