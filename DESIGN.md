---
name: DevDeck
version: 0.9.0
description: >-
  A terminal-first developer cockpit. Calm over clever — quiet, legible, fast to
  scan. One restrained accent, state shown in form as well as color. These tokens
  describe the default identity (Slate theme + Modern Pro style); the app ships
  several swappable themes and styles that re-bind these same tokens.
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

- **Themes (color):** Slate (dark, default), Sumi (warm dark), Washi (light),
  Zen (airy dark), Graphite (cool dark, indigo accent), Aurora (cool indigo
  glass), Neo (holographic cyan/violet).
- **Styles (shape/depth/type):** Modern Pro (default), Wabi-sabi, Modern Minimal,
  Neon, Flat Vector, Bauhaus, Phosphor CRT, Modern+, Lacquer, Aurora Glass,
  Neo Holographic, Kinetic Minimal.

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
lg. Corner radius is itself a style dial (Bauhaus is 0, Flat Vector is generous).

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
- **trace:** a two-minute terminal-activity sparkline on an agent tile, drawn as
  one SVG path in `currentColor` at `--muted`. Never accent-coloured — it is a
  reading, not an action. Empty buckets draw a baseline, so genuine silence
  reads as a flat line. It measures output volume, not usefulness: an agent
  repainting a spinner with `\r\n`-terminated frames registers as active,
  while one that repaints in place with a bare `\r` reads as silent — so read
  it for pace, not for progress.

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
| `quiet` | `--faint` | `QUIET` · `–`, a clean `EXITED` · `□` |

`--clay` and `--accent` sit within a hair of each other in both Sumi and
Washi — the same collision `.mission-tile.stalled`'s dashed-vs-solid rule
above already exists to route around — so `warn` never leans on hue to clear
`attention`: it is the chip's only dashed tone (`.mtile-chip.tone-warn`), and
`□` (`EXITED`) is the only glyph that spans two tones, because the
process-exited fact is the same at any code and only the tone says whether it
mattered.

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
