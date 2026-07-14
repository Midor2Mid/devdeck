# Extend Agent — Skills & Subagents Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A finder + installer for Claude Code skills (`SKILL.md`) and subagents (`agents/*.md`) — browse a curated catalog or paste a GitHub repo, preview it, and install to global (`~/.claude`) or the active project (`.claude/`), in a new Extend Agent hub.

**Architecture:** A pure `skillsCore.ts` (discovery, path resolution, frontmatter) is consumed by `src/main/skills.ts`, which shells `git clone` to fetch and copies matched folders into the chosen scope. IPC + preload mirror the existing `mcp` module. The renderer adds an `ExtendAgentModal` hub with Skills | Agents tabs (MCP tab deferred). Shared types are duplicated into preload exactly like `McpServer`.

**Tech Stack:** Electron + React + TS + Zustand; `git` shelled via `execFile` (no new deps); vitest.

## Global Constraints

- Indentation 4 spaces; strings double-quoted.
- No new dependencies. Fetch uses the system `git` via `child_process.execFile` (pattern: `src/main/git.ts`), `{ windowsHide: true }`, with a timeout.
- Verify with `npx tsc --noEmit` (ignore the one pre-existing unrelated `EditorPanel.tsx` monaco error) and `npm test`. Do NOT run a renderer build (OOMs); build via `npx electron-vite build` only for the run-app feel-check.
- Do NOT touch the unrelated in-progress files: `src/renderer/src/components/TerminalPane.tsx`, `src/renderer/src/termClipboard.ts`, `tests/termClipboard.test.ts`. (`src/main/index.ts` and `src/preload/index.ts` are edited here — add only the lines the tasks specify.)
- Do NOT touch `src/renderer/src/components/SettingsModal.tsx` — the MCP tab is deferred.
- Format target is Claude Code `.claude/` only. Install paths: skills → `<root>/.claude/skills/<name>/`, agents → `<root>/.claude/agents/<name>.md`, where `<root>` is `os.homedir()` (global) or the project path (project).
- Security: install only ever writes files into a `.claude/skills|agents` tree; `remove` refuses any path not under a `.claude/(skills|agents)/` root; temp clone dirs are always deleted in a `finally`.
- Conventional commits (`feat:`); commit at the end of each task.

## File Structure

- **Create** `src/main/skillsCore.ts` — pure helpers + shared types (`discover`, `targetPath`, `parseFrontmatter`). No electron/fs.
- **Create** `tests/skillsCore.test.ts`.
- **Create** `src/main/skillsCatalog.ts` — static curated `CatalogEntry[]`.
- **Create** `src/main/skills.ts` — `catalog`/`preview`/`install`/`listInstalled`/`remove` (git + fs).
- **Create** `tests/skills.test.ts` — `listInstalled` (project side) + `remove`, against a temp `.claude` tree.
- **Modify** `src/main/index.ts` — `extend:*` IPC handlers.
- **Modify** `src/preload/index.ts` — duplicate the shared types + `extend` API.
- **Create** `src/renderer/src/components/ExtendAgentModal.tsx` — the hub.
- **Modify** `src/renderer/src/store.ts` — `extendOpen` state + `setExtendOpen`.
- **Modify** `src/renderer/src/App.tsx` — render the modal.
- **Modify** `src/renderer/src/components/CommandPalette.tsx` — "Extend agent…" command.
- **Modify** `src/renderer/src/styles.css` — hub styles.

---

### Task 1: Pure core + tests

**Files:**
- Create: `src/main/skillsCore.ts`
- Test: `tests/skillsCore.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: types `ExtendScope`, `ItemKind`, `CatalogEntry`, `DiscoveredItem`, `InstalledItem`; `discover(paths: string[]): { skills: string[]; agents: string[] }`; `targetPath(scope, kind, name, opts: { home: string; projectPath: string }): string`; `parseFrontmatter(md: string): { name?: string; description?: string }`.

- [ ] **Step 1: Write the failing test** — `tests/skillsCore.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { discover, targetPath, parseFrontmatter } from "../src/main/skillsCore"

describe("discover", () => {
    it("finds skill dirs by SKILL.md and agents by agents/*.md", () => {
        const r = discover([
            "skills/foo/SKILL.md",
            "skills/foo/AUDIT.md",
            "skills/bar/SKILL.md",
            "agents/reviewer.md",
            "README.md",
            ".git/config",
            "node_modules/x/SKILL.md"
        ])
        expect(r.skills).toEqual(["skills/bar", "skills/foo"])
        expect(r.agents).toEqual(["agents/reviewer.md"])
    })
    it("handles a top-level SKILL.md (dir = '')", () => {
        expect(discover(["SKILL.md"]).skills).toEqual([""])
    })
})

describe("targetPath", () => {
    const opts = { home: "/home/u", projectPath: "/proj" }
    it("global skill", () => {
        expect(targetPath("global", "skill", "foo", opts)).toBe("/home/u/.claude/skills/foo")
    })
    it("project skill", () => {
        expect(targetPath("project", "skill", "foo", opts)).toBe("/proj/.claude/skills/foo")
    })
    it("global agent adds .md once", () => {
        expect(targetPath("global", "agent", "rev", opts)).toBe("/home/u/.claude/agents/rev.md")
        expect(targetPath("global", "agent", "rev.md", opts)).toBe("/home/u/.claude/agents/rev.md")
    })
})

describe("parseFrontmatter", () => {
    it("reads name and description, stripping quotes", () => {
        expect(parseFrontmatter("---\nname: foo\ndescription: \"a b\"\n---\nbody")).toEqual({
            name: "foo",
            description: "a b"
        })
    })
    it("returns {} when no frontmatter", () => {
        expect(parseFrontmatter("# just markdown")).toEqual({})
    })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/skillsCore.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/main/skillsCore.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/skillsCore.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/skillsCore.ts tests/skillsCore.test.ts
git commit -m "feat(extend): pure skills-catalog core (discover, targetPath, frontmatter)"
```

---

### Task 2: Main backend + catalog + IPC + preload + tests

**Files:**
- Create: `src/main/skillsCatalog.ts`, `src/main/skills.ts`, `tests/skills.test.ts`
- Modify: `src/main/index.ts` (IPC), `src/preload/index.ts` (types + API)

**Interfaces:**
- Consumes: everything from `skillsCore.ts` (Task 1).
- Produces: `catalog()`, `preview(repo, ref?)`, `install(repo, ref, item, scope, projectPath)`, `listInstalled(projectPath)`, `remove(item)` in main; `window.api.extend.{catalog,preview,install,list,remove}` in preload; the 5 shared types duplicated in `preload/index.ts`.

- [ ] **Step 1: Curated catalog** — `src/main/skillsCatalog.ts`:

```ts
import type { CatalogEntry } from "./skillsCore"

// Curated, vetted sources. Browsing this list needs no network.
export const SKILLS_CATALOG: CatalogEntry[] = [
    {
        id: "emilkowalski-skills",
        name: "Design Engineering skills (Emil Kowalski)",
        description: "Animation & interface-design skills: emil-design-eng, apple-design, review/improve-animations, animation-vocabulary.",
        repo: "emilkowalski/skills",
        kinds: ["skill"],
        vetted: true
    }
]
```

- [ ] **Step 2: Write the failing test** — `tests/skills.test.ts` (mock electron like `tests/projects.test.ts`):

```ts
import { describe, it, expect, vi } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() } }))

import { listInstalled, remove } from "../src/main/skills"

function seed(): string {
    const proj = mkdtempSync(join(tmpdir(), "ext-proj-"))
    mkdirSync(join(proj, ".claude", "skills", "foo"), { recursive: true })
    writeFileSync(join(proj, ".claude", "skills", "foo", "SKILL.md"), "---\nname: foo\n---\n")
    mkdirSync(join(proj, ".claude", "agents"), { recursive: true })
    writeFileSync(join(proj, ".claude", "agents", "rev.md"), "---\nname: rev\n---\n")
    return proj
}

describe("listInstalled (project side)", () => {
    it("lists installed skills and agents in a project", () => {
        const proj = seed()
        const { project } = listInstalled(proj)
        expect(project.find((i) => i.kind === "skill" && i.name === "foo")).toBeTruthy()
        expect(project.find((i) => i.kind === "agent" && i.name === "rev")).toBeTruthy()
    })
})

describe("remove", () => {
    it("deletes an installed item under a .claude root", () => {
        const proj = seed()
        const item = listInstalled(proj).project.find((i) => i.name === "foo")!
        remove(item)
        expect(existsSync(join(proj, ".claude", "skills", "foo"))).toBe(false)
    })
    it("refuses to remove a path outside .claude", () => {
        expect(() => remove({ kind: "skill", name: "x", scope: "project", path: join(tmpdir(), "evil") })).toThrow()
    })
})
```

- [ ] **Step 3: Run test to verify it fails** — `npx vitest run tests/skills.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement** — `src/main/skills.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes** — `npx vitest run tests/skills.test.ts` → PASS.

- [ ] **Step 6: IPC handlers** — in `src/main/index.ts`, add after the `mcp:save` handler block (near `:432`). `projects` is already imported; add `import * as skills from "./skills"` with the other main imports:

```ts
    ipcMain.handle("extend:catalog", () => skills.catalog())
    ipcMain.handle("extend:preview", (_e, { repo, ref }: { repo: string; ref?: string }) => skills.preview(repo, ref))
    ipcMain.handle("extend:install", (_e, { repo, ref, item, scope, projectPath }: { repo: string; ref?: string; item: { kind: "skill" | "agent"; name: string; sourcePath: string }; scope: "global" | "project"; projectPath: string }) => {
        if (scope === "project") guardPath(projectPath)
        return skills.install(repo, ref, item, scope, projectPath)
    })
    ipcMain.handle("extend:list", (_e, projectPath: string) => skills.listInstalled(projectPath))
    ipcMain.handle("extend:remove", (_e, item: { kind: "skill" | "agent"; name: string; scope: "global" | "project"; path: string }) => skills.remove(item))
```

- [ ] **Step 7: Preload types + API** — in `src/preload/index.ts`, duplicate the shared types near the other exported interfaces (mirroring `McpServer`), and add the `extend` API after the `mcp` block (`:544`):

```ts
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
```

```ts
    extend: {
        catalog: (): Promise<CatalogEntry[]> => ipcRenderer.invoke("extend:catalog"),
        preview: (repo: string, ref?: string): Promise<DiscoveredItem[]> =>
            ipcRenderer.invoke("extend:preview", { repo, ref }),
        install: (
            repo: string,
            ref: string | undefined,
            item: { kind: ItemKind; name: string; sourcePath: string },
            scope: ExtendScope,
            projectPath: string
        ): Promise<InstalledItem> => ipcRenderer.invoke("extend:install", { repo, ref, item, scope, projectPath }),
        list: (projectPath: string): Promise<{ global: InstalledItem[]; project: InstalledItem[] }> =>
            ipcRenderer.invoke("extend:list", projectPath),
        remove: (item: InstalledItem): Promise<void> => ipcRenderer.invoke("extend:remove", item)
    },
```

- [ ] **Step 8: Typecheck + tests** — `npx tsc --noEmit` (only the known EditorPanel error); `npm test` all green.

- [ ] **Step 9: Commit**

```bash
git add src/main/skillsCatalog.ts src/main/skills.ts tests/skills.test.ts src/main/index.ts src/preload/index.ts
git commit -m "feat(extend): skills backend — fetch, install, list, remove + IPC"
```

---

### Task 3: Extend Agent hub (renderer)

**Files:**
- Create: `src/renderer/src/components/ExtendAgentModal.tsx`
- Modify: `src/renderer/src/store.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/components/CommandPalette.tsx`, `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `window.api.extend.*` and the types from `../../../preload/index` (Task 2); opened via `store.extendOpen`.
- Produces: `store.extendOpen: boolean`, `store.setExtendOpen(open: boolean): void`; `<ExtendAgentModal />`.

Renderer components aren't unit-tested here (convention) — verified by tsc + the feel-check.

- [ ] **Step 1: Store state + setter** — in `src/renderer/src/store.ts`, add to the interface next to `paletteOpen` (search `paletteOpen: boolean`): `extendOpen: boolean` and `setExtendOpen: (open: boolean) => void`. Add init `extendOpen: false,` next to `paletteOpen: false,`. Add the setter next to `setPaletteOpen`:

```ts
        setExtendOpen: (extendOpen) => set({ extendOpen }),
```

- [ ] **Step 2: Command Palette entry** — in `src/renderer/src/components/CommandPalette.tsx`, add near the other `section: "Actions"` pushes (e.g. after `act:addproject`):

```ts
        cmds.push({ id: "act:extend", section: "Actions", title: "Extend agent — skills & agents…", run: () => store.setExtendOpen(true) })
```

- [ ] **Step 3: The hub component** — create `src/renderer/src/components/ExtendAgentModal.tsx`:

```tsx
import { useEffect, useState } from "react"
import { useStore } from "../store"
import type { CatalogEntry, DiscoveredItem, InstalledItem, ItemKind, ExtendScope } from "../../../preload/index"

type Tab = "skill" | "agent"

export function ExtendAgentModal(): JSX.Element {
    const close = useStore((s) => s.setExtendOpen)
    const project = useStore((s) => s.activeProject())
    const projectPath = project?.path ?? ""

    const [tab, setTab] = useState<Tab>("skill")
    const [catalog, setCatalog] = useState<CatalogEntry[]>([])
    const [url, setUrl] = useState("")
    const [items, setItems] = useState<DiscoveredItem[]>([])
    const [sourceRepo, setSourceRepo] = useState("")
    const [vetted, setVetted] = useState(false)
    const [scope, setScope] = useState<ExtendScope>("project")
    const [installed, setInstalled] = useState<{ global: InstalledItem[]; project: InstalledItem[] }>({ global: [], project: [] })
    const [busy, setBusy] = useState<string>("")
    const [error, setError] = useState("")

    const refreshInstalled = (): void => {
        window.api.extend.list(projectPath).then(setInstalled).catch(() => {})
    }
    useEffect(() => {
        window.api.extend.catalog().then(setCatalog).catch(() => {})
        refreshInstalled()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const loadPreview = async (repo: string, ref: string | undefined, isVetted: boolean): Promise<void> => {
        setError("")
        setBusy("preview")
        setSourceRepo(repo)
        setVetted(isVetted)
        try {
            setItems(await window.api.extend.preview(repo, ref))
        } catch (e) {
            setItems([])
            setError((e as Error).message || "Failed to load repository.")
        } finally {
            setBusy("")
        }
    }

    const doInstall = async (item: DiscoveredItem): Promise<void> => {
        setBusy(item.sourcePath)
        setError("")
        try {
            await window.api.extend.install(sourceRepo, undefined, { kind: item.kind, name: item.name, sourcePath: item.sourcePath }, scope, projectPath)
            refreshInstalled()
        } catch (e) {
            setError((e as Error).message || "Install failed.")
        } finally {
            setBusy("")
        }
    }

    const doRemove = async (item: InstalledItem): Promise<void> => {
        setBusy(item.path)
        try {
            await window.api.extend.remove(item)
            refreshInstalled()
        } finally {
            setBusy("")
        }
    }

    const shownItems = items.filter((i) => i.kind === (tab as ItemKind))
    const shownCatalog = catalog.filter((c) => c.kinds.includes(tab as ItemKind))
    const shownInstalled = [...installed.project, ...installed.global].filter((i) => i.kind === (tab as ItemKind))

    return (
        <div className="switcher-backdrop" onMouseDown={() => close(false)}>
            <div className="modal extend-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head extend-head">
                    <h3>Extend agent</h3>
                    <div className="extend-tabs">
                        <button className={"extend-tab" + (tab === "skill" ? " on" : "")} onClick={() => setTab("skill")}>Skills</button>
                        <button className={"extend-tab" + (tab === "agent" ? " on" : "")} onClick={() => setTab("agent")}>Agents</button>
                    </div>
                    <button onClick={() => close(false)}>Close</button>
                </div>

                <div className="extend-body">
                    <div className="extend-browse">
                        <div className="extend-catalog">
                            {shownCatalog.map((c) => (
                                <button key={c.id} className="extend-cat-card" onClick={() => loadPreview(c.repo, c.ref, true)}>
                                    <div className="extend-cat-name">{c.name} <span className="extend-badge vetted">Vetted</span></div>
                                    <div className="muted small">{c.description}</div>
                                    <div className="extend-cat-repo">{c.repo}</div>
                                </button>
                            ))}
                            {shownCatalog.length === 0 && <div className="muted small">No catalog entries for this type.</div>}
                        </div>
                        <div className="extend-url">
                            <input
                                className="switcher-search"
                                placeholder="owner/repo or GitHub URL…"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) loadPreview(url.trim(), undefined, false) }}
                            />
                            <button className="extend-add" disabled={!url.trim()} onClick={() => loadPreview(url.trim(), undefined, false)}>Preview</button>
                        </div>
                    </div>

                    <div className="extend-preview">
                        {busy === "preview" && <div className="muted">Fetching {sourceRepo}…</div>}
                        {error && <div className="extend-error">{error}</div>}
                        {sourceRepo && busy !== "preview" && !error && (
                            <>
                                <div className="extend-preview-head">
                                    <span>{sourceRepo}</span>
                                    <span className={"extend-badge " + (vetted ? "vetted" : "unverified")}>{vetted ? "Vetted" : "Unverified — review before installing"}</span>
                                </div>
                                <div className="extend-scope">
                                    <span className="muted small">Install to</span>
                                    <button className={"extend-scope-btn" + (scope === "project" ? " on" : "")} onClick={() => setScope("project")} disabled={!projectPath}>This project</button>
                                    <button className={"extend-scope-btn" + (scope === "global" ? " on" : "")} onClick={() => setScope("global")}>Global</button>
                                    {scope === "global" && <span className="muted small">affects every project</span>}
                                </div>
                                {shownItems.map((it) => (
                                    <div key={it.sourcePath} className="extend-item">
                                        <div className="extend-item-head">
                                            <b>{it.name}</b>
                                            <button className="extend-install" disabled={busy === it.sourcePath} onClick={() => doInstall(it)}>Install</button>
                                        </div>
                                        <div className="muted small">{it.description}</div>
                                        <details>
                                            <summary className="muted small">{it.files.length} file(s) · read {it.kind === "skill" ? "SKILL.md" : "agent"}</summary>
                                            <pre className="extend-content">{it.content}</pre>
                                        </details>
                                    </div>
                                ))}
                                {shownItems.length === 0 && <div className="muted small">No {tab}s found in this repo.</div>}
                            </>
                        )}
                    </div>

                    <div className="extend-installed">
                        <div className="muted small">Installed</div>
                        {shownInstalled.map((it) => (
                            <div key={it.path} className="extend-installed-row">
                                <span>{it.name}</span>
                                <span className={"extend-badge scope-" + it.scope}>{it.scope}</span>
                                <button className="extend-remove" disabled={busy === it.path} onClick={() => doRemove(it)}>Remove</button>
                            </div>
                        ))}
                        {shownInstalled.length === 0 && <div className="muted small">None installed.</div>}
                    </div>
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Render in App** — in `src/renderer/src/App.tsx`, add the state read near `paletteOpen` (`:60` area): `const extendOpen = useStore((s) => s.extendOpen)`; add the import with the other component imports; add the gated render next to the other modals (`:248` area): `{extendOpen && <ExtendAgentModal />}`.

- [ ] **Step 5: Styles** — append to `src/renderer/src/styles.css`:

```css
/* ---------- Extend Agent hub ---------- */
.extend-modal {
    width: 760px;
    max-width: 92vw;
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    padding: 0;
}
.extend-head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
}
.extend-head h3 {
    margin: 0;
    font-size: 14px;
}
.extend-tabs {
    display: flex;
    gap: 4px;
    flex: 1;
}
.extend-tab {
    padding: 4px 12px;
    border-radius: var(--radius, 6px);
    color: var(--faint);
}
.extend-tab.on {
    color: var(--text);
    background: var(--bg-3);
}
.extend-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto 1fr;
    gap: 14px;
    padding: 16px 18px;
    overflow: auto;
}
.extend-browse {
    grid-column: 1;
    grid-row: 1 / span 2;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.extend-catalog {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.extend-cat-card {
    text-align: left;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius, 6px);
    background: var(--bg-2);
}
.extend-cat-repo,
.extend-cat-name {
    font-size: 12px;
}
.extend-cat-repo {
    color: var(--faint);
    font-variant-numeric: tabular-nums;
}
.extend-url {
    display: flex;
    gap: 8px;
}
.extend-preview {
    grid-column: 2;
    grid-row: 1;
    min-height: 120px;
}
.extend-preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}
.extend-scope {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.extend-scope-btn {
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius, 6px);
}
.extend-scope-btn.on {
    border-color: var(--accent);
    color: var(--accent);
}
.extend-item {
    border: 1px solid var(--border);
    border-radius: var(--radius, 6px);
    padding: 10px;
    margin-bottom: 8px;
}
.extend-item-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.extend-content {
    max-height: 220px;
    overflow: auto;
    background: var(--bg-1);
    padding: 8px;
    border-radius: var(--radius, 6px);
    font-size: 11px;
    white-space: pre-wrap;
}
.extend-installed {
    grid-column: 2;
    grid-row: 2;
}
.extend-installed-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
}
.extend-installed-row > span:first-child {
    flex: 1;
}
.extend-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
}
.extend-badge.vetted {
    color: var(--ok, var(--accent));
}
.extend-badge.unverified {
    color: var(--danger);
}
.extend-error {
    color: var(--danger);
    font-size: 12px;
}
```

- [ ] **Step 6: Typecheck + tests** — `npx tsc --noEmit` (only known error); `npm test` green.

- [ ] **Step 7: Feel-check (run-app)** — `npx electron-vite build` (retry once if it OOM-segfaults), then drive:
  - Open the palette → "Extend agent — skills & agents…" opens the hub.
  - The Skills tab shows the curated card (Emil skills). Click it → preview lists its skills with descriptions; expanding an item shows the `SKILL.md` body and file count.
  - Paste `emilkowalski/skills` in the URL box → same preview, badged **Unverified**.
  - Set scope **This project**, Install one skill → it appears under Installed (project badge); confirm on disk at `<project>/.claude/skills/<name>/SKILL.md`.
  - Switch scope **Global**, install another → Installed shows a global badge; confirm `~/.claude/skills/...`.
  - Remove one from Installed → the row and the files disappear.
  - Paste a bogus repo (e.g. `nope/nope-xyz`) → a clear error, no crash.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/ExtendAgentModal.tsx src/renderer/src/store.ts src/renderer/src/App.tsx src/renderer/src/components/CommandPalette.tsx src/renderer/src/styles.css
git commit -m "feat(extend): Extend Agent hub — browse, preview, install, remove"
```

---

## Notes

- **Placement correction from the spec:** the pure core lives in `src/main/skillsCore.ts` (not `src/renderer/src/extendCatalog.ts` as the spec first said) so `src/main/skills.ts` can import it directly; the shared types are duplicated into `preload/index.ts` for the renderer — the same arrangement as `McpServer`.
- **Deferred (per spec):** MCP tab (no `SettingsModal.tsx` change), enable/disable toggle, hooks/commands, non-Claude formats, marketplace backend.
