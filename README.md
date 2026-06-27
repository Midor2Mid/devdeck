# DevDeck

> A command deck for terminal-first, Claude-driven development — multiple terminals, fast project switching, an editor, an API client, and network debugging in one window.

See `PRODUCT.md` for the problem, target user, and value proposition, and `ROADMAP.md` for the milestone plan.

## Status

**Stage:** MVP (Milestone 1 — terminal + project core)

## Getting started

Requires Node 18+ on Windows. Built and verified on **Node 22.11**.

```bash
cd devdeck
npm install        # @lydell/node-pty ships prebuilt binaries — no C++ compiler needed
npm run dev        # launch DevDeck in development (hot reload)
```

To build the bundled output:

```bash
npm run build      # bundle main + preload + renderer into out/
```

> **Toolchain note:** pinned to Electron 33 + Vite 5 because Electron 42 / Vite 7
> require Node ≥ 22.12, and this machine runs 22.11. Bump Node to the latest 22 LTS
> to move up to the newest Electron later (see `ROADMAP.md` decisions log).

## What works today

- **Projects sidebar** — add a folder as a project, switch the active project with one click. Persisted across restarts.
- **Multi-terminal** — real shells via xterm.js + pty, tabbed, each spawned in the active project's directory.
- **Split panes** — split any terminal right (⇆) or down (⇅) to see multiple terminals at once; close panes and the layout collapses cleanly.
- **Multi-agent sessions** — configurable agent presets (Claude, Codex, Gemini, custom) launched per project, each with a type badge; `+` for the primary agent, `▾` menu for the rest (with resume). Configure in Settings → Agents.
- **Prompt composer** — `Ctrl+Shift+P` opens a rich prompt box with `@file` autocomplete to compose and send to the focused agent session.
- **Project groups + switcher** — organize projects into collapsible groups; `Ctrl+K` opens a searchable launchpad grid of all projects with live session counts.
- **Status bar** — active project, git branch + uncommitted-change count, attention flag, remote indicator.
- **Claude session awareness** — every Claude session (across all projects) is listed in the sidebar with live status (working / idle / **needs attention**), an attention badge, and click-to-jump. Status is inferred from output activity + the terminal bell — no fragile output parsing.
- **Send file → Claude** — from the editor, send the current file's `@path` into the last-focused Claude session.
- **Sessions survive switches** — switching project/tab/pane keeps every pty running; panes re-attach and replay recent output (no lost work). Sessions end only when you close them.
- **Layout persists** — your tabs and split layout per project are restored on relaunch (as fresh shells/Claude sessions in the same arrangement).
- **Rename tabs** — double-click a tab to rename it.
- **In-terminal find** — ⌕ / Ctrl+Shift+F to search the focused terminal.
- **API client** — Postman-style request builder (runs in the main process, no CORS limits).
- **Editor** — Monaco-powered: file tree, multi-file tabs, syntax highlighting, dirty indicators, Ctrl+S to save.
- **Database** — per-project saved connections (PostgreSQL, MySQL & **SQLite**), Monaco SQL editor (Ctrl+Enter to run), table browser, results grid. SQLite uses a WASM driver (no native build) and reads/writes real `.db` files via a file picker. Passwords encrypted at rest (Electron `safeStorage`).
- **Settings** (⚙ in the sidebar) — Appearance (accent color), Terminal (default shell: PowerShell/cmd/Git Bash/WSL/custom + font), Editor (font/tab/wrap/minimap), Claude (command, resume args, idle timing), Remote (mobile access), Shortcuts reference, About. Persisted to `settings.json`.
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
