# Role-panel diff review — design

**Date:** 2026-07-08
**Status:** Design — autonomous ("keep shipping").
**Scope:** One action spawns several agent sessions over the active project's
uncommitted changes, each with a distinct review *lens*, arranged in the grid.

## Problem & realistic scope

The review suggested "a panel of agents reviewing a diff through different lenses,
aggregated." DevDeck drives **CLI agents in terminals** and deliberately does not
parse their output, so automated verdict **aggregation is not feasible** here. The
feasible, valuable core is **orchestration**: instead of manually starting N agent
sessions and pasting a lens prompt into each, one click spawns lens-specific
reviewers over the current diff, shown together in the grid. Each lens's review is
read in its own pane.

## Decisions (autonomous)

- **Target:** the active project's uncommitted changes. Each agent runs
  `git diff HEAD` itself (repo access) — we do **not** pipe a huge diff into the
  prompt. Precondition via `git.status(cwd).changes` (>0 required).
- **Lenses (pure data):** Correctness, Security, .NET idioms, Performance, Tests.
  Default-selected: Correctness + Security. Each has a prompt template focusing the
  agent on that concern and asking for concrete `file:line` findings.
- **Spawn:** for each selected lens, `newTab(agentId, undefined, "review:<id>")`
  (default agent = `settings.agents[0]?.id ?? "claude"`); switch to `terminal` view
  + `grid` layout so all reviewers are visible; after the agent-boot delay
  (2800 ms, matching `startWork`/`aiOnDiff`), `pty.input` the lens prompt.
- **No aggregation** (out of scope, stated in UI): the panel spawns the reviewers;
  the user reads each pane.

## Components

### `src/renderer/src/reviewLenses.ts` (pure, unit-tested)
- `interface Lens { id: string; label: string; focus: string }`
- `const LENSES: Lens[]` (the five above).
- `reviewPrompt(lens: Lens): string` — a template instructing the agent to run
  `git diff HEAD`, review the changes for `lens.focus`, and report concrete
  `file:line` findings (no edits).
- `const DEFAULT_LENSES = ["correctness", "security"]`.

### store (runtime-only)
- `reviewOpen: boolean` + `setReviewOpen(open)`.
- `startReview(lensIds: string[]): Promise<void>` — resolves lenses; if none / no
  active project, no-op; `setTermLayout("grid")`; spawn a tab per lens; set
  `{ reviewOpen: false, view: "terminal" }`; `await sleep(2800)`; `pty.input` each
  lens prompt. Mirrors the existing `startWork` spawn+delay pattern; reuses
  `newTab`/`pty.input`.

### `src/renderer/src/components/ReviewPanel.tsx` (new modal)
- Reads active project; on open, `git.status(path)` for the changed-file count.
- If no project or `changes === 0` → a message ("No uncommitted changes to
  review."), Start disabled.
- Lens checkboxes (seeded from `DEFAULT_LENSES`), a note that it starts one agent
  session per lens, and a **Start review** button → `startReview(selected)`.

### Wiring
- `App.tsx`: `{reviewOpen && <ReviewPanel />}`; keydown `mod+shift+KeyR` → toggle.
- `CommandPalette.tsx`: `{ id: "act:review", title: "Review changes (agent panel)",
  section: "Actions", run: () => store.setReviewOpen(true) }`.
- CSS for the modal + lens rows (existing tokens).

## Error handling & edge cases

- No project / no changes → message, Start disabled (no spawn).
- No agent configured → falls back to `"claude"` (same as `startWork`).
- Spawn failure (`newTab` returns undefined) → that lens is skipped; others proceed.

## Testing

- Unit-test `reviewLenses`: `LENSES` shape/ids, `reviewPrompt` includes the lens
  focus + the `git diff HEAD` instruction + a file:line ask, and `DEFAULT_LENSES`
  are valid ids.
- Verify with run-app: open (Ctrl+Shift+R); on a project with changes see the
  count + lenses + enabled Start; on a clean project see the disabled/no-changes
  state. **Start is not clicked in the automated harness** — it spawns real agent
  CLI sessions (consumes the user's AI usage); the spawn path reuses the proven
  `newTab`/`pty.input` primitives (shared with `startWork`/`aiOnDiff`/pipelines).

## Build steps (inline)

1. `reviewLenses.ts` (pure + tests).
2. store: `reviewOpen`/`setReviewOpen` + `startReview`.
3. `ReviewPanel.tsx` + CSS + App mount + Ctrl+Shift+R + palette entry.
4. `npm test`; verify with run-app (UI + precondition only).
