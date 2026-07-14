// Pure helpers + shared types for the Extend Agent catalog. No electron/fs/network —
// unit-tested in isolation. Paths are POSIX ("/"); Node fs accepts them on Windows too.

export type ExtendScope = "global" | "project"
export type ItemKind = "skill" | "agent"

export interface CatalogEntry {
    id: string
    name: string
    description: string
    repo: string
    ref?: string
    kinds: ItemKind[]
    vetted: true
}

export interface DiscoveredItem {
    kind: ItemKind
    name: string
    description: string
    sourcePath: string
    files: string[]
    content: string
}

export interface InstalledItem {
    kind: ItemKind
    name: string
    scope: ExtendScope
    path: string
}

/** Classify repo-relative paths into skill dirs (contain SKILL.md) and agent files (agents/*.md). */
export function discover(paths: string[]): { skills: string[]; agents: string[] } {
    const skills = new Set<string>()
    const agents = new Set<string>()
    for (const raw of paths) {
        const p = raw.replace(/\\/g, "/")
        if (p === ".git" || p.startsWith(".git/") || p.includes("/.git/") || p.includes("node_modules/")) continue
        const parts = p.split("/")
        const base = parts[parts.length - 1]
        if (base === "SKILL.md") {
            skills.add(parts.slice(0, -1).join("/"))
        } else if (base.endsWith(".md") && parts.length >= 2 && parts[parts.length - 2] === "agents") {
            agents.add(p)
        }
    }
    return { skills: [...skills].sort(), agents: [...agents].sort() }
}

/** Absolute install path for an item under the chosen scope. */
export function targetPath(
    scope: ExtendScope,
    kind: ItemKind,
    name: string,
    opts: { home: string; projectPath: string }
): string {
    const root = scope === "global" ? opts.home : opts.projectPath
    const sub = kind === "skill" ? "skills" : "agents"
    const leaf = kind === "skill" ? name : name.endsWith(".md") ? name : name + ".md"
    return [root.replace(/\/$/, ""), ".claude", sub, leaf].join("/")
}

/** Parse the leading --- YAML frontmatter block for name/description (no YAML dep). */
export function parseFrontmatter(md: string): { name?: string; description?: string } {
    const m = md.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) return {}
    const out: { name?: string; description?: string } = {}
    for (const line of m[1].split(/\r?\n/)) {
        const mm = line.match(/^(name|description)\s*:\s*(.*)$/)
        if (mm) {
            const v = mm[2].trim().replace(/^["']|["']$/g, "")
            if (mm[1] === "name") out.name = v
            else out.description = v
        }
    }
    return out
}
