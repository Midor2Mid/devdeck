# Cross-project search — design

**Date:** 2026-07-08
**Status:** Design — decisions made autonomously under a "keep shipping" directive.
**Scope:** Search file contents across all registered projects and jump to a hit
in the editor. New search modal + backend; a small editor-open handoff.

## Problem

DevDeck is a multi-project cockpit, but there is no way to ask "where is X across
all my projects." This is the single biggest structural gap for a tool whose
thesis is *project as the unit of context*.

## Decisions (made autonomously)

- **Backend = `git grep` per project root.** Git is a hard dependency and every
  project folder is (in practice) a git repo; `git grep` is fast, respects
  `.gitignore`, and needs no new dependency. Non-git projects simply return no
  hits. Run via `execFile("git", ["grep", …], { cwd: project.path })` — the arg
  array means the query is never shell-interpreted (injection-safe), and iterating
  only registered `project.path`s keeps it path-confined by construction.
- **Match mode:** fixed-string, case-insensitive (`-F -i`), line numbers (`-n`),
  skip binary (`-I`). A search box, not a regex console.
- **Caps:** min query length 2; ≤50 hits per project, ≤300 total; 5s timeout and
  a 4 MB buffer per project. Silent truncation is logged in the UI ("showing first
  N").
- **UI:** a full-window **SearchModal** (like ProjectSwitcher), opened by
  **Ctrl+Shift+F** (currently free) and a Command Palette entry. Debounced query;
  results **grouped by project**; each hit shows `file:line` + the matching line;
  arrow-keys + Enter or click to open.
- **Open a hit:** switch to the hit's project, open the file in the EditorPanel,
  and reveal the line — via a new `pendingEditorOpen` store handoff, mirroring the
  existing `pendingApiRequest` (Network→API) pattern.

## Components

### `src/main/search.ts` (new)
- Pure, unit-tested parser: `parseGitGrep(stdout: string, maxPerProject: number): RawHit[]`
  where `interface RawHit { file: string; line: number; text: string }`. Parses
  `path:line:text` lines (regex `^(.+?):(\d+):(.*)$`, non-greedy path so match text
  may contain colons), normalizes `\` → `/`, caps line text to 300 chars, stops at
  `maxPerProject`, skips malformed/blank lines.
- Orchestrator `code(query: string): Promise<SearchHit[]>`: trims; returns `[]` if
  `< 2` chars; `Promise.all` over `listProjects().projects`, each running
  `git grep` in its `cwd`; maps `RawHit` → `SearchHit` adding `projectId`,
  `projectName`, and `absPath = join(project.path, file)`; flattens and slices to
  300. `git grep` exit-1 (no match) / non-git errors resolve to `[]`.

### IPC + preload
- `src/main/index.ts`: `ipcMain.handle("search:code", (_e, { query }) => search.code(query))`.
- `src/preload/index.ts`: `search: { code: (query: string): Promise<SearchHit[]> => ipcRenderer.invoke("search:code", { query }) }`, plus the exported
  `interface SearchHit { projectId: string; projectName: string; file: string; absPath: string; line: number; text: string }`.

### store (`src/renderer/src/store.ts`) — runtime-only additions
- `searchOpen: boolean` + `setSearchOpen(open: boolean)`.
- `pendingEditorOpen: { path: string; line?: number } | null`,
  `openInEditor(projectId: string, path: string, line?: number)` (→ `setActiveProject`,
  `setView("editor")`, set `pendingEditorOpen`), and `clearPendingEditorOpen()`.

### `src/renderer/src/components/SearchModal.tsx` (new)
- Search input (autofocus), debounced ~180ms; calls `window.api.search.code(q)`.
- Groups hits by `projectId`; renders a project heading + hit rows
  (`file:line` muted + the matching line). Keyboard: ↑/↓ move a flat selection,
  Enter opens, Esc closes; click opens. Opening: `openInEditor(hit.projectId,
  hit.absPath, hit.line)` then `setSearchOpen(false)`.
- Empty states: `< 2` chars → hint; no hits → "No matches"; shows a "showing first
  N" note when capped.

### EditorPanel (`src/renderer/src/components/EditorPanel.tsx`) — consume the handoff
- Keep the Monaco instance from `onMount` in an `editorRef`; keep a `revealLineRef`.
- `useEffect([pendingEditorOpen])`: when set, open the file by absolute path
  (reuse the existing `open({ path, name, isDir: false })` routine — it dedupes,
  reads, and sets the active tab), stash the target line in `revealLineRef`, then
  `clearPendingEditorOpen()`.
- Reveal the line once the target model is active: on `onMount` and in a
  `useEffect([activePath])`, if `revealLineRef.current` and the editor is ready,
  `revealLineInCenter(line)` + `setPosition` + focus (in a `requestAnimationFrame`),
  then clear it. Both paths cover first-open (mount) and already-mounted (effect).

### Wiring
- `App.tsx`: render `{searchOpen && <SearchModal />}`; add a keydown branch
  `mod + shift + code === "KeyF"` → toggle `searchOpen` (modeled on the palette
  branch).
- `CommandPalette.tsx`: add `{ id: "act:search", section: "Actions", title:
  "Search across projects", run: () => store.setSearchOpen(true) }`.
- CSS for the modal (reuse switcher/backdrop tokens).

## Error handling & edge cases

- Non-git project / no matches → empty (no error surfaced).
- Query `< 2` chars → no backend call; hint shown.
- A hit whose file was deleted between search and open → `fs.read` throws → the
  EditorPanel's existing `setError` path shows the message; modal already closed.
- Huge result sets → capped (per-project + total) with a UI note.
- Opening an image file hit → editor shows the image; line reveal is skipped.

## Testing

- Unit-test `parseGitGrep`: well-formed lines, text-with-colons, blank/malformed
  skipped, `maxPerProject` cap, `\`→`/` normalization, 300-char clamp.
- Verify with run-app: open the modal (Ctrl+Shift+F), type a token known to exist
  across ≥2 projects, confirm grouped results, click a hit → editor opens that
  file at the line.

## Build steps (for inline execution)

1. `src/main/search.ts` (`parseGitGrep` pure + tests, then `code` orchestrator).
2. IPC handler + preload `search.code` + `SearchHit` type.
3. store: `searchOpen`/`setSearchOpen`, `pendingEditorOpen`/`openInEditor`/`clearPendingEditorOpen`.
4. `SearchModal.tsx` + CSS + App mount + Ctrl+Shift+F + palette entry.
5. EditorPanel: consume `pendingEditorOpen` + line reveal.
6. `npm test`; verify with run-app.
