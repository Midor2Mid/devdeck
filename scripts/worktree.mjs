#!/usr/bin/env node
/**
 * Parallel-session worktrees, in Node so it is testable.
 *
 * Each concurrent Claude Code (or human) session works in its OWN git worktree -
 * a separate folder on its own branch, backed by the same repo - so edits and
 * `git add -A` in one session never collide with another.
 *
 * Node rather than PowerShell for one reason: this is verifiable. The PowerShell
 * version could not be run or even parsed by an agent session on this machine, so
 * its bugs were found by hitting them. `tests/worktree.test.ts` drives this one
 * against a real throwaway repo, including the two cases that actually broke:
 * git reporting success on stderr, and a worktree holding its own node_modules
 * rather than a link to the shared one.
 *
 * Usage:
 *   node scripts/worktree.mjs new    <name>   # ../<repo>-trees/<name> on wt/<name>
 *   node scripts/worktree.mjs list
 *   node scripts/worktree.mjs remove <name>   # removes the folder, keeps the branch
 *
 * Exit: 0 = done - 1 = failed - 2 = usage error. Zero dependencies.
 */
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import { dirname, join, basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** Worktrees live beside the checkout, in a sibling folder named after it. */
export function treesDir(repoRoot) {
    return join(dirname(repoRoot), `${basename(repoRoot)}-trees`)
}

export function branchFor(name) {
    return `wt/${name}`
}

export function worktreePath(repoRoot, name) {
    return join(treesDir(repoRoot), name)
}

/**
 * What sits at a path: "link", "dir", or "missing".
 *
 * The distinction is load-bearing on removal. A link to the main checkout's
 * node_modules must be unlinked BEFORE the folder goes, or the removal walks into
 * the shared dependency tree; a real directory must NOT be treated as a link,
 * which is what broke the PowerShell version on a worktree that had its own.
 */
export function linkKind(p) {
    try {
        return lstatSync(p).isSymbolicLink() ? "link" : "dir"
    } catch {
        return "missing"
    }
}

/** Run git and report by EXIT CODE. git writes progress to stderr on success. */
function git(args, cwd) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" })
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim()
    return { ok: r.status === 0, code: r.status, out }
}

/** Name a session, not a path: anything that could escape the trees dir is refused. */
function badName(name) {
    return !name || /[\/:*?"<>|]/.test(name) || name === "." || name === ".."
}

export function parseArgs(argv) {
    const [command = "list", name] = argv
    if (!["new", "list", "remove"].includes(command)) {
        return { command, error: `unknown command '${command}'. Use: new <name> | list | remove <name>` }
    }
    if (command === "list") return { command }
    if (badName(name)) {
        return { command, name, error: `${command} needs a plain <name> (no slashes or drive letters)` }
    }
    return { command, name }
}

export function addWorktree(repoRoot, name) {
    const path = worktreePath(repoRoot, name)
    if (existsSync(path)) return { ok: false, detail: `${path} already exists` }
    mkdirSync(treesDir(repoRoot), { recursive: true })

    const add = git(["worktree", "add", "-b", branchFor(name), path], repoRoot)
    if (!add.ok) return { ok: false, detail: add.out || `git worktree add exited ${add.code}` }

    // Share node_modules so the worktree builds without a reinstall. A junction on
    // Windows: it needs no elevation, unlike a symlink.
    const src = join(repoRoot, "node_modules")
    const dst = join(path, "node_modules")
    let linked = false
    if (existsSync(src) && linkKind(dst) === "missing") {
        symlinkSync(src, dst, process.platform === "win32" ? "junction" : "dir")
        linked = true
    }
    return { ok: true, path, branch: branchFor(name), linked }
}

export function removeWorktree(repoRoot, name) {
    const path = worktreePath(repoRoot, name)
    if (!existsSync(path)) return { ok: false, detail: `no worktree at ${path}` }

    // Unlink first, so neither git nor the filesystem walks into the shared tree.
    // Only when it IS a link - a real directory belongs to this worktree and goes
    // with it.
    const dst = join(path, "node_modules")
    const kind = linkKind(dst)
    if (kind === "link") rmSync(dst, { recursive: false, force: true })

    const rm = git(["worktree", "remove", path, "--force"], repoRoot)
    if (!rm.ok) return { ok: false, detail: rm.out || `git worktree remove exited ${rm.code}` }
    return { ok: true, path, unlinked: kind === "link", ownModules: kind === "dir" }
}

function main(argv) {
    const repo = git(["rev-parse", "--show-toplevel"], process.cwd())
    if (!repo.ok) {
        console.error("not inside a git repository")
        return 1
    }
    const repoRoot = resolve(repo.out)
    const { command, name, error } = parseArgs(argv)
    if (error) {
        console.error(error)
        return 2
    }

    if (command === "list") {
        console.log(git(["worktree", "list"], repoRoot).out)
        return 0
    }

    if (command === "new") {
        const r = addWorktree(repoRoot, name)
        if (!r.ok) {
            console.error(r.detail)
            return 1
        }
        if (r.linked) console.log("Linked node_modules from the main checkout.")
        console.log("")
        console.log("Worktree ready:")
        console.log(`  folder: ${r.path}`)
        console.log(`  branch: ${r.branch}`)
        console.log("Open a session in that folder. When done:")
        console.log(`  git push -u origin ${r.branch}   (then open a PR), or merge into main.`)
        return 0
    }

    const r = removeWorktree(repoRoot, name)
    if (!r.ok) {
        console.error(r.detail)
        return 1
    }
    if (r.unlinked) console.log("Unlinked the shared node_modules.")
    if (r.ownModules) console.log("That worktree had its own node_modules; it went with the folder.")
    console.log(`Removed ${r.path} (branch ${branchFor(name)} kept; delete with: git branch -d ${branchFor(name)})`)
    return 0
}

if (resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main(process.argv.slice(2)))
}
