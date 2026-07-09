# Agent context files — design

**Date:** 2026-07-09 · **Status:** Approved · **Roadmap #6** (per-project agent
memory / context files — scoped to a **root-only** index over the agents' *own*
native memory files; no DevDeck-owned memory store, no nested-tree scan, no
per-agent routing).

## Problem
The CLI coding agents DevDeck supervises already have a memory convention — Claude
Code reads `CLAUDE.md`, Codex/general agents read `AGENTS.md`, Gemini reads
`GEMINI.md`, all at the project root. Today DevDeck gives you no awareness of these
files: you can't see at a glance whether a project *has* agent guidance, and
opening/creating one means hunting through the file tree. DevDeck should be a lens
over the real files the agents load — surface which exist, one click to open, one
click to create a seeded starter.

Non-goal: DevDeck does **not** invent its own memory format or inject anything at
launch. It edits the real files agents already read.

## Design (reuses existing fs + editor — no new IPC, no main changes)

- **Pure `src/renderer/src/contextCatalog.ts`:**
  - `interface ContextFile { name, agent, description }` — the known root memory
    files: `CLAUDE.md` (Claude Code), `AGENTS.md` (Codex / general), `GEMINI.md`
    (Gemini CLI).
  - `const CONTEXT_FILES: ContextFile[]` — the catalog (extensible; adding
    `.cursorrules` later is a one-line change).
  - `template(name, projectName): string` — the seeded starter for a file: a
    `# <projectName>` heading, an `<!-- Guidance for AI agents… -->` note, and empty
    `## Conventions`, `## Architecture`, `## Gotchas` sections.
  - `interface ContextEntry { name, agent, description, exists }`
  - `mergeContext(rootEntryNames: string[]): ContextEntry[]` — maps the catalog to
    entries, marking `exists` by case-sensitive membership in the root directory
    listing. Unknown root files are ignored. `template` is applied separately at
    create time (it's the only thing that needs `projectName`).
  - Unit-tested.

- **Surface:** a **`ContextIndex`** popover hung off the tool cluster
  (`ToolCluster.tsx`), opened by a document/memory glyph button consistent with the
  cluster's other icons. Titled `Context · <project>`. Each entry is a row:
  - **Present** (filled dot) → click calls `store.openInEditor(project.id, path)`.
  - **Missing** (hollow dot, `+ create`) → click writes `template(...)` via
    `fs.write`, then `openInEditor(...)`. On reopen it lists as present.
  - Hidden/disabled when no project is active (same guard as the MCP section).
  - Styling via tokens in `styles.css`, matching the MCP-catalog rows
    (`.mcp-cat-row` family) — mono name, muted description, right-aligned action.

## Data flow
Open popover → `window.api.fs.readDir(project.path)` → collect entry names →
`mergeContext(names)` → render rows. **Paths:** a present row reuses the
`DirEntry.path` from `readDir` (full path — same as the file tree). A missing row
constructs `project.path + "/" + name` for the write/open; the main guard runs
`resolve()` (normalizing separators) before its prefix check, so a forward-slash
join passes confinement on Windows and Node's fs accepts it. Click present →
`openInEditor(project.id, path)`. Click missing →
`fs.write(path, template(name, project.name))` → `openInEditor(project.id, path)`.

## Reuse
`store.openInEditor` (switches active project + view, opens a Monaco tab),
`window.api.fs.readDir` / `fs.write` (both project-root path-confined by the
existing `guardPath`/`inProject` guard), the existing toast system for errors.

## Edge cases
- **No active project** → the tool-cluster button is disabled (no popover).
- **`readDir` fails** (folder moved/unreadable) → popover shows an inline
  "Couldn't read project folder" line; never crashes.
- **`fs.write` fails** (permissions) → error toast; the row stays "missing".
- **File already exists** → it renders as present, so create isn't offered (no
  clobber path). Popover state is derived fresh from `readDir` each open.
- **Case sensitivity** → match the exact catalog names (`CLAUDE.md`, not `claude.md`);
  a differently-cased file simply reads as missing, which is acceptable (the agents
  themselves expect the canonical casing).

## Testing
- **Unit — `tests/contextCatalog.test.ts`:** catalog non-empty + unique names;
  `template` injects the project name and contains the expected section headings;
  `mergeContext` marks `exists` true only for catalog files present in the listing,
  ignores unknown root files, and returns one entry per catalog file regardless of
  listing.
- **run-app:** open the Context popover on a seeded project → `CLAUDE.md` shows
  present; click it → opens in a Monaco tab. Create `AGENTS.md` → opens with the
  template; reopen popover → now present. Screenshot.

## Build steps
1. `contextCatalog.ts` (pure) + `tests/contextCatalog.test.ts`.
2. `ContextIndex` popover + tool-cluster trigger in `ToolCluster.tsx` + CSS.
3. `npm test`; `npx electron-vite build`; run-app verify; CHANGELOG (Unreleased).
