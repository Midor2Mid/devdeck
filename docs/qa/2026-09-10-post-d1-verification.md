# Post-D1 verification — 2026-09-10

Range under test: `0746eac` · `74e969b` · `d45d732` · `c0814b2` (HEAD, tree clean).
Shots: `docs/qa/2026-09-10-shots/` (96 files). Before-state:
`2026-09-09-must-fix-verification.md` and the 09-08/09-09 shot sets.

All app runs used a **scratch `userDataDir`** under the session scratchpad and a
unique `debugPort` (9411–9428). The owner's live DevDeck kept running throughout
and was never signalled; a desktop capture (`s4-02`) shows both windows side by
side. No file outside `docs/qa/` was touched.

## Baseline, re-measured rather than taken on trust

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm test` | 138 files, 1758 passed, 1 skipped, exit 0 |
| `npx electron-vite build` | clean, exit 0 |

## Verdict per item

### 1. Four-key deck — PASS

Observed `Mission · Terminal · Browser · Editor`, `keyCount: 4`. Database, API and
Work are gone from the deck, the palette and the More menu. No group hairline in
the DOM (`.deck-group-sep|.deck-sep|.deck-views-sep` → 0 elements).

`Ctrl+1..4` each switch the view. **`Ctrl+5/6/7` do nothing at all** — no view
change, no toast, no console error (`App.tsx:424` matches `Digit[1-9]` but
`DECK_VIEWS[idx]` is undefined, so it falls through without `preventDefault`).

**The removed `max-width: 959px` claim holds, and holds with margin.** Measured at
1384 / 900 / 860 / 760 / 640px: `.deck-views` is a constant **346px** (the commit
message estimated ~350), labels stay `display: block`, no horizontal page
overflow, `.deck-status` and `.deck-tools` never overlap, tools never clip. At
900px — the window's own minimum — there is still 422px of slack in the status
slot. The query could not fire.

More menu: exactly `Tasks · Agent context files · AI usage · Activity ·
Keyboard shortcuts (F1)`. Anchored correctly off a real mouse click
(l:1169, 43px right gap, 19px bottom gap, not offscreen). With no project open
the **Tasks row is correctly omitted** (4 items). The `deck-popover-right` anchor
for context files measured l:1099, 10px right gap, on-screen.

**Tasks is functional from More, end-to-end** (`s20`): add card → override agent →
confirm dialog with honest copy ("Start Sim Waiting on \"QA stall probe\" in
devdeck? The card title is sent as its first prompt.") → accept → card moves
`Todo:0 / Doing:1` and a session spawns. I twice mis-read this as a dead Dispatch
button before finding the confirm dialog my selector was missing — recorded here
because the near-miss is the point.

### 2. The `⚑ N want you` control — PASS on all three claims

- **Absent at zero:** on a genuine first run (empty profile) and with only
  not-running sessions, `.deck-wants` is not in the DOM at all.
- **Correct count:** `"1 wants you"`, `--text`/weight 600 (`rgb(231,234,241)`),
  flag glyph on the accent (`rgb(235,166,92)`), full sentence in both
  `aria-label` and `data-tip`. Held at 1 for 165s alongside Mission's own
  `1 running · 1 need attention` — **the two counts agreed at every sample**
  (`s21`), which is the property its doc comment says the app has already paid
  for once.
- **The jump works,** twice, from two different starting views: Browser→Terminal
  with the target pane becoming `active key-seen key-attn` (`s4`), and
  Mission→Terminal (`s21`).

**The no-door case: NOT reached.** `wantsYou`'s divergent limb is `isStalled`,
which needs `awaited` (a `doing` card carrying a `termId`) **and** `alive` **and**
>120s silence, with `seen` set so `jumpToPending` skips it. I built the awaited
session and waited past 165s; in the run where `seen` took (`s20`) the flag showed
nothing rather than a stall count, and in the run where it did not (`s21`) the
click correctly found a real door and jumped. I could not distinguish between
three candidate causes for the `s20` result — `awaited` not actually set, `lastAt`
being refreshed, or `DeckWants` simply never re-rendering (it has **no interval**;
its count is derived from `Date.now()` at render time, so a stall arrives with no
subscribed slice changing). **Open question, not a filed bug.**

Related, from reading only: `recordTail(id, data)` at `store.ts:1210` stamps
`lastAt = Date.now()` and runs **before** the `if (!replay …)` guard at
`store.ts:1220`. So a replayed transcript refreshes the silence clock — glancing
at a tab would reset "silent for N" and clear a stall. Pre-existing (the renderer
could not tell before `c0814b2`), but it is the same principle that commit
establishes two lines below, left unapplied. **Not observed in the UI.**

### 3. The CSS deletion — PASS, with two orphans the sweep missed

Of **143 class selectors removed**, none is still rendered by any surviving
`.tsx`. No dangling imports: `ApiPanel`, `DbPanel`, `WorkPanel`, `ImportModal`,
`EnvManager`, `CollectionsSidebar`, `main/db.ts` and their helpers have zero
references in `src/` or `tests/`. `.subtabs` is gone and unreferenced.

Live-DOM audit across every view and every modal I could open: **on the first-run
surface, zero classes resolve to no rule** (38 used / 1139 defined). `.mono` and
`.section-label` are documented deliberate no-ops (`styles.css:159`, `:3498`) —
left alone.

Modals opened and confirmed painted, with a real background, border, radius and
backdrop, none offscreen or zero-size: Settings, Shortcuts, Project switcher,
Command palette, Prompt composer, Activity drawer, AI usage, Worktrees, Project
env, Commands, the Dispatch confirm. Six skins × 1384/900px all render correctly
in both light and dark.

Two findings:

- **`.env-body` is defined twice and the orphan wins** — `styles.css:2908`
  (dead `EnvManager`/API remnant, under the now-empty header
  `/* API environment bar + manager */`) duplicates the live rule at `:304`.
  Measured live on `ProjectEnvModal`: `rowGap/columnGap: 16px` where `:304`
  intends 12px, plus `flex-grow: 1` and `min-height: 0px` the surface was never
  designed with. `flex-direction: column` survives, so nothing breaks — but it is
  live pixels, on two shipping modals (`ProjectEnvModal.tsx:59`,
  `CommandsModal.tsx:64`). **Attributable to D1a; deleting `:2908` is the fix.**
- **`.status` / `.status.ok|.redirect|.error`** (`styles.css:2916-2928`) is the
  dead HTTP response pill. Nothing renders it. Dead weight, but `.status` is a
  generic enough name to collide later. Don't take `.resp-error` at `:2929` with
  it — `EditorPanel` uses it.

Three empty section headers remain (`:2904`, `:4450`, `:4744`).

### 4. Desktop notifications — PASS, delivery **proven**

`Notification.isSupported()` is `true` on this machine, so the Settings row reads
**checked and enabled with no warning copy** — the honest state for this
capability. The *absent* branch (disabled + unchecked + explanatory copy) is
**unreachable here and therefore unobserved**.

My screen-capture method **cannot see Windows toasts** — a known-good control
toast fired through PowerShell's own AUMID is equally invisible to
`Graphics.CopyFromScreen`, which does not capture the toast compositor. I say so
rather than reporting an absence.

Reading Action Center directly through `UserNotificationListener` is decisive.
Attributed to **`com.devdeck.app`**, titled **DevDeck**:

- `QA PROBE 2026-09-10 …` — the direct IPC call
- **`sim replay 1 · devdeck needs attention`** — the **real bell-driven
  notification**, raised because an agent rang while its pane was not visible
- the 400-char probe body arrived **truncated to exactly 200 characters** with the
  newline collapsed — `BODY_MAX` and the one-line rule both enforced
- empty-body, missing-`termId` and `null` payloads produced **no notification and
  latched no error**, as intended

The body `sim replay 1 · devdeck needs attention` is exactly what
`attentionText()` = `` `${labelForTerm(termId)} needs attention` `` produces, and
`pushNotification` (the ⚑ inbox entry) calls that same single builder at
`store.ts:1053`. **The desktop body is observed; the in-app entry agreeing with it
is inferred from the shared builder — I did not manage to catch the in-app entry
rendered in the DOM.**

**Toast click → raise + jump is NOT verifiable by this method** (it needs a real
click on an OS toast). Main's handler restores/shows/focuses and sends
`notify:activate` (`index.ts:605`), and the renderer maps it to `jumpToTerm`
(`store.ts:1677`) — read, not run.

### 5. Retired MCP tools — PASS, over real HTTP

Started the server on `127.0.0.1:8788` with a known bearer token and called it.

- `tools/list` returns **only** `devdeck_projects` and `devdeck_console_logs`
- all five retired names answer with `isError: true` and the removal sentence, e.g.
  `devdeck_db_query was removed along with the Database panel and the bundled
  pg/mysql2/mssql/sqlite drivers. DevDeck cannot run SQL any more; ask the user
  for the rows you need.`
- a genuinely unknown name still gets `Unknown tool: devdeck_not_a_tool` — the
  distinction is preserved
- a wrong bearer token → `401 unauthorized`
- both survivors return real data

### 6. The replay flag — PASS, verified twice

**At the wire** (`s15`, driving `window.api.pty` directly): spawning emits one
chunk with `replay: false`; re-attaching to the same id emits exactly one chunk
with `replay: true` carrying the whole 230-byte buffer. That buffer contains a
`BEL` inside an OSC title sequence — precisely the hazard the code comment
describes — and it arrived flagged, so `hasBell` never saw it.

**In the UI** (`s4`): a session whose buffer held an **answered** bell sat at
`status-waiting` / `key-waiting key-seen`; leaving to Browser and returning to
Terminal (pane unmount → remount → replay) left the dot at **waiting** and the ⚑
**absent**, across **two** round trips. The full sequence behaved as designed:
bell → `attention`, typed answer → `working`, 6s idle → `waiting`.

**A genuine new bell still raises attention** — confirmed by the Action Center
entry above, which only exists because a live bell classified and notified. My
attempts to catch a *second* fresh bell in the same long-lived profile did not
land (the pane must stay mounted long enough to spawn before switching away);
that is a driving limitation, not a product observation.

## Regressions against 09-08 / 09-09 — none found

Nothing I verified previously has degraded. Two things looked like regressions and
are not:

- **`.deck-status` renders empty in every run.** Cause is the harness:
  `document.hidden === true` for a CDP-launched window that is never composited,
  and `DeckStatus`'s poll returns early on `document.hidden`. Calling
  `git.status()` directly returned `branch: main, changes: 19, upstream:
  origin/main`. Not a product defect.
- **All sessions read "not running" after a relaunch.** Restored sessions are
  deliberately not auto-spawned (the "Start this agent?" card). `s15` proved the
  pty layer spawns a shell and echoes fine.

## Confirmed defects

1. **`.env-body` duplicate rule** (`styles.css:2908`) — cosmetic, live, D1a's own
   orphan. 16px gap instead of 12px on `ProjectEnvModal` and `CommandsModal`.
2. **`.modal-body` has no rule at all** (0 matches in `styles.css`) — deleted
   2026-09-04 by `d57c87d`, **six commits before D1a, so pre-existing**, and
   present during my earlier runs too. `WorktreesModal.tsx:101` uses it alone, so
   `.wt-list`'s `flex: 1; min-height: 0; overflow-y: auto` has no flex parent to
   bound it. Injecting 40 clones of the real row markup (a CSS-geometry probe,
   **not** a product state — the repo has one worktree): the list extends
   **1773px below the modal's bottom edge**, `.modal { overflow: hidden }` clips
   it, and **no ancestor is scrollable**. A long worktree list is silently
   unreachable.

## What this method cannot see

- **Windows toasts are invisible to screen capture** — proven with a control.
  Delivery was established via Action Center instead; *visual* appearance and
  on-screen position were never observed.
- **A click on an OS toast cannot be simulated**, so raise-window-and-jump is
  unverified.
- **HTML5 drag-and-drop cannot be driven over CDP** — the board's card drag, tab
  drag-to-split and the file/tree drag remain human-verified only.
- The renderer store is not on `window`; every scenario drove the DOM.
- `document.hidden` is permanently true under this harness, which silences any
  visibility-gated poll (it silenced `DeckStatus` all day).
- The notifications-unavailable UI branch is unreachable on this machine.

## The plain answer

**Yes, with one disclosure.** Every load-bearing claim in the four commits held up
under direct observation: the four-key deck and its narrow-width justification,
the new ⚑ (absent at zero, agreeing with Mission, jumping), the 1,027-line CSS
deletion, notifications that genuinely arrive with a bounded body from one
builder, the retired MCP tools explaining themselves, and the replay flag — the
last verified both at the IPC boundary and in the UI.

Needs disclosure to a stranger:

1. **Worktrees modal clips a long list with no scrollbar** (pre-existing, not D1).
   The only finding here that can lose a user access to something.
2. **`.env-body` orphan** — cosmetic, one line to delete, and worth deleting
   because the commit message claims the sweep left exactly one orphan and it left
   two.
3. **A stall may not raise the ⚑ on its own.** Unresolved, three candidate causes,
   and `recordTail` stamping `lastAt` ahead of the replay guard is a plausible
   fourth. The *count* is proven correct for the waiting/attention limbs; the
   *stall* limb is unproven in the running app.
4. Toast click-through and drag-and-drop have never been machine-verified.
