# DevDeck

> A command deck for terminal-first, AI-CLI-driven development: multiple terminals and agent sessions (Claude, Codex, Gemini) across projects, and one screen that answers which of them needs you.

## The problem

- **Who has this problem?** Me — a developer whose day is spent in the terminal driving agent CLIs across several projects at once. (Likely shared by other terminal-first / AI-CLI-first developers. "Likely" is doing real work in that sentence — see Validation.)
- **What is the pain?** My workflow is fragmented across tools: a terminal emulator for shells and agent sessions, an IDE for editing, Postman for API calls, a separate GUI for databases. Switching projects means re-`cd`-ing everywhere, re-opening tabs, and losing context. Running several agent sessions in parallel across projects is clumsy — I lose track of which terminal is which, and of which one is waiting on me.
- **How do they solve it today?** Windows Terminal (tabs/panes) + VS Code + Postman/Insomnia + a database GUI, juggled manually — that part hasn't changed, and none of them knows about "the project I'm working on" as a single switchable context. What has changed, verified 2026-09-10: "none of them can tell me which agent needs an answer" was true when this line was written and is not true now. Claude Code's own CLI (`claude agents`, a needs-input-first list) and Desktop app (session sidebar, notifications) answer it for a Claude-only user with nothing beyond the CLI itself; Remote Control puts phone approve/deny on every plan, over Anthropic's own relay; `microsoft/intelligent-terminal` answers it inside a Windows Terminal fork over ACP; and Herdr — 37,000+ stars, Apache-2.0, a single Rust binary, no Electron, native Windows beta — badges every pane working/blocked/idle across a dozen-plus CLIs including `claude` and `codex`. What's still narrowly mine: a phone approve/deny card bound to the exact screen that produced the question, never routed through anyone's relay; a **project** — not a repo, not a worktree — as the unit of context across a GUI instead of a terminal multiplexer; and per-project git identity. The phone card has never rendered on real hardware, and D1 (`ROADMAP.md`) is about to delete most of the panels that made "one window" mean something — so this is a narrower claim than the one this line used to make, not a bigger one.
- **Why is now the right time?** My work has shifted to be overwhelmingly agent-CLI-driven. The terminal is the cockpit now, so a tool built *around* the terminal (not around the file tree, like an IDE) fits how I actually work.

## The value proposition

- **What we offer:** One window where a **project** is the unit of context. Pick a project and every panel — terminals, editor, API client, database client, task board — snaps to it. Run many terminals and many agent sessions side by side, labeled and persistent, with one screen that shows every live agent across every project and which of them is waiting on you.
- **Why it's better than the status quo:** No more re-`cd`-ing and re-opening across four apps. Terminal-first layout (the terminal is a first-class citizen, not a drawer at the bottom). Agent-CLI affordances no terminal emulator has: one-click new session per project, per-session labels, and a supervision surface that answers "who needs me" once, in one place.
- **What we deliberately are NOT doing:**
    - Not replacing VS Code for heavy editing; no language servers, no debugger.
    - **No network capture.** A Network view and a local capture proxy were built and then deleted after 0.12.0 — they cost more to carry than they returned. (What survives under that name is unrelated: applying a corporate upstream proxy to the processes DevDeck spawns, so `npm` and `git` work behind one.)
    - **Not cross-platform.** Windows only, on purpose, because DevDeck drives a real Windows shell and a real pty. macOS and Linux are not planned.
    - Not a hosted service. No account and no telemetry; diagnostics go to the clipboard, not to a server. The one thing that leaves the machine is the phone approve/deny surface, which you pair yourself over your own network.

## Validation

**No external user has ever run this app.** Not one install off this machine,
not one recorded first session, not one sentence from anybody who is not its
author. That is the honest state of validation for this product, and it is
embarrassing on purpose: the whole of the current milestone exists to change it.

- [x] The pain is real and frequent — experienced daily, by one person.
- [x] That person is the author, so every design call in this repo has been
      ruled on by the only user, against their own habits. That is a fast way
      to build and a bad way to know anything.
- [ ] **Anybody else has run it.** Open, and the only item on this list that
      can tell a tool apart from a habit.
- **Evidence / quotes:** exactly one, from the author — *"most of my works are
  on terminal using claude cli so I hope this tool can also allow me to easily
  switch between projects and have multiple terminal active at the same time"*
  (2026-06-26). A quote from the person who wrote the code is a design note,
  not evidence.

**The milestone is 5–10 real users**, recruited one at a time, every install
watched and every first session recorded verbatim (`ROADMAP.md`, step 9). Not a
public launch, not revenue, not a number on a page. Until those sessions exist,
every claim in this document about what DevDeck is worth to anyone other than
its author is a hypothesis with n=1.

## Success metrics

How will we know it's working? The first three are the author's own bar, and
every one of them can be true of a tool nobody else can use — they were the
whole of this section until 2026-09-04, which was the defect.

1. **It becomes my daily driver** — I open DevDeck instead of Windows Terminal for a full week of real work.
2. **Project switch is fast** — switching active project and spinning up its terminals takes < 5 seconds and zero manual `cd`.
3. **Parallel agent sessions are legible** — I can run ≥3 agent sessions across projects without losing track of which is which, or of which one is blocked on me.
4. **Somebody else gets it running, and says something back** — 5–10 users, each install watched, each first session recorded verbatim. The one metric nothing in this repo can move on its own, and the one with no data at all.

## Scope

- **Platform(s):** Windows desktop, only. Electron, but macOS and Linux are not planned — see the value proposition.
- **Tech stack:** Electron + electron-vite + React + TypeScript. Terminals: xterm.js + `@lydell/node-pty` (prebuilt binaries — no native compiler needed). Editor: Monaco. Layout: `allotment` resizable split panes. HTTP client and database drivers run in the main process (`mssql`, `mysql2`, `pg`, `node-sqlite3-wasm`).
- **MVP = the smallest thing that delivers value:** Multi-terminal + project switcher (see `ROADMAP.md`). Everything else — editor, API client, database client, agent supervision — layers onto the same workspace shell.

## Open questions / risks

- **n=1 design.** The largest risk in this document, and the reason the current milestone is recruitment rather than features. Six surfaces and 78 of 84 skins have been built and then deleted; each was defensible to its only user at the time. There is no way to tell a real requirement from the author's habit without somebody else's first five minutes.
- **Native module (pty) on Windows** — mitigated by using `@lydell/node-pty` (ships prebuilt binaries). If it ever fails, fallback is `node-pty-prebuilt-multiarch` or ConPTY directly.
- **Scope creep** — "all-in-one" is the vision, but the terminal/project core must be excellent first or the rest is lipstick. The post-0.12.0 deletions are what enforcing this costs once it has been deferred.
- **Agent-CLI integration is fragile** — reading CLI output couples us to its format, and the approval prompt DevDeck parses is the most valuable and most brittle thing it does. Prefer UI affordances over a plain pty; only parse output where it is clearly stable, and never let a parse failure render as a confident answer.
- **Performance** — many live terminals plus Monaco in one Electron window. Watch memory; lazy-mount panels.
