# DevDeck

> A command deck for terminal-first, AI-CLI-driven development — multiple terminals, agent sessions (Claude, Codex, Gemini), fast project switching, an editor, an API client, and a database client in one window.

See `PRODUCT.md` for the problem and target user, and `ROADMAP.md` for the milestone history and the live plan.

## What DevDeck is not

Not a replacement for a full IDE — there's no language server or debugger. Not a
packet analyzer. Not cross-platform: DevDeck runs on **Windows only**, on
purpose, because it drives a real Windows shell and a real pty. macOS and Linux
are not planned.

## Project policy

One maintainer. Issues are open for bug reports. Discussions are off. There is
no `CONTRIBUTING.md`, because there is no contribution process — pull requests
are accepted only to fix behavior DevDeck already ships, by invitation. Open an
issue first.

## Status

Current release: **0.12.0**. Milestone 1 (terminal + project core) closed long
ago; see `ROADMAP.md` for what shipped since, and its "Next" section for the
live plan — recruiting 5–10 real users, not a public launch and not revenue.

## Before you install: what DevDeck needs from you

DevDeck does not install AI agents for you. It drives CLIs you install
yourself and finds on your PATH:

- [Claude Code](https://docs.claude.com/en/docs/claude-code) — `claude`
- [OpenAI Codex CLI](https://github.com/openai/codex) — `codex`
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) — `gemini`

You need at least one of these for the agent-session features; DevDeck's
terminal, editor, API client, and database panels work without any of them. To
check what you have, open PowerShell and type the command name (`claude`,
`codex`, `gemini`) — if it isn't recognized, install that CLI first. DevDeck
does its own version of this same check on launch and tells you plainly what
it found: see "The first five minutes" below.

## Install the released app

1. Download the latest installer from the
   [Releases page](https://github.com/Midor2Mid/devdeck/releases) —
   `DevDeck-Setup-<version>.exe` for a normal install, or
   `DevDeck-Portable-<version>.exe` if you'd rather not install anything.
2. Run it. Windows will very likely show **"Windows protected your PC."** This
   is Microsoft Defender SmartScreen, not a warning about the installer's
   contents — click **More info**, then **Run anyway**.
3. You're seeing that prompt because the installer is signed with a
   self-signed certificate, trusted today only on the developer's own machine
   — a real Authenticode signature, but not one Windows trusts out of the box.
   A free certificate for open-source projects, from the SignPath Foundation,
   is the plan for clearing SmartScreen for everyone — but it has **not** been
   applied for yet, and cannot be: the Foundation requires a public repository
   and this one is still private. See the
   [DevDeck homepage](site/index.html) for the full code-signing policy.
4. Launch DevDeck from the Start menu (installed) or by running the portable
   `.exe` directly.

## The first five minutes

With no project open, every view in DevDeck resolves to one screen: the name,
one line about what it does, and a single button, **Open a project folder**.
Below it: which agent CLIs DevDeck expects, and a line reporting what it
actually found on your PATH just now — `Found on your PATH: claude, codex,
gemini.`, or `None were found on your PATH.` if it didn't, or that it couldn't
check yet. That sentence renders nothing until the check has actually run — it
never guesses.

1. Click **Open a project folder** and pick a folder in the normal Windows
   dialog. DevDeck opens it and lands on **Mission**, its overview screen
   (agent sessions, uncommitted changes across your projects, listening ports
   on this machine).
2. Switch to **Terminal** — the third view key in the deck along the bottom
   of the window, or `Ctrl+3`. With
   no terminals yet it shows **+ New terminal**, plus one card per configured
   agent (**Claude**, **Claude Opus**, **Claude (no permission prompts)**,
   **Codex**, **Gemini**
   by default) and, if the folder has a `package.json`, one card per script in
   it.
3. Click **+ New terminal** (or press `Ctrl+Shift+T`) for a plain shell, or
   click an agent's card to start that CLI in the project's directory.
   `Ctrl+Shift+Enter` starts your primary agent from anywhere in the Terminal
   view.
4. `Ctrl+K` reopens the project list later. `F1` opens the complete, current
   keyboard-shortcut reference at any time — it's the source of truth, ahead
   of anything below.

If a card reads **not found on your PATH**, it still launches — DevDeck can't
see a shell alias or function, only what a real PATH walk finds — but if
nothing happens when you launch it, that's why.

## Building from source

Requires Node **^20.19 || >=22.12** on Windows (what Vite 7 and electron-vite
5 ask for). Built and verified on **Node 22.23.2**.

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

To produce a **signed** build (self-signed, trusted only on the machine that
made the cert — see "Install the released app" above for what that's worth to
anyone else):

```bash
npm run cert:make      # once, creates the local signing cert
npm run package:signed # builds, packages, signs, and verifies the signatures
```

Native/WASM deps (`@lydell/node-pty`, `node-sqlite3-wasm`, `@xterm/xterm`) are
unpacked from the asar archive automatically (see the `build` field in
`package.json`).

## Checking a change actually works

```bash
npm test                  # 1,518 unit tests
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

Run `npm run typecheck` before committing — the build does not typecheck on
its own, so nothing else catches a type error.

## What works today

- **Projects in the deck** — add a folder as a project; the deck along the bottom of the window carries one strip per project with its live sessions, and `Ctrl+K` switches between them. Persisted across restarts.
- **Multi-terminal** — real shells via xterm.js + pty, tabbed, each spawned in the active project's directory.
- **Split panes** — split any terminal right (⇆) or down (⇅) to see multiple terminals at once; close panes and the layout collapses cleanly.
- **Multi-agent sessions** — configurable agent presets (Claude, Claude Opus, Claude (no permission prompts), Codex, Gemini, or a custom command) launched per project, each with a type badge; `+` for the primary agent, `▾` menu for the rest (with resume). DevDeck checks each command against your shell's PATH and says so on the card, rather than launching into a pane that silently fails. Configure in Settings → Agents.
- **Task board + dispatch rules** — cards move through doing/review/done on real evidence (a snapshot of the project's git state, not just a quiet terminal); a Dispatch button routes a card to an agent by rule (title match, glob, or project) instead of always picking the first preset.
- **Prompt composer** — `Ctrl+Shift+I` opens a rich prompt box with `@file` and `/snippet` autocomplete (snippets defined in Settings) to compose and send to the focused agent session.
- **Terminal layouts** — three ways to arrange sessions: **Tabs**, a **Dashboard grid** of every terminal in the project, and an **Overview** across every project at once.
- **Project groups + switcher** — organize projects into collapsible groups; `Ctrl+K` opens a searchable launchpad grid of all projects with live session counts.
- **Status bar** — active project, git branch + uncommitted-change count, **git identity** (click to switch account), attention flag, remote indicator.
- **Git accounts** — define work/personal identities (name, email, custom SSH command) in Settings → Git and apply one per project (writes the repo's local `git config`).
- **SSH hosts** — define SSH profiles in Settings → SSH and open a connected terminal from the terminal `▾` menu.
- **MCP servers** — manage the active project's `.mcp.json` (command/args/env) from Settings → MCP, read by Claude Code and other agents.
- **Agent awareness** — every agent session (across all projects) sits in its project's deck strip with live status (working / idle / **needs attention**), an attention badge, and click-to-jump. Status is inferred from output activity + the terminal bell — no fragile output parsing.
- **Usage & cost** — a per-run ledger, priced from Claude Code's own transcripts (real tokens and USD, not an estimate), kept independent of whatever spent the money — deleting the card or pipeline that ran it doesn't delete the record.
- **Send file → Claude** — from the editor, send the current file's `@path` into the last-focused Claude session.
- **Sessions survive switches** — switching project/tab/pane keeps every pty running; panes re-attach and replay recent output (no lost work). Sessions end only when you close them.
- **Layout persists** — your tabs and split layout per project are restored on relaunch (as fresh shells/agent sessions in the same arrangement).
- **Rename tabs** — double-click a tab to rename it.
- **In-terminal find** — ⌕ / `Ctrl+Shift+F` to search the focused terminal.
- **API client** — Postman-style request builder (runs in the main process, no CORS limits); **paste a cURL command into the URL bar** and it auto-parses into method/headers/body.
- **Browser** — embedded web browser with a **Comment Mode**: click any element to annotate it, then send grouped feedback to your focused agent — element selector + note + URL, recent **console errors/warnings**, captured **network requests** (failed/4xx/5xx), and a **page screenshot**.
- **Editor** — Monaco-powered: file tree, multi-file tabs, syntax highlighting, dirty indicators, `Ctrl+S` to save.
- **Database** — per-project saved connections (PostgreSQL, MySQL, SQL Server & **SQLite**), Monaco SQL editor (`Ctrl+Enter` to run), table browser, results grid. SQLite uses a WASM driver (no native build) and reads/writes real `.db` files via a file picker. Passwords encrypted at rest (Electron `safeStorage`).
- **Themes** — 3 color themes (Slate, Sumi, Washi) × 2 design styles (Modern Pro, Wabi-sabi), switchable independently in Settings → Appearance and applied across UI, terminal, and editor; default is Slate + Modern Pro.
- **Diagnostics** — a capped, deduped, redacted crash log with a *Copy diagnostics* button on crash cards and in Settings → About, for handing someone the actual reason something broke. Nothing is sent anywhere; it goes to your clipboard, and the button tells you so.
- **Settings** (⚙ in the deck's tool cluster, bottom right) — Appearance, Terminal (default shell: PowerShell/cmd/Git Bash/WSL/custom + font), Editor (font/tab/wrap/minimap), Agents, AI (per-agent model + API key), Snippets, Pipelines, Git, SSH, MCP, Remote (mobile access), Corporate proxy, Notifications, Shortcuts reference, About. Persisted to `settings.json`.
- **Remote / mobile access** — turn on a token-guarded server (Settings → Remote) and open the shown URL/QR on your phone to view and drive your terminals + agent sessions, including approving or denying an agent's permission prompt from your phone. Off by default; bind is token-gated. For access *anywhere*, run [Tailscale](https://tailscale.com) on this PC and your phone (no public exposure) — the URL uses your Tailscale IP automatically when present.

> **Security:** a remote terminal can run commands on this machine. Keep the token private, prefer Tailscale over any public tunnel, and disable Remote when you don't need it.

### Terminal keyboard shortcuts

A quick reference; press **F1** in the app for the complete, current list (global, terminal, editor, and database).

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+T` | New shell tab |
| `Ctrl+Shift+Enter` | New agent session |
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
└── renderer/    # React UI — workspace shell, deck, terminal/editor/api panels
```

- Terminals: `@lydell/node-pty` (main) ↔ `@xterm/xterm` (renderer), streamed over IPC.
- Layout: `allotment` resizable split panes.
- State: project list persisted to Electron `userData`.
