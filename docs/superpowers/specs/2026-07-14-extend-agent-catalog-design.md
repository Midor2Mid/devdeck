# Extend Agent — Skills & Subagents Catalog — Design

**Date:** 2026-07-14
**Status:** Approved (brainstorm) — ready for implementation plan
**Scope:** A finder + installer for Claude Code **skills** (`SKILL.md`) and
**subagents** (`agents/*.md`) — browse a curated catalog or paste a GitHub repo,
preview what you're installing, and install to **global** (`~/.claude`) or the
**active project** (`.claude/`). Surfaced in a new unified **Extend Agent** hub.

## Motivation

Adding a skill/agent today is manual and fiddly: know `npx`/`git`, the
`~/.claude/skills` path, global-vs-local, and read the `SKILL.md` yourself. (We
did exactly this by hand to install `emilkowalski/skills`.) DevDeck already owns
the agent's *sessions*; this makes it own the agent's *capabilities* too, scoped
to a project or global — the natural extension of "project is the unit of
context." It also mirrors the existing MCP catalog, so it's a known shape.

## Decisions (locked in brainstorming)

1. **Content:** skills (`SKILL.md`) + subagents (`agents/*.md`). No hooks/commands v1.
2. **Sources:** curated catalog **+** "add from GitHub repo" (arbitrary URL).
3. **Scope:** install to **global** (`~/.claude`) or **project** (`.claude/`), chosen per install.
4. **Placement:** a new unified **Extend Agent** hub with tabs **Skills | Agents | MCP**.
5. **Fetch:** git shallow-clone to a temp dir → copy matched folders → delete temp (no new deps; `git clone` doesn't execute repo code).
6. **v1 verbs:** browse / preview / install / list / remove. **No** enable/disable toggle yet.
7. **Format:** Claude Code `.claude/` convention only (not Codex/Gemini equivalents).

## Architecture

### Data shapes (shared types)

```ts
export type ExtendScope = "global" | "project"
export type ItemKind = "skill" | "agent"

export interface CatalogEntry {
    id: string          // stable slug
    name: string
    description: string
    repo: string        // "owner/name"
    ref?: string        // branch/tag; default = repo default branch
    kinds: ItemKind[]   // what this repo offers (for badges)
    vetted: true        // curated entries are vetted
}

export interface DiscoveredItem {
    kind: ItemKind
    name: string        // skill dir name / agent file basename, or frontmatter name
    description: string // from frontmatter (may be "")
    sourcePath: string  // path WITHIN the cloned repo (dir for skill, file for agent)
    files: string[]     // repo-relative files that will be written (for the "what lands" list)
    content: string     // the SKILL.md / agent .md text, for the read-before-install preview
}

export interface InstalledItem {
    kind: ItemKind
    name: string
    scope: ExtendScope
    path: string        // absolute install path
}
```

### Pure, unit-tested core — `src/renderer/src/extendCatalog.ts`

No electron/React imports (testable in isolation, like `projectIdentity.ts`):

- `discover(repoRelPaths: string[]): { skills: string[]; agents: string[] }`
  - **skill** = the directory containing any `SKILL.md` (return that dir path).
  - **agent** = any `*.md` directly under an `agents/` directory (return the file path).
  - De-dupe; ignore `.git/`, `node_modules/`.
- `targetPath(scope, kind, name, opts: { home: string; projectPath: string }): string`
  - `global` → `join(home, ".claude", kind === "skill" ? "skills" : "agents", ...)`
  - `project` → `join(projectPath, ".claude", ...)`
  - skill → `.../skills/<name>` (a directory); agent → `.../agents/<name>.md` (a file).
- `parseFrontmatter(md: string): { name?: string; description?: string }` — read the leading `---` YAML block's `name`/`description` (simple line parse, no YAML dep).

### Main — `src/main/skills.ts` (mirrors `src/main/mcp.ts` conventions)

- `catalog(): CatalogEntry[]` — returns the static curated list from `skillsCatalog.ts`.
- `preview(repo: string, ref?: string): Promise<DiscoveredItem[]>`
  - Shallow-clone `https://github.com/<repo>.git` (or a full URL) to an OS temp dir
    (`git clone --depth 1 [--branch <ref>]`), walk it, `discover()` the skills/agents,
    read each item's frontmatter + `content`, **delete the temp dir**, return the items.
- `install(repo: string, ref: string | undefined, item: { kind; name; sourcePath }, scope: ExtendScope, projectPath: string): Promise<InstalledItem>`
  - Clone to temp, `cp -r` the `sourcePath` (skill dir) or copy the file (agent) into
    `targetPath(...)`, delete temp. `atomicWrite`/`mkdir -p` the target parent. Overwrite
    if the target already exists (re-install = update).
- `listInstalled(projectPath: string): { global: InstalledItem[]; project: InstalledItem[] }`
  - Scan `~/.claude/skills`, `~/.claude/agents`, `<project>/.claude/skills`,
    `<project>/.claude/agents`; each skill dir with a `SKILL.md` and each agent `.md`
    becomes an `InstalledItem`.
- `remove(item: InstalledItem): void` — `rm -rf` the skill dir / `rm` the agent file
  (validate the path is under a `.claude/skills|agents` root before deleting).

**Temp dirs:** use `app.getPath("temp")`/`os.tmpdir()`; always clean up in a `finally`.
**No git dependency install** — shell the system `git` like `src/main/git.ts` does; if
`git` is missing or the clone fails, return a clear error the UI surfaces.

### IPC + preload (mirror the `mcp`/`projects` pattern)

- `ipcMain.handle` for `extend:catalog`, `extend:preview`, `extend:install`,
  `extend:list`, `extend:remove` in `src/main/index.ts`.
- Preload `window.api.extend = { catalog, preview, install, list, remove }` with the
  matching signatures.

### Renderer — the hub

- New `src/renderer/src/components/ExtendAgentModal.tsx`: a modal (reuse `.modal`
  entrance + backdrop) with three tabs: **Skills | Agents | MCP**.
  - **Skills / Agents tabs** share one sub-component: Browse (curated catalog cards +
    an "Add from GitHub…" input) and Installed (list with scope badges + Remove).
  - Selecting a catalog entry or submitting a URL calls `preview` → shows a
    **preview pane**: source repo, each discovered item, its frontmatter, the
    `SKILL.md`/agent body, and a **"files that will be written"** list, plus the
    **scope toggle** (Global / This project) and an **Install** button.
  - Curated entries render a **Vetted** badge; URL results render **Unverified —
    review before installing.** Global scope shows a "affects every project" note.
- **MCP tab:** extract the MCP-catalog section currently inside `SettingsModal.tsx`
  into a reusable `<McpCatalog projectPath />` component and render it here. *(This is
  the only part touching existing code; it can be deferred — ship the hub with
  Skills + Agents and add the MCP tab in a fast follow — without blocking v1.)*
- Store: `extendOpen: boolean` + `setExtendOpen(open)` mirroring `envEditorProject`
  pattern; render `{extendOpen && <ExtendAgentModal />}` in `App.tsx`.
- Open via: a **Command Palette** command ("Extend agent — skills, agents, MCP…") and
  the project context menu.

### Curated catalog — `src/renderer/src/skillsCatalog.ts`

A static typed `CatalogEntry[]` (like `mcpCatalog.ts`), seeded with a few known-good
sources including `emilkowalski/skills`. No network for browsing the catalog itself.

## Security model (the part that matters most)

Installing a skill = installing instructions the agent will later obey — so:

- **Read-before-install:** the preview pane shows the source repo, the item's
  frontmatter, and the full `SKILL.md`/agent body **before** any file is written.
- **Explicit scope:** Global (`~/.claude`, every project) vs This project (`.claude/`,
  committed with the repo), chosen per install; Global is labeled as affecting everything.
- **Trust signal:** curated = **Vetted**; arbitrary URL = **Unverified**.
- **No execution at install** — the only side effect is copying files into the chosen
  `.claude/skills|agents`. `remove` validates the path is under a `.claude` root.
- Clone is `--depth 1` of exactly the requested repo/ref; temp dir always cleaned up.

## Testing

- **`extendCatalog.ts`** unit tests: `discover()` (skills via `SKILL.md`, agents via
  `agents/*.md`, ignores `.git`/`node_modules`, de-dupes), `targetPath()` (global vs
  project × skill vs agent, using injected `home`/`projectPath`), `parseFrontmatter()`
  (name/description, missing block → empty).
- **`src/main/skills.ts`**: test `listInstalled`/`remove` against a temp `.claude` tree
  (mock `electron` for `app.getPath`, as `projects.test.ts` does). `preview`/`install`
  (which shell `git` + network) are covered by the run-app feel-check, not unit tests.
- Existing suite stays green.

## Non-goals (YAGNI)

- No enable/disable toggle (install/remove only).
- No hooks or slash-commands.
- No non-Claude (`.codex`, Gemini) formats.
- No marketplace backend: no ratings, accounts, or publishing.
- No auto-update of installed skills (re-install to update).

## Verification

- `npx tsc --noEmit`: no new errors (pre-existing `EditorPanel.tsx` monaco error aside).
- `npm test`: existing suite + new `extendCatalog`/`skills` tests pass.
- Do NOT run a renderer build directly (OOMs); build via `npx electron-vite build` for
  the run-app harness only.
- **Feel check** (run-app): open the hub from the palette; browse the curated catalog;
  paste `emilkowalski/skills`, confirm the preview lists its skills with frontmatter +
  body and a "files that will be written" list; install one to **This project**,
  confirm it lands in `<project>/.claude/skills/<name>/SKILL.md`; install one to
  **Global**, confirm `~/.claude/skills/...`; the Installed tab lists both with scope
  badges; Remove deletes the files. Confirm a bad URL surfaces a clear error.
