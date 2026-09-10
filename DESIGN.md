---
name: DevDeck
version: 0.9.5
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
  states, focus, the primary CTA. Spent in **three tiers**, below.
- **ok (#5fce8f) / danger (#e9786b):** semantic only — success and destructive.
  They never stand in for the accent.

### The accent budget

The rule here used to read *"never more than one accent on screen"*, and the
stylesheet contradicted it 130 times. One ordinary Terminal frame spent the
accent on fourteen things — the ensō, the active tab underline, the `+ Claude`
fill and its chevron, the active deck key's stripe **and** its tint, the active
view key's underline, `● 3 changes`, the wants-you flag, the cursor, the
attention dot and its halo, and four breathing key edges. Each had a local
justification and the sum pointed at nothing. **A rule nobody can obey is not a
rule**, so it is restated as three tiers, each with a ceiling a stylesheet can
actually be held to:

| Tier | Means | Ceiling |
| --- | --- | --- |
| **1 · Fill** | *the act* — a solid accent block with `--on-accent` ink | one per frame for a frame-level act; one per **blocked session** in a list of sessions |
| **2 · Stripe / underline** | *where you are* | one per surface — a surface being a set of peers among which exactly one is selected |
| **3 · Ink** | *you can act here, now* | the `attention` dot and its `!`, the wants-you flag, focus rings, hover |

Everything else — decoration, brand, and **facts** — takes `--text`, `--muted`
or `--faint`. The test is one question: *if this is accent and a stranger cannot
act on it, it is wrong.*

Three things fall out of that, and all three were live defects:

- **Tier 1 is the only tier where the accent still buys a signal.** `qa`
  measured `--accent` against `--clay` at **1.32 : 1 (Slate) · 1.01 : 1 (Sumi) ·
  1.15 : 1 (Washi)**, and a 100% accent fill against Washi's ground at 2.92:1.
  As *ink*, the accent is barely a colour at all in two of three themes. As a
  filled block it stops being a hue comparison and becomes a shape, and its
  label clears the text floor everywhere (`--on-accent` on `--accent`: 9.09 /
  6.07 / 5.13). This is why spending the accent widely costs the one place it
  works.
- **A segment never takes the fill.** `--seg-tint` + weight 600, per the
  active-state grammar. `.ov-seg button.on` and `.usage-windows .btn-min.on`
  used a full fill for a time range and an Overview mode; both are now the tint,
  which puts the AI usage modal's loudest element back on its content instead of
  on `24h`.
- **One active, one marker.** `.deck-key.active` carried the 3px stripe *and* a
  14% accent tint. The tint measured **1.28 / 1.23 / 1.14** against `--bg-2` —
  a second accent spend for no signal — and is gone; the stripe plus the row's
  existing `--muted` → `--text` ink step carry it.

The cuts this rule required, recorded so they are not quietly re-added:
`.topbar-brand` and the `.empty-state` ensō watermark (brand is not an act) →
`--muted`; `.sb-changes` and `.sb-pull.behind` (facts about the repo) → `--text`
with the accent only on hover; `+ Claude` and its split-button caret → ghost;
and `✓ Approve` **gains** the fill it should always have had. A Terminal frame
now spends the accent on the three Tier-2 actives (document tab, deck key, view
key), the Tier-3 marks that mean an agent is blocked on you, and the terminal's
own cursor. Nothing else.

`✓ Approve` is the reason the Tier-1 ceiling is written per *blocked session*
rather than per window: two agents both asking a question is two acts, and the
honest answer is two fills. What the ceiling forbids is a fill that is not an
act. `✕ Deny` stays a ghost with `--danger` text (6.35 / 4.12 / 3.94 on
`--bg-2`) — only one of two answers may be the fill, and destroying work is not
the one to make easiest to hit.

**A user can pick their own accent**, so no rule above may depend on the shipped
value. None does: every tier is a *form* first (a fill, a stripe, a glyph) and
the accent is what fills it. One known consequence is recorded rather than
hidden — `button.accent:hover` swaps in `--accent-soft`, which `applyTheme`
derives by *darkening* on a light theme, so `--on-accent` on that hover measures
**4.07:1 in Washi**, a hair under the 4.5:1 text floor. It is app-wide and
pre-existing on every primary CTA, not something Approve introduced, and the fix
is to derive `--on-accent` from the resolved accent's luminance rather than
pinning it near-black per theme. Not done here; named so it is not rediscovered.

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

### Modal head

A modal whose title sits beside **controls** — a close `×`, a `refresh`, a tab
row, a segment picker — puts them in a `.modal-head`: a flex line, title first,
controls last, `justify-content: space-between`, weight 600, and a 1px `--border`
divider beneath. Eight modals use it (Review changes, Saved commands, Extend
agent, Open pull request, Environment variables, Project appearance, AI usage,
Worktrees). A modal with a bare title and no controls uses `.modal-title`
instead and gets no divider — there is no toolbar to separate.

This is here because the rule was **deleted**, on 2026-09-04, along with the
recordings modal it appeared to belong to — the same commit and the same mistake
that took `.modal-body`. For six days `.modal-head` had **zero own rules** while
eight components rendered against it, and the give-away is still in the
stylesheet: `.identity-modal .modal-head` overrides `padding: 0` and
`border-bottom: none`, i.e. it is written against a base that had both.

**Painted is not laid out.** A 96-screenshot sweep opened these modals and
reported every one "painted, in all six skins", and it was right: a head with no
rule is still a block div inside a bordered, rounded, shadowed card. What it is
not is a row. The six heads whose controls are inline rendered the `×` glued to
the end of the title text, where it reads as punctuation rather than as a
control; the three whose controls are block or flex — Review changes' button
pair, AI usage' window segments, Extend agent's tabs — dropped them onto a
second line under the title. None of that trips a "did it render" check, which is
the lesson worth keeping: **a screenshot proves paint, not layout, and a missing
flex row fails silently in a way a missing colour does not.**

Two details the restoration got right on the second pass rather than the first:

- **The original padding is not restored.** `padding: 12px 16px` belonged to a
  modal that declared `padding: 0`; five of the eight sit inside `.modal`'s own
  18/20px and would have been double-inset. `.changes-modal`, the one head in a
  `padding: 0` modal, states its own inset — as `.extend-head` already did.
- **The divider is unconditional, and it is not a scroll cue.** Every one of the
  eight heads holds a control that acts on the body, and the line is what
  separates a toolbar from the thing it acts on. It earns its keep twice over now
  that `.modal-body` scrolls: content moving under an undivided title makes the
  title look like the first row that scrolled away. `--border` on `--bg-2` is
  **1.26 / 1.22 / 1.25** — a hairline, correctly, because it is structure and
  carries no state, so the 3:1 floor for a meaningful non-text mark does not
  apply to it.

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

  Two exceptions that were listed here are gone: `.deck-key.active`'s second
  axis (the 14% accent tint) and the accent *fill* on `.ov-seg button.on` /
  `.usage-windows .btn-min.on`. Both were struck by the accent budget above.
- `.switcher-card.active` marks the active project with a `--moss` ring, i.e. the
  semantic success color standing in for an active state. Should be an accent
  stripe.
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
one — `.deck-key.key-waiting`'s breathing accent edge, and the `⚑ N want you`
control on the bar — so the deck key can carry `waiting` on the dot alone.
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

### The deck bar, and its wants-you control

**The bar reads left to right in the order the questions arrive:** where am I
(the four view keys, `Ctrl+1..4`) → what needs me (`.deck-wants`) → facts about
the repo (`.deck-status`: branch, pull, changes, identity, remote) → tools
(`.deck-tools`: Scripts, Settings, More). It used to put the tools between the
keys and the facts and the wants-you count at the far right end, so the eye had
to cross the whole bar to reach the only number on it that changes what you do
next. DOM order is visual order, so the tab order agrees with the reading order.

**The wants-you control is the aggregate form of the word above.** Same rule,
one scale up: the per-session heads say `needs you` / `waiting for you` for one
session; this says how many want you across every project, off the same
`wantsYou` predicate Mission's header counts, so the two cannot disagree.

| Count | Renders |
| --- | --- |
| 0 | nothing at all — the marker only ever *adds* |
| 1 | `⚑ 1 wants you` |
| n | `⚑ n want you` |

- **Zero renders nothing**, which is why it can be a word rather than a badge:
  there is no `0 want you` to learn to ignore, and its mere presence is the
  signal. A bare digit does the opposite — it vanishes at zero *and* never
  teaches what it counts, which is what the old corner glyph did for a year.
- **"Want you", not "waiting" or "needs".** Those two words are spent on the
  per-session heads, where they distinguish a bell from a finished turn. The
  aggregate sums BOTH mechanisms, so borrowing either word would name one and
  lie about the other.
- **The accent is on the flag, never on the word.** Same spend-once rule as the
  blocked-on-you word: the flag glyph is the marker, the word is `--text`/600.
  `--accent` at 12px on Washi's `--bg` is the 2.92:1 mark this system removed.
  It is the bar's one Tier-3 accent — the active view key's 2px underline is the
  other, and no third accent is added.
- **It is one control carrying the state and the act it invites** (the
  `.sb-pull` precedent): clicking it opens the session that has waited longest,
  and the tip says so. Because it *offers* a door, it has to be able to find out
  there was none — the store's jump reports whether it moved, and the control
  says so rather than answering a click with silence. A stall counts here and
  has no pending turn to open, so that is not a hypothetical case.
- **Nothing here moves.** The deck's nag is the key edge; a second breathing
  thing on the same bar would be the additive mistake.

**No responsive collapse.** At four keys the bar cannot overflow the window's
own 900px minimum (keys ~350 + wants ~110 + three tools 88 + 20 padding + 36 of
gaps ≈ 604, against a status region needing 139), so the `max-width: 959px`
rule that used to drop the verify keys' labels was **deleted** rather than left
as a branch that can never fire. A rule nobody can trigger is a rule nobody can
trust. The `.deck-view.group-start` hairline went for the neighbouring reason:
with four keys the supervise-then-verify order is carried by the order itself.

### Badge tiers

Distinguished by *treatment* rather than color, so urgency is never confused with
identity:

- **Outlined** micro-pill — **identity**, never urgency (agent/model names, on
  `--clay`). Outline marks it as "this is *what*, not *how urgent*".
- **Bare uppercase** micro-label — **classification** (`--faint`, letter-spaced).
- **Tint fill + weight** — **active segment** (see above).
- **Accent fill** — Tier 1 of the accent budget: the primary CTA
  (`button-accent`), and `✓ Approve` on a Mission tile or an Overview card,
  which is the act the product exists for. If something is filled, it is the
  thing to act on; a fill that is not an act is a bug.

Attention/urgency is **not** a badge tier — it is form plus the accent: the
accent flag beside the deck bar's wants-you word (`.deck-wants`), and a bare `!`
glyph on a deck key. There is no filled count badge in the app.

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

### Overflow and the scroll affordance

**A surface that can outgrow its box scrolls, and says so.** The pattern is a
pair, and both halves have to be present: something caps the height (a
`max-height`, or a flex parent that has one), and the child holding the growing
content takes `min-height: 0; overflow-y: auto`. The `min-height` is the
load-bearing half — a flex item's `auto` minimum is its own content height,
which is exactly the refusal-to-shrink that turns a long list into a clipped
one. Two live cases: a modal's `.modal-body` (and the `.wt-list` inside
Worktrees) and the deck's key row. The Worktrees list was unreachable below the
fold for six days because its modal had the cap and nothing had the scroll.

The affordance is **drawn explicitly — an 8px bar with a `--border-strong` thumb
at 4px radius** — not the global quiet scrollbar, and never
`scrollbar-width: thin`: setting `thin` makes Chromium ignore the
`::-webkit-scrollbar` rules and draw its own, and what it drew was invisible at
every theme. `--border-strong` is the token that clears 3:1 against every
theme's ground where `--border` does not.

A scrollbar is honest by construction: it exists exactly when there is more to
see, its thumb length says how much of the content is off-screen, and it costs
the surface those 8px only while it is overflowing. The corollary is that a
short surface must gain **nothing** — no bar, no fixed height, no dead space.
Shrink-only (no `flex-grow` on the scrolling child) is what guarantees it: with
the container sized by its content there is no free space to grow into.

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
