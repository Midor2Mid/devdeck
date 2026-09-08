---
name: DevDeck
version: 0.9.2
description: >-
  A terminal-first developer cockpit. Calm over clever — quiet, legible, fast to
  scan. One restrained accent, state shown in form as well as color. These tokens
  describe the default identity (Slate theme + Modern Pro style); the app ships
  three swappable themes and two styles that re-bind these same tokens.
colors:
  bg: "#0c0e13"
  surface: "#13161d"
  surfaceDeep: "#0a0c11"
  border: "#252a35"
  borderSoft: "#1d212a"
  text: "#e7eaf1"
  muted: "#99a1b2"
  faint: "#6f7686"
  accent: "#eba65c"
  accentSoft: "#f2bd83"
  ok: "#5fce8f"
  danger: "#e9786b"
typography:
  heading:
    fontFamily: '"Inter Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: 15px
  body:
    fontFamily: '"Inter Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: 13px
  label:
    fontFamily: '"Inter Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: 11px
  mono:
    fontFamily: '"Geist Mono Variable", "Cascadia Mono", Consolas, monospace'
    fontSize: 13px
rounded:
  sm: 6px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: 12px
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: 12px
  input:
    backgroundColor: "{colors.surfaceDeep}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 8px
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  section-label:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  terminal:
    backgroundColor: "{colors.surfaceDeep}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
---

## Overview

DevDeck is a terminal-first cockpit you live in for hours, so the north star is
**ease of use and calm over clever** — quiet, legible, fast to scan, never busy.

It is unusual among design systems in being **multi-skin by design**. A *theme*
(color) and a *style* (shape / depth / type) are independent, swappable axes in
Settings → Appearance, and both re-bind the tokens in this file. The tokens here
encode the **default identity — Slate (cool dark) + Modern Pro** — but the same
component definitions hold under every theme/style:

- **Themes (color):** Slate (dark, default), Sumi (warm dark), Washi (light).
- **Styles (shape/depth/type):** Modern Pro (default), Wabi-sabi.

  Cut from seven themes and twelve styles on 2026-09-04. Four themes (Zen,
  Graphite, Aurora, Neo) and ten styles (Modern Minimal, Neon, Flat Vector,
  Bauhaus, Phosphor CRT, Modern+, Lacquer, Aurora Glass, Neo Holographic,
  Kinetic Minimal) were removed, because every UI change had to be verified
  against all 84 combinations and that cost was being paid on every change.
  The CSS is in git if one is ever wanted back.

A **global motion layer** underlies all of them: floating surfaces ease/scale
in, interactions give press feedback, and everything is disabled under
`prefers-reduced-motion`. Motion is purposeful and brief — never decoration that
costs scan-speed.

The brand mark is an **ensō** — a single quietly-imperfect brush ring.

## Colors

One accent carries the eye; semantic colors are separate from it.

- **bg (#0c0e13):** the cool slate ground.
- **surface (#13161d):** lifted panels, modals, menus.
- **surfaceDeep (#0a0c11):** terminals and inputs — the deepest layer.
- **border / borderSoft:** a visible divider and a quiet one.
- **text / muted / faint:** primary copy, secondary metadata, decorative hints
  (muted/faint are tuned to clear WCAG-AA contrast on the ground).
- **accent (#eba65c):** the single warm amber that drives interaction — active
  states, focus, the primary CTA. Never more than one accent on screen.
- **ok (#5fce8f) / danger (#e9786b):** semantic only — success and destructive.
  They never stand in for the accent.

There is deliberately **no warning/attention color token**, and that constraint is
load-bearing: the default accent *is* amber, so an "attention amber" would be the
same hue as brand, active, and focus — urgency would be indistinguishable from
"this tab is selected". Attention therefore has to carry a **form** marker (the
flag icon on the status count, the `!` glyph on a deck key, the dot state) and may
use the accent only *in addition* to it. Tools whose accent is blue can afford a
lone orange for urgency; DevDeck cannot. Never add a warning color to fix this —
add form.

## Typography

Two families: a humanist UI sans for chrome and a mono for everything terminal-
or code-shaped.

- **heading (15px):** modal titles and section headers, ~600 weight.
- **body (13px):** the default — buttons, rows, labels.
- **label (11px):** uppercase, letter-spaced section titles (PROJECTS, AGENTS).
- **mono (Geist Mono, 13px):** terminals, the SQL/HTTP editors, code, paths,
  and tabular numerals where digits must align. Terminal line-height is generous.

Inter (UI) and Geist Mono (mono) ship bundled with the app (Fontsource, no CDN
fetch), so type renders identically offline and on first launch. The terminal
(xterm) keeps its own user-configurable font — it's a workspace, not chrome.
Numeric/status surfaces (usage counters, mono status columns) use tabular
numerals so digits align in a column instead of jittering as they change.

## Layout

A slim **topbar** (ensō · active project ▾ · view breadcrumb · command pill) →
the **main panel** (one view at a time: terminal / editor / API / database /
browser / network, full width) → a bottom **Console Deck**. The deck is the live
control surface: agent sessions appear as **keys** grouped into per-project
strips (state shown as a dot, active key carries the accent stripe), with the
view switch, a tool cluster, and the git/status region on its lower row. Project
management (add, group, reorder, presets) lives in the `Ctrl+K` switcher.

Spacing is a small, consistent scale — **xs 4 · sm 8 · md 12 · lg 16** — applied
through tokens, never ad hoc. Density is compact-but-breathable; the terminal gets
extra line-height so long sessions stay scannable.

## Elevation & Depth

Flat by default. Depth is a *style dial*: Modern Pro uses **subtle elevation**
(hairline borders + soft shadows on cards, menus, and modals); Wabi-sabi stays
nearly flat; Lacquer adds frosted glass; Neon swaps shadow for accent glow. Use
the lightest depth that still separates a floating surface from the ground —
modals get the largest shadow, inline cards the smallest.

Elevation is a token scale — `--elev-1` (cards), `--elev-2` (menus/popovers),
`--elev-3` (modals) — plus `--edge-hi`, a hairline top highlight that gives a
floating surface a tactile top edge. Each theme tunes its own shadow color and
opacity (a soft warm set for light Washi, a darker set for the dark themes);
styles still dial overall intensity on top.

## Motion

A shared motion vocabulary: `--ease` (standard) and `--ease-spring` (playful
overshoot) pair with `--dur-fast` / `--dur` / `--dur-slow` (120/180/260ms) for
hovers, presses, and floating-surface transitions. All of it is disabled under
`prefers-reduced-motion: reduce` — motion is a nicety, never a requirement to
read the UI.

## Shapes

Radii step **sm 6 · md 8 · lg 12** — controls at sm, panels at md, modals/cards at
lg. Corner radius is itself a style dial: Wabi-sabi keeps the softer default,
Modern Pro tightens it (7 / 10 / 12px on controls, panels and cards).

- **Icons:** one inline-SVG line set (`components/Icon.tsx`) — a 24 grid, 1.75
  stroke, `currentColor`. No Unicode glyphs or emoji in chrome.
- **State in form, not just color:** running/idle/attention show as a dot, pill,
  or edge stripe — never color alone — so state survives any theme.

## Components

Defined against tokens so a theme/style switch recolors and reshapes them with no
component changes:

- **button / button-accent:** ghost button on `surface`; the accent CTA is the one
  filled, high-contrast action (amber fill, near-black text).
- **input:** sits on `surfaceDeep` with an sm radius; focus draws the accent.
- **panel / modal:** `surface` at md / lg radius; modals float with the deepest
  shadow.
- **section-label:** muted, uppercase, letter-spaced.
- **terminal:** `surfaceDeep` ground, mono type, generous line-height.

### Disabled controls

**A disabled control must still say what it is and why it is off.** Both halves,
always — the identity and the reason — and in words a stranger can read without
knowing the app.

This is a rule and not a note because of where it failed. On first run all seven
deck view keys were `disabled` with **both `data-tip` and `aria-label` null**, and
Chromium dispatches no mouse *or* focus events from a disabled button — so those
seven glyphs could not be named by hovering, by Tab, or by a screen reader, at
the very first moment of the product. The control that most needs explaining is
the one that is off, and `disabled` is precisely the state that removes every
means of asking.

What that means in practice:

- **Prefer `aria-disabled` to `disabled`** for anything a stranger might need
  named. It keeps the control focusable and hoverable, still announces
  "unavailable", and lets its `data-tip` and label be read. Guard the handler
  instead — `Enter`/`Space` on a focused button still fires a click. `disabled`
  is right only where the control needs no explaining.
- **Carry the form.** `button:disabled { opacity: .4 }` stops applying, so the
  dimmed state must be restored on the `[aria-disabled="true"]` selector, and the
  hover brightening withdrawn: a control that lights up under the cursor is
  claiming it will do something.
- **The reason is per-control, not per-group.** A single sentence on the
  container was what the deck shipped instead, and it named none of the seven
  things it covered.
- **A keyboard chord may not reach a control the pointer cannot.** The same
  condition that greys a control gates its shortcut, read from one predicate so
  the two cannot drift. `Ctrl+1..N` bypassed the deck's disabled state and moved
  the topbar to "Terminal" while the first-run panel stayed up — the app naming a
  view it was not showing.
- **Gating a chord is half the job: it must also answer.** Once gated, `Ctrl+1..N`
  returned in silence, which made a chord the app refuses indistinguishable from a
  chord that does not exist. A refused gesture owes the same answer as the refused
  click, or a stranger presses it twice and concludes the app is broken when it is
  only empty.
- **An inert control's explanation may not be withdrawn by the gesture that
  reveals it is inert.** A tooltip hidden on `mousedown` takes the reason away at
  the exact moment the click proves one is needed — and a stranger clicks before
  they hover long enough to have read it. **The click answers for itself:** offer
  the fix, not a second copy of the reason. Seven view keys that answered a click
  with nothing at all were the product's first ten seconds.
- An `aria-label` must be **permanent**, not conditional on being enabled, and it
  must survive a visible label collapsing at narrow widths: `display: none` takes
  the text out of the accessibility tree with it.

### Active-state grammar

Every "active" is marked in **form**, and each kind of active has its own marker,
so two different actives on screen aren't ambiguous. This table is **descriptive
of the main surfaces** — the known exceptions are listed below it, deliberately,
rather than left to be discovered:

| What's active | Form marker |
| --- | --- |
| **Container** (deck key) | 2–3px accent **left stripe** (3px on the deck key, 2px on list rows) |
| **Document tab** (terminal, editor) | 2px accent **bottom underline** |
| **Segment** (Edit/Split/Preview, AI/normal, panel mode switchers) | `--seg-tint` fill **+ font-weight 600** |
| **Focused pane** in a split | brighter accent **border** |

A segment needs *both* the tint and the weight. The tint alone cannot carry it:
18% accent over Washi's ground is 1.2:1, and even a 100% accent fill is only
2.9:1, so on the one light theme a tint never clears the 3:1 floor for non-text
UI. The weight is the part that survives; the tint is a hue cue on top.

Fill-shift to `--bg-3` accompanies some actives, but should never be the *only*
marker — a surface change alone reads as hover, not selection. Style layers may
substitute a stronger idiom (Bauhaus fills the tab with accent; Neon/CRT/Aurora/Neo
swap the underline for a glow ring; Kinetic springs its own underline in and drops
the base one).

**Known exceptions** — real today, not endorsed. Fix opportunistically; don't cite
them as precedent:

- `.deck-view.on` (the main view switcher) uses the *document-tab* underline. It's
  a segment by shape but selects the main view, so the tab idiom is arguable — it
  is called out here rather than silently contradicting the table.
- `.switcher-card.active` marks the active project with a `--moss` ring, i.e. the
  semantic success color standing in for an active state. Should be an accent
  stripe.
- `.deck-key.active` carries *two* axes — the 3px stripe plus a 14% accent tint.
- `.ov-seg button.on` and `.usage-windows .btn-min.on` use a full accent fill for
  a segment, which the badge tiers reserve for urgency.
- On/off **toggles** (`.icon-action.on`, `.net-toggle.on`, …) are marked by border
  or text color only. The table has no axis for toggles; that's a gap in both.
- Menu/keyboard-cursor highlights (`.mention-item.active`) intentionally share
  their rule with `:hover` — a transient cursor, not a persisted selection.

### Mission tile state chip

A different axis from the table above — not a selected control but a tile
*reporting its own status* — so none of the table's rows fit it and it isn't
folded into that table. Recorded here for the reason the badge tiers below get
their own listing too: a fixed vocabulary is only worth having if the next
person can look it up instead of inventing a ninth glyph.

One Mission tile carries exactly one chip, first-match-wins
(`resolveTileState` in `tileState.ts`). Four tones, and a glyph fixed per
state so the two axes read independently — tone says how loud, glyph says
which:

| Tone | Spends | States (chip · glyph) |
| --- | --- | --- |
| `attention` | the accent | `NEEDS YOU` · `●`, `ASKING` · `◆` |
| `warn` | `--clay`, dashed border | `STALLED` · `⋯`, `EXITED n` · `□` |
| `neutral` | `--text`, no color spend | `CHANGED` · `▤`, `WAITING` · `◇`, `WORKING` · `▶` |
| `quiet` | `--faint` | `QUIET` · `–`, `NOT RUNNING` · `○`, a clean `EXITED` · `□`, `COULDN'T CHECK` · `?` |

`--clay` and `--accent` sit within a hair of each other in both Sumi and
Washi — the same collision `.mission-tile.stalled`'s dashed-vs-solid rule
above already exists to route around — so `warn` never leans on hue to clear
`attention`: it is the chip's only dashed tone (`.mtile-chip.tone-warn`), and
`□` (`EXITED`) is the only glyph that spans two tones, because the
process-exited fact is the same at any code and only the tone says whether it
mattered.

`WAITING` keeps `neutral` — no color spend — and the deck key status dot
section below now agrees with it: that state's dot is a `--text` hollow
**diamond**, not an accent ring. The two used to contradict each other inside a
single tile, which rendered the chip and the dot 20px apart. **One rule, stated
once: only `attention` spends the accent on a session's status.**

For `WAITING` the agreement is now on **shape** as well as on token: this table
fixes `◇` as its glyph while the dot 20px away was a circle, so the tile said
one state twice in two shapes. It says one shape twice now. That is not a rule
about the whole vocabulary and must not be read as one — `▶` (`WORKING`) and
`□` (`EXITED`) still name their states with a shape the dot does not use, and
they should: a chip has room to be specific about which of several exits or
which kind of work this is, and the dot has 6px and five forms. Where a chip
glyph and a dot form *can* be the same shape for the same state, they are.

`attention`'s own two states share a tone, so `NEEDS YOU` and `ASKING` separate
by the chip's *words*, not by `●` vs `◆` — at the chip's actual size (9px) a
filled circle and a filled diamond are not reliably told apart at a glance.
That pair is legible by text, not by form, and should not be read as a second
instance of the dash trick above.

Washi is the theme this file's own contrast math already flags (above: a
100% accent fill over Washi's ground is 2.9:1): `tone-attention` and
`tone-warn` chip text measure 2.9:1 and 3.4:1 against `--bg-2` there, under
the 4.5:1 text floor. Consistent with why actives are told not to lean on
tint alone in Washi — the chip is small set text, so it carries more of that
shortfall than a fill would, and does so by word and by the warn tone's dash
rather than by clearing the ratio.

### Deck key status dot

The deck is the surface that is always on screen and Mission is not, so the 6px
dot on a `.deck-key` carries the same question the tile answers in words. Four
forms for four live states, plus one for no process at all — and the forms do the
work, because `--clay` and `--accent` sit within a hair of each other in Sumi and
Washi and the accent is a user choice that can be set to either:

| Dot | Means | Form |
| --- | --- | --- |
| `status-idle` | resting | filled `--clay`, faint |
| `status-working` | mid-turn | filled `--clay`, full (+ opacity pulse) |
| `status-waiting` | finished a turn, your move | **hollow** `--text` **diamond**, static |
| `status-attention` | asking | filled `--accent` + a static 3px halo, plus the `!` glyph |
| `status-not-running` | nothing is running behind this tab | a flat `--muted` **bar** |

**Only `attention` spends the accent, and that is the whole accent rule for
status.** `waiting` was speced as a hollow `--accent` ring, which put two
statements about one state on one Mission tile: the chip tier above gives
`WAITING` the `neutral` tone — "`--text`, no color spend", because *a live
question is what the accent is saved for* — and `MissionControl.tsx` renders
that chip and this dot 20px apart. They now read the **same token**. The tile
makes one statement, and the accent still points at the one session that cannot
continue without an answer rather than at every session that has stopped.

Two other things fall out of that, and both were defects:

- **Contrast.** The accent ring measured **2.92:1** on Washi's `--bg-2` — below
  the 3:1 floor for a non-text mark, and the weakest mark in the app at 1×. No
  per-theme accent value could have fixed it, because **the accent is a user
  choice**; whatever ships, someone can pick a cream. `--text` is by definition
  the ink a theme paints its ground *against*, so the ring clears the floor in
  every theme for every accent: **15.0:1 Slate · 12.2:1 Sumi · 9.8:1 Washi**.
  A badly-chosen accent can now cost you the *nag* (the deck key's breathing
  edge), never the classification.
- **Motion.** The mark is **static**; the halo went with the breathing. So
  `attention` is the only dot with a halo and `working` the only dot that moves,
  each form is unique on both axes, and `waiting` reads identically in a still
  frame and in motion. The accent still marks a waiting session on the deck, but
  only on the **nag** channel — `.deck-key.key-waiting`'s breathing edge, which
  `key-seen` takes away — never on the mark that says what the session *is*.

The pair this most had to survive — `waiting` against `working` — comes out
*better* separated by ink, not worse. `--accent` vs `--clay` measured 1.32:1
(Slate), 1.01:1 (Sumi), 1.15:1 (Washi): hue was contributing nothing, and
hollow-vs-filled was already doing the entire job. `--text` vs `--clay` is
**2.27:1 · 2.27:1 · 2.93:1**. The form still carries the distinction and is
still what the grammar rests on; the ink no longer has to pretend it is helping.

The one pair that stays ink-identical is a **seen** `waiting` mark (`--muted`)
against a `working` disc (`--clay`) — 1.05:1, 1.02:1, 1.33:1 — and it is told
apart the way this whole table is told apart, by form: a hollow diamond against
a filled circle.

**Why a diamond and not a ring.** `--text` fixed the contrast and created one
smaller problem. A hollow **circle** of text ink, 4px left of a `--text`/600
session name on the same baseline, *is* a typographic bullet — `◦` is a bullet
character — and it was read as a leading bullet before the title rather than as
a status, on Mission's tiles, on the active deck key and on Overview's focus
header. A status mark that reads as decoration has stopped being a status mark.
Ink cannot fix it: `--text` is the most contrast a theme has, and the accent is
exactly what was taken away for measuring 2.92:1. So the fix is **form** — no
bullet glyph is a diamond. The 6×6 box and the 1.5px ring do not change (the
hole is the same 3×3); only the corner radius (1px, as on the `not-running`
bar) and a static `rotate(45deg)` do. That costs no token and nothing under
`prefers-reduced-motion`, because a transform is not motion. The rotation grows
the mark's painted extent to 8.49px inside a 6px slot, which is deliberate and
precedented on this same element: `attention`'s 3px halo has always painted
12px of extent in the same containers, the tightest of which is the deck key's
6px gap. Contrast is unchanged by rotation — still **15.03:1 Slate · 12.17:1
Sumi · 9.82:1 Washi** on `--bg-2`.

`not-running` is **derived, never stored**: `deckKeyStatus` (`deck.ts`) reads
`hasProcess` — the same predicate behind Mission's "N running" count and its
`NOT RUNNING` chip — so the deck cannot describe a session differently from the
tile. It is a *bar* rather than a dot because every other form already means
alive (a filled circle = running, a hollow diamond = your move), and a restored
session used to
paint `status-idle`, the resting form of a live agent, on the one surface you
never look away from. It never spends the accent: the act it needs lives in the
pane's own Start gate.

**Every surface that says something about a session reads the derived status**,
through one resolver (`useKeyStatus`, whose only job is to carry the `paneHold`
subscription into `deckKeyStatus`). That is eleven surfaces, not one dot: deck
key, terminal tab strip and grid card, Mission tile (dot *and* left border),
Overview card / rail row / collapsed mini-strip, the usage panel's `Running now`
rows, board cards, the composer's target list, the command palette's session
rows, and the switcher card's attention marker. A raw `status` in any of them is
a claim about a live agent — `status` is what the agent last *did*, and it
outlives the process that did it.

**And every one of them now shows all five forms.** The terminal tab strip used
to read the derived status and then discard one of its values: `tabDotStatus`
(`deck.ts`) reduces a tab's several panes to one dot, and `waiting` fell through
to `idle` — the resting form of a live agent, painted on a session blocked on
your answer, on the surface you use to move between panes. It was left as a
known gap for a designer to rule on, on the grounds that granting the mark would
put a *breathing* dot on the tab of every session that finished a turn. That
reason expired when the dot went static: a hollow diamond carries **less** ink
than the filled disc the tab was painting instead, so granting it makes the
strip quieter, not busier. There is no three-form tab strip. A vocabulary that
drops exactly one of its five values on exactly one surface is not a smaller
vocabulary, it is an exception nobody can predict.

`tabDotStatus`'s ladder is `missionTail`'s `RANK` order — attention, waiting,
working, idle, then nothing-running — and a test asserts it stays that order. A
tab dot that ranked its panes differently from the order Mission and Overview
*sort* by would be the same surface-disagreement defect the derived status
exists to prevent.

Two consequences beyond colour, because a dead session must also stop being
*actionable*:

- **A prompt is only relayed by a live session.** `promptFor` takes the derived
  status, so Approve / Deny cannot appear under a question nothing is listening
  for. Overview offered both buttons on a `not-running` row.
- **A dead session is not a send target.** The composer lists it (it is real, and
  hiding it moves the confusion) with the flat `--muted` bar, a disabled
  checkbox, the words `not running`, and no hover fill — three forms, because one
  of them is 6px. Its quick-select presets skip it too; `Idle` used to select
  exactly the dead ones.

**The acknowledgement axis is separate from all of this, and lives on the KEY.**
`seen` (`store.ts`) records that you have looked at or answered a session; it is
read by the wants-you count and by two CSS rules, and by nothing that decides
what a session IS. Both rules dim the *nag* and leave the *state* at full
strength:

- `.deck-key.key-waiting.key-seen` — the breathing edge stops and goes, and the
  dot's ring drops from `--text` to `--muted` **keeping its hollow form**, so it
  still says `waiting`.
- `.deck-key.key-attn.key-seen .claude-attn` — the `!` drops to `--muted` and
  from 700 to 500 weight; the filled accent dot and its halo still say `asking`.

**The line a `seen` rule may not cross is the dot's FORM, not its ink.** Form is
what classifies — filled = alive, hollow = your move, bar = nothing running — and
a `seen` rule that changed it would put a visibility-derived fact back into what
a session *is*. Ink is loudness, and dimming it is what the `!` rule above has
always done.

Ink alone has to carry it for `waiting`, because it is all there is: that state
has one mark and no second glyph to thin. It carries by a wide margin —
`--text` vs `--muted` is **2.15:1** (Slate), **2.22:1** (Sumi), **2.20:1**
(Washi), against **1.25:1** for the shipped `!` precedent's `--accent` →
`--muted` in Slate, which is why that one also changes weight. The seen mark
shares its ink with the `not-running` bar and is told apart by form, the same way
every other pair on this table is: a 6px hollow diamond against a 6×2px flat
bar — a wider separation than the circle it replaced.

This is a *correction*, not the original design. Acknowledgement on a waiting dot
used to be `animation: none` and nothing else, so at the breathing keyframe's
rest point a seen and an unseen waiting dot were **pixel-identical** — the axis
existed only while you watched it move. It was statically distinguishable under
`prefers-reduced-motion` and not under normal motion, i.e. the guarantee
backwards, and it gave up the "must survive a still frame" bar that the hollow
ring was promoted out from behind `prefers-reduced-motion` to meet.

A fresh bell re-raises the loud form by itself, because `setStatus` clears `seen`
on a new attention transition.

The same axis governs **counts**, and a count now excludes two different things
for two different reasons: a session with no process (nothing is there) and a
session you have already looked at (acknowledged, still unanswered). Only the
first changes the dot. The switcher card's per-project attention marker
(`projectSessionCounts`, `deck.ts`) applies both; its `terms` / `agents` numbers
apply neither, because those count what *exists* and claim nothing about it.

### The blocked-on-you word

**A 6px mark is enough only where a nag channel already exists.** The deck has
one — `.deck-key.key-waiting`'s breathing accent edge, and the `⚑ N` count in
the status region — so the deck key can carry `waiting` on the dot alone.
Mission has one too: the tile prints the state in words, `WAITING 13s`, 20px
under its dot. **Overview has neither**, and its session heads set the name in
`--text`/600, which is where the mark also read most like a bullet. When the
waiting dot stopped breathing, a waiting session on Overview's focus header and
on a grid card was one static 6px mark and nothing else — no word, no chip, no
motion — on a surface a user may well be looking at when an agent starts
waiting on them. That is the product's core promise going unserved on the screen
built to watch several agents at once.

The fix is a **word**, not a fourth marker. DESIGN.md prefers a word to an
encoding, these heads have room for one, and Overview's rail row had already
shipped both words since it was written — so the two heads that were silent say
the same thing in the same words rather than inventing something new:

| Derived status | Word |
| --- | --- |
| `attention` | `needs you` |
| `waiting` | `waiting for you` |
| anything else | nothing at all — the marker only ever *adds* |

`.ov-flag`, one component (`StatusFlag`) on all three heads, so they cannot come
to describe one state differently. `--text` at weight 600 for **both** states,
and **the accent is not spent on this line at all**: the accent's marker on an
attention head is the `!` glyph immediately to its left, and colouring the word
as well was the same spend twice. It was also the last `2.92:1` mark of that
family — `--accent` on `--bg-2` in Washi, at 9.5px, i.e. a word too faint to
read set in the one colour that exists to be noticed. As `--text` it measures
**15.03 / 12.17 / 9.82** on `--bg-2` and **16.03 / 12.87 / 10.73** on `--bg`
(Slate / Sumi / Washi), and `waiting`'s own former `--accent-soft`
(10.03 / 6.69 / **4.11**) goes with it — which is what finally makes the head
agree with the dot: one token for one state. `attention` still outranks
`waiting` on this line, by the `!` beside it and by the words themselves.

`not-running` deliberately has no word here. Nothing in there is listening, and
the flat bar plus the pane's own Start gate is the whole of that story.

### Badge tiers

Distinguished by *treatment* rather than color, so urgency is never confused with
identity:

- **Outlined** micro-pill — **identity**, never urgency (agent/model names, on
  `--clay`). Outline marks it as "this is *what*, not *how urgent*".
- **Bare uppercase** micro-label — **classification** (`--faint`, letter-spaced).
- **Tint fill + weight** — **active segment** (see above).
- **Accent fill** — reserved for the primary CTA (`button-accent`), and otherwise
  scarce. If something is filled, it is the one thing to act on.

Attention/urgency is **not** a badge tier — it is form plus the accent: a flag
icon beside the count in the status region (`.sb-attn`), and a bare `!` glyph on a
deck key. There is no filled count badge in the app.

### Risk marker

Some choices aren't destructive actions but are still the riskier of several
options sitting side by side — a launch preset running with permissions
bypassed, a network bind that exposes the machine wider than the alternatives.
These carry a **2–3px `--danger` left stripe** (border or inset box-shadow) plus
full-`--text` description color where the option would otherwise be muted, so
the risk reads in form as well as color rather than depending on someone
noticing which one they picked. This is not the ok/danger *semantic* pairing
above — nothing failed and no button destroys anything — it's a distinct axis:
"of these options, this one is the one to think twice about." Used on
`.launch-card-unsafe` / `.agent-menu-unsafe` (a preset launched with
`--dangerously-skip-permissions`) and `.bind-option.warn` (the "Local network"
and "Auto (legacy)" remote-bind choices, next to the safe "Tailscale" option).

### Attribution marker

A number that looks like money must say whether it is a **receipt** or an
**attribution**. DevDeck prices a run by summing the agent transcripts under a
project's directory inside the run's time window, so when a second session shared
that directory the figure covers both runs and belongs to neither. Such a figure
carries a `~` prefix plus a **dashed rule** under it (`.usage-run-cost.approx` in
the usage panel's Runs section) and is set in `--muted` — the `~` and the rule are
the form, the color is only reinforcement, so it survives a theme that flattens
muted toward text. Attributed figures are never summed into a total; the total
states how many rows it left out, in words, beside itself.

This rule is **not** part of the active-state grammar above and must not be read
as precedent for it: it is 1px and **dashed**, never accent-colored, and it sits
under a *static figure* rather than a control — deliberately distinct from the
2px solid accent underline that marks an active document tab. A dashed rule says
"this number is qualified"; a solid accent rule says "this thing is selected".

### Command presence marker

A launcher card says what a control **will do**; this marker says whether it
**can do it at all**. Three states, and the third is the reason the grammar
exists: `not on PATH`, `unchecked`, and `no command set`. A card DevDeck
resolved successfully is left alone — a healthy launcher does not grow by a
pixel, so the marker only ever *adds*, and its absence is the honest default
while a check is still in flight.

Three channels, none of them hue:

- **The icon desaturates.** `filter: grayscale(1) opacity(0.6)`, not `color`.
  `color` does not mark an emoji-presentation glyph — it paints its own colours
  and ignores the property — so a preset whose icon is a bolt kept a
  full-strength accent-looking icon while the computed style claimed `--faint`.
  Anything that marks an icon in this app must survive a glyph that brings its
  own colours.
- **A 1px dashed rule** under the command, reading the same way as the
  attribution marker above: *this value is qualified*. Extended here from a
  static figure to a pill and an input mark; still never accent, still never
  solid, so it cannot be confused with the 2px solid accent underline that
  means "selected".
- **The word**, in a `.probe-tag` pill: `NOT ON PATH` or `UNCHECKED`. The word
  is what survives a theme whose `--border` is nearly invisible against
  `--bg-2` (Washi is ~1.25:1), which is why there are three channels and not
  two.

**`unchecked` is not a weaker `not on PATH`.** It means DevDeck could not read
the shell's PATH, so it checked nothing — and it therefore **keeps the accent
icon** and takes a *solid* pill border, because nothing about that card is
qualified; only our knowledge is. Rendering the two the same way is the failure
this grammar exists to prevent: absent, unknown and zero are three states.

**A marker is not a gate.** A `not on PATH` card still launches, because a PATH
walk cannot see a shell alias or a function — refusing would make DevDeck refuse
something that works. The single exception is `no command set`, which is a fact
about the preset rather than an inference about the machine; it uses
`aria-disabled`, never `disabled`, so the click that goes to fix it still fires.

Copy is part of the grammar: **"not found on your PATH"**, never "not
installed". The pill reads `NOT ON PATH`, never `MISSING`.

Section-level copy (the launcher's notice bar, the Settings hint) keys off
whether PATH hydration succeeded — **not** off "every result is unknown".
`unknown` has a second cause, a relative-path command, and an absolute path can
resolve even when hydration failed.

### Notice bar

A condition that outlives a toast gets a **notice bar** (`.notice-bar`), not a
toast: full width under the topbar or at the top of a panel, a 1px
`--border-strong` left stripe, an `Icon` glyph, the sentence, and its action(s)
on the right. Two exist today — persistence is off for the session
(`PersistBlockedBar`), and a save was refused because the file changed on disk
(the editor's conflict bar).

The rule that makes it work: **there is no warning color in this system**, so the
bar's *form* carries the state — width, stripe, glyph — and the frame's single
accent is spent on the one action worth taking. Where a bar offers two actions,
only the non-destructive one is accent; the other takes `.secondary` and stays
`--muted`. A bar that fades, or that colors itself red, is the wrong answer: the
first hides a condition that is still true, the second re-introduces the
attention color the accent already owns.

A machine-readable value inside the sentence (a filename, a path) is set in
`--font-mono` via `<code>`, per the sans-for-names/mono-for-values rule.

## Do's and Don'ts

**Do**

- Let one accent carry the eye; keep semantic colors (ok/danger) separate.
- Change the *token*, then let the cascade apply it — don't tweak spacing or shape
  on one element.
- Match the existing system in `themes.ts` and `styles.css` before inventing a token.
- Show state in form (dot/pill/stripe) as well as color.

**Don't**

- No gratuitous gradients, no emoji as section markers, no everything-centered.
- Don't let decoration fight legibility — if a flourish costs scan-speed, cut it.
- Don't hard-code a color/size in a component when a token exists.
- Don't ship a disabled control that cannot say what it is and why it is off.
