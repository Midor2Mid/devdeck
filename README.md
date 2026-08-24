# DevDeck

> A command deck for terminal-first, Claude-driven development — multiple terminals, fast project switching, an editor, an API client, and network debugging in one window.

See `PRODUCT.md` for the problem, target user, and value proposition, and `ROADMAP.md` for the milestone plan.

## Status

**Stage:** MVP (Milestone 1 — terminal + project core)

## Getting started

Requires Node **^20.19 || >=22.12** on Windows (what Vite 7 and electron-vite 5 ask for). Built and verified on **Node 22.23.2**.

```bash
cd devdeck
npm install        # @lydell/node-pty ships prebuilt binaries — no C++ compiler needed
npm run dev        # launch DevDeck in development (hot reload)
```

To build the bundled output:

```bash
npm run build      # bundle main + preload + renderer into out/
```

To package an installable Windows app:

```bash
npm run package        # NSIS installer + portable .exe in release/
npm run package:dir    # just the unpacked app in release/win-unpacked/ (faster)
```

Native/WASM deps (`@lydell/node-pty`, `node-sqlite3-wasm`, `@xterm/xterm`) are
unpacked from the asar archive automatically (see the `build` field in
`package.json`). Builds are unsigned.

> **Toolchain note (updated 2026-08-24):** the Electron 33 + Vite 5 pin is gone.
> It existed because Electron 42 / Vite 7 need Node >= 22.12 while the machine ran
> 22.11; the machine now runs 22.23.2, so the block had already lifted and no doc
> had noticed. Now on **Electron 43 + Vite 7 + electron-vite 5 + vitest 4**, which
> takes `npm audit` from 25 advisories (2 critical, 19 high) to **zero**.
> Vite is capped at 7, not 8: `electron-vite@5` peers on `vite ^5 || ^6 || ^7`.
> **Packaging is unverified here** - `electron-builder` shells out to
> `powershell.exe` for the code-signing cert lookup, and PowerShell cannot run in
> the agent environment at all (see `ROADMAP.md` decisions log).

## Checking a change actually works

```bash
npm test                  # 985 unit tests
npm run verify:terminal    # drives the DEV build over CDP: 15 checks
npm run build && npm run verify:packaged   # drives the PACKAGED app: 4 checks
```

`verify:terminal` and `verify:packaged` launch a real window on an isolated
`--user-data-dir` and press real keys, because the things they cover cannot be
reached from a unit test: keyboard chords, pane geometry, and whether a pty actually
spawns. Both seed `cmd` rather than the default shell, since a shell that never
starts leaves a blank pane that a negative assertion would happily pass - which is a
mistake this harness has already made once. `verify:packaged` **skips** (exit 0)
when there is no build in `release/`, so it is safe to chain.

## What works today

- **Projects sidebar** — add a folder as a project, switch the active project with one click. Persisted across restarts.
- **Multi-terminal** — real shells via xterm.js + pty, tabbed, each spawned in the active project's directory.
- **Split panes** — split any terminal right (⇆) or down (⇅) to see multiple terminals at once; close panes and the layout collapses cleanly.
- **Multi-agent sessions** — configurable agent presets (Claude, Codex, Gemini, custom) launched per project, each with a type badge; `+` for the primary agent, `▾` menu for the rest (with resume). Configure in Settings → Agents.
- **Prompt composer** — `Ctrl+Shift+P` opens a rich prompt box with `@file` and `/snippet` autocomplete (snippets defined in Settings) to compose and send to the focused agent session.
- **Terminal layouts** — toggle between **Tabs** and a **Dashboard grid** that shows every terminal in the project at once.
- **Project groups + switcher** — organize projects into collapsible groups; `Ctrl+K` opens a searchable launchpad grid of all projects with live session counts.
- **Status bar** — active project, git branch + uncommitted-change count, **git identity** (click to switch account), attention flag, remote indicator.
- **Git accounts** — define work/personal identities (name, email, custom SSH command) in Settings → Git and apply one per project (writes the repo's local `git config`).
- **SSH hosts** — define SSH profiles in Settings → SSH and open a connected terminal from the terminal `▾` menu.
- **MCP servers** — manage the active project's `.mcp.json` (command/args/env) from Settings → MCP, read by Claude Code and other agents.
- **Claude session awareness** — every Claude session (across all projects) is listed in the sidebar with live status (working / idle / **needs attention**), an attention badge, and click-to-jump. Status is inferred from output activity + the terminal bell — no fragile output parsing.
- **Send file → Claude** — from the editor, send the current file's `@path` into the last-focused Claude session.
- **Sessions survive switches** — switching project/tab/pane keeps every pty running; panes re-attach and replay recent output (no lost work). Sessions end only when you close them.
- **Layout persists** — your tabs and split layout per project are restored on relaunch (as fresh shells/Claude sessions in the same arrangement).
- **Rename tabs** — double-click a tab to rename it.
- **In-terminal find** — ⌕ / Ctrl+Shift+F to search the focused terminal.
- **API client** — Postman-style request builder (runs in the main process, no CORS limits); **paste a cURL command into the URL bar** and it auto-parses into method/headers/body.
- **Browser** — embedded web browser with a **Comment Mode**: click any element to annotate it, then send grouped feedback to your focused agent — element selector + note + URL, recent **console errors/warnings**, captured **network requests** (failed/4xx/5xx), and a **page screenshot**.
- **Editor** — Monaco-powered: file tree, multi-file tabs, syntax highlighting, dirty indicators, Ctrl+S to save.
- **Database** — per-project saved connections (PostgreSQL, MySQL & **SQLite**), Monaco SQL editor (Ctrl+Enter to run), table browser, results grid. SQLite uses a WASM driver (no native build) and reads/writes real `.db` files via a file picker. Passwords encrypted at rest (Electron `safeStorage`).
- **Themes** — three wabi-sabi themes (Sumi & Zen dark, Washi light), switchable in Settings → Appearance and applied across UI, terminal, and editor; plus a customizable accent color.
- **Settings** (⚙ in the sidebar) — Appearance (theme + accent), Terminal (default shell: PowerShell/cmd/Git Bash/WSL/custom + font), Editor (font/tab/wrap/minimap), Claude (command, resume args, idle timing), Remote (mobile access), Shortcuts reference, About. Persisted to `settings.json`.
- **Remote / mobile access** — turn on a token-guarded server (Settings → Remote) and open the shown URL/QR on your phone to view and drive your terminals + Claude sessions. Off by default; bind is token-gated. For access *anywhere*, run [Tailscale](https://tailscale.com) on this PC and your phone (no public exposure) — the URL uses your Tailscale IP automatically when present.

> **Security:** a remote terminal can run commands on this machine. Keep the token private, prefer Tailscale over any public tunnel, and disable Remote when you don't need it.

### Terminal keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+T` | New shell tab |
| `Ctrl+Shift+Enter` | New Claude session |
| `Ctrl+Shift+W` | Close focused pane |
| `Ctrl+Shift+\` | Split right |
| `Ctrl+Shift+-` | Split down |
| `Ctrl+Shift+]` / `[` | Next / previous tab |
| `Ctrl+Shift+F` | Find in terminal |
| `Ctrl+Shift+I` | Prompt composer |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+K` | Project switcher |

## Architecture

```
src/
├── main/        # Electron main process — pty spawning, project store, IPC handlers
├── preload/     # contextBridge — safe typed API exposed to the renderer
└── renderer/    # React UI — workspace shell, sidebar, terminal/editor/api panels
```

- Terminals: `@lydell/node-pty` (main) ↔ `@xterm/xterm` (renderer), streamed over IPC.
- Layout: `allotment` resizable split panes.
- State: project list persisted to Electron `userData`.
