# Per-Project Visual Identity — Design

**Date:** 2026-07-13
**Status:** Approved (brainstorm) — ready for implementation plan
**Scope:** Give every project a fast-to-recognize visual identity (auto colored
monogram, with optional emoji/color override) and surface it in the two
highest-value places: the `Ctrl+K` project switcher and the always-on topbar.

## Motivation

Switching projects is mechanically strong today (searchable grid, keyboard nav,
folder-drop) but slow to *scan*: projects carry only `name`, `path`, and optional
`group`, so the switcher is a wall of near-identical text whose paths share long
prefixes (`D:/Contoso - Partner/Projects/APP/…`). Recognition is a *reading* task;
the eye can't lock on before parsing.

A per-project **color + monogram** turns recognition pre-attentive ("the teal
one") and, in the always-on topbar, guards against the classic cockpit error of
firing an agent/command in the wrong project.

## Decisions (locked in brainstorming)

1. **Default identity:** auto colored monogram — zero-config, applies retroactively
   to all existing projects.
2. **Color model:** per-project hue, hashed deterministically from the name.
3. **Overrides:** optional emoji and/or color, set via the existing right-click
   project menu; absence means "use auto".
4. **MVP surfaces:** switcher cards + topbar chip only. Everything else (Mission
   tiles, cross-project search, compact deck) reuses the same component later.
5. **Palette:** a curated set of muted, theme-harmonious hues (NOT a raw hashed
   HSL rainbow), rendered as self-contained tiles.

## Architecture

### Data model

Extend the `Project` record with two optional override fields:

```ts
emoji?: string   // custom emoji; when set, replaces the monogram glyph
color?: string   // palette KEY (e.g. "teal"), not arbitrary hex; overrides the auto hue
```

Both absent → fully auto. These persist with the project (see Persistence).

### `projectIdentity.ts` — pure derivation module

No React, no electron imports → unit-testable in isolation (per the repo's
convention for testable logic). Public API:

```ts
export interface Identity {
    label: string      // the monogram (e.g. "LC") OR the emoji
    isEmoji: boolean
    bg: string         // tile background (CSS color)
    fg: string         // glyph color (CSS color) — only meaningful when !isEmoji
}

export function monogram(name: string): string
export function autoColorKey(name: string): PaletteKey
export function identity(p: { name: string; emoji?: string; color?: string }): Identity
```

**`monogram(name)` rules** (deterministic):
1. Trim; strip surrounding brackets/quotes and leading/trailing punctuation.
2. Split into tokens on whitespace, `-`, `_`, `/`, `.`, and camelCase boundaries
   (a lowercase→uppercase transition starts a new token).
3. If ≥2 tokens: first alphanumeric char of token 1 + first of token 2, uppercased.
4. If 1 token: its first two alphanumeric chars, uppercased (or just one if the
   token is a single char).
5. If no alphanumeric chars survive: return `"?"`.

Examples: `"LauChoySeng"` → `"LC"`; `"my-api-gateway"` → `"MA"`;
`"devdeck"` → `"DE"`; `"[ACME] - BE"` → `"AB"`; `"…"` → `"?"`.

**`autoColorKey(name)`**: `PALETTE_KEYS[ hash(name) % PALETTE_KEYS.length ]`, where
`hash` is a small stable string hash (djb2):

```ts
function hash(s: string): number {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
    return h
}
```

Must be stable across sessions and machines (same name → same color forever).

**`identity(p)` resolution:**
- Resolve the color source: `p.color` (if a valid palette key) else `autoColorKey(p.name)`.
- If `p.emoji`: `{ label: p.emoji, isEmoji: true, bg: <resolved tile bg, see below>, fg }`.
- Else: `{ label: monogram(p.name), isEmoji: false, bg, fg }` from the resolved palette entry.

### The curated palette

A typed constant in `projectIdentity.ts`. **Intentionally theme-independent** — the
chip is a self-contained filled tile that carries its own contrast, so it reads
correctly on every theme (Sumi/Zen dark, Washi light) without per-theme logic, and
a project keeps the *same* identity color as the user switches themes (recognition
consistency). This is a deliberate exception to "colors come from theme tokens":
identity is not a themeable surface.

~10 muted, harmonious hues (earth/jewel tones that sit calmly with the Japanese-
minimal palette). Starter set (implementer may fine-tune values, not count/spirit):

| key | bg (hex) | fg |
| --- | --- | --- |
| clay | `#b0614a` | `#fff` |
| ochre | `#a8853e` | `#fff` |
| sage | `#6d8a68` | `#fff` |
| teal | `#478a8a` | `#fff` |
| steel | `#5a7196` | `#fff` |
| indigo | `#6a6aa0` | `#fff` |
| plum | `#8a5a82` | `#fff` |
| rose | `#a85a6e` | `#fff` |
| moss | `#79894a` | `#fff` |
| stone | `#7a756e` | `#fff` |

`fg` is white for all starter entries (they're mid-dark). If any tuned value ends
up light, set its `fg` to the ink token color instead so text stays legible
(threshold: relative luminance of `bg` ≥ 0.5 → ink). Emoji tiles: use a neutral
subtle background unless a `color` override is set, in which case use that entry's
`bg`.

### `<ProjectChip>` component

One shared component, reused in both surfaces (and later everywhere):

```tsx
<ProjectChip project={p} size="sm" | "md" />
```

- Renders a rounded square tile: emoji centered if `isEmoji`, else the monogram in
  `fg` on `bg`.
- Sizes: `sm` ≈ 18px (topbar), `md` ≈ 26px (switcher card). Exact px set as CSS
  classes in `styles.css` following existing sizing conventions.
- `aria-label={p.name}`; emoji variant adds `role="img"`.
- No animation of its own.

### Placement

- **`ProjectSwitcher.tsx`** (card at `:136`): render `<ProjectChip size="md">` to
  the left of `.switcher-card-name`. Card `sel`/`active` styling (which uses
  `--accent` for border/stripe) is unchanged — identity (tile) and state (accent
  border) occupy different visual roles and must not merge.
- **Topbar** (`Topbar.tsx`): add `<ProjectChip size="sm">` for the active project
  *inside* the project button (`.topbar-proj-btn`, `Topbar.tsx:19-27`), before
  `project.name`. **Do NOT touch `.topbar-brand`** (`Topbar.tsx:16`) — the `○` there
  is the DevDeck ensō *brand* mark (`<Enso>`), i.e. app identity, not the project
  glyph; it stays. When there is no active project, render no chip (the button shows
  "No project" as today).

### Overrides + persistence

- **UI:** extend the right-click project menu (`projectMenu.ts`) with:
  - "Set emoji…" — a minimal emoji entry (text input accepting one emoji, or a tiny
    picker; a plain input is acceptable for MVP).
  - "Set color…" — a small swatch picker showing the curated palette.
  - "Reset to auto" — clears both `emoji` and `color`.
- **Persistence:** add a `setMeta(id, { emoji?, color? })` path mirroring the
  existing group flow:
  - main-process projects store: a setter that patches the record and persists.
  - preload API: expose `projects.setMeta`.
  - renderer `store.ts`: a `setProjectMeta` action mirroring `setProjectGroup`
    (`store.ts:621`) — calls the preload API, updates state from the returned store.
  - Setting `color`/`emoji` to `undefined`/empty clears the override.

## Coexistence, accessibility, motion

- **Identity ≠ state.** Chip color = identity; `--accent` remains the sole
  interaction/selection/attention signal. Different visual roles (filled tile vs
  border/stripe), so no conflict and no theme-accent fight.
- Chip is labeled (`aria-label` = project name); emoji variant is `role="img"`.
- No new animation; reduced-motion unaffected (static element).

## Testing

- Unit tests for `projectIdentity.ts`:
  - `monogram`: the examples above + edge cases (empty, punctuation-only, single
    char, camelCase, bracketed).
  - `autoColorKey`: determinism (same input → same key across calls) and that it
    always returns a valid palette key.
  - `identity`: emoji override wins; color override sets bg; auto path when neither
    set; invalid `color` key falls back to auto.
- Existing suite (252 tests) stays green.

## Non-goals (YAGNI)

- No group-family hue model (per-project hue chosen).
- No free color wheel / arbitrary hex (curated palette keys only).
- No image/icon uploads.
- No chip in Mission Control tiles, cross-project search, or the compact deck yet —
  those reuse `<ProjectChip>` in a later pass.

## Verification

- `npx tsc --noEmit`: no new errors (one pre-existing unrelated `EditorPanel.tsx`
  monaco error may remain — ignore it).
- `npm test`: existing suite green + new `projectIdentity` tests pass.
- Do NOT run a renderer build directly (OOMs); use `npx electron-vite build` only
  via the run-app harness.
- **Feel check** (run-app): open `Ctrl+K` — every card shows a distinct colored
  monogram; the active project's chip matches the topbar chip. Set an emoji and a
  color on one project via right-click; confirm both persist across an app restart
  and that "Reset to auto" restores the hashed monogram. Switch themes (Sumi →
  Washi) and confirm chips stay legible and keep their identity color.
