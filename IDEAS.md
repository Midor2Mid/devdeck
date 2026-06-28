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
- [x] **Unified AI diff review** — shipped v0.1.8.
- [ ] **Fire one prompt at many agents** at once (+ @mention targeting).
- [ ] **Rich prompts** — image/drag-drop into the composer.
- [ ] **Pipeline conditional branching / delays / checkpoints** (we have linear
      pipelines + gates + triggers already).

### Deliberately skipping (breadth, not differentiation)

- 26 database engines (we have PG/MySQL/SQLite — enough).
- Standalone "memory manager" UI (Claude already manages memory).

## Unique to DevDeck — the moat (built around the user's workday)

- [x] **Work-item-native start** — Jira/Azure Work panel, shipped v0.1.9
      (proxy support v0.2.0).
- [x] **Release / promotion board (UAT→PROD)** — shipped v0.2.0 (git-ref stages,
      promote gaps, pre-flight checklist, commands/tag — no auto-push).
- [x] **Standup / worklog generator** — shipped v0.2.1.
- [ ] **Record → share repro** — turn a terminal recording into a shareable
      bug-repro / PR artifact (asciinema-style link or GIF).
- [ ] **Role-panel review** — on Claude Team, run a panel of agents with
      different lenses (correctness / security / .NET conventions) over a diff and
      aggregate the verdicts. The "act as a team" idea, productized.
- [ ] **C#/.NET-aware actions** — build/test/watch with parsed, clickable build
      errors.
- [ ] **Corporate-proxy friendliness** — first-class TLS-proxy config (the user's
      environment breaks npm behind a corporate proxy).

## Design

- [x] **Design Style presets** — six shipped (v0.2.2–v0.2.6) + **Modern Pro**
      (v0.3.0). **Modernization** (v0.3.0): line-icon system, Slate theme, Modern
      Pro default. Remaining: slim icon-rail layout + top command bar (structural).
