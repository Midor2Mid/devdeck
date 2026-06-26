# DevDeck

> A command deck for terminal-first, Claude-driven development — multiple terminals, fast project switching, an editor, an API client, and network debugging, all in one window. For me (a developer who lives in the Claude CLI), first.

## The problem

- **Who has this problem?** Me — a developer whose day is spent in the terminal driving the Claude CLI across several projects at once. (Likely shared by other terminal-first / AI-CLI-first developers.)
- **What is the pain?** My workflow is fragmented across tools: a terminal emulator for shells + Claude CLI, an IDE for editing, Postman for API calls, and yet another tool for network debugging. Switching projects means re-`cd`-ing everywhere, re-opening tabs, and losing context. Running several Claude sessions in parallel across projects is clumsy — I lose track of which terminal is which.
- **How do they solve it today?** Windows Terminal (tabs/panes) + VS Code + Postman/Insomnia + browser devtools/Wireshark, juggled manually. Each is good alone; none knows about "the project I'm working on" as a single switchable context.
- **Why is now the right time?** My work has shifted to be overwhelmingly Claude-CLI-driven. The terminal is the cockpit now, so a tool built *around* the terminal (not around the file tree, like an IDE) fits how I actually work.

## The value proposition

- **What we offer:** One window where a **project** is the unit of context. Pick a project and every panel — terminals, editor, API client — snaps to it. Run many terminals (and many Claude CLI sessions) side by side, labeled and persistent.
- **Why it's better than the status quo:** No more re-`cd`-ing and re-opening across three apps. Terminal-first layout (the terminal is a first-class citizen, not a drawer at the bottom). Deep Claude CLI affordances: one-click "new Claude session" per project, labeled panes, session awareness.
- **What we deliberately are NOT doing (for now):** Not replacing VS Code for heavy editing. Not a full IDE with language servers/debuggers. Not a Wireshark-grade packet analyzer. Not cross-platform-polished — Windows-first, since that's where I work.

## Validation (do this before building much)

- [x] Talked to / observed at least a few real potential users → **I am the user.** Validation = does it become my daily driver?
- [x] Confirmed the pain is real and frequent → Yes; experienced daily.
- [x] Confirmed they'd use (or pay for) a solution → I'll use it daily if it works; that's the bar.
- **Evidence / quotes:** *"most of my works are on terminal using claude cli so I hope this tool can also allow me to easily switch between projects and have multiple terminal active at the same time"* — me, 2026-06-26.

## Success metrics

How will we know it's working?

1. **It becomes my daily driver** — I open DevDeck instead of Windows Terminal for ≥1 full week of real work.
2. **Project switch is fast** — switching active project + spinning up its terminals takes < 5 seconds and zero manual `cd`.
3. **Parallel Claude sessions are legible** — I can run ≥3 Claude CLI sessions across projects without losing track of which is which.

## Scope

- **Platform(s):** Windows desktop (primary). Electron, so macOS/Linux are technically reachable later.
- **Tech stack:** Electron + electron-vite + React + TypeScript. Terminals: xterm.js + `@lydell/node-pty` (prebuilt binaries — no native compiler needed). Editor: Monaco. Layout: `allotment` resizable split panes. HTTP client: Node `undici`/fetch in main process.
- **MVP = the smallest thing that delivers value:** Multi-terminal + project switcher (see `ROADMAP.md`). Everything else (editor, API client, network inspect) layers onto the same workspace shell.

## Open questions / risks

- **Native module (pty) on Windows** — mitigated by using `@lydell/node-pty` (ships prebuilt binaries). If it ever fails, fallback is `node-pty-prebuilt-multiarch` or ConPTY directly.
- **Scope creep** — "all-in-one" is the vision, but the terminal/project core must be excellent first or the rest is lipstick. Sequencing enforced via ROADMAP milestones.
- **Deep Claude CLI integration is fragile** — parsing CLI output couples us to its format. Start with UI affordances over a plain pty; only parse output where it's clearly stable.
- **Performance** — many live terminals + Monaco in one Electron window. Watch memory; lazy-mount panels.
