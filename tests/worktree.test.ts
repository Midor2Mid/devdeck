import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, lstatSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, basename } from "node:path"
import {
    treesDir,
    branchFor,
    worktreePath,
    linkKind,
    addWorktree,
    removeWorktree,
    parseArgs
} from "../scripts/worktree.mjs"

describe("paths and names", () => {
    it("puts worktrees in a sibling folder named after the repo", () => {
        expect(treesDir("D:/work/devdeck")).toBe(join("D:/work", "devdeck-trees"))
    })

    it("prefixes branches with wt/", () => {
        expect(branchFor("api-polish")).toBe("wt/api-polish")
    })

    it("names the worktree folder after the session", () => {
        expect(worktreePath("D:/work/devdeck", "api-polish")).toBe(
            join("D:/work", "devdeck-trees", "api-polish")
        )
    })
})

describe("parseArgs", () => {
    it("defaults to list", () => {
        expect(parseArgs([])).toEqual({ command: "list" })
    })

    it("reads a command and a name", () => {
        expect(parseArgs(["new", "api-polish"])).toEqual({ command: "new", name: "api-polish" })
    })

    it("refuses new and remove without a name", () => {
        expect(parseArgs(["new"]).error).toMatch(/name/)
        expect(parseArgs(["remove"]).error).toMatch(/name/)
    })

    it("names an unknown command instead of silently listing", () => {
        expect(parseArgs(["frobnicate"]).error).toMatch(/frobnicate/)
    })

    // A name that would escape the trees directory, or collide with a git ref
    // separator, is refused rather than passed to git.
    it("refuses a name containing a path separator", () => {
        expect(parseArgs(["new", "../evil"]).error).toMatch(/name/i)
        expect(parseArgs(["new", "a/b"]).error).toMatch(/name/i)
    })
})

describe("against a real repo", () => {
    let repo: string
    const git = (args: string[], cwd: string) =>
        spawnSync("git", args, { cwd, encoding: "utf8" })

    beforeEach(() => {
        // A repo inside its own temp parent, so the sibling trees dir lands in the
        // temp area rather than beside the real checkout.
        const parent = mkdtempSync(join(tmpdir(), "wt-"))
        repo = join(parent, "sample")
        mkdirSync(repo)
        git(["init", "--quiet", "-b", "main"], repo)
        git(["config", "user.email", "t@t"], repo)
        git(["config", "user.name", "t"], repo)
        writeFileSync(join(repo, "README.md"), "sample\n")
        git(["add", "-A"], repo)
        git(["commit", "-qm", "init"], repo)
    })

    afterEach(() => {
        try {
            rmSync(join(repo, ".."), { recursive: true, force: true })
        } catch {
            /* windows can hold a handle briefly; a temp dir left behind is harmless */
        }
    })

    it("creates the worktree on its own branch", () => {
        const r = addWorktree(repo, "feature-a")
        expect(r.ok).toBe(true)
        const path = worktreePath(repo, "feature-a")
        expect(existsSync(join(path, "README.md"))).toBe(true)
        const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], path).stdout.trim()
        expect(branch).toBe("wt/feature-a")
    })

    it("links node_modules from the main checkout so the worktree can build", () => {
        mkdirSync(join(repo, "node_modules"))
        writeFileSync(join(repo, "node_modules", "marker.txt"), "shared\n")

        const r = addWorktree(repo, "feature-b")
        expect(r.ok).toBe(true)
        const linked = join(worktreePath(repo, "feature-b"), "node_modules")
        expect(lstatSync(linked).isSymbolicLink()).toBe(true)
        // Reachable through the link: that is the whole point of sharing it.
        expect(existsSync(join(linked, "marker.txt"))).toBe(true)
    })

    it("does not invent a link when the main checkout has no node_modules", () => {
        const r = addWorktree(repo, "feature-c")
        expect(r.ok).toBe(true)
        expect(existsSync(join(worktreePath(repo, "feature-c"), "node_modules"))).toBe(false)
    })

    it("refuses to reuse a name that already has a worktree", () => {
        expect(addWorktree(repo, "dup").ok).toBe(true)
        const again = addWorktree(repo, "dup")
        expect(again.ok).toBe(false)
        expect(again.detail).toMatch(/exists|already/i)
    })

    it("removes the worktree and leaves the shared node_modules intact", () => {
        mkdirSync(join(repo, "node_modules"))
        writeFileSync(join(repo, "node_modules", "marker.txt"), "shared\n")
        addWorktree(repo, "feature-d")

        const r = removeWorktree(repo, "feature-d")
        expect(r.ok).toBe(true)
        expect(existsSync(worktreePath(repo, "feature-d"))).toBe(false)
        // The failure this guards: deleting through the link would empty the
        // main checkout's dependency tree.
        expect(existsSync(join(repo, "node_modules", "marker.txt"))).toBe(true)
    })

    // The case that broke the PowerShell version: a worktree with its OWN
    // dependency tree (a toolchain branch pinning a different Electron) has a real
    // directory there, and deleting it as if it were a link throws.
    it("removes a worktree whose node_modules is a real directory", () => {
        addWorktree(repo, "feature-e")
        const own = join(worktreePath(repo, "feature-e"), "node_modules")
        mkdirSync(own)
        writeFileSync(join(own, "own.txt"), "not shared\n")

        const r = removeWorktree(repo, "feature-e")
        expect(r.ok).toBe(true)
        expect(existsSync(worktreePath(repo, "feature-e"))).toBe(false)
    })

    it("says so when asked to remove a worktree that is not there", () => {
        const r = removeWorktree(repo, "never-existed")
        expect(r.ok).toBe(false)
        expect(r.detail).toMatch(/no worktree/i)
    })

    it("keeps the branch after removing the worktree", () => {
        addWorktree(repo, "feature-f")
        removeWorktree(repo, "feature-f")
        const branches = git(["branch", "--list", "wt/feature-f"], repo).stdout
        expect(branches).toMatch(/wt\/feature-f/)
    })
})

describe("linkKind", () => {
    let dir: string
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "linkkind-"))
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it("reports a missing path", () => {
        expect(linkKind(join(dir, "nope"))).toBe("missing")
    })

    it("reports a real directory", () => {
        mkdirSync(join(dir, "real"))
        expect(linkKind(join(dir, "real"))).toBe("dir")
    })

    it("reports a link", () => {
        const target = join(dir, "target")
        mkdirSync(target)
        const link = join(dir, "link")
        // Junction on Windows, dir symlink elsewhere - the same call the script makes.
        const { symlinkSync } = require("node:fs") as typeof import("node:fs")
        symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir")
        expect(linkKind(link)).toBe("link")
    })
})

// basename is imported for the treesDir contract; keep the reference honest.
describe("contract", () => {
    it("derives the trees folder from the repo folder name", () => {
        const repoRoot = "C:/x/my-app"
        expect(basename(treesDir(repoRoot))).toBe("my-app-trees")
    })
})
