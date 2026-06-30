---
name: DevDeck
version: 0.5.9
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
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: 15px
  body:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: 13px
  label:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: 11px
  mono:
    fontFamily: "Cascadia Mono, Consolas, monospace"
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

## Typography

Two families: a humanist UI sans for chrome and a mono for everything terminal-
or code-shaped.

- **heading (15px):** modal titles and section headers, ~600 weight.
- **body (13px):** the default — buttons, rows, labels.
- **label (11px):** uppercase, letter-spaced section titles (PROJECTS, AGENTS).
- **mono (Cascadia Mono, 13px):** terminals, the SQL/HTTP editors, code, paths,
  and tabular numerals where digits must align. Terminal line-height is generous.

## Layout

A fixed slim **icon rail** (primary nav) → a resizable **sidebar** (projects +
agent sessions) → the **main panel** (one view at a time: terminal / editor / API
/ database / browser / network). Panels are resizable splits.

Spacing is a small, consistent scale — **xs 4 · sm 8 · md 12 · lg 16** — applied
through tokens, never ad hoc. Density is compact-but-breathable; the terminal gets
extra line-height so long sessions stay scannable.

## Elevation & Depth

Flat by default. Depth is a *style dial*: Modern Pro uses **subtle elevation**
(hairline borders + soft shadows on cards, menus, and modals); Wabi-sabi stays
nearly flat; Lacquer adds frosted glass; Neon swaps shadow for accent glow. Use
the lightest depth that still separates a floating surface from the ground —
modals get the largest shadow, inline cards the smallest.

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

Active tabs, selected rows, and focused panes are marked with an accent edge
stripe (form) on top of any color change.

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
