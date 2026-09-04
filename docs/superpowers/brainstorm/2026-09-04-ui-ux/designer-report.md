# DevDeck — UI/UX overhaul specification

Design audit + specification. No code was changed. Written against `DESIGN.md`
(v0.9.1), the 7 x 12 = 84-skin constraint, and the stated milestone: **5–10 real
external users, none of whom have ever opened this app.**

**Audience ruling applied throughout:** where the daily driver and the newcomer
conflict, the newcomer wins. Labels over icons; obvious first steps; nothing that
requires memorising. I have *not* specified density settings or labels-that-fade-
with-use. I agree with that call and argue for it in §2, Q3.

## Method

Built (`npx electron-vite build`) and drove the real app via the `run-app` skill on
a scratch `userDataDir`, which gave the true zero-projects first-run state
(`debugPort: 9431–9438`, `udata-designer`). Screenshots in `../shots/`:
`01-firstrun`, `02-switcher-empty`, `20-mission-populated`, `21-terminal-launcher`,
`22-tasks`, `23-api`, `25-network`, `27-switcher-populated`,
`30-labels-always-1386`. Deck widths were **measured in the running app across all
12 `[data-style]` values**, not estimated. Three parallel source audits covered the
project-open flow, the terminal/agent flow, and every view's empty state.

---

# 1. Ranked findings

Ranked by **cost to a stranger in their first five minutes**, not by how wrong they
are in the abstract.

| # | Finding | Cost |
| --- | --- | --- |
| 1 | **The deck is 13 unlabelled icons.** The app's primary navigation is unreadable on arrival. `styles.css:7926` hides `.deck-view-name`; only the active view — the one you already know — is named. | Blocks everything. A stranger cannot find Terminal, which is the only view that teaches. |
| 2 | **A moved/deleted project folder is invisible, and three separate features then lie about why things fail.** No path validation exists anywhere (`main/projects.ts:84`). Git returns `{isRepo:false, changes:0}` (`git.ts:181`); the Run button says *"No runnable project type detected"*; a terminal says *"Pick a different shell in Settings -> Terminal"*. Verified live: I deleted a project's folder and the app rendered it as perfectly healthy. | Unrecoverable confusion. Every message points away from the real cause. |
| 3 | **Folder drag-and-drop is dead code that still animates.** `ProjectSwitcher.tsx:144` reads `File.path`, removed in Electron 32; the app is on Electron 43 and `webUtils` is absent from the preload. The dashed accent outline (`styles.css:489`) lights up on drag, then nothing happens on drop. | Promises a feature and silently fails — worse than not having it. |
| 4 | **No application menu, no `Ctrl+O`.** `src/main/index.ts` never imports `Menu`. The first thing a Windows user tries does nothing. | The most-guessed path is a dead end. |
| 5 | **The default landing view is the emptiest one, and its loudest object is a wall of the machine's listening ports.** Mission is `DECK_VIEWS[0]`; after opening a folder a stranger sees `0 running`, two "nothing here" sentences, and ~18 port pills belonging to Steam and SQL Server. | Terrible first impression; teaches nothing. |
| 6 | **The app explains itself exactly once, on a screen it then destroys.** `NoProjects.tsx:31` is the only sentence in the product that says what DevDeck is. `App.tsx:364` unmounts it permanently after the first folder is added. | The framing never returns. |
| 7 | **`Deck.tsx:38` "Add or open a project" does not add.** It calls `openSwitcher()`. Deck -> empty switcher -> `+ Add folder` is a three-hop path to a folder dialog. | A labelled control that does something else. |
| 8 | **`projects.json` unreadable => every project action is a silent no-op, forever.** `ProjectStore.unreadable` is set diligently in main and read by *zero* renderer code. Compare `PersistBlockedBar`, which handles the `workspace.json` equivalent properly. | The app appears broken with no explanation. |
| 9 | **No help affordance anywhere in persistent chrome.** F1 is advertised only inside the modal it opens. The topbar has no `?`. | 26 shortcuts, undiscoverable. |
| 10 | **`worktree` — bare, lowercase, unexplained, and checked by default** (`TaskBoard.tsx:309`). Every dispatch silently creates a git worktree in a sibling folder. | Jargon gating a side-effecting default. |
| 11 | **Two accents side by side in the terminal tab bar** — `+ Claude` (accent fill) and `Resume` (accent outline), `TerminalView.tsx:407,440`. Plus an accent-filled **disabled** `Add` on Tasks. | Violates the one-accent rule; the eye has no single target. |
| 12 | **`Claude YOLO`** ships as a default preset (`settings.ts:163`) running `claude --dangerously-skip-permissions`. The riskiest control in the app is named after a joke, and no word on the card says what it does — only a 2px stripe and a hover tip. | Copy failure on the one control where copy is a safety control. |
| 13 | **Zeros standing in for unknown.** Mission claims *"No uncommitted changes across your projects."* before the first git poll resolves (`MissionControl.tsx:204,412`); Network shows `0/0` before the proxy has ever run; Browser shows a disabled `-> Agent (0)`. | The app states facts it has not established. |
| 14 | **Switcher cards are non-semantic `<div>`s** — no listbox roles, no Tab order — and `onMouseEnter` moves the keyboard selection, so mouse and keyboard fight. Active project is marked by a 1px `--moss` ring (colour only, and the *success* colour). | Inaccessible; active state fails the grammar. |
| 15 | **Seeded preset icons are Unicode pictographs** (`* + lightning + diamonds`, literally `✳ ✦ ⚡ ◆ ◇ ▶ ⚒ ✓`), which the review rubric bans in chrome and which carry no learnable meaning. | Decoration masquerading as a vocabulary. |
| 16 | **Two disagreeing definitions of "the primary agent."** The button uses `agents.find(runMode !== "normal")`; `Ctrl+Shift+Enter` uses `agents[0]` (`TerminalView.tsx:103` vs `:126`). They diverge as soon as a normal-mode command is first in Settings. | A chord and a button labelled the same thing do different things. |
| 17 | **No spawning state.** Between click and the shell's first byte the pane is an unlabelled black rectangle — visually identical to a hung spawn. | Absent != loading != failed, all rendered the same. |
| 18 | **Path dedupe is exact string equality** (`projects.ts:98`). `C:\Repos\Foo` and `c:\repos\foo` become two project cards. | Duplicate cards, no explanation. |

---

# 2. Verdicts on the three named questions

## Q1 — Opening a project

### Verdict: **"Add" and "Open" are the same act. Stop shipping two verbs.**

The code already agrees: `addProject()` (`store.ts:1266`) adopts main's returned
`activeId`, so adding *always* activates. Only the interface pretends there is a
distinction, and it pretends four different ways:

| Surface | Copy today | Actually does |
| --- | --- | --- |
| `NoProjects.tsx:35` | `Open a project folder` | opens the dialog |
| `ProjectSwitcher.tsx:163` | `+ Add folder` | opens the dialog |
| `CommandPalette.tsx:163` | `Add project…` | opens the dialog |
| `Deck.tsx:38` | `Add or open a project` | **opens the switcher** |
| OS dialog title (`projects.ts:89`) | `Add a project folder` | — |

Five labels, one act, and the one that says both words is the one that does
neither.

### Spec

**One verb everywhere: `Open folder…`** — ellipsis because it opens an OS dialog.
Applies to `NoProjects`, the switcher header, the command palette, the deck, the
new File menu, and the dialog's own title. Drop "add" and "project" from this act
entirely; a stranger opens a *folder*, and DevDeck's own lede already says "one
folder at a time".

**Three new entry points, in value order:**

1. **An application menu** (`src/main/index.ts`, which currently imports no `Menu`).
   `File -> Open Folder…  Ctrl+O` · `Open Recent >` (from the MRU) ·
   `Close Project` · separator · `Exit`. Plus `Help -> Keyboard Shortcuts  F1`,
   `Help -> About DevDeck`. This is the cheapest discoverability win in the audit —
   zero new pixels in the renderer — and it makes `Ctrl+O` and the OS "recent"
   idiom work. It also fixes finding #9.
2. **`Ctrl+O`** bound to `addProject()` globally in `App.tsx`, alongside `Ctrl+K`.
3. **Whole-window folder drop** (fixes finding #3). Add `webUtils.getPathForFile`
   to the preload bridge and replace the dead `File.path` read at
   `ProjectSwitcher.tsx:144`. Move the drop target from the switcher backdrop to
   the app root so it works whether or not the switcher is open.

**Drop overlay states.** On `dragover` with `types.includes("Files")`, a full-window
overlay: `--scrim` ground, a `2px dashed var(--accent)` inset frame (the idiom
already at `styles.css:489`), centred `Icon name="plus"` and one line —
`Drop a folder to open it`. On drop of something that is not a directory, a toast:
`That's a file, not a folder. DevDeck opens folders.` No new tokens.

**Deck control** (`Deck.tsx:34–39`). Replace the ghost text-link with a real button
that opens the dialog. `.deck-empty` renders when there is no *active project*,
which includes "projects exist, none active" — so two copies:

- no projects at all -> `Open folder…` (Icon `plus`), calls `addProject()`
- projects exist, none active -> `Choose a project` (Icon `chevronUp`), calls
  `openSwitcher()`

Token change: `.deck-empty` is currently `color: var(--faint); border: none`. Give
it the `.deck-add` treatment already in the file (`1px dashed var(--border)`,
`border-radius: var(--radius, 7px)`) and `color: var(--muted)`, hovering to
`--accent`. It must **not** take an accent fill — the deck is chrome, and in this
state the accent CTA already lives on the `NoProjects` panel above it.

### The moved/deleted-on-disk state — the honest case

This is the "we asked and could not find out" the brief demands, and it currently
does not exist at all. **Three states, and the third is the point.** Reuse the
**command-presence marker** grammar from `DESIGN.md` verbatim — do not invent a
second vocabulary for the same idea:

| State | Meaning | Form (three channels, none of them hue) |
| --- | --- | --- |
| `ok` | folder resolved | **nothing.** A healthy project does not grow by a pixel. |
| `missing` | `stat` succeeded and said "not there" | ProjectChip `filter: grayscale(1) opacity(.6)` · path gets a **1px dashed** rule (`--border-strong`) · `.probe-tag qualified` pill reading **`FOLDER MISSING`** |
| `unchecked` | the `stat` *itself* failed — permission denied, unmounted network path, timeout | chip **keeps full colour** · **solid**-bordered `.probe-tag` reading **`UNCHECKED`** |

`unchecked` is not a weaker `missing`. Nothing about the *project* is qualified;
only our knowledge is. Rendering them the same way is precisely the failure this
grammar exists to prevent. And **before the first check lands there is no marker at
all** — absence is the honest default while a probe is in flight, per the same rule.

The grayscale filter (not `color`) matters for the same reason it does on launch
cards: `ProjectChip` renders a user-set emoji, which paints its own colours and
ignores `color`.

**A marker is not a gate.** A `missing` project still activates and still opens a
terminal, because a path can come back — an unmounted drive, a VPN, a sleeping NAS.
What changes is that the failure is now *attributed*.

**New copy.** In the switcher card, the pill plus the dashed path is the whole
marker. When the *active* project is missing, a `notice-bar` (the existing
component) under the topbar:

> `DevDeck can't find this folder.` `<code>{path}</code>`
> `It may have moved, been renamed, or be on a drive that isn't connected.`
> Actions: `Locate…` (accent) · `Remove from DevDeck` (`.secondary`, `--muted`)

Never "deleted" — DevDeck cannot know that. Per the notice-bar rule, only the
non-destructive action takes the accent; the bar does not fade and does not colour
itself red.

**Downstream corrections this unlocks** (all currently misattributed):

- `git.ts:181` must return `changes: null` (unknown), not `0`, when `execFile`
  fails ENOENT on the cwd. The file's own doc comment already insists "unknown is
  not zero"; this branch violates it. `DeckStatus` already renders `? changes`
  correctly when given `null`, so the UI work is already done.
- `Topbar.tsx:29` must not say "No runnable project type detected" when the folder
  does not exist. Copy: `This project's folder isn't there right now.`
- `pty.ts:249`'s corpse notice must not send the user to Settings -> Terminal when
  the shell is fine and the cwd is gone. Branch the copy on which one failed.

**And the store-unreadable case** (finding #8) gets the same treatment it already
has for `workspace.json`: read `ProjectStore.unreadable` in the renderer and render
a `notice-bar` modelled on `PersistBlockedBar`:

> `DevDeck can't read its project list, so adding and removing projects is off for
> this session.` Actions: `Show file` · `Reload`

### Recents, groups

The MRU exists (`projectMru.ts`) and orders the switcher grid, but **says so
nowhere** — a 40-project user sees 40 identical cards ordered by an invisible rule.

Spec: two `section-label` rows in the switcher grid (existing component: `--muted`,
`--fs-label`, uppercase, `--ls-label`): `RECENT` above the first row,
`ALL PROJECTS` below. Footer copy gains the digit hint it is missing:

> `1–9 to open · arrows to move · Enter to open · Esc to close`

Also fix on this surface: `addProject` must call `recordMru` (today a project you
just added sorts **last**), and the five call sites that bypass `setActiveProject`
(`store.ts:1807, 2249, 2273, 2719, 2645`) must go through it so `Ctrl+Shift+K` stops
being unreliable. `.switcher-card.active` must move off the `--moss` ring to the 2px
accent **left stripe** the grammar assigns to a container — this is already listed
as a known exception in `DESIGN.md`, and the fix is one line.

**Pinning: deliberately not designed.** See §5.

## Q2 — Opening a terminal for that project

### The path today, counted

From a cold first run to an agent process running:

1. click `Open a project folder`
2. navigate the OS dialog, click *Select Folder*
3. **land on Mission** — `0 running`, two "nothing here" lines, a wall of ports
4. **find Terminal** — unlabelled icon 3 of 8 at the bottom of the screen
5. click the `Claude` card

**Five steps, and step 4 is a guess.** Step 3 is not optional: `addProject` never
touches `view`, and the fresh-install default is `"mission"` (`store.ts:1233`).

### Verdict: **three steps, and the app does exactly one thing on its own — it lands you in the right room.**

**Change:** when activating a project that has **no recorded view**, default to
`"terminal"`, not to the current view. `store.ts:1301` today reads
`s.viewByProject[id] ?? s.view`; for a never-opened project that resolves to
Mission. A returning project keeps its remembered view — this changes first contact
only.

Why Terminal: `CommandLauncher` is **the only screen in the app that answers all
three questions a stranger has** — what is this for, what do I press, and what could
go wrong. It names the commands, marks the ones not on PATH, explains the mark, and
does not gate the launch on the mark. It is the product's best-written surface and
it is currently three steps and one guess away. Every other empty state in the app
should be rewritten against it as the template (§4).

New path: `Open folder…` -> dialog -> **launcher, click a card.** Three steps, no
guessing.

### Should DevDeck auto-spawn anything? No.

- **Never an agent.** These are paid CLIs. The codebase already argues this well
  (`ProjectStrip.tsx:48`: *"firing a paid CLI straight off it was a guess at what
  you meant. It asks instead."*). Don't undo that.
- **Not even a plain shell.** A spawned pane *replaces* the launcher — the one
  teaching screen — with a blank prompt and no instructions. Auto-spawning would
  buy one click and cost the only onboarding the app has.

The launcher **is** the landing. That is the whole answer.

### Other Terminal fixes

- **Kill the second accent.** `Resume` (`TerminalView.tsx:440`) drops to
  `.secondary` / `--muted`. And hide it entirely until a resumable session has
  existed — offering "Resume" on a project with zero history is a control for a
  thing that does not exist.
- **One label for one act.** `+ Terminal` (tab bar) and `+ New terminal` (launcher)
  are the same action under two labels, visible within one second of each other.
  Use `New terminal` for both.
- **Rename `Claude YOLO` -> `Claude (no permission prompts)`**, and give the card a
  **word**, not just a stripe: a bare uppercase micro-label reading `SKIPS PROMPTS`
  (badge-tier "classification": `--faint`, letter-spaced — *not* a filled badge,
  which is reserved). `DESIGN.md`'s risk marker specifies a `--danger` left stripe
  *plus* full-`--text` description colour; the stripe is present, the word is not.
  A 2px stripe and a hover tooltip is not enough for the one control that lets an
  agent edit and run anything without asking. Copy rule: no cheerfulness where the
  situation is not neutral, and this situation is not neutral.
- **Drop the duplicate preset.** `Claude` and `Claude Opus` ship with the *identical*
  command `claude` — two visually duplicate cards for one binary. Three of the five
  default agent cards run the same binary. Either make the command differ visibly or
  drop `Claude Opus` from the seed.
- **Replace the seeded Unicode pictographs** with `Icon.tsx` names. Keep the
  free-text field for users; only the *shipped defaults* must obey the rubric,
  because they are what a stranger sees.
- **Fix the alignment.** The launcher centres its heading, subtitle, buttons and
  section labels over a **left-aligned** card grid (see `21-terminal-launcher.png`),
  and the grid occupies the left 60% with a dead right third. Left-align the whole
  panel in a `max-width: 960px` column with `margin-inline: auto`; section labels
  become normal left-aligned `section-label`s.
- **Reconcile the two "primary agent" definitions** (finding #16): make
  `Ctrl+Shift+Enter` use the same
  `agents.find(a => a.runMode !== "normal") ?? agents[0]` the button uses.
- **Add a spawning state** (finding #17). Between `pty.create` and the first byte,
  render a centred `--muted` line in the pane: `Starting {shell}…`. After 5s it
  becomes `Still starting {shell}…`. Absent, loading and failed must not share a
  rendering. No spinner — a static line carries it and survives
  `prefers-reduced-motion` unchanged.
- **The blank-custom-shell path emits no exit event**, so it renders a message with
  **no affordance** — no dead bar, no restart (`TerminalPane.tsx:259`). Give it the
  same dead bar the other failures get, with `Open Settings` as its action.

## Q3 — Icon-only vs icon+label

### Verdict: **labels always, on both the deck view keys and the tool cluster.** With one measured caveat that changes a window constraint.

**Measured in the running app** (1386x863 window, `.deck-bar` = 1386px):

| | icon-only | labels |
| --- | --- | --- |
| `.deck-views` (8 keys) | 348px | **683px** |
| `.deck-tools` (5 icons) | 148px | 148px |
| chrome total (+44 gaps/padding) | 540px | **875px** |
| left for `.deck-status` | 846px | **511px** — and it only needs 511px |

Labels-always costs 335px and fits with 511px to spare.
`30-labels-always-1386.png` shows the result: the deck stops being a mystery strip
and starts being a navigation bar. This is not a close call.

### The middle options, and which I would kill

- **Active-label-only (today).** **Kill.** The worst of the five: it spends the
  label on the one view whose identity you already know, and leaves the seven you
  might want to *go to* unlabelled. The label lands on the lowest-information item
  in the row.
- **Labels on hover.** **Kill.** A label that appears only under the pointer teaches
  nothing to someone scanning, is invisible to keyboard and touch, and duplicates
  the `data-tip` tooltip already on every key. It is a tooltip with extra steps and
  a layout shift.
- **A user setting.** **Kill.** A preference is what you ship when you cannot
  decide, and it fails the stranger by construction: they would have to find a
  setting inside a 15-section modal to make the app legible, and they do not know
  the setting exists. It also doubles the QA surface across 84 skins.
- **A responsive/width-driven rule.** **Keep — but invert it and re-threshold it.**
  The rule today (`@media (max-width: 1180px)`) strips labels on any 1366x768
  laptop, which is very common and is precisely the machine a beta user will have.

### The 84-skin flag — measured, and it is real

The labelled deck does **not** cost the same in every style. Measured across all 12
`[data-style]` values with a project open:

| Style | `.deck-views` | chrome total | Why |
| --- | --- | --- | --- |
| modern, wabi, minimal, neon, modernplus, lacquer, aurora, neo, kinetic (9) | 683px | 875px | baseline |
| **crt** | 724px | 916px | `[data-style="crt"]` sets the whole UI to `--font-mono`, and `styles.css:6113` explicitly forces `.deck-view-name` to mono |
| **flat** | 743px | 935px | wider control padding |
| **bauhaus** | **786px** | **978px** | `[data-style="bauhaus"] button` sets `text-transform: uppercase; font-weight: 700; letter-spacing: .04em` — and `.deck-view` **is** a `<button>` |

`src/main/index.ts:127` sets `minWidth: 900`. **In Bauhaus the labelled deck chrome
alone is 978px — it overflows the app's own minimum window width by 78px** before
the status region gets a single pixel. Flat overflows by 35px, CRT by 16px.

**Do not solve this with a per-style override.** A design that needs one has not
been finished, and shrinking Bauhaus's deck type would contradict the style's entire
statement.

**Two changes, together:**

1. **Raise `minWidth` from 900 to 1040** (`src/main/index.ts:127`). 900px is an
   implausible floor for a multi-pane cockpit anyway, and 1040 clears the worst skin
   (978) with 62px of status headroom. One line, and it makes labels-always safe in
   all 84 combinations.
2. **Re-threshold and re-order the collapse.** Replace `@media (max-width: 1180px)`
   with a rule at **1040px** that degrades in *meaning order* rather than
   all-or-nothing. `.deck-status` is already `flex: 1; min-width: 0; overflow:
   hidden`, so it correctly yields first with no change. Then:
   - **first** — tool-cluster labels drop to icons (they are overlay openers, not
     navigation)
   - **then** — the four `verify`-group labels drop (API, Database, Browser,
     Network — the ones a stranger needs least). The group already exists as
     `v.group === "verify"` in `ViewKeys.tsx:9–12` and already carries the
     `.group-start` hairline, so this needs no new markup.
   - **last, and only below ~880px** — the supervision three (Mission, Tasks,
     Terminal)

   Nothing that drops a label may drop its `data-tip` or `aria-label`.

### The tool cluster

Five icon-only buttons with tooltip-only names — `Scripts & saved commands`,
`Agent context files`, `AI usage`, `Settings`, `More` — and `More` hides Work,
Activity, Standup, Release **and Keyboard shortcuts** behind an unlabelled `…`.

Labelling all five in place costs ~380px and would put **13 text buttons of two
different kinds** in one 30px row: 8 that switch the main view and 5 that open an
overlay. That is not legibility, it is a wall.

**Recommended: move the tool cluster out of the deck into the topbar's right side,
beside the command pill, labelled.** Measured, the topbar uses ~740px of 1386
(crumb ~400 + pill ~340); 640px is free. This:

- gives the deck bar one job — *where am I, where can I go, what is the state*
- puts app-level panels where every desktop app puts them, at the top
- removes the two-kinds-of-control ambiguity without deleting anything
- creates the obvious home for the missing **`?` help control** (finding #9)

Topbar right, left to right:
`[command pill] | Scripts · Usage · Settings · ? · …`

The three named tools take `Icon + label` at `--fs-sm`. `?` and `…` stay icon-only,
**because they are the two universally-understood glyphs in desktop software** —
that is the one place icon-only survives this ruling, and it survives on convention,
not on the author's memory. `Agent context files`, Work, Activity, Standup and
Release move into `…`.

**Fallback if the topbar move is judged too structural for one release:** keep the
cluster in the deck, label three (`Scripts`, `Usage`, `Settings`) at ~250px, push
the rest into `More`, and keep the `.group-start` hairline as the divider between
navigation and tools. Chrome total becomes ~977px baseline / ~1080px Bauhaus, which
pushes `minWidth` to 1120. The topbar move is better and cheaper in pixels.

### The counter-argument I considered and rejected

The one honest case for icon-only is scan speed for a daily driver: eight
same-width icons are a faster saccade target than eight variable-width words. That
is true, and it is why the current design exists. It loses here for two reasons
beyond the audience ruling.

First, **the icons are not actually distinguishable at 16px** — `send` (API),
`appWindow` (Browser) and `globe` (Network) are three abstract outlines for three
abstract concepts, and no legend exists. `DESIGN.md` itself says *prefer a word to
an encoding that needs a legend*; an encoding that needs a printed key did not
survive on its own.

Second, **the deck is not a high-frequency target for the expert.** `Ctrl+1..8`
already exists, and every key's tooltip already names its chord. The person who has
memorised the icons has also memorised the chords and does not look at the deck at
all. The labels cost the expert nothing and give the newcomer the app. I have no
counter-argument against the stated preference.

---

# 3. Beyond the brief — the shell and the views

## 3.1 First run: two competing "add" affordances, and a collision

`01-firstrun.png`. The `NoProjects` panel is the best-written screen in the app and
its state handling is exemplary — the PATH probe renders *nothing* until the first
report lands, because a sentence about the PATH before the walk finished would be a
claim nobody made. Keep all of that. Three defects around it:

1. **The accent CTA sits on top of the ensō watermark.** `.empty-state::before`
   draws a 200px ensō at `opacity: .07` centred in the panel, and
   `Open a project folder` lands directly on it. The one accent object in the frame
   has a ring through it. Fix: offset the watermark to `top: 38%` for
   `.empty-state:has(.first-run)`, or drop it on this panel — it is the one screen
   where the void is already intentional.
2. **The deck below contradicts the panel.** The panel is "one object on a void";
   underneath sit 13 icons, 8 of them disabled at `opacity: .4`, plus a `faint`
   text link. In this state the deck should render **only** the `Open folder…`
   button and the status region, with `ViewKeys` and `ToolCluster` unmounted rather
   than disabled. A disabled control a stranger has never seen enabled teaches
   nothing; it is just noise with a tooltip.
3. **`Ctrl+K reopens this list later.` is not true.** There is no list on this
   panel, and `Ctrl+K` opens the switcher. Copy: `Ctrl+K opens your projects later.`

Also: the topbar breadcrumb reads `No project / Mission` while every view key is
disabled and no key is on. The crumb claims a view is active when none is. With no
project, render the crumb as `No project` alone and drop the `/ Mission` segment.

## 3.2 The empty-state doctrine

Seven of the eight views answer *"what isn't here"*. Only `CommandLauncher` answers
*"what is this for, what do I press, and what could go wrong"*. Make that the
required shape. Every view's empty state gets three parts, in order:

1. **A purpose line** — one sentence, what this view is for. Sentence case.
2. **A control** — a real button, not a sentence naming a control elsewhere.
3. **A precondition line, only when one exists** — what you need that you may not
   have, in the honest form the launcher already uses.

Concrete rewrites (each replaces the quoted current copy):

| View | Today | Spec |
| --- | --- | --- |
| **Mission** | `No agent sessions running. Start one from the deck (＋) or the command palette.` — a sentence pointing at a 14px icon, using a fullwidth `＋` that does not match what is drawn | Purpose: `Mission watches every agent session across your projects, so you can see which ones need you.` Control: a real `Start an agent session` button opening `LaunchOptions`. Delete the prose pointer. |
| **Tasks** | *nothing* — four columns of `0` and a `worktree` checkbox | Purpose: `A task board you can hand to an agent. Add a task, then press Dispatch to start an agent working on it.` The `Dispatch` control is rendered per-card, so at zero cards the entire point of the view is invisible. |
| **API** | `Response will appear here. (Requests run in the main process - no CORS limits.)` | `Response will appear here.` Delete the parenthetical: "main process" and "CORS" are implementation vocabulary in the sentence that greets an empty panel. |
| **Database** | `Select or add a connection to run SQL.` + `PostgreSQL, MySQL, SQL Server & SQLite (WASM - no native build) supported.` | Keep line 1. Line 2: `Connect to PostgreSQL, MySQL, SQL Server, or open a SQLite file.` Drop `(WASM - no native build)` — reassurance aimed at a packager. Add the precondition: `You'll need a database already running, or a SQLite file on disk.` |
| **Browser** | nothing; hardcoded to `google.com` with an address bar reading `https://` | Land on `about:blank` with a purpose line: `Open your app here, click any element to annotate it, and send the notes to an agent.` The address bar must never contradict the page. |
| **Network** | `No traffic captured yet.` / `Start the proxy, then route a client's traffic through it.` | Purpose first: `Capture the HTTP traffic your app makes, so you can show an agent what actually went over the wire.` Then the mechanism. |
| **Editor** | `Ctrl+S to save · syntax highlighting via Monaco.` | Drop `Monaco` — a library name, not a benefit. `Ctrl+S to save.` |

**The unknown states these rewrites must add:**

- **Mission's review queue** claims `No uncommitted changes across your projects.`
  during the whole window between mount and the first `git.status` resolving —
  a positive claim on zero data. Third state required: while `changes` is `{}` and
  no poll has returned, render `Checking your projects for changes…` in `--muted`.
  Not a spinner; a sentence.
- **Network's `0/0`** must not render before the proxy has ever run. Show the
  counter only once `captures` has been populated at least once.
- **Browser's `-> Agent (0)`** — drop the count until there is something to count.
- **The Editor's file tree** renders a bare project name with nothing under it for
  an empty folder, a folder it could not read, and a folder still loading. Three
  states, one rendering. Needs `This folder is empty.` /
  `DevDeck couldn't read this folder.` / `Reading…`.

## 3.3 Jargon

Ranked by how likely a stranger is to hit it in the first session, with the
replacement:

| Term | Where | Fix |
| --- | --- | --- |
| `worktree` | `TaskBoard.tsx:309` — bare, lowercase, **checked by default** | **Uncheck it by default.** Relabel: `Run in a separate copy of the repo` with a tooltip explaining the git worktree underneath. A side-effecting default must not hide behind a word the user does not know. |
| `preset` | `TaskBoard.tsx:120`, `SettingsModal.tsx:1492` | Settings calls the same objects "Startup commands". Pick one name. Recommend **`startup command`** — it says what the thing is. |
| `Lenses` | `MissionControl.tsx:425` — a bare button beside `Diff` on every review row | `Review with an agent`. "Lens" is defined only inside the panel the button opens. |
| `MCP` | Settings nav label, never expanded anywhere | Expand once on the section: `MCP (Model Context Protocol) servers`. |
| `gate`, `pipeline` | Settings | `gate` is used as a noun with no definition anywhere. Define it in the section hint or rename to `check`. |
| `main process`, `CORS` | `ApiPanel.tsx:802` | Delete (above). |
| `WASM` | `DbPanel.tsx:501` | Delete (above). |
| `Monaco` | `EditorPanel.tsx:477` | Delete (above). |
| `@path` | `EditorPanel.tsx:99,419` | Claude Code syntax presented as universal. `Send this file's path to the agent`. |
| `DPAPI` | `SettingsModal.tsx:1557` | `The key is encrypted on disk using Windows' own credential protection.` |
| `deck` | `MissionControl.tsx:249` | The only user-facing use of "deck" as a noun for the bottom bar, which is never labelled. Removed by the Mission rewrite above. |

`PATH` stays. It is honest, necessary, and the launcher already explains it better
than a rename would.

## 3.4 Settings

15 flat sections, 2,595 lines, and **8 of the 15 labels are unrecognisable to a
first-time user** (`Agents`, `AI`, `Snippets`, `Pipelines`, `SSH`, `MCP`,
`Remote (Mobile)`, `Proxy`). `Agents` is two full sections wearing one label —
clicking it renders `<AgentsSection/><RoutingSection/>`, 26 controls, ~560 lines,
where the second half governs a feature that lives in a different view.

Minimum viable fix for the beta — **grouping, not redesign.** Three
`section-label` headers in the existing left nav, no other change:

- **`SETUP`** — Appearance, Terminal, Editor, Startup commands *(renamed from
  Agents; Routing splits out)*, AI keys *(renamed from AI)*
- **`WORKFLOW`** — Snippets, Routing, Pipelines, Git, Tasks
- **`ADVANCED`** — SSH, MCP, Remote (Mobile), Proxy, Notifications, Shortcuts, About

A stranger needs the first group on day one and may never need the third. Splitting
`Routing` out of `Agents` is the one structural change and it is small.

## 3.5 Command palette

~60 flat commands, no grouping in the DOM despite a `section` field on every row,
no scoping. A stranger with no agent session still sees `Jump to the agent waiting
longest`, `Reopen the last closed session`, `Recordings - replay a session` — all
no-ops. Only 8 of ~60 carry a `kbd`, so the palette teaches the keyboard path for a
minority of what it lists.

Spec: render the existing `section` values as `section-label` group headers in
source order; **omit commands whose target does not exist** (zero sessions => no
session commands, no pipelines => no pipeline section). Empty state today is two
words, `No commands.` Replace with the idiom one file over in
`CollectionsSidebar.tsx`: `No commands match "{q}".`

---

# 4. Tokens

**This specification adds zero new tokens.** Everything above is expressible in the
existing set, and that is the correct outcome for a change of this size — the system
already has the vocabulary.

What each new element uses:

| Element | Tokens |
| --- | --- |
| Deck view-key labels | `--fs-sm` (12px), `--muted` -> `--text` on active; active keeps `inset 0 -2px 0 var(--accent)` |
| Deck `Open folder…` button | `--border` (1px dashed), `--radius`, `--muted`, hover `--accent` |
| `FOLDER MISSING` / `UNCHECKED` pills | existing `.probe-tag` / `.probe-tag.qualified`; `--faint`, `--ls-label`, `--fs-label` |
| Missing-project dashed rule | `--border-strong` |
| Missing-project chip desaturation | `filter: grayscale(1) opacity(.6)` — no token, and deliberately not `color` |
| Folder-drop overlay | `--scrim`, `2px dashed var(--accent)` (existing `.switcher-backdrop.folder-drop` idiom) |
| Notice bars (missing folder, unreadable store) | existing `.notice-bar`: `--border-strong` left stripe, `Icon`, one accent action |
| `SKIPS PROMPTS` micro-label | `--faint`, `--fs-label`, `--ls-label` — bare uppercase (classification tier), **not** a filled badge |
| Switcher `RECENT` / `ALL PROJECTS` | existing `section-label` |
| Spawning line | `--muted`, `--fs-body` |
| Settings nav groups | existing `section-label` |

**The one token someone will be tempted to add, and must not: a warning colour** for
`FOLDER MISSING`. `DESIGN.md` forbids it and the reason is load-bearing — the
default accent is amber, so an "attention amber" would be indistinguishable from
"this tab is selected". The missing-folder state carries **three non-hue channels**
(desaturated chip, dashed rule, the word). That is the fix. Add form, never a colour.

## Things that cannot survive all 84 skins as currently specified

1. **Labelled deck keys at `minWidth: 900`** — measured overflow in Bauhaus (978px),
   Flat (935px) and CRT (916px). Resolved only by the `minWidth: 1040` change in
   §2/Q3. **This is a hard dependency: ship the label change and the window change
   together, or Bauhaus users get a clipped navigation bar.**
2. **`--moss` as the switcher's active ring** — already a `DESIGN.md` known
   exception, and it is colour-only, so it dies under a colour-vision difference in
   every skin. Move to the accent left stripe.
3. **The `Claude YOLO` risk stripe alone.** `--danger` at 45% mixed into `--border`
   is a hue-only signal on a 2px edge. In Washi (light) and in the styles that
   flatten borders it is close to invisible. The `SKIPS PROMPTS` word is what
   survives — the same reasoning `DESIGN.md` uses for why the command-presence
   marker has three channels and not two.
4. **Preset emoji icons.** They paint their own colours and ignore `color`, so they
   are the one element in the frame that does not change when the theme does.
   Replacing the seeded ones with `Icon.tsx` is the fix; user-set ones stay a known,
   accepted gap.

---

# 5. What I deliberately did not design, and why

- **Pinned / favourite projects, manual project ordering, group headers with
  collapse.** These are power-user features for a 40-project workspace. The
  milestone is 5–10 strangers who will have one to three projects. Making the
  existing MRU *visible* (§2/Q1) delivers most of the value at a fraction of the
  cost, and pinning is easy to add later without invalidating anything here.
- **A density setting, or labels that fade as the user gains experience.** Ruled
  out by the stated audience decision, and I agree: both re-introduce the failure
  mode the label change exists to fix, and both triple the review surface across 84
  skins.
- **A guided tour / coach marks / a persisted "you have seen this" flag.** The
  right fix for "the app explains itself once" (finding #6) is that each view's
  empty state explains itself (§3.2), not a modal a stranger dismisses in two
  seconds and can never recall. A tour is what you build when the interface cannot
  be made self-describing; this one can.
- **The phone client (`CLIENT_HTML` in `src/main/server.ts`).** It has its own
  hard-coded palette and is a genuinely separate surface. **Everything in this
  document is the desktop renderer.** The phone client needs its own audit — it
  does not participate in the 84 skins at all, which is itself worth a decision.
- **Mission's SYSTEM section content.** It lists every listening port on the
  machine, most of them nothing to do with the user's projects, and it is the
  loudest object on the default view. I have said it should not be the first thing
  a stranger sees, but *what the section should show instead* is a product question
  — is it the project's ports, or the machine's? — and answering it is not a
  design decision. Flagging, not designing.
- **The Tasks board's dispatch/routing model.** The board is unexplained (§3.2) and
  its `worktree` default is wrong (§3.3), and I have specified both. The board's
  actual workflow — what dispatch does, what a routing rule is, whether four
  columns are right — is a product design that needs a decided answer to "what is
  the agent task loop" first.
- **Accessibility beyond naming it.** The switcher's `<div>` cards (finding #14)
  need roles, a roving tabindex and `aria-activedescendant`, and the hover/keyboard
  selection conflict needs resolving. I have specified *that* it is broken, not the
  full keyboard model, because it is a distinct piece of work and deserves its own
  pass rather than a paragraph here.

---

# 6. Suggested order

The dependencies are real; this order avoids rework.

1. **`minWidth: 1040` + labels always + the re-ordered collapse rule.** One change,
   shipped together. Highest impact, and the window constraint must land with the
   labels.
2. **Application menu + `Ctrl+O` + one verb (`Open folder…`) everywhere.** No
   renderer layout risk, large discoverability gain, fixes findings #4, #7, #9.
3. **The missing-folder grammar** (`ok` / `missing` / `unchecked`) plus the three
   downstream copy corrections and the `git.ts` `null` fix. This is the honesty
   work and it is the one a beta user is most likely to hit.
4. **Land on Terminal for a never-opened project**, plus the launcher's alignment,
   second accent, and `Claude YOLO` rename. Three steps to a running agent.
5. **Fix drag-and-drop** (`webUtils`) and give it a whole-window overlay.
6. **The empty-state rewrites** (§3.2) and the jargon pass (§3.3).
7. **Tool cluster to the topbar**, with the `?` control.
8. **Settings grouping** (§3.4) and the palette grouping/scoping (§3.5).

Items 1–4 are what I would want in a beta build. Items 5–8 are what I would want
before the sixth stranger.
