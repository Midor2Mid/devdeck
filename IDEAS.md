# DevDeck — Ideas Backlog

Living list of feature ideas and product direction. Nothing here is committed
scope — it's a place to capture thinking so it isn't lost.

**How to read this file, set 2026-09-15.** It is a backlog and a register, so a
dead idea stays here with its cause of death rather than being deleted — the
record of what was considered is the point. But the marks mean exactly one thing
each, and they are checked against the tree, not against memory:

- `[x]` — **shipped and still in the build today.** Nothing else earns this box.
- `[-]` — **built and then deleted.** Names the release that removed it, and why.
- `[ ]` — never built.

Built items also appear in `CHANGELOG.md`; deletions appear there too, and that
is where the full reasoning lives.

> **The moat paragraph that stood here until 2026-09-15 is gone, and it is worth
> saying what it claimed.** It read: *"DevDeck's moat is being a personal tool
> wired to one developer's actual workday"*, and then named that workday's stack
> and process in detail. Two things are wrong with it. **It contradicts the
> standing decision of 2026-09-02** — the ambition is a product with users and
> the current milestone is five recorded sessions from people who are not the
> author (`ROADMAP.md`). A moat made of one person's specificity is an argument
> for never having a second user. And **it was employer-shaped prose on a public
> repository**, which is the class of leak `tests/publishedIdentifiers.test.ts`
> exists to catch, and which this repo has already leaked twice.
>
> **What replaces it is smaller, and it is the whole claim.** DevDeck's signal
> **names its source and refuses what it cannot source** — the agent said it over
> a hook, or DevDeck guessed it from terminal output; the tile says which; and a
> hook that cannot be matched to a session attributes nothing rather than picking
> between two candidates. Nobody else does this. *It survives because nobody
> competes on it, which may also mean nobody buys on it* — that caveat travels
> with the claim everywhere it is written, and five recorded sessions exist to
> decide it. Everything else this file once called a moat is now free somewhere
> else: `github.com/vc1492a/Pane` is AGPL-3.0, Electron, native Windows,
> cross-vendor, worktree-per-agent, with a self-hosted phone client, at zero
> cost. Herdr, Maestro, Nimbalyst and Munder Difflin hold the rest.
>
> **So the standing instruction for anything proposed below is:** don't copycat,
> and don't propose a differentiator that has expired. A clause Pane ships free
> may be *stated as a fact about the build*; it may not be the reason anyone is
> asked to install it (`ROADMAP.md` → *What this roadmap now forbids*).

## Parity check vs. 1DevTool (2026-06-28) — **two thirds of it is now false**

~~DevDeck is at rough feature parity and ahead in three places 1DevTool doesn't
have: **mobile remote access** (Tailscale), **terminal record/replay**, and the
**Canvas** layout.~~ **Struck 2026-09-15.** Terminal recording and the Canvas
layout were both deleted in 0.13.0 (see the deleted list below), so two of the
three "ahead" places no longer exist. The third, mobile remote access, still
ships — and is no longer ahead of anything: Pane's Remote Pane, Maestro's
QR-code phone access and Nimbalyst's iOS companion are all free.

**What the section was right about, and it is the only part that survives:** the
goal is differentiation, not catch-up. Parity checks against a feature list are
how this file accumulated most of what was later deleted.

### Gaps worth closing (their features we lack)

- [x] **Git worktree-per-agent** — shipped v0.1.8. Still here (`main/worktrees.ts`,
      `WorktreesModal.tsx`). Note it is now the *industry* default while DevDeck's
      own dispatch default is off — an explicit minority position that only a
      recorded session may re-open (`ROADMAP.md`, `W5`).
- [x] **Unified AI diff review** — shipped v0.1.8; **AI actions on the diff** +
      **Open PR** (Azure API / web) v0.3.2. Still here (`ReviewPanel.tsx`,
      `ChangesModal.tsx`, `PrModal.tsx` → `pr.createAzure`). **But the loop is no
      longer ticket→worktree→review→PR**: the ticket end was deleted with the Work
      panel, so it now starts at a worktree.
- [x] **Fire one prompt at many agents** at once (+ @mention targeting) —
      `PromptComposer.tsx`, `broadcast.ts`. Still here.
- [x] **Rich prompts** — drop/paste an image into the composer (2026-07-16):
      saved to `.devdeck/uploads` (`fs:saveUpload`) and appended as an
      `@`-mention so the agent can read it. Still here.
- [x] **Pipeline conditional branching / delays / checkpoints** (2026-07-16) —
      `pipeline.ts`, `PipelineBar.tsx`. Still here.

### Deliberately skipping (breadth, not differentiation)

- ~~26 database engines (we have PG/MySQL/SQLite — enough).~~ **Overtaken
  2026-09-15: DevDeck now has zero.** All four drivers left with the Database
  panel in 0.14.0, and re-adding any of them is refused in advance by
  `ROADMAP.md` ("Re-adding a panel or a deck key"). The entry stays because its
  reasoning — breadth is not differentiation — is what eventually deleted the
  panel too.
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
  because this developer writes C# backends. **Amended 2026-09-15:** that reason is
  now the wrong shape — "this developer" is the exact premise the current milestone
  exists to test. The kill stands on the other ground the review gave it (it is an
  authoring feature, and authoring is the IDE's job); revisit only if a recorded
  session asks for it.
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
  removing. **Still the right kill, and now over-determined:** there is no DB pane left
  to put beside anything.
- Seven switchable layout presets — a product that had solved on-screen composition
  would need one, not seven.
- The DB and browser panes as depth products — **the DB half is moot; the panel is
  deleted.** The browser half stands: more depth there is maintenance surface, not
  value.

~~What DevDeck does instead, and already ships: … the MCP tools let an agent read the
DB, replay saved requests and read browser console logs with **no panel visible at
all**.~~ **Corrected 2026-09-15 — that sentence named two retired tools.** D1 retired
five MCP tools along with the panels they read from; the surviving two are
`devdeck_projects` and `devdeck_console_logs` (`main/mcptools.ts`, `RETIRED_TOOLS`).

What is still true: panels stay mounted (`App.tsx` toggles `display`, so nothing is
lost on a switch), the deck stays visible under every view with live state and the
"N need you" count, terminals have their own splits/Grid/Overview, and an agent can
read browser console logs with no panel visible at all. **Tools sharing *context* is
the mechanism; sharing a screen is the screenshot** — that line was the point of the
section, and it survives its own examples.

## Built around one developer's workday — what survived, and what did not

**This section used to be titled "Unique to DevDeck — the moat". It is neither.**
Five of the nine things it listed have been deleted, and not one of the survivors
is unique. Renamed and re-checked against the tree on 2026-09-15.

### Deleted

- [-] **Work-item-native start** — Jira/Azure Work panel, shipped v0.1.9, proxy
      support v0.2.0. **`WorkPanel` deleted in 0.14.0 (D1).** A work-item tracker
      is a team artifact in a single-developer cockpit, and the deck seat it held
      is the scarcest chrome in the app. **Recorded because it is not tidy:**
      `src/main/work.ts` and its four `work:*` IPC handlers are still registered
      and still exposed through preload, with **no renderer caller** — a live
      channel holding encrypted Jira/Azure credentials and an insecure-TLS toggle
      that nothing can reach. 0.14.0's changelog says the panels went "along with
      their IPC handlers, preload channels, stores"; that is true of Db and Api
      and **false of Work**. Not ordered for removal before the beta — it is inert
      and nobody is installed anywhere — but the changelog sentence is wrong, and
      the module is first on the list for the tidy after the fifth recorded
      session.
- [-] **Release / promotion board (UAT→PROD)** — shipped v0.2.0. **`ReleaseBoard`
      deleted in 0.13.0**: a deployment tracker is a team artifact, GitHub
      Environments and the CI system own it, and it held a permanent seat in the
      deck's status region. Its five `release:*` IPC handlers went with it.
- [-] **Standup / worklog generator** — shipped v0.2.1. **`StandupModal` deleted
      in 0.13.0**, with the git-log-scraping worklog stack behind it. A single
      developer does not have a standup, and a team's standup is not a product
      feature.
- [-] **Record → share repro** (2026-07-16) — asciinema v2 `.cast` export.
      **Terminal recording and its modal deleted in 0.13.0**: buried under an
      overflow menu, never promoted, no agent edge; asciinema owns this. The run
      **ledger** also "records" and is a different thing — untouched, and
      load-bearing.
- [-] **C#/.NET-aware actions** — build/test with parsed, clickable diagnostics
      (`DotnetPanel`, `Ctrl+Shift+B`) and a live `dotnet watch` (2026-07-16).
      **Deleted in 0.13.0**: it jumps to file:line, i.e. it helps you author,
      which is Visual Studio's job, and it was stack-specific in a stack-agnostic
      product.
- [-] **The Canvas terminal layout** — **deleted in 0.13.0.** Two layouts is a
      choice; three is a hobby. Listed here because the 1DevTool parity check
      above claimed it as one of three advantages over a competitor.

### Still here

- [x] **Role-panel review** — `reviewLenses.ts` (correctness / security / .NET
      idioms / performance / tests) fan out over the uncommitted diff, each lens
      in its own agent session. The .NET lens is unaffected by the DotnetPanel
      deletion.
- [x] **Corporate-proxy friendliness** (2026-07-16) — Settings → Proxy: upstream
      HTTP(S) proxy + no-proxy + extra CA, injected into every new terminal and
      child process (npm/git/dotnet/gh) via `netproxy.ts`. **Explicitly not
      affected by any deletion** — three modules in this repo have "proxy" in the
      name and an earlier kill list once treated two of them as one feature.
- [x] **One-click Run** — topbar play button detects the project type (Node
      `dev`/`start`, .NET `dotnet run`, Go `go run .`) and runs it in a fresh
      terminal at the project cwd (`runProject.ts`); hidden for unrecognized
      types. `dotnet` project detection survives the DotnetPanel deletion.
- [x] **Mobile coding + AI** — the remote client's **Files** view (browse project
      tree, open/edit/save, confined to project roots) and **AI** view (compose a
      prompt with tap-to-insert `@file` mentions, fire it at any running agent
      session). **Carries the standing caveat:** the phone approve/deny card **has
      never rendered on real hardware** (`ROADMAP.md` step 7), and no sentence
      anywhere may present the phone surface as proven until it has.

## Design

- [-] ~~**Design Style presets** — six shipped (v0.2.2–v0.2.6) + Modern Pro
      (v0.3.0); line-icon system, Slate theme, Modern Pro default; slim icon-rail
      layout + command-bar topbar (v0.3.1). DONE.~~ **Overtaken 2026-09-15, and
      mostly deleted.** 0.13.0 cut **84 skins → 6**: Slate (default), Washi and
      Sumi — the stated wabi-sabi north star — across Modern Pro and Wabi-sabi.
      Ten styles and four themes were deleted, Aurora Glass, Neo Holographic and
      Kinetic Minimal among them, and `styles.css` went 8,716 → 7,081 lines. The
      icon rail is gone too; the shell is now a bottom deck plus a topbar. It is
      reversible — the CSS is in git — and it will not be reversed: **a seventh
      skin is refused in advance, three times over** (`ROADMAP.md`). Each skin was
      a tax on every future UI change, paid forever, for combinations nobody had
      ever selected.

## Not on this list, and refused in advance

These are here so that a good idea does not arrive looking new. The full
reasoning and the *not us* / *not real* verdicts live in `ROADMAP.md` → *What
this roadmap now forbids*; do not re-propose against this summary alone.

- **A second answer to "which agent needs me"** — any list, panel, badge, tray
  window, pop-out or view beside the deck's one row. *Not real.*
- **A fifth deck key, or any re-added panel**, under any name, for any stack.
  *Not us.* D1 bought exactly one thing, and this is how it would be spent.
- **Competing with Herdr on speed, binary size, "no Electron", TUI mode or
  multi-machine session lists.** *Not us, and losing is certain.*
- **ACP — or any structured protocol — as the session transport.** *Not us:*
  copy the stance, never the transport. The transport is a chat client.
- **Agents that supervise agents** — a coordinator, dispatcher or orchestrator
  pane. *Not us.* DevDeck is for the human who is still the bottleneck at two or
  three agents.
- **Free-text "steer" on the phone card.** *Not us.* The card's entire safety
  argument is that the route writes one keypress bound to a `tailHash`, or
  nothing.
- **A reviewer's queue** — ordering "who needs me" by how much reading it will
  cost. Ruled **not built, not queued, not now** on 2026-09-15. It is a *watch*
  (`W3`) with a threshold: two of five candidates, unprompted, either opening
  Changes or asking which agent to read first. Below two it is dead. If it fires
  it returns as a **re-ordering of the existing row and its existing `seen`
  state** — never a queue, never a panel, never a fifth key.
- **Any feature at all, before the fifth recorded session.** The only test that
  admits work right now is: *would a stranger's first session be wrong without
  it?*
