import { execFile } from "child_process"
import { join } from "path"
import { rm } from "fs/promises"

/**
 * Git change review — list a repo's pending changes and let the user stage,
 * unstage, discard, or commit them. This is post-hoc review (agents write files
 * directly; we review what landed), surfaced in one place across worktrees.
 */

const OPTS = { timeout: 8000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 } as const

export interface ChangeFile {
    path: string
    /** Two-letter porcelain code, e.g. " M", "A ", "??". */
    code: string
    staged: boolean
    untracked: boolean
    label: string // human status: Modified / Added / Deleted / Untracked / Renamed
}

function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        execFile("git", args, { cwd, ...OPTS }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" })
        })
    })
}

function labelFor(code: string): string {
    if (code === "??") return "Untracked"
    const x = code[0]
    const y = code[1]
    const c = x !== " " && x !== "?" ? x : y
    switch (c) {
        case "M":
            return "Modified"
        case "A":
            return "Added"
        case "D":
            return "Deleted"
        case "R":
            return "Renamed"
        case "C":
            return "Copied"
        default:
            return "Changed"
    }
}

/** Parse `git status --porcelain=v1` into change entries. Pure. */
export function parseStatus(porcelain: string): ChangeFile[] {
    const out: ChangeFile[] = []
    for (const line of porcelain.split("\n")) {
        if (line.length < 4) continue
        const code = line.slice(0, 2)
        let path = line.slice(3)
        // Renames look like "old -> new"; keep the new path.
        const arrow = path.indexOf(" -> ")
        if (arrow > -1) path = path.slice(arrow + 4)
        path = path.replace(/^"(.*)"$/, "$1")
        const untracked = code === "??"
        const staged = !untracked && code[0] !== " " && code[0] !== "?"
        out.push({ path, code, staged, untracked, label: labelFor(code) })
    }
    return out
}

export async function listChanges(cwd: string): Promise<ChangeFile[]> {
    const r = await git(cwd, ["status", "--porcelain=v1", "-z"])
    if (!r.ok) return []
    // -z separates entries with NUL and never quotes paths.
    const parts = r.stdout.split("\0").filter(Boolean)
    const out: ChangeFile[] = []
    for (let i = 0; i < parts.length; i++) {
        const entry = parts[i]
        if (entry.length < 3) continue
        const code = entry.slice(0, 2)
        let path = entry.slice(3)
        // A rename consumes the following NUL field (the old path).
        if (code[0] === "R" || code[1] === "R") i++
        const untracked = code === "??"
        const staged = !untracked && code[0] !== " " && code[0] !== "?"
        out.push({ path, code, staged, untracked, label: labelFor(code) })
    }
    return out
}

/** Unified diff for one file (staged or working-tree). Untracked → show content as additions. */
export async function fileDiff(cwd: string, path: string, opts: { staged: boolean; untracked: boolean }): Promise<string> {
    if (opts.untracked) {
        const r = await git(cwd, ["diff", "--no-index", "--", "/dev/null", path])
        return r.stdout || "" // --no-index exits non-zero by design when differing
    }
    const args = opts.staged ? ["diff", "--staged", "--", path] : ["diff", "--", path]
    const r = await git(cwd, args)
    return r.stdout
}

export async function stageFile(cwd: string, path: string): Promise<boolean> {
    return (await git(cwd, ["add", "--", path])).ok
}

export async function unstageFile(cwd: string, path: string): Promise<boolean> {
    return (await git(cwd, ["restore", "--staged", "--", path])).ok
}

/** Discard a file's changes: revert tracked files, delete untracked ones. */
export async function discardFile(cwd: string, path: string, untracked: boolean): Promise<boolean> {
    if (untracked) {
        try {
            await rm(join(cwd, path), { force: true })
            return true
        } catch {
            return false
        }
    }
    // Unstage then restore working tree to HEAD.
    await git(cwd, ["restore", "--staged", "--", path])
    return (await git(cwd, ["restore", "--", path])).ok
}

/** Combined diff of all tracked changes vs HEAD, capped for feeding to an agent. */
export async function fullDiff(cwd: string, maxChars = 14000): Promise<string> {
    const r = await git(cwd, ["diff", "HEAD"])
    const out = r.stdout
    if (out.length <= maxChars) return out
    return out.slice(0, maxChars) + "\n\n…[diff truncated]"
}

export async function commitAll(cwd: string, message: string): Promise<{ ok: boolean; error?: string }> {
    const add = await git(cwd, ["add", "-A"])
    if (!add.ok) return { ok: false, error: add.stderr.trim() }
    const r = await git(cwd, ["commit", "-m", message])
    return r.ok ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}
