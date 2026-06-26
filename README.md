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
- **One-click Claude session** — `+ Claude` spawns a terminal running `claude` in the active project.
- **Sessions survive switches** — switching project/tab/pane keeps every pty running; panes re-attach and replay recent output (no lost work). Sessions end only when you close them.
- **Layout persists** — your tabs and split layout per project are restored on relaunch (as fresh shells/Claude sessions in the same arrangement).
- **Rename tabs** — double-click a tab to rename it.
- **In-terminal find** — ⌕ / Ctrl+Shift+F to search the focused terminal.
- **API client** — Postman-style request builder (runs in the main process, no CORS limits).
- **Editor** — Monaco-powered: file tree, multi-file tabs, syntax highlighting, dirty indicators, Ctrl+S to save.
- **Database** — per-project saved connections (PostgreSQL & MySQL), Monaco SQL editor (Ctrl+Enter to run), table browser, results grid. Passwords encrypted at rest (Electron `safeStorage`). SQLite coming via a WASM driver.

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
