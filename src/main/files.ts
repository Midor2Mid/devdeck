import { readdirSync, readFileSync, realpathSync, statSync, type Dirent } from "fs"
import { basename, dirname, join, resolve, sep } from "path"
import { CHANGED_ON_DISK } from "../shared/fsErrors"
import { atomicWrite } from "./atomic"

function norm(p: string): string {
    const r = resolve(p)
    return process.platform === "win32" ? r.toLowerCase() : r
}

/**
 * `resolve()` plus a real dereference of every link on the way.
 *
 * `resolve()` only collapses `..` textually, so it answers a question about a
 * *string* while the caller is asking a question about a *file*. A junction or
 * symlink inside an open project pointing at `C:\Users\me\.ssh` resolved to a
 * path that starts with the project root and was therefore "inside" it -
 * and on Windows, which is what this app targets first, creating a directory
 * junction needs no elevation at all.
 *
 * The subtlety: `fs:write` legitimately names a file that does not exist yet,
 * and `realpathSync` throws on a missing path. So walk up to the deepest
 * ancestor that DOES exist, dereference that, and re-attach the segments below
 * it textually - a link anywhere along the existing part is still resolved,
 * and only the not-yet-created tail is taken at face value (it has no link to
 * hide behind). If nothing on the path exists at all, fall back to the plain
 * textual resolve. That fallback is written out here on purpose rather than
 * being a bare `catch {}`: "we could not check" must be a decision someone can
 * read, not an accident.
 */
function realNorm(p: string): string {
    const full = resolve(p)
    let head = full
    const tail: string[] = []
    for (;;) {
        try {
            const real = realpathSync(head)
            return norm(tail.length ? join(real, ...[...tail].reverse()) : real)
        } catch {
            const parent = dirname(head)
            if (parent === head) return norm(full)
            tail.push(basename(head))
            head = parent
        }
    }
}

/**
 * True if `target` resolves to a path inside one of the allowed roots.
 *
 * Both sides go through `realNorm`, not just the target: a project root that is
 * itself reached through a junction (a `D:\work` shortcut to `C:\src`, a synced
 * folder) would otherwise start rejecting every file inside it the moment the
 * target got dereferenced and the root did not.
 */
export function isWithinRoots(target: string, roots: string[]): boolean {
    // Typed as a string, but every caller is one hop from an untyped IPC
    // payload. Without this, a renderer sending an object gets a TypeError out
    // of path.resolve - which still fails closed, but reaches the user as
    // "paths[0] must be of type string" instead of an answer about the path.
    if (typeof target !== "string" || !target) return false
    const t = realNorm(target)
    return roots.some((root) => {
        if (typeof root !== "string" || !root) return false
        const r = realNorm(root)
        return t === r || t.startsWith(r + sep)
    })
}

export interface DirEntry {
    name: string
    path: string
    isDir: boolean
}

// Directories we never want to expand in the file tree - too large / noisy.
const IGNORE = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "out",
    ".cache",
    ".turbo",
    "__pycache__",
    ".venv"
])

export function readDir(dir: string): DirEntry[] {
    const entries = readdirSync(dir, { withFileTypes: true })
    const out: DirEntry[] = entries
        .filter((e) => !IGNORE.has(e.name))
        .map((e) => ({
            name: e.name,
            path: join(dir, e.name),
            isDir: e.isDirectory()
        }))
    // Directories first, then alphabetical.
    out.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
    })
    return out
}

// Guard against opening huge / binary files in the lightweight editor.
const MAX_BYTES = 2 * 1024 * 1024

// Flat list of project-relative file paths (forward slashes) for @-mention
// autocomplete. Skips IGNORE dirs and caps the count to stay responsive.
export function allFiles(root: string, max = 4000): string[] {
    const out: string[] = []
    const walk = (dir: string, rel: string): void => {
        if (out.length >= max) return
        let entries: Dirent[]
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const e of entries) {
            if (IGNORE.has(e.name)) continue
            const childRel = rel ? rel + "/" + e.name : e.name
            if (e.isDirectory()) walk(join(dir, e.name), childRel)
            else {
                out.push(childRel)
                if (out.length >= max) return
            }
        }
    }
    walk(root, "")
    return out
}

/**
 * Read a text file along with the version it was read at.
 *
 * The `mtimeMs` is not extra work - the `statSync` below already ran for the
 * size check, and throwing its result away is what let the editor hold a string
 * with no idea which version of the file it came from. This app's whole premise
 * is agents editing your files while you watch, so the version has to travel
 * with the content.
 */
export function readFileText(path: string): { content: string; mtimeMs: number } {
    const st = statSync(path)
    if (st.size > MAX_BYTES) {
        throw new Error(`File too large to open (${Math.round(st.size / 1024)} KB).`)
    }
    const buf = readFileSync(path)
    // Refuse binary files - opening them as text would corrupt them on save.
    if (buf.subarray(0, 8000).includes(0)) {
        throw new Error("Binary file - not opened in the text editor.")
    }
    return { content: buf.toString("utf8"), mtimeMs: st.mtimeMs }
}

/**
 * Write a text file, refusing when it has changed since `baseMtimeMs`.
 *
 * Pass `0` to create a new file or to force an overwrite the user has explicitly
 * confirmed. The comparison is on mtime only, never content: a formatter or a
 * `git checkout` rewriting identical bytes must not make the editor unusable,
 * and the caller always gets an Overwrite path out.
 */
export function writeFileText(path: string, content: string, baseMtimeMs = 0): void {
    if (baseMtimeMs) {
        let current: number | null = null
        try {
            current = statSync(path).mtimeMs
        } catch {
            current = null // gone - treat as a create rather than blocking the save
        }
        if (current !== null && current !== baseMtimeMs) {
            throw new Error(CHANGED_ON_DISK)
        }
    }
    // Through atomicWrite, like every bookkeeping file. The doctrine used to be
    // inverted: workspace.json got the crash-safe write and the user's source
    // code got a bare writeFileSync, so an interrupted save truncated the file
    // being edited while an interrupted layout save did not.
    atomicWrite(path, content)
}
