# QA — `60c0ac0` nav merge + worktree status row

**Date** 2026-09-14 · **Commit under test** `60c0ac0` (tree clean, nothing edited under `src/`)
**Method** `run-app` over CDP against `npx electron-vite build` output, every launch on a
**scratch `userDataDir`** (`…/scratchpad/ud`) and a unique `debugPort` (9411–9419). The owner's
own DevDeck was never touched, never killed, and holds its own single-instance lock in its own
userData.

**Fixture** (all inside the scratchpad, all with a **space in the path**, since this repo lives in
one): `…/scratchpad/fix/qa proj` — a git repo on `main` with 1 untracked change; its worktree
`…/fix/qa proj.worktrees/feature-x` on branch `feature-x` with 3 untracked changes, created
**through the app's own Worktrees window**, not by hand; `…/fix/not a repo` — a plain folder, to
force the git-failure path; `…/fix/deleted by someone else` — a project whose folder does not
exist, to force the `probe-tag`.

---

## 0. Render-loop sweep — clean

The palette's seven store subscriptions were exercised open, idle, and under typing. Frame rate
was sampled with `requestAnimationFrame` in the live renderer; a spinning render starves it.
`Runtime.consoleAPICalled`, `Runtime.exceptionThrown` and `Log.entryAdded` were tapped off the raw
websocket for the whole of every run, so a `getSnapshot should be cached` or
`Maximum update depth exceeded` could not pass unseen.

| state | frames / ms | fps |
|---|---|---|
| palette closed (baseline) | 182 / 3015 | 60.4 |
| palette open, 2 sections, idle 5s | 302 / 5009 | 60.3 |
| palette open, query `the`, idle 4s | 243 / 4001 | 60.7 |
| palette open, query matching nothing, idle 3s | 183 / 3006 | 60.9 |
| palette open **with a SESSIONS section**, idle 5s | 303 / 5015 | 60.4 |
| same, query `feat`, idle 4s | 243 / 4009 | 60.6 |

Console/exception lines captured across **all nine runs: 0**. Not one warning, not one exception.
No spin, no blank frame, no degradation with sessions present.

Scope of the claim: seven `useStore` slices plus `useFolderStates` were live in every one of those
samples, with `sessions` / `termCwd` / `seen` / `declared` all populated. `working`, `idle` and
`waiting` agent states were never driven (see §7), so the sweep covers the palette under
`attention`, `not-running` and shell sessions, not under all five.

## 1. The status row now tells the truth about a worktree — confirmed

Observed, in the real window, on the real fixture:

| focused session | `WORKTREE` word | branch chip | changes chip | `openChanges` file list |
|---|---|---|---|---|
| `feature-x 2` (in the worktree) | **present** | `feature-x` | `● 3 changes` | `a.txt`, `b.txt`, `c.txt` |
| `shell 1` (project root) | **absent** | `main` | `● 1 change` | `root-only.txt` |

The diff is the load-bearing half and it is the worktree's own tree, not the root's: the three
files only ever existed inside `qa proj.worktrees/feature-x`, and `root-only.txt` only ever
existed in `qa proj`. Modal head reads `Review changes · feature-x` and `Review changes · qa proj`
respectively. Branch chip `aria-label` reads
`Current branch - the worktree this session started in`.
Shots `05`, `07`, `08`, `11`, `17`.

**Git identity — confirmed by forcing a divergence, not inferred.** Git config is shared across
worktrees, so the two reads are normally indistinguishable and "it still reads the project's" is
unfalsifiable. I made it falsifiable: `git config extensions.worktreeConfig true` on the repo,
then `git config --worktree user.name "WORKTREE IDENTITY"` in the worktree. The two now genuinely
differ (`git -C <worktree> config user.name` → `WORKTREE IDENTITY`;
`git -C <repo> config user.name` → `QA Fixture`). With the **worktree session focused**, the
identity chip reads:

> `Git identity: QA Fixture — click to switch account`

It is reading the project path, as designed.

## 2. The merged palette

- **`Ctrl+K` opens it; `Ctrl+Shift+P` opens the same surface.** Both confirmed live.
- Sections render in fixed order **SESSIONS → PROJECTS → COMMANDS** and a query filters in place;
  with `feat` typed, SESSIONS kept `feature-x 2` at top and PROJECTS vanished (neither name
  matches) without any row moving between sections.
- **Arrow keys step over the headers.** `.palette-head.sel` never existed at any point of a
  25-step walk; the walk went session → session → project → project → project → command with no
  dead index.
- **The list scrolls, it does not overflow.** Measured live: `.palette-list` `clientHeight` 493,
  `scrollHeight` 1795, `overflow-y: auto`, palette box 584.5px against a 70vh of 585px. After 60
  `ArrowDown`s the cursor sat on the last row with `scrollTop` 1296 and the selected row
  **fully inside** the list's client box.
- **`Ctrl+K` then `Enter` still flips to the previous project — confirmed, with a caveat.**
  With the pointer parked away from the palette: active `qa proj`, palette preselects
  `palette-row-5 = not a repo` (the previous project, correctly skipping the three session rows
  above it), `Enter` → active becomes `not a repo`. Flipped back the same way. Shot `26`.
  The caveat is finding **B-1** below, which breaks exactly this gesture.
- **`SearchModal` after the rename — fine.** `.search-modal` resolves: 920px wide, `max-width`
  920px, `max-height` 651.3px (= 78vh), `display:flex column`, `background rgb(19,22,29)`,
  `1px solid` border, `12px` radius, `overflow:hidden`. `.overlay-foot` resolves too:
  `border-top 1px`, `text-align:center`, `padding 10px 20px`, text
  `↑↓ move · Enter open · Esc close`. A real query returned a real hit
  (`QA PROJ  README.md:1  root readme`) and the box stayed inside the viewport. Shots `19`, `21`.

## 3. `WorktreesModal` — all three states observed, failure forced

| state | how it was produced | what rendered |
|---|---|---|
| **nobody asked yet** (`read === null`) | sampled every animation frame from the modal's mount | 4 frames (~50ms) with the modal present and **neither** `.wt-unknown` nor `.wt-only-main` nor any `.wt-row` — nothing at all, as specified |
| **only the main working tree** | opened on `qa proj` before any worktree existed | `.wt-only-main`: *Only the main working tree. Name a branch above to give an agent its own copy.* (shot `03`) |
| **couldn't find out** | **forced** — opened on `not a repo`, a directory `git worktree list` exits non-zero in | `.wt-unknown`: *Couldn't read this project's worktrees.* + `Retry` ghost button (shot `12`). `Retry` clicked: re-read, still not a repo, state correctly held at unknown rather than collapsing to empty |

The frame-by-frame trace of the first state is the one nobody had seen. Raw samples
(`M`=modal, `U`=unknown, `O`=only-main, trailing digit = row count):
`12867---0, 12883M--0, 12900M--0, 12917M--0, 12934M--0, 12987M--2, …`

## 4. Confirmed findings

### B-1 — the hovered row steals the keyboard selection, and it breaks `Ctrl+K, Enter`
`src/renderer/src/components/CommandPalette.tsx:469` (`onMouseEnter={() => setSel(idx)}`) fights
`src/renderer/src/components/CommandPalette.tsx:366-370` (`scrollIntoView({block:"nearest"})` on
selection change). Arrowing scrolls the list; scrolling slides a new row under a **stationary**
pointer; `mouseenter` fires; `sel` is reset to that row.

Observed, with the pointer dispatched **once** to the middle of the list and then never moved
again — every step below is one `ArrowDown` and zero mouse events:

```
 1..6   Go to Mission → New terminal (shell)     (rows 6→11, advancing)
 7      Go to Mission                            (row 11 → row 6 — snapped back)
 8..13  advances to row 12
14      Go to Terminal                           (row 12 → row 7 — snapped back)
21      Go to Browser                            (row 13 → row 8 — snapped back)
```

The user cannot arrow past ~7 rows while the cursor rests over the palette.

Worse, the same mechanism hits the gesture this commit set out to protect. Same build, same
fixture, only the pointer differs:

- pointer at `(3,3)`: `.palette-item:hover` count **0**, preselect `palette-row-5 = not a repo`
  (the previous project), `Enter` → flips to `not a repo`. Correct.
- pointer resting mid-list: `.palette-item:hover` count **1**, preselect
  `palette-row-6 = ghost proj`. `Ctrl+K, Enter` would activate **the wrong project**.

Damage × likelihood for someone running several agent terminals: high. The palette opens centred
under wherever the mouse already is, and `Ctrl+K, Enter` is the gesture the commit message
singles out as the one that must not regress. Shots `24-palette-hover-steal.png`,
`24-palette-hover-vs-arrows.png`.
*Not claimed:* that a palette opening under a truly stationary OS cursor always fires
`mouseenter` without any movement. I proved the arrow-scroll case with zero mouse events; the
open-under-cursor case I produced with one dispatched move.

### B-2 — a project row's **name** is what shrinks, not its path
`src/renderer/src/styles.css:1111` gives `.palette-title` `flex: 0 1 auto` and
`src/renderer/src/styles.css:1143` gives `.palette-path` `flex: 1 1 auto`. Both carry
`flex-shrink: 1`, so flexbox shrinks both in proportion to their base widths — the path is simply
longer, it does not go *first*. The comment above `.palette-title` says the opposite:

> `Shrinks before the path does not - the path has flex: 1 and goes first.`

Measured on the real rows, **all six skins, both widths**:

| width | row | `.palette-title` rendered width | `.palette-path` rendered width |
|---|---|---|---|
| 1384px | `qa proj` | **20px**, clipped | 446px, clipped |
| 1384px | `not a repo` | **19px**, clipped | 304px, clipped |
| 900px | `qa proj` | **17px**, clipped | 388px, clipped |
| 900px | `not a repo` | **16px**, clipped | 248px, clipped |

On screen at 900px the three projects read `n..`, `q..`, `g...` — the identity is gone and the
disambiguator keeps 380px (shot `20-palette-900-flat.png`; identical in modern, glass,
neumorphic, brutalist, terminal). The PROJECTS section becomes unusable by name, which is the one
thing it is for. Present at 1384px too (shot `02`), so it is not a minimum-width edge case.

### B-3 — `probe-tag` wraps and makes its row 15px taller than every other row
`src/renderer/src/styles.css:1738` `.probe-tag` sets neither `white-space: nowrap` nor
`flex: none`, unlike every other trailing run on the row (`.palette-dim`, `.palette-branch`,
`.palette-want`, `.palette-kbd` all set both). `FOLDER MISSING` therefore wraps to two lines
inside its pill and the row measures **52px against 37px** for every other row in the list — at
1384px and 900px, in all six skins. Shot `20-palette-900-flat.png`.

**No collisions.** I measured every child of every palette row for overlap
(`child[i].left < child[i-1].left + child[i-1].width`) at both widths in all six skins:
**zero overlaps anywhere**, including the row carrying `probe-tag` and the project row carrying
`⚑ 1 wants you` together with `1 term · 1 agent`. `probe-tag` deepens its row rather than
colliding. **Session rows keep to one flex line** — 37px in every skin at both widths, including
the attention row `● qa bell agent 1 · not a repo ! needs you` with dot + title + project +
`claude-attn` + `StatusFlag` all present.

### B-4 — the F1 overlay still publishes `Ctrl+Shift+P`, and still calls the surface by its old name
`src/renderer/src/components/ShortcutsModal.tsx:52-55`, a hard-coded footer the commit did not
touch:

> Terminal shortcuts apply in the Terminal view. Tip: `Ctrl + Shift + P` opens the command
> palette for everything else.

`shortcuts.ts:41-46` states in terms that the chord "is NOT listed any more … publishing both
would teach a stranger a distinction the app no longer has", and the commit message says it
"stays wired and undocumented for one release". The overlay publishes it anyway, three inches
below the row that teaches `Ctrl + K — Find anything - a session, a project, a command`. Same
window, two names for one surface. Shot `22`. Low damage, but it is the exact failure the
`shortcuts.ts` module exists to prevent, and it is a one-line fix.

## 5. Attacked, and held

- **Restart mid-flow.** Nine separate launches against one persisted scratch profile. Tabs,
  `termCwd`, active pane, MRU and the worktree session all restored every time; the status row
  came back on the worktree session saying `WORKTREE / feature-x / ● 3 changes`.
- **Second click before the first finished.** `Shell only` in the Worktrees window clicked twice
  in the same tick → **one** worktree, **one** tab (`race-branch 3`), no error text. `busy` holds.
- **`Enter` twice in the palette** on a modal-opening row → **one** `.worktrees-modal`, palette
  closed. No double-open.
- **A project whose folder is gone** → row still renders, still selects, `FOLDER MISSING` pill,
  no crash (and see B-3).
- **A directory git cannot answer for** → §3 failure state, no exception.
- **Paths with spaces throughout** — project, worktree base (`qa proj.worktrees`), and worktree.
  `git worktree add`, `git status`, `git diff` and the changes modal all handled them.
- **Empty state / one item / many** — palette with 0 sessions, 1, 4; 40 rows scrolling to 1795px.

## 6. Regression glance — nothing regressed that I could see

- **Four-key deck**: `Mission · Terminal · Browser · Editor`, plus `⚑ 1 wants you` (shots `16`, `23`).
- **`⚑` control**: appeared with a real attention state, read `1 wants you`, and the palette's
  project row carried the matching `⚑ 1 wants you` from `wantsYouLabel`.
- **Dot forms**: `tab-dot claude status-attention` (live, from a real BEL), `status-not-running`,
  and the shell's own `tab-dot shell` all rendered. See §7 for the three not covered.
- **Modal heads and scroll**: `Worktrees · qa proj`, `Review changes · feature-x`,
  `Keyboard shortcuts` (640×668, fits the viewport, grid does not need to scroll) all render with
  head + close control. `.palette-list` scroll verified numerically in §2.
- **Typecheck 0 · `npm test` 150 files / 1999 passed / 1 skipped · `electron-vite build` clean** —
  reproduced from a clean tree, full suite, not just the new files.

## 7. What this method could not see — stated, not glossed

- **The taskbar badge.** It is an OS shell surface. CDP screenshots the renderer only; I never
  observed the badge itself, and nothing here should be read as verifying it.
- **Desktop notifications.** Same reason — raised by main through the OS, invisible to a renderer
  screenshot. Not verified.
- **Three of the five dot forms.** `working`, `idle` and `waiting` need a real agent's output
  cadence. I drove `attention` with a genuine BEL through a real pty and observed `not-running`
  after a restart; the other three were not produced and are not claimed.
- **The renderer store is not on `window`.** Every scenario drove the DOM and real key/mouse
  events, never store actions, so "the store did X" is nowhere in this report.
- **Drag and drop.** HTML5 DnD cannot be simulated over CDP. Nothing in this diff appeared to
  touch it, and I did not verify any drag.
- **`data-style` was switched by attribute** for the six-skin sweep rather than through Settings.
  That is how the cascade is keyed, but it is not identical to a user changing the skin.
- **`shortcutGroups` in Settings → Shortcuts** was not opened; only the F1 overlay was. B-4 may or
  may not have a twin there.
- The fixture is a two-commit repo with untracked files. A large repo, a detached HEAD, a
  submodule, and a worktree whose branch was deleted underneath it are all unexercised.

---

# Re-check — `e6efff7` (the four findings above, plus `SearchModal`)

**Date** 2026-09-14 · **Commit under test** `e6efff7` · tree clean, nothing edited under `src/`
**Method** `run-app` over CDP against a fresh `npx electron-vite build`, every launch on a
**scratch `userDataDir`** (`…/scratchpad/rv/ud1`, a copy of the §0 profile so the MRU in Local
Storage came with it) and a unique `debugPort` (9431–9442). The owner's own DevDeck was never
touched and never killed. Same fixture as above (`qa proj` + its worktrees, `not a repo`,
`ghost proj` pointing at a deleted folder), all under a path with a space in it.

Every key and every pointer position below went through `Input.dispatchKeyEvent` /
`Input.dispatchMouseEvent` — the browser's real input pipeline — not synthetic DOM events. The
renderer store is still not on `window`, so this drove the DOM throughout.

**Static gates, reproduced from the clean tree:** `npm run typecheck` → 0.
`npx vitest run` → **152 files, 2068 passed, 1 skipped** (full suite, 15.9s). `electron-vite build`
clean.

## The instrumentation that makes the rest of this falsifiable

A capture-phase listener on `document` counted every `mousemove`, `mouseenter` and `mouseover`
that landed on a row, **with its client coordinates**, for the duration of each run. Without it,
"the selection did not move" is indistinguishable from "no event fired", and only the first of
those is evidence that a gate works.

## 1. Hover vs keyboard — **fixed, and the mechanism is visible**

### 1a. Pointer parked mid-list, never moved → the bottom is reachable

Pointer dispatched once to `(692, 430)` — the middle of the list — **before** `Ctrl+K`, then
never again. 60 × `ArrowDown`, zero mouse events:

```
sel: 6 7 8 9 10 … 38 39 40 40 40 …      snapbacks: 0
```

`sel` walks from 6 to **40, the last of 41 rows**, and stays. Previously it climbed ~7 and snapped
back, forever. The selected row ends **fully inside** the list box (row 577–614, list 121–613).
Shot `30-palette-parked-bottom.png` — the palette scrolled to `Keyboard shortcuts (F1)` with the
mouse still resting mid-list.

**The old mechanism is still firing** — this is the part worth recording. During those steps the
list fired **30 `mouseenter` events on rows, every one of them carrying the unchanged coordinate
`[692,430]`**, and **0 `mousemove`**. So in this Chromium the post-scroll synthetic event is
`mouseenter`, not `mousemove`. The old `onMouseEnter={() => setSel(idx)}` would have been dragged
30 times; the new handler is never called at all.

*Precisely what that means:* the load-bearing half of the fix **in this build** is the
`onMouseEnter` → `onMouseMove` swap. I did not observe a single same-coordinate `mousemove`, so
the coordinate fold in `hoverSelect.ts` never had to reject one. The fold is what makes the fix
robust rather than lucky (a Chromium that did emit one would still be gated), and it is
independently load-bearing for the first-sighting case in 1c — but I am not claiming to have
watched it reject a synthetic move, because no synthetic move occurred.

Opening the palette under the resting cursor fired **1 `mouseenter`, 0 `mousemove`** — and the
preselect held.

### 1b. `Ctrl+K, Enter` is now independent of where the mouse rests

Same state, four pointer positions, palette reopened each time. Active project `not a repo`,
previous project `qa proj`:

| pointer resting on | `.palette-item:hover` | preselect |
|---|---|---|
| `(3,3)`, away from the palette — baseline | 0 | row 5 `qa proj` |
| row 4 — **`not a repo`**, the active project | 1 | row 5 `qa proj` |
| row 5 — `qa proj` | 1 | row 5 `qa proj` |
| row 6 — **`ghost proj`**, a different project | 1 | row 5 `qa proj` |

The last line is the case that failed before (it preselected `ghost proj`). `hovering: 1` is the
proof the pointer genuinely was on that row — CSS `:hover` matched — and the selection ignored it.
Shot `32-palette-parked-on-row-6.png` shows the hover shading on `ghost proj` and the selection
stripe on `qa proj`.

Then the gesture itself, pointer still resting on `ghost proj`'s row:

- `Ctrl+K` → preselect `qa proj` → `Enter` → **active becomes `qa proj`** (not `ghost proj`).
- `Ctrl+K` again → preselect `not a repo` → `Enter` → **active back to `not a repo`**.

Shot `33-ctrlk-enter-from-ghost-row.png`.

### 1c. A real move still selects — no input traded for another

- **One pixel.** From the parked position, the *first* real `mousemove` is the sighting and does
  not select (sel held at 40) — by design. The *second*, 1px away, selected row 29, the row under
  the pointer. That is one real gesture: a mouse produces a stream of moves, and the second is a
  frame away.
- **A whole row.** A single move onto row 38 selected row 38 immediately.
- **Not a one-shot.** Arrowing after that real move resumed cleanly (39 → 40, 0 snapbacks); the
  pointer goes back to losing the moment it stops.

Shot `31-palette-real-move-selects.png`.

*The one cost, stated plainly:* a pointer that has been still since before the palette opened now
needs **two** mouse events, not one, before hover takes the cursor. A physical mouse cannot
produce only one. A trackpad tap-then-lift, or a pointer warped by an accessibility tool, could.

## 2. Row shrink — **fixed at both widths**

Measured live on the real rows (viewport set with `Emulation.setDeviceMetricsOverride`, which is
a layout-viewport override, not a real window resize):

| viewport | palette | name | rendered / needed | clipped | path |
|---|---|---|---|---|---|
| 1384px | 600px | `not a repo` | 61 / 61px | **no** | 362px, clipped |
| 1384px | 600px | `qa proj` | 41 / 41px | **no** | 425px, clipped |
| 1384px | 600px | `ghost proj` | 60 / 60px | **no** | 341px, clipped |
| 900px | 540px | `not a repo` | 61 / 61px | **no** | 302px, clipped |
| 900px | 540px | `qa proj` | 41 / 41px | **no** | 365px, clipped |
| 900px | 540px | `ghost proj` | 60 / 60px | **no** | 281px, clipped |

`rendered == needed` on every name at both widths: nothing is ellipsised. The path is the run that
gives way, and it gives way **first** — 60px of it at 1384→900 while every name holds to the
pixel. Against the previous pass's 20px / 17px names beside 446px / 388px paths. On screen at
900px the three read `not a repo`, `qa proj`, `ghost proj`. Shots `34-palette-1384.png`,
`34-palette-900.png`.

## 3. `probe-tag` — **fixed**

`FOLDER MISSING` measured by `Range.getClientRects()` on the tag's own text: **1 line box**, pill
111×19px, at both widths. Its row is **37px**, and the set of distinct row heights across all 41
rows is **`[37]`** — one value, at 1384px and at 900px. Against 52px against 37px before.

## 4. F1 — **fixed, and `Ctrl+Shift+P` still works**

- Footer now reads, in full: `Terminal shortcuts apply in the Terminal view.`
- `Ctrl+Shift+P` appears **nowhere** in the overlay (regex over the whole rendered text: false).
- `command palette` appears **nowhere** in the overlay (false).
- The 23 `kbd` pills are unchanged and still include `Ctrl + K` for *Find anything*.
- **The chord still works:** palette absent → `Ctrl+Shift+P` → palette present. Wired and
  unpublished, as intended. Shots `35-f1-overlay.png`, `36-ctrl-shift-p-still-works.png`.

## 5. `SearchModal` — **fixed, and here the gate is doing visible work**

Fixture: the devdeck repo itself registered as a scratch project, query `useStore` → **50 hits**,
list `scrollHeight` 2254 against `clientHeight` 468. (See *What this method could not see* for why
the Temp-path fixture could not supply the hits.)

- **Results arriving under a resting pointer.** Pointer parked at `(692,420)` before `Ctrl+Shift+F`.
  When the hits rendered, **1 `mouseenter` fired on a hit row**; selection stayed on **hit 0**, the
  first hit, not the row under the mouse. Shot `37-search-parked-results.png`.
- **Arrow to the bottom, pointer parked.** 55 × `ArrowDown` → `sel` 1 → **49 of 50**, **0
  snapbacks**.
- **The subtle case, and the strongest single piece of evidence in this pass.** With the pointer
  *not moving*, six wheel events scrolled the list `scrollTop 0 → 720`. That fired **12
  `mouseenter` events on hit rows, all at the unchanged coordinate `[692,420]`** — and `sel` held
  at 49 throughout. Twelve steals, prevented, counted. Shot `38-search-wheel-no-steal.png`.
- **A real move still selects.** First event = sighting (sel held 49); 1px second event → hit 18;
  a further move → hit 22. Arrows then resumed 23→30, 0 snapbacks. Shot
  `39-search-real-move-selects.png`.

### 5b. NEW — confirmed: `SearchModal` never scrolls the selected hit into view

`src/renderer/src/components/SearchModal.tsx` has no `scrollIntoView` effect, while
`src/renderer/src/styles.css:996` gives `.search-results` `max-height: 56vh; overflow-y: auto`.
The palette has that effect (`CommandPalette.tsx:376-380`); the search modal does not.

Observed, pointer at `(3,3)` so hover is not involved at all, 25 × `ArrowDown`:

| | `sel` | `scrollTop` | selected row on screen? |
|---|---|---|---|
| `.palette-list` | 30 | **743** | yes |
| `.search-results` | 25 | **0** | **no** — row at y 1261, list ends at y 588 |

The list does not move, no row is highlighted anywhere in the window, and `Enter` opens hit 26
blind. Shot `40-search-selection-offscreen.png` — 25 presses in, and the frame is identical to the
first one.

**This is pre-existing, not a regression:** the only change `e6efff7` made to this file was
`onMouseEnter` → `onMouseMove`. But it is newly *reachable*, and that is the honest framing — with
the ungated handler, a pointer resting over the list used to yank `sel` back to a visible row on
every re-render, which accidentally masked the missing scroll for exactly the users whose mouse
was over the results. Now the keyboard keeps what it takes, and takes it out of sight.

Damage × likelihood for a developer running several agent terminals: **medium**. Cross-project
search past the tenth hit is keyboard-only and currently unusable without the mouse; the failure
is silent and the wrong file opens. One `useEffect` mirroring the palette's.

## Regressions looked for and not found

Nothing in §2–§4 of the original pass was re-run (out of scope by instruction), but nothing
observed incidentally had changed: 41 palette rows in the same three sections, headers still
un-selectable by arrow, the list still scrolls rather than overflows, `FOLDER MISSING` still
renders on the ghost project, `Ctrl+Shift+F` still opens search from a non-Terminal view and is
still find-in-terminal inside it, and `Ctrl+1` still switches view. **Zero** console messages or
exceptions were seen across the ten launches of this pass.

## What this method could not see — this pass

- **The Temp-path search blackout is environmental, and it cost me the intended fixture.** The
  app's `git grep` (`src/main/search.ts`) returned **0 hits for every query against every
  project under `C:\Users\Admin\AppData\Local\Temp\…`**, including a repo created fresh for this
  run with 40 matching committed lines — while returning 50 hits from `D:\…\devdeck` in the *same
  call*, in ~50ms (so: not the 5s timeout). The identical `execFile("git", …)` with the identical
  cwd succeeds from a plain Node process. It is therefore something about a git child spawned by
  *this* Electron process with a cwd under Temp — Avast is the standing suspect on this machine
  (see the pty fast-fail and the PowerShell-signing failures). **Suspected, not proven, and not a
  DevDeck defect on this evidence.** I worked around it by using the devdeck repo as the search
  fixture. It also means the earlier pass's one-hit search observation and this one were taken
  under different conditions.
- **`Emulation.setDeviceMetricsOverride` is not a window resize.** §2's 900px is a layout
  viewport; a real drag of the window frame was not performed.
- **A trackpad is not a mouse.** §1c's "two events" claim is about event streams. I did not test a
  physical trackpad, a touchscreen, or a pointer moved by an accessibility tool, any of which
  could in principle deliver a single isolated `mousemove`.
- **One skin, one scale.** This pass ran entirely in the default skin at devicePixelRatio 1. The
  six-skin sweep of the original pass was not repeated.
- **HTML5 drag-and-drop** still cannot be simulated over CDP. Nothing here touched it; nothing
  here verifies it.
- **The renderer store is not on `window`.** Every assertion above is a DOM assertion.
- **The fixture was mutated and restored.** `qa proj`'s README was rewritten and restored to its
  one line (three extra commits remain in its history); a scratch `fresh repo` was created and
  deleted. `root-only.txt` is still untracked, so `changes: 1` is unchanged.
