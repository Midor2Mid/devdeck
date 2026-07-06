# DevDeck — UI Craft Foundations (Global Design Pass)

**Date:** 2026-07-06
**Status:** Design approved; pending spec review → implementation plan
**Author:** Raymond Tran (with Claude)

## Goal

Make DevDeck feel **unmistakably premium** without changing its soul. The north
star in `DESIGN.md` stays exactly as written — *"calm over clever — quiet,
legible, fast to scan, never busy."* We are **elevating the craft**, not making
it louder: the Linear/Things playbook, where "premium" is won at the *foundation*
level (type, spacing, depth, motion, detail), not by decorating screens.

**Direction chosen:** Elevate the craft (calm) · **Scope:** Global foundations
pass · **Approach:** Retune existing tokens **and** expand the system, including
a **bundled premium font pair**.

Because every change is token-level, it cascades to all **7 themes** (Slate,
Sumi, Washi, Zen, Graphite, Aurora, Neo) and **12 styles** (Modern Pro, Wabi-sabi,
Modern Minimal, Neon, Flat Vector, Bauhaus, Phosphor CRT, Modern+, Lacquer,
Aurora Glass, Neo Holographic, Kinetic Minimal) at once — no screen is left
half-finished.

## Non-goals

- **No philosophy change.** Not more colorful, glassy, or dramatic by default.
- **No new themes or styles.** We retune the shared foundation the existing
  skins already consume.
- **No re-layout of screens.** Structure/IA is unchanged; this is finish, not
  rearrangement.
- **No terminal (xterm) font change by default.** The active-terminal font is
  high-opinion and higher-risk to re-render; it stays user-configurable and keeps
  its current default.
- **No CDN / network fonts.** Everything ships offline (corporate-proxy
  constraint, matches the existing `Icon.tsx` "no icon font / CDN" rationale).

## Design principles carried from DESIGN.md

- Change the **token**, then let the cascade apply it — never hard-code a
  color/size on one element.
- One accent carries the eye; semantic colors (ok/danger) stay separate.
- State shown in **form** (dot/pill/stripe/ring) as well as color.
- If a flourish costs scan-speed, cut it.

---

## The foundation levers

### A. Typography (the biggest single lever)

**Bundled pair**, shipped as **subsetted (latin) `woff2`** inside the app:

| Token | Family | Fallback | Where used |
|-------|--------|----------|------------|
| `--font-ui` | **Inter** (variable) | `Segoe UI, system-ui, sans-serif` | All chrome/UI text |
| `--font-mono` | **Geist Mono** | `Cascadia Mono, Consolas, monospace` | Chrome mono (`--mono`), Monaco editor, SQL/HTTP editors, kbd chips, paths, tabular contexts |

- Both are OFL-licensed and safe to bundle/redistribute.
- **Terminal (xterm)** keeps its current mono default and remains user-set — out
  of scope for this pass.
- Loaded via `@font-face` referencing bundled asset URLs (electron-vite resolves
  the import at build time). No `file://`, no network.

**Refined type ramp** (metrics tuned because Inter runs slightly smaller than
Segoe UI at the same px). Introduce as `:root` tokens:

| Token | Value | Notes |
|-------|-------|-------|
| `--fs-title` | 15px / weight 600 / letter-spacing -0.01em | modal + section headers |
| `--fs-body` | 13px | default UI text |
| `--fs-sm` | 12px | dense controls (buttons, tabs) |
| `--fs-label` | 11px / uppercase / letter-spacing 0.06em | PROJECTS, AGENT SESSIONS |
| `--fs-mono` | 13px | code/paths/editors |
| `--lh-tight` | 1.2 | labels, single-line chrome |
| `--lh-body` | 1.45 | multi-line copy |

Adoption is targeted at the highest-traffic selectors first (base `body`, buttons,
tabs, section labels, modal titles); the global `font-family` swap does most of
the lifting via inheritance.

**Alternatives (if preferred at review):** Geist Sans for UI (more "Vercel dev
tool"); JetBrains Mono for code.

### B. Space, shape & elevation

**Spacing** — keep the existing 4px base, extend the top of the scale for
breathing room in modals/empty states:

```
--sp-xs: 4px  --sp-sm: 8px  --sp-md: 12px  --sp-lg: 16px  --sp-xl: 24px  --sp-2xl: 32px
```

(`xs–lg` already exist conceptually; `xl`/`2xl` are new.) Adopt consistently in
panel/row/header vertical rhythm.

**Elevation scale** (new — the premium "tell"). Layered ambient + key shadows,
tuned per light/dark, defined as color-dependent tokens in `themes.ts`:

| Token | Role | Dark reference value |
|-------|------|----------------------|
| `--elev-1` | inline cards | `0 1px 2px rgba(0,0,0,.24), 0 1px 1px rgba(0,0,0,.16)` |
| `--elev-2` | menus / popovers / dropdowns | `0 4px 12px -2px rgba(0,0,0,.30), 0 2px 4px rgba(0,0,0,.20)` |
| `--elev-3` | modals | `0 18px 48px -12px rgba(0,0,0,.55), 0 6px 16px rgba(0,0,0,.30)` |
| `--edge-hi` | tactile top-edge highlight on raised dark surfaces | `inset 0 1px 0 rgba(255,255,255,.04)` |

- Light themes (Washi) get lighter, cooler shadows.
- **Styles keep control of intensity:** Neon swaps shadow for accent glow,
  Wabi-sabi stays near-flat, Lacquer leans into frost. The tokens define the
  *default* Modern-Pro elevation; style layers may override.

**Borders / radii:** refine the hairline `--border-soft` to a cleaner ~9% contrast
(currently reads slightly muddy on some grounds); add `--border-strong` for
emphasis (focused pane edges, active dividers). Keep the `sm 6 · md 8 · lg 12`
radius scale — styles still own `--radius`.

### C. State & motion

**Unified interaction states** via one hover token instead of scattered rgba:

- `--bg-hover` (new, per theme): dark ≈ `rgba(255,255,255,.03)`, light ≈
  `rgba(0,0,0,.03)`.
- Hover = `--bg-hover` lift + border move; **selected** = accent edge stripe
  (unchanged — already correct); **focus** = accent ring (already shipped in the
  prior pass); **press** = subtle nudge (below).

**Motion tokens** (`:root`), standardizing today's ad-hoc timings:

```
--ease:  cubic-bezier(.2,.6,.35,1)   /* default ease-out */
--ease-spring: cubic-bezier(.34,1.4,.5,1)  /* Kinetic-style overshoot */
--dur-fast: 120ms   --dur: 180ms   --dur-slow: 260ms
```

- Buttons/interactive rows get a shared transition + a ~0.3px / `scale(.997)`
  press feedback on `:active`.
- Everything remains gated behind `prefers-reduced-motion: reduce` (the existing
  global motion-disable blocks are preserved and extended).

### D. Numerals & fine detail

- `font-variant-numeric: tabular-nums` applied to `.mono`, the status bar, counts/
  badges, times, file sizes, and the Usage panel — digits stop jittering and
  tabular data aligns. High craft-per-line-changed.
- Light nudge to neutral-ramp **depth separation** (bg / surface / surfaceDeep)
  so layers read cleanly, *without* shifting each theme's hue identity.

---

## Architecture — where tokens live

| Concern | Location | Why |
|---------|----------|-----|
| Theme-agnostic tokens: spacing, radii, motion (ease/dur), type ramp, elevation **structure** | `src/renderer/src/styles.css` `:root` | Same across all themes |
| Color-dependent tokens: shadow colors (`--elev-*`), `--edge-hi`, `--bg-hover`, `--border-strong`, refined `--border-soft`, depth nudges | `src/renderer/src/themes.ts` per-theme `*_VARS` | Differ light vs dark and per palette |
| Font files + `@font-face` + `--font-ui` / `--font-mono` | `src/renderer/src/assets/fonts/` + `styles.css` (or `fonts.css`) | Bundled, offline |
| Style-specific elevation/glow overrides | existing `[data-style="…"]` blocks in `styles.css` | Styles dial intensity |
| **Source-of-truth doc** | `DESIGN.md` front-matter + prose | Must reflect the new foundation |

**Cascade discipline:** introduce tokens, then repoint existing hard-coded values
(e.g. `font-size: 12px`, ad-hoc `rgba(...)` hovers, per-element shadows) at the new
tokens. No new one-off values in components.

## Rollout plan (implementation order)

1. **Fonts first** — bundle Inter + Geist Mono, wire `@font-face` + `--font-ui`/
   `--font-mono`, swap global `body`/`--mono`. Verify metrics across surfaces
   *before* anything else (this is the highest-risk step; see Risks).
2. **Type ramp** — introduce `--fs-*` / `--lh-*`, adopt at base + key selectors.
3. **Elevation + borders** — add `--elev-*`, `--edge-hi`, `--border-strong`,
   refine `--border-soft`; repoint cards/menus/modals.
4. **Spacing + rhythm** — add `--sp-xl/2xl`, tidy panel/row/header rhythm.
5. **State + motion** — `--bg-hover`, motion tokens, shared transitions, press
   feedback.
6. **Numerals + depth nudge** — tabular-nums, neutral-ramp separation.
7. **Update `DESIGN.md`** to document the new foundation.

Each step is independently buildable and verifiable; we can stop/adjust between
steps.

## Verification

- `npx electron-vite build` after each step (catches TS/asset errors).
- `run-app` skill: screenshot the **default (Slate + Kinetic)** plus **2–3 skins**
  (e.g. Modern Pro, Aurora Glass, Washi light) across the **main cockpit + a few
  panels** (API, DB, Settings) — compare against pre-change baselines for metric/
  layout shifts.
- `npm test` (all 159 currently green) stays green.
- Restore the user's original skin (Slate + Kinetic, rail collapsed) after driving.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| **Global font swap shifts text metrics app-wide** (spacing, wrapping, truncation on every screen) | Do fonts as step 1 in isolation; screenshot many surfaces; tune the type ramp to Inter's metrics; keep Segoe UI fallback so a load failure degrades gracefully. |
| Bundle size grows (~200–400 KB for subsetted variable fonts) | Latin subset only; variable woff2; acceptable for a desktop app. |
| A style's custom elevation/glow conflicts with new `--elev-*` | Style `[data-style]` blocks keep override priority; test Neon/Lacquer/Aurora Glass explicitly. |
| CSP blocks font loading | Fonts are bundled same-origin assets, not remote — no CSP relaxation needed; verify in the built app. |
| Tabular-nums applied too broadly looks odd in prose | Scope it to mono/numeric/status contexts only, not body copy. |

## Success criteria

- Side-by-side, the app reads as **more premium and considered** while still
  passing the "calm, fast to scan" test — no reviewer calls it busy or loud.
- Zero hard-coded font sizes/colors/shadows introduced in components; everything
  flows from tokens.
- All 7 themes and 12 styles still look coherent (spot-checked).
- `DESIGN.md` accurately documents the new foundation.
- Build green, 159 tests green, no layout breakage found in `run-app` screenshots.

## Open questions for review

- Font picks: Inter + Geist Mono as specced, or swap to Geist Sans / JetBrains Mono?
- Elevation intensity: the dark `--elev-*` reference values above — comfortable, or
  dial lighter/heavier?
- Any surface you specifically want screenshotted during verification?
