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
import { join, dirname } from "path"
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

const CLONE_TIMEOUT = 60000

export function catalog(): CatalogEntry[] {
    return SKILLS_CATALOG
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
            const files = paths.filter((p) => p === (dir ? dir + "/SKILL.md" : "SKILL.md") || (dir && p.startsWith(dir + "/")))
            items.push({
                kind: "skill",
                name: fm.name || (dir.split("/").pop() ?? "skill"),
                description: fm.description ?? "",
                sourcePath: dir,
                files,
                content
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
                content
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
    const tmp = mkdtempSync(join(tmpdir(), "devdeck-skill-"))
    try {
        await clone(repo, ref, tmp)
        const dest = targetPath(scope, item.kind, item.name, { home: homedir(), projectPath })
        mkdirSync(dirname(dest), { recursive: true })
        const src = join(tmp, item.sourcePath)
        if (item.kind === "skill") {
            rmSync(dest, { recursive: true, force: true })
            cpSync(src, dest, { recursive: true })
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

export function remove(item: InstalledItem): void {
    const norm = item.path.replace(/\\/g, "/")
    if (!/\/\.claude\/(skills|agents)\//.test(norm + "/")) {
        throw new Error("refusing to remove path outside .claude/skills|agents")
    }
    rmSync(item.path, { recursive: true, force: true })
}
