# .NET build/test with clickable errors — design

**Date:** 2026-07-08
**Status:** Design — decisions made autonomously under "keep shipping".
**Scope:** Run `dotnet build` / `dotnet test` for the active project and show
parsed MSBuild diagnostics as a clickable list that jumps to `file:line` in the
editor. New modal + backend; reuses the `openInEditor` handoff.

## Problem

The user's day job is a C# backend, but DevDeck has no .NET awareness: `dotnet
build`/`test` output is a wall of terminal text where you hunt `file:line` by eye.
This is the "personal tool wired to my workday" gap called out in the review.

## Decisions (autonomous)

- **Backend:** `execFile("dotnet", ["build"|"test", "--nologo"], { cwd: projectRoot })`
  in the main process; 180s timeout, 10 MB buffer. dotnet is on PATH (verified
  9.0.x). Runs at the project root — `dotnet` auto-discovers the single `.sln`/
  `.csproj`. Confined to registered project roots (only the active project's path).
- **Detection:** before spawning, `readdirSync(root)` for `*.sln`/`*.csproj`; if
  none, return a "No .NET project" result without running (no pointless spawn).
- **Missing SDK:** `execFile` ENOENT → a friendly "dotnet not found" result.
- **Parser (pure, unit-tested):** MSBuild diagnostics
  `path(line,col): error|warning CODE: message [proj]` (col optional), plus the
  summary line (`Build succeeded.`/`Build FAILED.`, `Passed!`/`Failed!` for test)
  and error/warning counts. Dedupe identical diagnostics (MSBuild repeats them per
  target).
- **UI:** a modal overlay (like WorkPanel/ReleaseBoard), opened by **Ctrl+Shift+B**
  and a Command Palette entry. A **Build / Test** segmented toggle, a **Run**
  button, a status/summary line (running / ok / failed + counts), and a diagnostics
  list. Each diagnostic row: severity dot (form, not color-only) + `file(line,col)`
  + code + message. Click → `openInEditor(activeProjectId, absPath, line)` and close
  the modal (reuses the cross-project-search handoff).

## Components

### `src/main/dotnet.ts` (new)
- `interface Diag { file: string; line: number; col: number; severity: "error" | "warning"; code: string; message: string }`
- Pure `parseDotnet(stdout: string): { diagnostics: Diag[]; summary: string }`:
  regex `^(.+?)\((\d+)(?:,(\d+))?\):\s+(error|warning)\s+(\S+):\s+(.*)$` per line
  (strips a trailing ` [..proj..]`), dedupes by `file:line:col:code`, and picks the
  last `Build succeeded|FAILED` / `Passed!|Failed!` line (or the counts line) as
  `summary`.
- `interface DotnetResult { ok: boolean; ran: boolean; summary: string; diagnostics: (Diag & { absPath: string })[] }`
- `run(root: string, mode: "build" | "test"): Promise<DotnetResult>`: detect
  `.sln`/`.csproj` (else `{ ran:false, ok:false, summary:"No .sln or .csproj in
  this project.", diagnostics:[] }`); `execFile` dotnet; on ENOENT resolve
  `{ ran:false, summary:".NET SDK (dotnet) not found on PATH." }`; else
  `parseDotnet` and map each Diag to add `absPath = isAbsolute(file) ? file :
  join(root, file)`. `ok` = summary indicates success (no errors).

### IPC + preload
- `src/main/index.ts`: `ipcMain.handle("dotnet:run", (_e, { root, mode }) => { guardPath(root); return dotnet.run(root, mode) })` (path-confined).
- `src/preload/index.ts`: `dotnet: { run: (root: string, mode: "build" | "test"): Promise<DotnetResult> => ipcRenderer.invoke("dotnet:run", { root, mode }) }`, plus exported `Diag`/`DotnetResult` interfaces (`Diag` gains `absPath` in the result).

### store (runtime-only)
- `dotnetOpen: boolean` + `setDotnetOpen(open: boolean)`.

### `src/renderer/src/components/DotnetPanel.tsx` (new)
- Reads `activeProject`; if none → "No project selected".
- Local state: `mode` ("build"|"test"), `result: DotnetResult | null`, `running`.
- Run: `setRunning(true)`; `window.api.dotnet.run(activeProject.path, mode)` →
  `setResult`; `setRunning(false)`. Auto-run once on open with the default mode.
- Renders: Build/Test toggle, Run button (disabled while running), status line
  (running spinner / `result.summary` with error+warning counts), and the
  diagnostics list. Each row click → `openInEditor(activeProject.id, d.absPath,
  d.line)` + `setDotnetOpen(false)`. Empty/no-project/not-ran states handled.

### Wiring
- `App.tsx`: `{dotnetOpen && <DotnetPanel />}`; keydown branch `mod + shift + code
  === "KeyB"` → toggle `dotnetOpen`.
- `CommandPalette.tsx`: `{ id: "act:dotnet", section: "Actions", title: "Build /
  test (.NET)", run: () => store.setDotnetOpen(true) }`.
- CSS for the modal + diagnostics list (existing tokens).

## Error handling & edge cases

- No project selected → message, no run.
- No `.sln`/`.csproj` → "No .NET project", no spawn.
- dotnet not on PATH → "dotnet not found".
- Build takes long → running state until resolve; 180s timeout → the timed-out
  `execFile` returns whatever stdout it captured (parsed) or an empty result.
- A diagnostic path that no longer exists → the editor's existing `setError` path.
- Non-.NET repo (e.g. DevDeck itself) → "No .NET project" state.

## Testing

- Unit-test `parseDotnet`: an error line with (line,col), a warning without col,
  the trailing `[proj]` stripped, dedupe of repeated diagnostics, and summary
  extraction for build-succeeded / build-failed / test Passed! / Failed!.
- Verify with run-app: open (Ctrl+Shift+B) on the C# project (AZURE /
  SPC.FleetPortal), Run build, confirm the summary + any diagnostics render and
  clicking one opens the file at the line; open on a non-.NET project → "No .NET
  project" state.

## Build steps (inline)

1. `src/main/dotnet.ts` (`parseDotnet` pure + tests, then `run`).
2. IPC handler + preload `dotnet.run` + `Diag`/`DotnetResult` types.
3. store: `dotnetOpen`/`setDotnetOpen`.
4. `DotnetPanel.tsx` + CSS + App mount + Ctrl+Shift+B + palette entry.
5. `npm test`; verify with run-app.
