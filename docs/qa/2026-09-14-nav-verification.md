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
