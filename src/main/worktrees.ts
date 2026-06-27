import { execFile } from "child_process"
import { basename, dirname, join } from "path"

/**
 * Git worktree management for agent-per-worktree workflows. Each agent can run
 * in its own worktree (separate dir + branch) so parallel agents on one repo
 * don't trample each other. Worktrees live in a sibling `<name>.worktrees/`
 * folder so they're never nested inside the main working tree.
 */

const OPTS = { timeout: 8000, windowsHide: true } as const

export interface Worktree {
    path: string
    branch: string
    head: string
    /** True for the repo's primary working tree (not removable). */
    main: boolean
}

/** Where this repo's managed worktrees live (a sibling directory). */
export function worktreeBase(repoPath: string): string {
    return join(dirname(repoPath), basename(repoPath) + ".worktrees")
}

/** Sanitize a user branch name into something git + the filesystem accept. */
export function safeBranch(name: string): string {
    return (
        name
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^\w./-]/g, "")
            .replace(/^[-/.]+/, "")
            .replace(/\.lock$/i, "")
            .slice(0, 80) || "agent-work"
    )
}

/** Parse `git worktree list --porcelain` output. Pure. */
export function parseWorktreeList(porcelain: string): Worktree[] {
    const out: Worktree[] = []
    let cur: Partial<Worktree> = {}
    const flush = (): void => {
        if (cur.path) out.push({ path: cur.path, branch: cur.branch ?? "", head: cur.head ?? "", main: false })
        cur = {}
    }
    for (const raw of porcelain.split("\n")) {
        const line = raw.trim()
        if (line.startsWith("worktree ")) {
            flush()
            cur.path = line.slice("worktree ".length)
        } else if (line.startsWith("HEAD ")) {
            cur.head = line.slice("HEAD ".length).slice(0, 8)
        } else if (line.startsWith("branch ")) {
            cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "")
        } else if (line === "detached") {
            cur.branch = "(detached)"
        }
    }
    flush()
    if (out.length) out[0].main = true
    return out
}

function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        execFile("git", args, { cwd, ...OPTS }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" })
        })
    })
}

export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
    const r = await git(repoPath, ["worktree", "list", "--porcelain"])
    if (!r.ok) return []
    return parseWorktreeList(r.stdout)
}

/** Create a worktree on a new branch (or check out an existing branch). */
export async function addWorktree(
    repoPath: string,
    rawBranch: string,
    base?: string
): Promise<{ ok: boolean; path?: string; branch?: string; error?: string }> {
    const branch = safeBranch(rawBranch)
    const path = join(worktreeBase(repoPath), branch)
    // Does the branch already exist?
    const exists = await git(repoPath, ["rev-parse", "--verify", "--quiet", "refs/heads/" + branch])
    const args = exists.ok
        ? ["worktree", "add", path, branch]
        : ["worktree", "add", path, "-b", branch, ...(base ? [base] : [])]
    const r = await git(repoPath, args)
    if (!r.ok) return { ok: false, error: r.stderr.trim() || "git worktree add failed" }
    return { ok: true, path, branch }
}

export async function removeWorktree(
    repoPath: string,
    worktreePath: string,
    deleteBranch?: string
): Promise<{ ok: boolean; error?: string }> {
    const r = await git(repoPath, ["worktree", "remove", worktreePath, "--force"])
    if (!r.ok) return { ok: false, error: r.stderr.trim() || "git worktree remove failed" }
    if (deleteBranch) await git(repoPath, ["branch", "-D", safeBranch(deleteBranch)])
    return { ok: true }
}
