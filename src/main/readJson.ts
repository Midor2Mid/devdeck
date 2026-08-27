import { readFileSync } from "fs"
import type { Loaded } from "../shared/loaded"

/**
 * Read and parse a JSON file, keeping "absent" distinct from "damaged".
 *
 * ENOENT is `missing` — a legitimate first run, and the only case in which a
 * caller may safely fall back to an empty base. Everything else (a parse error,
 * a permission denial, an antivirus lock, a truncated file) is `unreadable`, and
 * a caller that writes must refuse rather than overwrite what it could not read.
 */
export function readJson<T>(path: string): Loaded<T> {
    let text: string
    try {
        text = readFileSync(path, "utf8")
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === "ENOENT") return { ok: false, reason: "missing" }
        return { ok: false, reason: "unreadable" }
    }
    try {
        return { ok: true, data: JSON.parse(text) as T }
    } catch {
        return { ok: false, reason: "unreadable" }
    }
}
