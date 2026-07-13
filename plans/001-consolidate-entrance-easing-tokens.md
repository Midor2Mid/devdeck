# 001 — Consolidate overlay entrance easing onto one `--ease-out` token

- **Status**: DONE
- **Commit**: 8e7f85d
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens + Easing & duration
- **Estimated scope**: 1 file (`src/renderer/src/styles.css`), ~8 edits

## Problem

DevDeck's overlay entrance animations use **three different easing systems**,
none of which is the existing motion token. This is a cohesion finding (the
motion "feel" is inconsistent across overlays) and an easing finding (bare CSS
`ease` is weak for entrances — the ease-out rule says entering elements should
start fast so they feel responsive).

Current state, all in `src/renderer/src/styles.css`:

```css
/* :337 — tooltip: bare `ease` */
.tip { animation: tip-in 0.12s ease; }

/* :3559 — pipeline runner bar: bare `ease` */
.pipeline-bar { /* … */ animation: toast-in 0.18s ease; }

/* :4863 — toast: bare `ease` */
.toast { /* … */ animation: toast-in 0.18s ease; }

/* :5939-5945 — modal/drawer/menu surfaces: a MIX */
.modal-backdrop { animation: dd-fade-in 0.14s ease; }
.modal { animation: dd-pop-in 0.19s cubic-bezier(0.2, 0.8, 0.2, 1); }
.drawer-backdrop { animation: dd-fade-in 0.14s ease; }
.drawer { animation: dd-slide-in-right 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }
.ctx-menu,
.agent-menu,
.db-history-menu { animation: dd-menu-in 0.13s ease; transform-origin: top; }
```

So: modals/drawers use a hand-typed `cubic-bezier(0.2, 0.8, 0.2, 1)`, while
backdrops, menus, tooltips, toasts, and the pipeline bar use the bare `ease`
keyword. Meanwhile the `:root` block already defines `--ease` (used correctly
on hover/color transitions) but there is **no** entrance token, so entrances
can't reference one.

## Target

Introduce ONE strong ease-out entrance token and point every overlay entrance
at it. Keep all durations exactly as they are. Keep `--ease` for hover/color
transitions (do not touch those).

Add the token to the existing motion block (`src/renderer/src/styles.css:53-58`):

```css
/* target — add after --ease-spring (:55) */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);   /* strong ease-out for entrances */
```

Then swap the timing function to `var(--ease-out)` on these entrances (durations
unchanged):

```css
.tip { animation: tip-in 0.12s var(--ease-out); }
.pipeline-bar { /* … */ animation: toast-in 0.18s var(--ease-out); }
.toast { /* … */ animation: toast-in 0.18s var(--ease-out); }
.modal-backdrop { animation: dd-fade-in 0.14s var(--ease-out); }
.modal { animation: dd-pop-in 0.19s var(--ease-out); }
.drawer-backdrop { animation: dd-fade-in 0.14s var(--ease-out); }
.drawer { animation: dd-slide-in-right 0.22s var(--ease-out); }
.ctx-menu,
.agent-menu,
.db-history-menu { animation: dd-menu-in 0.13s var(--ease-out); transform-origin: top; }
```

Note: `.modal` and `.drawer` move from `cubic-bezier(0.2, 0.8, 0.2, 1)` to the
slightly stronger `cubic-bezier(0.23, 1, 0.32, 1)`. Both are ease-out; this is a
deliberate, subtle unification. Confirm it in the feel check.

## Repo conventions to follow

- Motion tokens live in the `:root` block at `src/renderer/src/styles.css:53-58`,
  defined as `--name: value;` and consumed as `var(--name)`. Exemplar already in
  the file: `--ease: cubic-bezier(.2,.6,.35,1);` (:54), consumed at
  `styles.css:93` (`transition: … var(--ease)`).
- Add `--ease-out` right after `--ease-spring` (:55), same formatting.
- Reduced-motion is handled by existing `@media (prefers-reduced-motion: reduce)`
  blocks that set `animation: none` (e.g. `:5952-5962`, `:344-347`). These are
  unaffected by a timing-function change — do not edit them.

## Steps

1. `styles.css` `:root` motion block (~:55): add a new line after
   `--ease-spring: cubic-bezier(.34,1.4,.5,1);`:
   `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`
2. `styles.css:337` `.tip`: change `tip-in 0.12s ease` → `tip-in 0.12s var(--ease-out)`.
3. `styles.css:3559` `.pipeline-bar`: change `toast-in 0.18s ease` → `toast-in 0.18s var(--ease-out)`.
4. `styles.css:4863` `.toast`: change `toast-in 0.18s ease` → `toast-in 0.18s var(--ease-out)`.
5. `styles.css:5939` `.modal-backdrop`: `dd-fade-in 0.14s ease` → `dd-fade-in 0.14s var(--ease-out)`.
6. `styles.css:5940` `.modal`: `dd-pop-in 0.19s cubic-bezier(0.2, 0.8, 0.2, 1)` → `dd-pop-in 0.19s var(--ease-out)`.
7. `styles.css:5941` `.drawer-backdrop`: `dd-fade-in 0.14s ease` → `dd-fade-in 0.14s var(--ease-out)`.
8. `styles.css:5942` `.drawer`: `dd-slide-in-right 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)` → `dd-slide-in-right 0.22s var(--ease-out)`.
9. `styles.css:5945` `.ctx-menu, .agent-menu, .db-history-menu`: `dd-menu-in 0.13s ease` → `dd-menu-in 0.13s var(--ease-out)` (leave `transform-origin: top` as-is).

## Boundaries

- Touch ONLY the `animation` timing function on the nine entrances listed, plus
  the one new token line. Do NOT change any duration.
- Do NOT touch `transition:` lines that use `var(--ease)` or bare `ease` on
  hover/color/press interactions — those are correct per the easing rules
  (hover/color → `ease`) and are out of scope.
- Do NOT edit any `@keyframes` block (dd-fade-in, dd-pop-in, dd-menu-in,
  dd-slide-in-right, tip-in, toast-in) — only the animation shorthand that
  references them.
- Do NOT touch `.pipeline-bar`'s `transform: translateX(-50%)` or any layout /
  positioning property.
- Do NOT edit the `prefers-reduced-motion` media blocks.
- Do NOT add dependencies.
- If a cited line no longer matches (drift since commit 8e7f85d), STOP and report.

## Verification

- **Mechanical**: `npm test` (vitest) still passes 252/252; `npx tsc --noEmit`
  produces no *new* errors (there is one pre-existing unrelated error in
  `EditorPanel.tsx` around monaco typing — ignore it). CSS-only change, so tests
  are just a regression guard. Do NOT run a renderer build (it OOMs on this
  machine) — the run-app harness at `.claude/skills/run-app/` builds `out/` itself.
- **Feel check**: build `out/` via `npx electron-vite build`, then drive the app
  (run-app skill) and open, in slow motion (DevTools → Animations panel, 10%):
  - A **tooltip** (hover a deck view button ~0.5s), a **context menu**
    (right-click a project label), a **modal** (Ctrl+Shift+P palette, or
    Settings), a **drawer** (Inbox/Review), a **toast** (trigger any toast), and
    the **pipeline bar** (run a pipeline).
  - Confirm each now starts fast and settles softly (ease-out), and that all six
    read as the *same* motion character (the point of this change).
  - Confirm the modal/drawer entrance still looks right with the slightly
    stronger curve — no overshoot, no sluggish start.
  - Toggle `prefers-reduced-motion: reduce` (DevTools → Rendering) and confirm
    every one of these still appears instantly with no movement (unchanged).
- **Done when**: `--ease-out` exists as a token, all nine entrances reference it,
  no duration changed, and the feel check passes.
