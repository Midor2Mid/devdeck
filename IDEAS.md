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
