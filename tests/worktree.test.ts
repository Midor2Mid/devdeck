import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, lstatSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, basename } from "node:path"
import { fileURLToPath } from "node:url"
import {
    treesDir,
    branchFor,
    worktreePath,
    linkKind,
    addWorktree,
    removeWorktree,
    parseArgs,
    sharedModules
} from "../scripts/worktree.mjs"

const git = (args: string[], cwd: string) => spawnSync("git", args, { cwd, encoding: "utf8" })

/** A throwaway repo inside its own temp parent, so the sibling trees dir lands in temp. */
function makeRepo(): string {
    const parent = mkdtempSync(join(tmpdir(), "wt-"))
    const repo = join(parent, "sample")
    mkdirSync(repo)
    git(["init", "--quiet", "-b", "main"], repo)
    git(["config", "user.email", "t@t"], repo)
    git(["config", "user.name", "t"], repo)
    writeFileSync(join(repo, "README.md"), "sample\n")
    git(["add", "-A"], repo)
    git(["commit", "-qm", "init"], repo)
    return repo
}

function cleanupRepo(repo: string): void {
    try {
        rmSync(join(repo, ".."), { recursive: true, force: true })
    } catch {
        /* windows can hold a handle briefly; a temp dir left behind is harmless */
    }
}

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

describe("sharedModules", () => {
    // Discovered, not configured: this helper is copied between products that keep
    // their dependencies in different places (root here, app/ in dev-cockpit,
    // guarded-ops-mcp/ in dev-ai-tools). A version that assumed one of those links
    // nothing at all in the others.
    let repo: string
    beforeEach(() => {
        repo = makeRepo()
    })
    afterEach(() => cleanupRepo(repo))

    it("finds nothing when nothing is installed", () => {
        expect(sharedModules(repo)).toEqual([])
    })

    it("finds a root install", () => {
        mkdirSync(join(repo, "node_modules"))
        expect(sharedModules(repo)).toEqual(["."])
    })

    it("finds a per-package install", () => {
        mkdirSync(join(repo, "app", "node_modules"), { recursive: true })
        expect(sharedModules(repo)).toEqual(["app"])
    })

    it("finds both, and ignores directories with nothing installed", () => {
        mkdirSync(join(repo, "node_modules"))
        mkdirSync(join(repo, "app", "node_modules"), { recursive: true })
        mkdirSync(join(repo, "docs"), { recursive: true })
        expect(sharedModules(repo).sort()).toEqual([".", "app"])
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

    beforeEach(() => {
        repo = makeRepo()
    })

    afterEach(() => cleanupRepo(repo))

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

    // Per package, not just the root. devdeck installs at the root today, so this
    // is the case that would silently not work if it ever grew a second package -
    // and it is how the other three copies of this helper already behave.
    it("links a package's node_modules, not only the root's", () => {
        writeFileSync(join(repo, ".gitignore"), "node_modules/\n")
        mkdirSync(join(repo, "app"))
        writeFileSync(join(repo, "app", "package.json"), '{ "name": "app" }\n')
        git(["add", "-A"], repo)
        git(["commit", "-qm", "add app"], repo)
        mkdirSync(join(repo, "app", "node_modules"))
        writeFileSync(join(repo, "app", "node_modules", "marker.txt"), "shared\n")

        const r = addWorktree(repo, "feature-pkg")
        expect(r.ok).toBe(true)
        expect(r.linked).toEqual(["app"])
        const linked = join(r.path as string, "app", "node_modules")
        expect(lstatSync(linked).isSymbolicLink()).toBe(true)
        expect(existsSync(join(linked, "marker.txt"))).toBe(true)
    })

    it("reports each place it linked, so nothing is claimed that did not happen", () => {
        mkdirSync(join(repo, "node_modules"))
        expect(addWorktree(repo, "feature-root").linked).toEqual(["."])
    })

    it("does not invent a link when the main checkout has no node_modules", () => {
        const r = addWorktree(repo, "feature-c")
        expect(r.ok).toBe(true)
        expect(existsSync(join(worktreePath(repo, "feature-c"), "node_modules"))).toBe(false)
    })

    // `remove` keeps the branch by design, so reusing a name is a normal thing to
    // try - and git answers it with "fatal: a branch named 'wt/x' already exists",
    // which is true and no help. Backported from the dev-ai-tools copy, where this
    // was hit within a minute of real use.
    it("explains an existing branch instead of passing through git's fatal", () => {
        expect(addWorktree(repo, "reused").ok).toBe(true)
        expect(removeWorktree(repo, "reused").ok).toBe(true)

        const again = addWorktree(repo, "reused")
        expect(again.ok).toBe(false)
        expect(again.detail).toMatch(/branch wt\/reused already exists/)
        expect(again.detail).toMatch(/git branch -d wt\/reused/)
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

// The helper addresses the repo root as "." internally. Printing that verbatim gave
// "shared dependencies linked: .", which reads as noise rather than as a place.
// Asserted at the CLI, because the string a person reads is what was wrong. The same
// assertion was watched failing against the three sibling copies before each was
// fixed, so it is known to catch the regression.
const SCRIPT = fileURLToPath(new URL("../scripts/worktree.mjs", import.meta.url))

describe("the CLI's own words", () => {
    let repo: string
    beforeEach(() => {
        repo = makeRepo()
    })
    afterEach(() => cleanupRepo(repo))

    it("names the repo root in words, not as a dot", () => {
        mkdirSync(join(repo, "node_modules"))
        const r = spawnSync(process.execPath, [SCRIPT, "new", "cli-root"], { cwd: repo, encoding: "utf8" })
        expect(r.status).toBe(0)
        expect(r.stdout).toMatch(/shared dependencies linked: the repo root/)
    })

    it("says plainly when there was nothing to share", () => {
        const r = spawnSync(process.execPath, [SCRIPT, "new", "cli-bare"], { cwd: repo, encoding: "utf8" })
        expect(r.status).toBe(0)
        expect(r.stdout).toMatch(/no installed dependencies to share/)
    })
})
