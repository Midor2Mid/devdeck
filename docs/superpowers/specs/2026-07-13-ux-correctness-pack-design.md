# UX Correctness Pack — Design

**Date:** 2026-07-13
**Scope:** Renderer-only correctness fixes that make DevDeck easier to use. No new
features, no visual/token changes, no shared-overlay refactor. Pure correctness.

## Motivation

A UX survey surfaced three help/discoverability surfaces that are stale, wrong, or
self-inconsistent — they actively mislead users. Each fix is small and isolated.

## Fix 1 — Truthful help & empty-state copy

### `src/renderer/src/components/ShortcutsModal.tsx`
- The Global group hardcodes `["Ctrl + 1 … 6", "Switch view (Terminal … Network)"]`
  but there are now **8** deck views starting with *Mission* (see `DECK_VIEWS` in
  `ViewKeys.tsx`). Derive this row from `DECK_VIEWS`: label
  `Ctrl + 1 … {N}` and description `Switch view ({first.name} … {last.name})`,
  where N = `DECK_VIEWS.length`. This makes it drift-proof.
- Add the three real global chords currently undocumented (they exist in
  `App.tsx`): `Ctrl + Shift + F` → "Search across projects",
  `Ctrl + Shift + B` → "Build / test (.NET)", `Ctrl + Shift + R` → "Review changes".
  Add them to the **Global** group.

### `src/renderer/src/components/TerminalView.tsx` (empty state, ~line 122)
- Rewrite the copy that says: "Click **+** next to **PROJECTS** in the sidebar".
  There is no sidebar. New copy points at the real path:
  press `Ctrl + K` to open the project switcher (or drop a folder onto it) to add or
  switch projects. Keep the existing `F1` shortcuts hint.

## Fix 2 — `Ctrl+Shift+F` must not fire two handlers at once

Both `App.tsx` (global cross-project search toggle) and `TerminalView.tsx`
(find-in-terminal) register capture-phase `window` keydown listeners for
`Ctrl+Shift+F`. `stopPropagation()` does not stop sibling listeners on the same
target, so in Terminal view both fire (find bar toggles AND search modal opens).

**Resolution — scope by context:**
- In `App.tsx`, the `Ctrl+Shift+F` (KeyF) branch: if
  `useStore.getState().view === "terminal"`, do NOT toggle search — return and let
  the terminal handle find-in-terminal. Elsewhere, behave as today (toggle search).
- In `TerminalView.tsx`, for the matched chords use `stopImmediatePropagation()`
  (belt-and-suspenders) so nothing else on `window` also handles the event.
- Documentation stays correct because the modal lists find under **Terminal** and
  search under **Global** (Fix 1).

Do not change `Ctrl+Shift+B` / `Ctrl+Shift+R` — no conflict there.

## Fix 3 — Command Palette complete & internally consistent

`src/renderer/src/components/CommandPalette.tsx`:
- **Go to**: replace the hardcoded 5-view array with `DECK_VIEWS` (from
  `ViewKeys.tsx`) so all 8 views (Mission, Tasks, Network included) are reachable.
  Use `v.name` for the title and `store.setView(v.view)` to run.
- **Themes**: iterate `THEMES` (from `themes.ts`) instead of the 3 hardcoded
  entries; title `"Theme: " + t.label`, run `setAppearance({ theme: t.id })`.
- **Styles**: add a new **Style** section, iterate `STYLES` (from `themes.ts`);
  title `"Style: " + s.label`, run `setAppearance({ style: s.id })`.
- **Duplicate `id: "act:review"`** (two commands share this id — React key
  collision). Give distinct ids and clearer titles:
  - `act:review-panel` — "Review changes — agent panel" (`setReviewOpen(true)`)
  - `act:review-project` — "Diff working tree — active project" (`openChanges(...)`)

## Non-goals
- No shared overlay/Escape refactor, no tooltip a11y, no polling changes.
- No changes to `themes.ts` token values or `styles.css`.

## Verification
- `npx tsc --noEmit` (or the project typecheck) passes.
- `npm test` (vitest) passes — existing suite stays green; add a small unit test
  only if a fix exposes a pure-logic seam worth locking (e.g. the derived
  shortcuts row / palette command list), otherwise rely on the suite.
- One `run-app` pass: open shortcuts modal (F1), open palette (Ctrl+Shift+P) and
  confirm Mission/Tasks/Network + all themes + styles appear with no duplicate
  keys, and confirm Ctrl+Shift+F in Terminal view opens only find (not search).
