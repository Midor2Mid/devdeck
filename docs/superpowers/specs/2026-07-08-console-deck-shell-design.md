# Console Deck — shell redesign

**Date:** 2026-07-08
**Status:** Design — awaiting review
**Scope:** The app shell/chrome only. The single-focus main panel (one view at a
time, panels stay mounted) is unchanged.

## Problem

The current shell is the classic VS Code three-zone layout: a slim icon **Rail**
(6 views + 8 tools) → a resizable **Sidebar** (projects + agent sessions) → the
**Main** panel (thin topbar + one view) → a **StatusBar**. Three complaints:

1. **Generic / VS Code-y** — no distinctive point of view; reads like every other
   Electron IDE.
2. **Wasted / awkward horizontal space** — Rail (~48px) + Sidebar (~240px) eat
   ~290px of width from the terminal, the thing the user lives in; the topbar is
   thin and underused; projects/agents don't scale gracefully.
3. **Navigation friction** — too many clicks/modes to move between projects,
   agents, and tools.

Explicit non-goal (user confirmed): do **not** turn the main area into a
multi-pane dashboard. One-view-at-a-time is good and stays.

## Solution overview

Replace the Rail **and** Sidebar with a bottom **Console Deck** — a live control
surface, in the spirit of the product's name. Navigation moves off the left edge
(reclaiming ~290px of width for the main panel) onto a short bottom band plus a
slim topbar. The deck expresses what DevDeck *is*: a surface for live agent
sessions you can watch and switch between.

```
┌────────────────────────────────────────────────────────────┐
│ ◐  devdeck ▾   / Terminal                     Search or run… │  TOPBAR ~40px
├────────────────────────────────────────────────────────────┤
│                                                              │
│                MAIN  (one view, full width)                  │
│                                                              │
├────────────────────────────────────────────────────────────┤
│ DEVDECK ▏[●claude ⣿][●dev]＋▕ FABRIKAM ▏[○pty]＋  ◀scroll▶  │  DECK
│ Terminal Editor API DB Web Net ▏ tasks ✉3 ◔ ⚙ ⋯ ▏ ⎇main ●3 │  ~64px
└────────────────────────────────────────────────────────────┘
```

Confirmed decisions:
- **One bottom band.** StatusBar is dissolved into the deck's baseline row (not a
  separate bar).
- **Project management lives in `Ctrl+K`.** The switcher is upgraded into a light
  project manager; the always-visible deck stays lean.
- **Full Console Deck** in the first cut (not a deferred MVP).

## Components

Break the deck into small, single-purpose units with clear interfaces. Each reads
existing store state — this is a **re-parenting of existing behavior**, not new
backend logic.

### `Topbar` (new small component, extracted from App.tsx)
- Ensō mark (brand anchor).
- **Active project `▾`** — opens the upgraded `Ctrl+K` switcher/manager. This is
  the cold-start path: opening a project that has no live session yet.
- View breadcrumb `/ <View label>`.
- **Command pill** (right) — `Search or run…`, opens the command palette
  (`Ctrl+Shift+P`). Moved out of the current per-view topbar so it's global.
- Depends on: `activeProject()`, `view`, `openSwitcher`, `setPaletteOpen`.

### `Deck` (new) — container, two rows
Row 1 = project strips (live sessions). Row 2 = view keys + tool cluster + status
region. Fixed height; a firm top divider so it reads as a distinct instrument
band against the terminal above it.

#### `ProjectStrip` (new) — one per *live* project
- A **project label** (click = `setActiveProject`; right-click = the full project
  context menu, identical to today's Sidebar menu: Open, Environment variables…,
  Saved commands…, Move to group / Ungroup, Save layout as preset, Open/Delete
  presets, Remove project).
- Its **agent keys** + a `＋` (start a session for this project via `newTabIn`).
- Only projects with ≥1 agent session appear. The active project's strip is
  lifted (elevation/edge-hi).

#### `AgentKey` (new) — one per agent session
Replaces a Sidebar `claude-session` row. Preserves all of its behavior:
- State **dot** (idle / running / attention) — form, not color alone.
- Agent **badge** + session **name**; active key carries the **accent
  edge-stripe**.
- Click = `jumpToTerm`. Double-click name = inline rename (`renameSession`).
- **Drop target** for cross-pane drag-to-agent: on drop of `dragPayload`, call
  `window.api.pty.input(termId, dragPayload)` then `jumpToTerm` (unchanged logic).
- Attention "!" affordance when `status === "attention"`.
- **Live output tick:** a slow, calm pulse on the dot when the session has fresh
  output; disabled under `prefers-reduced-motion`; never a flash.
- **Density compression:** past a per-strip threshold, keys collapse to
  dot + agent-badge/initials (name hidden, shown on hover/tip).

#### `ViewKeys` (new) — segmented view switch
- Terminal / Editor / API / Database / Browser / Network; active = accent stripe.
- Click = `setView`. Scoped to the active project. Also `Ctrl+1…6`.

#### `ToolCluster` (new) — right side
- High-frequency tools as keys: **Tasks/Commands** (see below), **Inbox**
  (✉ + attention badge), **AI usage** (◔), **Settings** (⚙), and an **overflow
  `⋯`** menu for the long tail (Work, Activity, Standup, Release, Shortcuts).
- Each key clickable + hotkeyed; overflow items keep their existing open actions.

#### `DeckStatus` (new) — baseline status region (dissolved StatusBar)
Carries **everything** the old StatusBar showed (it is more than counters):
- Active project name, git **branch**, uncommitted **changes** count.
- **Git identity picker** (click to switch git account — `git.setIdentity`,
  reads `gitAccounts`). This is real functionality, not a label — must survive.
- **Attention** count, **remote** indicator, **release** shortcut.
- Version (`DevDeck`).
- Keeps the existing git-poll effect (12s tick, focus/visibility refresh, skip
  while hidden) verbatim — just relocated.

### `TaskRunner` (relocated)
Currently embedded in the Sidebar. Becomes the **Tasks/Commands** tool key on the
deck, opening as a **popover** over the deck. Preserves: reading the active
project's `package.json` scripts (with the `SAFE_SCRIPT` allowlist), saved
commands, and running either in a fresh terminal (`newTab`). Hidden/empty-state
behavior unchanged.

### `ProjectSwitcher` (upgraded) — light project manager
`Ctrl+K` / topbar `▾`. Absorbs the Sidebar's low-frequency project management:
- Search + list **all** projects (live and cold), grouped by named groups.
- Add folder (`addProject` / `addProjectByPath`), reorder (`moveProject`),
  move-to-group (`setProjectGroup`), per-project actions (env vars, commands,
  presets, remove).
- OS **folder-drop to add** a project retargets to the **whole window** (the
  Sidebar's narrow drop zone is gone).

### Deleted
- `Rail.tsx`, `Sidebar.tsx`. Their CSS classes in `styles.css` are removed or
  repurposed for the deck.

## Data flow

No new IPC or store actions. The deck derives its display lists from existing
state, the same way the Sidebar does today:

- **Sessions-by-project** grouping: from `tabsByProject` × `termAgents` (skip
  `SHELL`) × `agentStatus` × `termNames` × `projects` × `agents` badges — the
  exact derivation in `Sidebar.sessions`, refactored into a pure helper
  (`deriveDeckStrips(...)`) so it is unit-testable.
- **Live projects** = projects that appear in that grouping. Cold projects only
  in the switcher.
- View/project/session switching, rename, drag-to-agent, presets, git identity —
  all call existing store actions / `window.api`.

## Interaction & keyboard

- `Ctrl+1…6` — switch view.
- `Ctrl+Tab` / `Ctrl+Shift+Tab` — cycle agent sessions (alt-tab across deck keys,
  MRU order).
- `Ctrl+K` — project switcher/manager (existing binding).
- `Ctrl+Shift+P` — command palette (existing).
- `F1` — shortcuts (existing).
- **Reconcile:** audit `store.ts` / `App.tsx` for existing `Ctrl+1…6` /
  `Ctrl+Tab` handlers before binding, to avoid collisions. Document final map in
  the ShortcutsModal.
- Every deck key is mouse-clickable *and* hotkeyed — no hidden modes.

## Theming & motion

- New surface = new **tokens**: deck background, key rest/hover/active, strip
  divider, status-region foreground. Added to every theme in
  `src/renderer/src/themes.ts` and given per-`[data-style]` treatments in
  `src/renderer/src/styles.css`, so all 7 themes × 12 styles reskin the deck with
  **zero component changes** (per DESIGN.md: change the token, let the cascade
  apply).
- Active key uses the existing **accent edge-stripe** pattern; elevation via the
  existing `--elev-*` / `--edge-hi` scale.
- Live tick + horizontal strip scroll reuse the shared `--ease` / `--dur` motion
  layer; all deck motion is disabled under `prefers-reduced-motion`.
- DESIGN.md's **Layout** section is updated to describe the deck (the current text
  describes rail → sidebar → main).

## Error handling & edge cases

- **No projects:** deck row 1 shows a calm empty affordance ("Add a project" →
  opens switcher); topbar `▾` still works.
- **No live sessions (all cold):** deck row 1 shows the active project's label +
  `＋` only; the user starts a session or opens the switcher.
- **Many projects / many agents:** horizontal scroll on the strip row, keeping the
  active project in view; per-strip key compression to dot+badge.
- **Git poll while hidden:** unchanged (skips when `document.hidden`).
- **Rename / drag-to-agent:** identical semantics to the Sidebar; no regression.

## Testing

- Unit-test the pure `deriveDeckStrips(...)` helper: grouping correctness,
  SHELL exclusion, badge resolution, attention counting, active-key selection,
  compression thresholds — mirroring `tests/projects.test.ts`.
- Verify in the real app with the `run-app` skill (build `out/` first): view
  switch, project switch, session jump, rename, tool overflow, theme/style
  switch reskins the deck. Note: HTML5 drag-and-drop can't be driven over CDP —
  **drag-to-agent is verified manually**.

## Risks & mitigations

- **Bottom edge near the terminal prompt** → keep the deck visually calm: firm
  divider, fixed height, slow pulses (not flashes), form-based state.
- **Horizontal overflow** → density compression + scroll with active-in-view;
  cold projects offloaded to the switcher so the deck only shows live work.
- **Losing sidebar affordances** → every one is explicitly rehomed (table below);
  nothing is silently dropped.

### Affordance rehoming (nothing dropped)

| Sidebar affordance | New home |
| --- | --- |
| Project list + active highlight | Deck project strips (live) + switcher (all) |
| Project groups (collapsible) | Switcher |
| Project reorder (drag) | Switcher |
| OS folder-drop to add | Whole-window drop |
| Project context menu | Right-click deck project label (unchanged menu) |
| Add project `+` | Switcher / topbar `▾` |
| Workspace presets | Switcher / context menu |
| Env vars / saved commands editors | Context menu (unchanged) |
| Agent session list | Deck agent keys |
| Session status dot / badge / attention | Agent key |
| Session rename (double-click) | Agent key |
| Drag-to-agent drop target | Agent key |
| TaskRunner (tasks + commands) | Deck Tasks/Commands popover |
| StatusBar git branch/changes/identity | Deck status region |
| StatusBar attention/remote/release/version | Deck status region |

## Implementation shape (for the plan)

1. Extract `Topbar`; move the command pill into it.
2. Add pure `deriveDeckStrips` helper + unit tests.
3. Build `Deck` + `ProjectStrip` + `AgentKey` + `ViewKeys` + `ToolCluster` +
   `DeckStatus`; relocate `TaskRunner` into a deck popover.
4. Rewire `App.tsx`: drop the Allotment sidebar split (main full-width), mount
   Topbar above main and Deck below; remove `<StatusBar/>`.
5. Upgrade `ProjectSwitcher` into the project manager; add whole-window folder
   drop.
6. Add deck tokens to `themes.ts` + `[data-style]` treatments in `styles.css`;
   remove Rail/Sidebar CSS.
7. Bind + reconcile keyboard shortcuts; update ShortcutsModal.
8. Delete `Rail.tsx`, `Sidebar.tsx`; update DESIGN.md Layout section.
9. `npm test`; verify with `run-app`; manual drag-to-agent check.
