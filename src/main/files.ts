import { readdirSync, readFileSync, writeFileSync, statSync, type Dirent } from "fs"
import { join, resolve, sep } from "path"

/** True if `target` resolves to a path inside one of the allowed roots. */
export function isWithinRoots(target: string, roots: string[]): boolean {
    const norm = (p: string): string => {
        const r = resolve(p)
        return process.platform === "win32" ? r.toLowerCase() : r
    }
    const t = norm(target)
    return roots.some((root) => {
        const r = norm(root)
        return t === r || t.startsWith(r + sep)
    })
}

export interface DirEntry {
    name: string
    path: string
    isDir: boolean
}

// Directories we never want to expand in the file tree — too large / noisy.
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

export function readFileText(path: string): string {
    const size = statSync(path).size
    if (size > MAX_BYTES) {
        throw new Error(`File too large to open (${Math.round(size / 1024)} KB).`)
    }
    const buf = readFileSync(path)
    // Refuse binary files — opening them as text would corrupt them on save.
    if (buf.subarray(0, 8000).includes(0)) {
        throw new Error("Binary file — not opened in the text editor.")
    }
    return buf.toString("utf8")
}

export function writeFileText(path: string, content: string): void {
    writeFileSync(path, content, "utf8")
}
