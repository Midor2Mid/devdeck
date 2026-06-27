# Roadmap — DevDeck

The vision is all-in-one. The build is sequenced into milestones so there's a usable daily-driver early, with every later panel plugging into the same workspace shell. Keep each milestone ruthlessly shippable.

**Design north star:** ease of use + Japanese **wabi-sabi** — simplicity, calm, restraint, natural/imperfect beauty, quiet space. One earthy accent, minimal chrome, an ensō brand mark. Every feature must earn its visual weight; default to removing. (See `NOTES.md` → "Design north star".)

> Direction confirmed 2026-06-27: pursue **all four** next-step tracks over time (terminal polish, Monaco editor, API depth, deeper Claude). Default shell stays PowerShell.

## Milestone 1 — Terminal + project core (the beating heart) ✅ MVP

- [ ] App shell: Electron + electron-vite + React + TS, runs on Windows
- [ ] Resizable layout (sidebar | main | terminal area) via `allotment`
- [ ] Project sidebar: add a project (folder picker), list projects, select active project; persisted to disk
- [ ] Multi-terminal: tabbed terminals via xterm.js + `@lydell/node-pty`, each spawned with `cwd` = active project
- [ ] "New terminal" and "New Claude session" buttons (Claude session = pty launching `claude` in the project)
- [ ] Terminals survive project switches (per-project terminal groups)

### Milestone 1.5 — terminal core polish ✅ (2026-06-27)

- [x] Split panes within a tab (binary layout tree; split right/down, close + collapse)
- [x] Pty buffer-replay: panes detach/re-attach without killing sessions (kill is explicit)
- [x] Persist + restore tabs/splits per project across restarts (`workspace.json`)
- [x] Rename tabs (double-click)
- [x] Keyboard shortcuts (new/close/split/cycle/find — all `Ctrl+Shift+…`, captured before xterm)
- [x] In-terminal search (`@xterm/addon-search`)

**Definition of done for the MVP:** I can add my real projects, switch between them with one click (no manual `cd`), and run several terminals — including parallel Claude CLI sessions — side by side, labeled. It's good enough to replace Windows Terminal for a day.

## Milestone 2 — Editor panel ✅ (2026-06-27)

- [x] File tree for the active project
- [x] Monaco editor: open, edit, save files (syntax highlighting, per-file undo)
- [x] Tabs for open files; dirty indicators
- [x] Monaco workers bundled locally (offline; no CDN) + wabi-sabi editor theme

## Milestone 3 — API client panel (Postman-lite)

- [ ] Request builder: method, URL, headers, query params, body (JSON/form)
- [ ] Send via main process; show status, timing, headers, pretty body
- [ ] Per-project request history + saved requests (collections)

## Milestone 3.5 — Database panel ✅ (2026-06-27, partial)

- [x] Per-project saved connections (PostgreSQL, MySQL) with encrypted passwords (`safeStorage`)
- [x] Connect / test, list tables, run SQL (Monaco editor, Ctrl+Enter), results grid
- [x] **SQLite via WASM** (`node-sqlite3-wasm`, 2026-06-27) — no native build; reads/writes real `.db` files, file picker in the connection form
- [ ] Query history / saved queries per connection
- [ ] Packaging note: unpack `node-sqlite3-wasm` `.wasm` from asar when building a distributable

## Milestone 7 — Remote / mobile access ✅ (2026-06-27, terminals-first)

- [x] Multi-client pty (event bus + per-client buffer replay) so a phone can attach to live sessions
- [x] Token-guarded HTTP + WebSocket server in the main process (off by default)
- [x] Self-contained mobile web client (xterm served from node_modules): session list, attach, live output, input + quick keys, start a Claude session remotely
- [x] Settings → Remote: enable, port, token (regen), Tailscale/LAN URL + QR
- [x] Verified end-to-end headlessly (auth 401/reject, session broadcast, shell output over WS)
- Reach from anywhere: **Tailscale** (private, recommended) — bind is 0.0.0.0 but token-gated
- [ ] Later: TLS option, full-UI mobile client, push notification on attention

## Milestone 4 — Network debugging

- [ ] Local HTTP proxy to capture requests/responses
- [ ] Request list + inspector (headers, timing, payloads)
- [ ] Filter by project / host

## Milestone 5 — Deeper Claude CLI integration ✅ (2026-06-27, core)

- [x] Session registry: all Claude sessions across projects in the sidebar, status + click-to-jump
- [x] Status without parsing output — activity (working/idle) + terminal bell (attention); visibility-aware
- [x] Tab-level status dots; attention badge
- [x] Quick-resume (`claude --continue`)
- [x] Cross-pane action: send a file's `@path` from the editor into the last-focused Claude session
- [ ] Later: send API response / DB result into a session; rename sessions independently of tabs

## Milestone 6 — Settings hub ✅ (2026-06-27)

- [x] Left-nav modal (reference-style): Appearance, Terminal, Editor, Claude, Shortcuts, About
- [x] Persisted to `settings.json`; wired to real behavior:
  - Appearance: accent color (single wabi-sabi accent, applied to CSS vars)
  - Terminal: default shell (PowerShell / cmd / Git Bash / WSL / custom) + font family/size (live)
  - Editor: font size, tab size, word wrap, minimap
  - Claude: command, resume args, idle→attention timing
- [ ] Later sections: Git multi-account, SSH, Remote (mobile access), MCP, AI, light theme

## Milestone 8 — 1DevTool-inspired depth ✅ (2026-06-27)

From studying the 1DevTool reference (video + 1devtool.com):
- [x] **Multi-agent sessions** — agent presets (Claude/Codex/Gemini/custom) with type badges; generalized from Claude-only
- [x] **Prompt composer** — rich prompt box with `@file` mentions → focused agent (Ctrl+Shift+P)
- [x] **Project groups** — collapsible named groups in the sidebar
- [x] **Project switcher** — Ctrl+K launchpad grid (search, live counts, keyboard nav)
- [x] **Markdown preview** — Edit/Split/Preview + word count
- [x] **Status bar** — git branch + change count, attention, remote, project
- [ ] Later (from reference): agent pipelines (chain agents), embedded browser, image-preview tabs, AI diff, activity feed, more DB engines

## Later / maybe (parking lot)

- Command palette (Ctrl+P) for projects/files/actions
- Split terminals (not just tabs) within a project
- Restore terminal layout across app restarts (which tabs, which were Claude)
- **Git multi-account** — per-account PAT (GitHub/GitLab), custom SSH command, token verification, per-project Git identity / pinned accounts (new Settings section)
- **SSH** profiles + remote project folders (new Settings section)
- **Remote / mobile access** — reach DevDeck from a phone (see NOTES; security-sensitive, needs design)
- **MCP** server management; **AI** settings (new Settings sections)
- Per-terminal/per-project shell override (default shell is now configurable)
- Embedded **Browser** panel (preview + simple devtools)
- Wabi-sabi **light "washi paper" theme** + theme switching
- Cross-platform (macOS/Linux) polish
- Snippets / saved command runner per project
- Pipe an API response or file path straight into a running Claude session

## Decisions log

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-26 | Electron + electron-vite + React + TS | Best-in-class terminal libs (xterm.js, pty), easy to add Monaco + HTTP client; ship fast on Windows. |
| 2026-06-26 | `@lydell/node-pty` instead of `node-pty` | Ships prebuilt binaries → no MSVC C++ toolchain needed (user's machine lacks the compiler). Removes the #1 Windows setup risk. |
| 2026-06-26 | Sequence "all-in-one" into milestones; terminal/project core first | User chose the all-in-one vision; honored in architecture, but the terminal core must be excellent before layering editor/API/network or it's all lipstick. |
| 2026-06-26 | `allotment` for layout | Lightweight resizable split panes; defer a full docking lib (dockview/rc-dock) until layout needs grow. |
| 2026-06-27 | Pinned Electron 33 + Vite 5 (not latest 42 / 7) | Electron 42's installer (`@electron/get@5`) is ESM-only and needs Node ≥22.12; machine runs 22.11. Electron 33 + Vite 5 support Node 22.11 cleanly. Revisit after a Node LTS bump. |
| 2026-06-27 | Verified `@lydell/node-pty` loads under Electron's ABI | Headless Electron smoke test spawned a shell with no rebuild/compiler — confirms the prebuilt-binary bet before building UI on it. |
| 2026-06-27 | Pty sessions own a replay buffer; panes don't kill on unmount | Lets a pane detach/re-attach (splits, tab/project switches) without losing the session — main keeps the pty + ~256 KB tail, replayed to the new xterm. Kill is explicit only. |
| 2026-06-27 | Split layout = binary tree, terminal-mgmt keys are `Ctrl+Shift+…` | Tree keeps split/close/collapse simple and serializable for persistence. `Ctrl+Shift` combos (captured before xterm) avoid clobbering shell keys like Ctrl+C/Ctrl+W. |
| 2026-06-27 | DB panel ships Postgres + MySQL first; SQLite deferred | `pg`/`mysql2` are pure-JS (no compiler); `better-sqlite3` is native and won't build without MSVC. SQLite will use a WASM driver later to stay compiler-free. |
| 2026-06-27 | DB passwords encrypted at rest via Electron `safeStorage` (DPAPI) | Avoid plaintext credentials on disk; passwords are never sent back to the renderer (only referenced by connection id). |
| 2026-06-27 | Claude status from activity + bell, not output parsing | Coupling to Claude CLI's text output is fragile (NOTES risk). Output-activity (working/idle) and the bell char `\x07` (attention) are format-independent and intentional signals. Visibility-aware so viewing a session clears attention and buffer-replay doesn't false-trigger. |
| 2026-06-27 | Mobile access = terminals-first + Tailscale; pty made multi-client | A remote terminal is RCE surface, so: off by default, token required, prefer Tailscale (no public exposure). Pty refactored to an event bus + per-client buffer replay so phone + desktop attach to the same sessions. Session metadata stays in the renderer and is synced to the server. |
