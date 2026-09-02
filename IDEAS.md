# DevDeck — Ideas Backlog

Living list of feature ideas and product direction. Nothing here is committed
scope — it's a place to capture thinking so it isn't lost. Built items move to
`CHANGELOG.md`.

> Philosophy: don't copycat. DevDeck's moat is being a **personal** tool wired to
> one developer's actual workday (C# backend, outsource team, Jira + Azure DevOps,
> UAT→PROD). A commercial tool can't justify that specificity; this one can.

## Parity check vs. 1DevTool (2026-06-28)

DevDeck is at rough feature parity and ahead in three places 1DevTool doesn't
have: **mobile remote access** (Tailscale), **terminal record/replay**, and the
**Canvas** layout. So the goal is differentiation, not catch-up.

### Gaps worth closing (their features we lack)

- [x] **Git worktree-per-agent** — shipped v0.1.8.
- [x] **Unified AI diff review** — shipped v0.1.8; **AI actions on the diff** +
      **Open PR** (Azure API / web) v0.3.2 → full ticket→worktree→review→PR loop.
- [x] **Fire one prompt at many agents** at once (+ @mention targeting) —
      PromptComposer: checkbox targets grouped by project, All/This-project/Idle
      presets, `broadcast()`, confirm on ≥3; `@file` + `/snippet` autocomplete.
- [x] **Rich prompts** — drop/paste an image into the composer (2026-07-16):
      saved to `.devdeck/uploads` (type preserved, `fs:saveUpload`) and appended
      as an `@`-mention so the agent can read it.
- [x] **Pipeline conditional branching / delays / checkpoints** (2026-07-16):
      per-step delay + manual checkpoint (pause→Continue), and gate routing
      (onPass/onFail = next / stop / goto:<step>) with a 50-step run cap.

### Deliberately skipping (breadth, not differentiation)

- 26 database engines (we have PG/MySQL/SQLite — enough).
- Standalone "memory manager" UI (Claude already manages memory).

## Checked against Orca and deliberately not built (2026-08-30)

Full reasoning in `.superpowers/orca-2026-08-30/T1-build-list.md`. Do not re-propose
without engaging it.

- Agent map / spatial canvas — **Orca built it and deleted it** (PR #15853).
- Dashboard pop-out window; right-sidebar activity bar; floating terminal; tab-group
  docking — four surfaces answering questions one sorted list answers.
- Worktree-per-agent as an app-managed lifecycle, and the worktree-as-navigation-object
  frame — it would silently retire "a project is the unit of context".
- Agent hibernation; silent stale-to-idle decay (a signal that lies).
- Native mobile app, hosted relay, desktop-to-desktop pairing, headless daemon.
- Design Mode (element → HTML+CSS+screenshot → prompt): passes the agent edge, killed
  because this developer writes C# backends. Revisit when the work is frontend.
- Terminal-theme import from Warp/Ghostty; i18n; in-product feature wall.
- A `yolo/manual/mixed` permission chip — it lies on any custom arg.

Two things the review recommended that DevDeck **already ships**: attention counts on a
row you pass anyway (`DeckStatus.tsx`, `wantsYou`), and retaining a dead session's tile
(`specs/2026-08-25-dead-pane-lifecycle-design.md`).

## Checked against 1DevTool and deliberately not built (2026-08-31)

Full reasoning in `.superpowers/1devtool-2026-08-31/T1-verdict.md`; competitor evidence in
`R1-competitor.md`, mechanism cost in `R2-feasibility.md`.

- **Terminal + browser + DB visible at once** — in any form: a two-pane split, a docked
  drawer, a persistent secondary pane, or a full dockable workspace. Killed on mechanism:
  `TerminalPane.tsx` resizes the pty to its pane, so a narrowed terminal wraps the agent's
  permission prompt and `detectApproval` stops matching — Approve/Deny disappears from the
  tile, the Overview row and the phone with no error. A cosmetic feature that silently
  disables a correctness signal is the defect class this repo has spent two releases
  removing.
- Seven switchable layout presets — a product that had solved on-screen composition
  would need one, not seven.
- The DB and browser panes as depth products — four engines already covers the
  relational work this developer's projects need; more is maintenance surface, not
  value.

What DevDeck does instead, and already ships: panels stay mounted (`App.tsx` toggles
`display`, so nothing is lost on a switch), the deck stays visible under every view with
live state and the "N need you" count, terminals have their own splits/Grid/Canvas/Overview,
and the MCP tools let an agent read the DB, replay saved requests and read browser console
logs with **no panel visible at all**. Tools sharing *context* is the mechanism; sharing a
screen is the screenshot.

## Unique to DevDeck — the moat (built around the user's workday)

- [x] **Work-item-native start** — Jira/Azure Work panel, shipped v0.1.9
      (proxy support v0.2.0).
- [x] **Release / promotion board (UAT→PROD)** — shipped v0.2.0 (git-ref stages,
      promote gaps, pre-flight checklist, commands/tag — no auto-push).
- [x] **Standup / worklog generator** — shipped v0.2.1.
- [x] **Record → share repro** (2026-07-16) — export a recording to asciinema
      v2 `.cast` (`asciicast.ts`); `asciinema play`/`upload` for a link. GIF
      deferred (needs a terminal rasterizer + encoder).
- [x] **Role-panel review** — `reviewLenses.ts` (correctness / security / .NET
      idioms / performance / tests) fan out over the uncommitted diff via the
      review flow; each lens runs in its own agent session.
- [x] **C#/.NET-aware actions** — build/test with parsed, clickable diagnostics
      that jump to file:line (DotnetPanel, Ctrl+Shift+B) + **Watch** launches a
      live `dotnet watch` terminal (2026-07-16).
- [x] **Corporate-proxy friendliness** (2026-07-16) — Settings → Proxy: upstream
      HTTP(S) proxy + no-proxy + extra CA, injected into every new terminal and
      child process (npm/git/dotnet/gh) via process.env (`netproxy.ts`). API
      client + updater not yet routed (no undici).

## Also shipped 2026-07-16

- [x] **One-click Run** — topbar play button detects the project type
      (Node `dev`/`start`, .NET `dotnet run`, Go `go run .`) and runs it in a
      fresh terminal at the project cwd; hidden for unrecognized types.
- [x] **Mobile coding + AI** — the remote/mobile client gained a **Files** view
      (browse project tree, open/edit/save, confined to project roots) and an
      **AI** view (compose a prompt with tap-to-insert `@file` mentions, fire it
      at any running agent session). See ROADMAP M7 "full-UI mobile client".

## Design

- [x] **Design Style presets** — six shipped (v0.2.2–v0.2.6) + **Modern Pro**
      (v0.3.0). **Modernization** (v0.3.0): line-icon system, Slate theme, Modern
      Pro default. Slim icon-rail layout + ⌘K command-bar topbar (v0.3.1). DONE.
