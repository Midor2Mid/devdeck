import { execFile } from "child_process"
import {
    mkdtempSync,
    rmSync,
    existsSync,
    mkdirSync,
    cpSync,
    copyFileSync,
    readFileSync,
    readdirSync
} from "fs"
import { tmpdir, homedir } from "os"
import { join, dirname, resolve, sep } from "path"
import {
    discover,
    targetPath,
    parseFrontmatter,
    type DiscoveredItem,
    type InstalledItem,
    type ExtendScope,
    type ItemKind,
    type CatalogEntry
} from "./skillsCore"
import { SKILLS_CATALOG } from "./skillsCatalog"
import { isWithinRoots } from "./files"

const CLONE_TIMEOUT = 60000

export function catalog(): CatalogEntry[] {
    return SKILLS_CATALOG
}

/** Read a file as text for preview; null for binary or oversized (>64 KiB) files. */
function readTextCapped(abs: string): string | null {
    try {
        const buf = readFileSync(abs)
        if (buf.length > 64 * 1024 || buf.includes(0)) return null
        return buf.toString("utf8")
    } catch {
        return null
    }
}

function repoUrl(repo: string): string {
    return /^https?:\/\//.test(repo) ? repo : `https://github.com/${repo}.git`
}

function clone(repo: string, ref: string | undefined, dest: string): Promise<void> {
    const args = ["clone", "--depth", "1"]
    if (ref) args.push("--branch", ref)
    args.push(repoUrl(repo), dest)
    return new Promise((resolve, reject) => {
        execFile("git", args, { windowsHide: true, timeout: CLONE_TIMEOUT }, (err) => {
            if (err) reject(new Error("git clone failed: " + err.message))
            else resolve()
        })
    })
}

/** Recursively list repo-relative POSIX file paths under root (skips .git/node_modules). */
function walk(root: string, rel = ""): string[] {
    const out: string[] = []
    for (const entry of readdirSync(rel ? join(root, rel) : root, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules") continue
        const r = rel ? rel + "/" + entry.name : entry.name
        if (entry.isDirectory()) out.push(...walk(root, r))
        else out.push(r)
    }
    return out
}

export async function preview(repo: string, ref?: string): Promise<DiscoveredItem[]> {
    const tmp = mkdtempSync(join(tmpdir(), "devdeck-skill-"))
    try {
        await clone(repo, ref, tmp)
        const paths = walk(tmp)
        const { skills, agents } = discover(paths)
        const items: DiscoveredItem[] = []
        for (const dir of skills) {
            const content = readFileSync(join(tmp, dir, "SKILL.md"), "utf8")
            const fm = parseFrontmatter(content)
            const skillMdRel = dir ? dir + "/SKILL.md" : "SKILL.md"
            const files = paths.filter((p) => p === skillMdRel || (dir && p.startsWith(dir + "/")))
            const extraFiles = files
                .filter((f) => f !== skillMdRel)
                .map((f) => ({ path: f, text: readTextCapped(join(tmp, f)) }))
            items.push({
                kind: "skill",
                name: fm.name || (dir.split("/").pop() ?? "skill"),
                description: fm.description ?? "",
                sourcePath: dir,
                files,
                content,
                extraFiles
            })
        }
        for (const file of agents) {
            const content = readFileSync(join(tmp, file), "utf8")
            const fm = parseFrontmatter(content)
            items.push({
                kind: "agent",
                name: fm.name || (file.split("/").pop() as string).replace(/\.md$/, ""),
                description: fm.description ?? "",
                sourcePath: file,
                files: [file],
                content,
                extraFiles: []
            })
        }
        return items
    } finally {
        rmSync(tmp, { recursive: true, force: true })
    }
}

export async function install(
    repo: string,
    ref: string | undefined,
    item: { kind: ItemKind; name: string; sourcePath: string },
    scope: ExtendScope,
    projectPath: string
): Promise<InstalledItem> {
    // Reject names that could escape the target directory or hide as dotfiles.
    if (!item.name || /[\\/]|\.\./.test(item.name) || item.name.startsWith(".")) {
        throw new Error("invalid item name")
    }
    const tmp = mkdtempSync(join(tmpdir(), "devdeck-skill-"))
    try {
        await clone(repo, ref, tmp)
        const dest = targetPath(scope, item.kind, item.name, { home: homedir(), projectPath })
        mkdirSync(dirname(dest), { recursive: true })
        const src = join(tmp, item.sourcePath)
        // The source must stay inside the cloned temp dir (no .. traversal).
        const base = resolve(tmp)
        const srcResolved = resolve(src)
        if (srcResolved !== base && !srcResolved.startsWith(base + sep)) {
            throw new Error("invalid source path")
        }
        if (item.kind === "skill") {
            rmSync(dest, { recursive: true, force: true })
            // Skip .git/node_modules so a root-level skill doesn't drag the whole repo along.
            cpSync(src, dest, {
                recursive: true,
                filter: (s) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(s)
            })
        } else {
            copyFileSync(src, dest)
        }
        return { kind: item.kind, name: item.name, scope, path: dest }
    } finally {
        rmSync(tmp, { recursive: true, force: true })
    }
}

function scanScope(root: string, scope: ExtendScope): InstalledItem[] {
    const items: InstalledItem[] = []
    const skillsDir = join(root, ".claude", "skills")
    if (existsSync(skillsDir)) {
        for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
            if (e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md"))) {
                items.push({ kind: "skill", name: e.name, scope, path: join(skillsDir, e.name) })
            }
        }
    }
    const agentsDir = join(root, ".claude", "agents")
    if (existsSync(agentsDir)) {
        for (const e of readdirSync(agentsDir, { withFileTypes: true })) {
            if (e.isFile() && e.name.endsWith(".md")) {
                items.push({ kind: "agent", name: e.name.replace(/\.md$/, ""), scope, path: join(agentsDir, e.name) })
            }
        }
    }
    return items
}

export function listInstalled(projectPath: string): { global: InstalledItem[]; project: InstalledItem[] } {
    return {
        global: scanScope(homedir(), "global"),
        project: projectPath ? scanScope(projectPath, "project") : []
    }
}

/**
 * Uninstall one skill or agent.
 *
 * The guard is a **root**, not a regex. The old one tested an unanchored,
 * root-agnostic pattern against the resolved path, so
 * `D:/OtherProduct/.claude/agents/x` and `C:/Users/Someone/.claude/skills/y`
 * both passed it - in front of a recursive `rmSync`. It did not need an
 * attacker to be dangerous: a bug in a path string was enough to delete a
 * directory outside every project.
 *
 * So the location is **rebuilt** from the scope's root with the same
 * `targetPath` that decided where the item was installed, and the caller's
 * `path` is treated as a claim to be checked against it rather than a place to
 * act on. `projectPath` arrives already guarded to a real project.
 */
export function remove(item: InstalledItem, projectPath: string): void {
    const root = item.scope === "global" ? homedir() : projectPath
    if (!root) throw new Error("refusing to remove: no root for this scope")
    if (!item.name || /[\/]/.test(item.name)) {
        throw new Error("refusing to remove: name is not a single leaf")
    }
    const dir = join(root, ".claude", item.kind === "skill" ? "skills" : "agents")
    const target = targetPath(item.scope, item.kind, item.name, { home: homedir(), projectPath })
    if (!isWithinRoots(target, [dir])) {
        throw new Error("refusing to remove path outside .claude/skills|agents")
    }
    if (resolve(item.path) !== resolve(target)) {
        throw new Error("refusing to remove a path that is not where this item lives")
    }
    rmSync(target, { recursive: true, force: true })
}
