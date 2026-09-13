# Navigation design — the worktree, and the one search surface

**2026-09-14 · `designer` · design only, no code written.** Against `DESIGN.md`
0.9.6, `ROADMAP.md`'s live section, and the tree at `be54c6d` / `v0.14.0`.
A `technical-director` ruling on the seams runs in parallel and is not
reproduced here. This is the **desktop renderer**. The phone client
(`CLIENT_HTML` in `src/main/server.ts`) has its own hard-coded palette, has
neither a switcher nor a palette, and is **not** designed here.

---

## Part 0 — The ruling, in one paragraph each

**Worktree.** The project stays the unit of context. The worktree is not
promoted to a navigation object, because in DevDeck **it already is one and the
frame is lying about it**: clicking a deck key already changes which directory
and which branch you are working in, and `DeckStatus` keeps reporting the
*project root's* branch, change count and pull target regardless. The work is to
make the repo-facts region follow the focused session instead of the active
project. That buys Orca's property — *switching agent and switching branch are
one click* — for one changed data source and one new word, and adds no rail, no
strip, no grouping axis and no deck key.

**Search.** `ProjectSwitcher` is deleted. `CommandPalette` absorbs projects,
becomes the one answer to *where is the thing*, and keeps `Ctrl+K`.
`Ctrl+Shift+P` becomes an unpublished alias for one release and then goes. Net:
two surfaces to one, two chords to one, 262 lines and ~110 lines of CSS removed,
and **three accent spends that `DESIGN.md`'s own budget would have had to strike
anyway** go with them.

---

# Part 1 — The worktree

## 1.1 Why not the four candidate answers

| Candidate | Refused because |
| --- | --- |
| **Worktrees are just projects** | A project carries env vars, launch presets, git identity, chip/colour, group, MRU position, board and appearance. A worktree carries none of those and would inherit all of them from a parent it would no longer name. Three projects with four branches each is twelve switcher rows, nine of which die at merge, each with its own settings record, and an MRU list made of branch churn. |
| **A second axis (a worktree rail, or a second strip row)** | The roadmap forbids re-adding a panel or a fifth deck key, and this is chrome on the one surface that is always on screen. It is also wrong at the common case: `LaunchOptions`' worktree toggle **defaults off**, so most projects have exactly one worktree and the axis would render a container holding one thing. |
| **Nested grouping in `deriveDeckStrips`** | Same cost, plus it re-keys the deck's grouping — the function the whole deck reads — for a fact already visible in the key's own name. `newAgentInWorktree` passes `res.branch` as the session name, so a DevDeck-made worktree session is *already* labelled with its branch. |
| **Dethrone the project** | Costs `PRODUCT.md`'s thesis and everything above, and buys nothing that 1.2 does not buy for free. |

## 1.2 The defect this replaces them with

`DeckStatus.tsx` takes `const project = useStore(s => s.activeProject())` and
polls `window.api.git.status(project.path)`. The store already knows better:
`termCwd[termId] || project.path` (`store.ts:973`) is the session's own
directory, and `newAgentInWorktree` writes it.

So today, with an agent focused in `repo.worktrees/fix-JIRA-1423`:

- the branch chip says `main`;
- `● N changes` counts the main tree's changes, and clicking it calls
  `openChanges(project.path, …)` — **a diff of a tree that agent never touched**;
- the pull button pulls `main`'s upstream.

That is three false statements about the repo, on the always-on-screen row. It
is a worse problem than a missing navigation axis, and fixing it *is* the Orca
property.

## 1.3 What the deck bar becomes

The `.deck-status` region reads the **focused session's directory**, not the
active project's path. Source of truth: the existing `sessionCwd`-shaped read
(`termCwd[activePane] || activeProject().path`). Everything in the region that
takes a path — `git.status`, `git.pull`, `openChanges` — takes that one.
`git.getIdentity` stays on the project path: git config lives in the common dir
and is shared across worktrees, so a per-worktree identity chip would name a
distinction the repo does not have.

Rendered, left to right, on the existing `.sb-item` chips:

```
⑂  WORKTREE  fix/JIRA-1423     ⤓ 2     ● 3 changes     ⛁
```

- **`WORKTREE`** — a new `.sb-item` label in the bare-uppercase classification
  tier (`Badge tiers`), letter-spaced, 10px. Shown **only when the session's
  directory is not the project root**. On the project's own tree the label is
  absent entirely — *the marker only ever adds*, the rule the wants-you control
  and the command-presence marker both already keep. There is no legend to
  learn: its presence is the signal and the word says it.
- **Token: `--muted`, not the classification tier's `--faint`.** `--faint` on
  `--bg-2` measures **4.25 (Slate) · 4.25 (Sumi) · 4.13 (Washi)** — under the
  4.5 text floor for a 10px label on the row you never look away from.
  `--muted` on `--bg-2` measures **6.98 · 5.49 · 4.46**. Washi's 4.46 misses the
  floor by 0.04; that is a pre-existing property of `--muted` on that ground and
  must not be patched with a literal. The departure from the tier's token
  applies to this one chip, is stated here rather than discovered later, and
  costs no new token.
- **No accent, no new dot form, no new elevation.** The status dot vocabulary
  stays at five forms.

**Copy** (`data-tip`, and a permanent `aria-label` on the chip):

| Case | Copy |
| --- | --- |
| project root | `Current branch — the project folder` |
| worktree | `Current branch — the worktree this session started in` |
| changes chip, in a worktree | `Uncommitted changes in this worktree — click to review the diff` |
| pull button, in a worktree | `Pull latest into fix/JIRA-1423 from origin/fix/JIRA-1423` |

`termCwd` records where a session **started**, not where its shell is now. A
user who types `cd ../other.worktrees/x` inside a pane will be told the launch
directory's branch. The copy above says "started in" precisely so the chip does
not claim more than it knows. **I deliberately did not invent a visual state for
this** — marking every session as possibly-stale is noise for a case nobody has
been observed doing. See Part 4.

The `? changes` unknown chip already in `DeckStatus` is untouched and is the
precedent this follows: a `git status` that never came back keeps a chip and
says so, rather than letting a chip vanish and be read as "nothing to review".

## 1.4 The deck key gains nothing visible

Ruled explicitly, against Orca portable-idea #3. The key has 6px of dot, a name
and a badge; the frame's mark budget was just cut from ~14 to 6; the dot may not
gain a sixth form. A worktree session's **name is already its branch**, so a
second line would print the branch twice for the common case. `AgentKey`'s
tooltip gains one line after the status line:

```
worktree · fix/JIRA-1423
```

Shown only when the session's directory is not the project root. Zero pixels,
zero marks, and consistent with that file's own recorded reasoning for why the
key carries no visible provenance mark.

## 1.5 The worktree list's missing third state

`listWorktrees` returns `[]` both when a project has only its main tree **and
when `git worktree list` fails**. `WorktreesModal` renders both as an empty
list, which is *unknown rendered as zero* — exactly what the command-presence
grammar exists to prevent.

The handler must return `{ ok, list }` rather than a bare array so the modal can
tell them apart. Three states, three sentences:

| State | Copy |
| --- | --- |
| one tree, no worktrees | `Only the main working tree. Name a branch above to give an agent its own copy.` |
| read failed | `Couldn't read this project's worktrees.` plus a `Retry` ghost button |
| has worktrees | the list, `main` on the first row in the bare-uppercase tier, as today |

`Retry` is a ghost, not the accent: re-reading is not the act this modal exists
for. `+ Agent in worktree` is, and it keeps the fill.

---

# Part 2 — One search surface

## 2.1 What merges into what, and what dies

`CommandPalette` is the survivor: it already carries every session, every view,
every action, and `Switch project…` besides. `ProjectSwitcher` contributes its
project rows and its `Open folder…` button, and is then deleted.

**Removed** — this must subtract, and it does:

1. `components/ProjectSwitcher.tsx` (262 lines).
2. `.switcher-grid`, `.switcher-card*`, `.card-attn`, `.switcher-foot` in
   `styles.css` (~110 lines). `.switcher-backdrop`, `.switcher-search` and
   `.switcher-empty*` survive — the palette already uses them.
3. `switcherOpen` / `openSwitcher` / `closeSwitcher` in the store, and
   `switcherEmpty` in `probeView.ts`.
4. The palette's own `act:switcher` row (`Switch project…`) — you cannot
   navigate to the surface you are standing in.
5. The 1–9 digit pick. In a mixed list a digit names whichever *kind* landed at
   that index — it would look like an identity while naming a position, which is
   the argument `shortSessionLabel`'s own doc already makes against launch-order
   numerals.
6. The string-concatenated status suffixes in session titles (`" - needs you"`,
   `" - waiting"`, `" - not running"`), replaced by real form: the shared dot and
   the shared `StatusFlag` word.
7. **Three accent spends**, each of which `DESIGN.md` would have had to strike on
   its own: `.switcher-card.active`'s `--moss` ring (a *listed known exception* —
   the semantic success colour standing in for an active state, now deleted
   rather than fixed); `.switcher-card-group`'s `--accent-soft` group label (a
   group name is a fact, not an act); and `.card-attn`'s bare accent `●` (a
   2.92:1-class mark on Washi, and a dot borrowing the status vocabulary's shape
   for a different meaning).

**Net concept count: −1.** One lookup surface instead of two, one chord instead
of two, one attention vocabulary instead of a card dot plus a prose suffix.

## 2.2 Ranking — the rule that keeps it from disagreeing with the deck

Three fixed sections, **always in this order, never re-ordered by score**:

```
SESSIONS      what needs me
PROJECTS      where do I go
COMMANDS      what can I do
```

That is the deck bar's own reading order one scale up (*where am I → what needs
me → facts → tools*), and fixing it is the whole anti-disagreement rule.

**A typed query filters; it does not re-rank.** Within `SESSIONS` the order is
`followRank(useKeyStatus(s))` — `missionTail`'s `RANK`, the same ladder Mission
and Overview sort by and `tabDotStatus` reduces by — before and after a query,
stable within a rank. Within `PROJECTS` the order is `orderByMru`. Within
`COMMANDS` it is authored order.

This is the one place I refuse something Orca does. `WorktreeJumpPalette`
interleaves its sections by score; DevDeck must not, because a list that can put
a better-matching idle session above an agent blocked on you is a fourth opinion
about attention order, and this codebase spent two weeks killing the other three.

Matching stays `matches()` (fuzzy subsequence) over a per-kind haystack: session
name + project name + worktree leaf; project name + path + group; command title.

## 2.3 Row anatomy

All three kinds are `.palette-item` — same height, same 2px accent selection
stripe (Tier 2, one per surface), same `--bg-3` selected fill.

**Session row**

```
[dot]  auth refactor  · devdeck  · fix/JIRA-1423            needs you
```

- `[dot]` — `.tab-dot status-<derived>`, the same five forms through
  `useKeyStatus`. This is the merge's biggest single gain: the palette becomes
  one more surface rendering the full vocabulary instead of prose.
- session name — `--text`, `flex: 1; min-width: 0`, ellipsis.
- `· project` — `--muted`.
- `· branch` — the worktree leaf, `var(--font-mono)` / `--muted`, **only when the
  session's directory is not the project root** (sans for names, mono for
  values). Absent otherwise; presence is the signal.
- right — `StatusFlag` (`.ov-flag`), the existing single component: `needs you`
  for `attention`, `waiting for you` for `waiting`, **nothing at all otherwise**.
  `--text` / 600. The accent is spent on the `!` beside the dot, never on the
  word — the same spend-once rule the Overview heads keep.
- `not-running` — the flat `--muted` bar, the words `not running` in `--muted`
  where the flag would be, sorts last, and is **still listed and still
  selectable**: jumping to it is how you start it again.

**Project row**

```
[chip]  devdeck  ~/code/devdeck            3 terms · 1 agent   ⚑ 2 want you
```

- `ProjectChip` (existing), at the small size this row height allows.
- name `--text`; group `--muted`; path `--muted` (**not** `--faint`: 4.25 / 4.25
  / 4.13 on `--bg-2` is under the text floor), mono, ellipsis, first to shrink.
- counts from `projectSessionCounts` — `3 terms · 1 agent`, `--muted`.
- attention — `⚑ n want you` / `⚑ 1 wants you` / **nothing at zero**, reusing
  `DeckWants`' exact copy table and its rule: accent on the flag glyph, word in
  `--text`/600. A project row aggregates, so it borrows the aggregate word and
  never the per-session one.
- `probe-tag` folder marker (`MISSING` dashed / `UNCHECKED` solid) exactly as the
  card carried it, with the dashed rule under the path. **A marker is not a
  gate**: a missing-folder row still selects, activates the project, and lets
  `FolderNotice` explain.

**Command row** — unchanged: title, `.palette-kbd` chord pill; no per-row section
label, because the header carries it now.

**Section headers** — one per group, `section-label` grammar (`--muted`, 11px,
uppercase, letter-spaced), `aria-hidden`, presentational, **skipped by the arrow
keys**. The list is `role="listbox"` with `aria-activedescendant` on selectable
rows only. Dropping the per-row `.palette-section` label and adding three headers
is a net subtraction at any list longer than three rows.

## 2.4 States, exhaustively

| State | Renders |
| --- | --- |
| **First run, no projects** | `SESSIONS` and `PROJECTS` absent — a zero-row section renders nothing, because there is no `0 projects` header to learn to ignore. Body: `No projects yet. Open a folder to start.` The head keeps the `Open folder…` button — the one piece of switcher chrome that survives, because `Ctrl+O` is a chord nobody has met on first run. |
| **Projects, no sessions** | `SESSIONS` absent. `PROJECTS` and `COMMANDS` as normal. |
| **Empty query, normal** | All three sections. Selection preselects **the previously-used project** (`previousProjectId`), scrolled into view — today's learned `Ctrl+K, Enter` flip-back is preserved unchanged. Wants-you sessions lead the list visually; the cursor does not steal `Ctrl+Shift+J`'s job. |
| **Query matches one section** | The other headers are **absent**, not empty. |
| **Query matches nothing** | `No session, project or command matches ` plus the query in `.switcher-empty-q` (mono, `overflow-wrap: anywhere`). |
| **Folder missing** | `MISSING` dashed pill plus the dashed rule under the path; row still selectable. |
| **Folder unknown** | `UNCHECKED` **solid** pill, chip **not** desaturated — only our knowledge is qualified, per the command-presence grammar. |
| **Session with no process** | `status-not-running` bar, `not running`, sorts last, selectable. |
| **Loading** | **There is none, and none may be built.** Every row is in-memory store state; nothing here awaits IPC. An implementer must not add a spinner or a skeleton. |

## 2.5 Keyboard

| Chord | Was | Becomes |
| --- | --- | --- |
| `Ctrl + K` | project switcher | **the palette** |
| `Ctrl + Shift + P` | command palette | the same palette; **removed from `shortcuts.ts` and the F1 overlay**, still working for one release so nobody's hand hits a dead key |
| `1`–`9` inside it | pick a project card | **gone** (2.1 §5) |
| `Ctrl + Shift + K` | recent project, hold to walk back | unchanged |
| `Ctrl + Shift + J` | jump to the agent waiting longest | unchanged |
| `↑ ↓` | — | move, skipping headers |
| `Enter` / `Esc` | — | run / close, unchanged |

`Ctrl+K` is the survivor because it is unshifted, because it is the chord the F1
overlay already teaches first, and because `Ctrl+Shift+K` and `Ctrl+Shift+J` are
already a family around it.

New `shortcuts.ts` copy, two rows replaced by one:

```
Ctrl + K            Find anything — a session, a project, a command
Ctrl + Shift + K    Recent project - hold and tap to walk back
```

The placeholder changes from `Run a command…` to
**`Find a session, a project or a command…`**. The foot line, adopted from the
switcher, reads `↑↓ to move · Enter to open · Esc to close`.

## 2.6 Layout, and one latent defect

- **Real window.** `.palette` stays `60vw / max-width: 600px / max-height: 70vh`.
  It does **not** need the switcher's 920px — that width existed for a card grid,
  and this is a row list. No new width rule.
- **Narrow case.** The window minimum is 900px, so the palette is 540px there.
  Shrink order: project path first (`min-width: 0`, ellipsis), then the session
  name. The `.palette-kbd` pill, the flag word and the dot never shrink.
- **Latent defect, found by reading, to be fixed with this work.**
  `.palette-list` has `overflow-y: auto` inside a `max-height: 70vh` column flex
  and **no `min-height: 0`** — the load-bearing half of `DESIGN.md`'s overflow
  pair. A flex item's `auto` minimum is its own content height, so with a long
  list the palette can push past 70vh instead of scrolling, and it inherits the
  global quiet scrollbar rather than the explicit affordance. Add `min-height:
  0`, an 8px bar with a `--border-strong` thumb at 4px radius, and **never**
  `scrollbar-width: thin`.
- **Deck bar at 900px.** `DESIGN.md`'s own budget: keys ~350 + wants ~110 + three
  tools 88 + 20 padding + 36 gaps ≈ 604, against a status region needing 139. The
  `WORKTREE` label adds ~62px plus a 6px gap → status region ~207, total ~811
  against 900. It fits with ~89px of slack, so the deleted `max-width: 959px`
  collapse rule stays deleted and no new branch is added.

## 2.7 Cost across the six skins

Every element above is an existing token on an existing ground. Measured on
`--bg-2` (the palette's ground) and `--bg-3` (the selected row), Slate / Sumi /
Washi:

| Ink | on `--bg-2` | on `--bg-3` |
| --- | --- | --- |
| `--text` — name, flag word, waiting diamond | 15.03 / 12.17 / 9.82 | 16.24 / 13.73 / 11.51 |
| `--muted` — project, path, branch, counts, `not-running` bar | 6.98 / 5.49 / **4.46** | 7.54 / 6.20 / 5.23 |
| `--faint` — **not used for new text**; listed for the record | 4.25 / 4.25 / 4.13 | 4.60 / 4.80 / 4.84 |
| `--clay` — idle and working dots | 6.62 / 5.37 / 3.36 | 7.15 / 6.06 / 3.94 |
| `--accent` — the `!`, the flag glyph, the selection stripe | 8.74 / 5.30 / **2.92** | 9.45 / 5.98 / 3.43 |

Three things follow, and all three are this system's existing positions rather
than new concessions: `--muted` on Washi's `--bg-2` misses the 4.5 floor by 0.04
and must not be patched with a literal; `--accent` as *ink* on Washi's `--bg-2`
is 2.92 and is therefore never the only channel — the `!` glyph and the flag's
shape carry it; and every status distinction is carried by **form** (filled disc
/ hollow diamond / flat bar / halo) before ink, so these rows survive Washi, and
a user-chosen accent, identically to the deck's keys.

Accent count with the palette open: **one** Tier-2 selection stripe, plus one
Tier-3 mark per session that is blocked on you — the per-blocked-session
allowance the budget states. **No accent fill anywhere on this surface.**

Two `DESIGN.md` edits this requires, both corrections rather than additions. The
Layout section's *"Project management … lives in the `Ctrl+K` switcher"* becomes
*"lives in the project context menu — on the deck strip label, and on any project
row"*; it already does, because `projectContextMenu` is wired to `ProjectStrip`'s
label, which is the fact that lets the switcher die without losing a capability.
And the active-state grammar's known exception *".switcher-card.active marks the
active project with a `--moss` ring"* is **struck**, because the element is gone.

---

# Part 3 — What I deliberately did not design

- **Score-interleaved results.** Orca's `WorktreeJumpPalette` does it; refused in
  2.2, because it is a fourth opinion about attention order.
- **A hibernation / sleeping filter.** Orca has hibernated agents; DevDeck does
  not. `not-running` is death, not sleep. A filter for a state the product does
  not have would be inventing the state to justify the control.
- **Linked provider items** (Linear / GitHub rows in the palette). DevDeck has no
  provider integration on this surface, and Tasks was demoted out of the deck by
  D1. Not designed, and not to be added to reach parity.
- **A worktree rail, a second deck row, or a nested strip.** Part 1.1.
- **A branch line on the deck key.** Part 1.4.
- **A per-worktree git identity chip.** Git config is shared across worktrees; it
  would name a distinction the repo does not have.
- **Worktree lifecycle** — creating, pruning, merge cleanup. `WorktreesModal`
  keeps it; only its missing third state is specified here (1.5).
- **The phone client.** `CLIENT_HTML` has neither a palette nor a switcher, and
  its own hard-coded palette. Out of scope.
- **The accent picker's contrast floor.** `DESIGN.md` already records that it has
  none and that giving it one is undesigned. Still true.
- **Any new token.** Nothing above needs one.

---

# Part 4 — What only a user session can settle

The beta has not happened; neither idea below has been tested on anybody, and
nothing here may be written up as validated.

1. **Does `Ctrl+K, Enter` still want to be flip-back?** I preserved it (2.4)
   because it is the one gesture this product has that is genuinely learned. The
   alternative — preselect the top wants-you session — is arguably the product's
   thesis expressed as a keystroke. Watch what a user's hand does after `Ctrl+K`
   in a first session; do not decide it from this document.
2. **Does a filtered-not-re-ranked session list feel broken?** Typing `auth` and
   getting an attention-first order rather than a best-match-first order is
   correct by the rule and may feel wrong at the keyboard. If it does, the fix is
   a tie-break *within* a rank, never a re-rank across ranks.
3. **Do people `cd` between worktrees inside a pane?** If they do, `termCwd`'s
   launch-directory reading becomes a real staleness problem and the branch chip
   needs a fourth state (1.3). If they do not — and the worktree toggle
   defaulting off suggests most sessions never leave the project root — the
   wording is the whole of the answer.
4. **Is `WORKTREE` the right word?** The candidates were `BRANCH` (wrong: the
   branch name is right beside it) and `ISOLATED` (wrong: it names an intent, not
   a fact about the folder). A user who has never run `git worktree` may read
   none of them. One session settles it.
5. **Do three fixed sections read as one list or as three?** The header rows are
   the cheapest thing in this spec to remove if they do not.
