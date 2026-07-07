# Fire-to-many-agents — design

**Date:** 2026-07-08
**Status:** Design — approved
**Scope:** Extend the PromptComposer so one composed prompt can be fired at
multiple agent sessions at once. No backend/protocol changes.

## Problem

DevDeck's founding use case is running several Claude CLI sessions across
projects at once ("most of my works are on terminal using claude cli … multiple
terminal active at the same time"). Today the PromptComposer sends only to the
single focused agent (`lastAgentTermId` via `sendToAgent`). To give the same
instruction to N sessions you paste it N times. This feature lets you fire one
prompt at a chosen subset of agent sessions in a single action.

## Solution overview

Add a **target selector** to the existing `PromptComposer` modal. The composer
keeps its prompt textarea, `@file`/`/snippet` autocomplete, and per-project
draft; we add a checkbox list of agent sessions (grouped by project) with quick
presets, and route Send to every selected session.

Confirmed decisions:
- **Targetable set:** agent sessions only (not plain shells) — it is a *prompt*
  composer, and this matches the founding use case.
- **Default selection on open:** only the focused agent (`lastAgentTermId`) is
  checked, so the common single-send path is byte-for-byte unchanged; fan-out is
  opt-in.
- **Selection is NOT persisted** — it reseeds to the focused agent every time the
  composer opens (predictable; no surprise broadcasts).
- **Safety:** firing at 1–2 targets is immediate; firing at **3+** requires a
  `confirm()` ("Send this prompt to N agents?"). Uses the existing confirm dialog.

## Components

Small, single-purpose units; reuses the deck's session-grouping patterns.

### `broadcast.ts` (new, pure) — target grouping + preset selection
- `interface TargetGroup { projectId: string; projectName: string; sessions: AnySession[] }`
- `groupTargets(sessions: AnySession[]): TargetGroup[]` — agent sessions grouped
  by project in first-seen order (same shape as `deriveDeckStrips`, without the
  compression/active-project concerns).
- `type Preset = "all" | "project" | "idle" | "none"`
- `presetSelection(sessions: AnySession[], preset: Preset, activeProjectId: string | null): Set<string>`
  returns the termIds a preset selects:
  - `all` → every agent session's termId
  - `project` → agent sessions whose `projectId === activeProjectId`
  - `idle` → agent sessions with `status === "idle"`
  - `none` → empty set
- Pure (only `import type { AnySession } from "./store"`); fully unit-tested,
  mirroring `deck.ts` / `tests/deck.test.ts`.

### store `broadcast(termIds: string[], text: string)` (new action)
- Iterates the given termIds and calls `window.api.pty.input(termId, text)` for
  each. Sets `lastAgentTermId` to the last target so the focused-agent notion
  stays coherent. Leaves the existing `sendToAgent(text)` untouched (other
  callers unaffected).
- Signature added to the `AppState` interface; implementation next to
  `sendToAgent` in `store.ts`.

### `PromptComposer.tsx` (modified) — target selector + multi-send
- New **target selector** section between the head and the textarea: agent
  sessions grouped by project (`groupTargets`), each row a checkbox + state dot
  (`tab-dot status-*`) + session name + agent badge. A preset row: **All ·
  This project · Idle only · None** and a live "N selected" count.
- Selection held in local React state as a `Set<string>` of termIds, seeded on
  open from `lastAgentTermId` (the focused agent) — or empty if there is none.
- Head line reflects the selection: "→ *tabName* badge" for a single target,
  "→ **N agents**" for many, and the existing "No agent session…" empty state
  when there are zero agent sessions.
- `send()` becomes: `body = text.trim()`; the selected termIds = `[...selected]`;
  if none or empty body, no-op; if `selected.length >= 3`, `await confirm({...})`
  and bail if declined; then `broadcast(selected, body + "\r")`; clear the draft
  and close.
- Send button enabled when `text.trim()` is non-empty AND at least one target is
  selected. Ctrl+Enter path calls the same `send()`.

## Data flow

No new IPC. `broadcast` reuses the existing `window.api.pty.input` primitive that
`sendToAgent` already uses. The target list derives from the existing
`agentSessions()` getter. `@file` mentions remain literal text the agent CLI
resolves against each target's own cwd/project (documented behavior — a
project-specific path fired cross-project may not resolve elsewhere; the file
autocomplete stays scoped to the active project as an authoring aid).

## Error handling & edge cases

- **No agent sessions:** selector shows the existing empty-state hint; Send
  disabled.
- **Focused agent gone / none:** default selection is empty; user picks targets;
  Send stays disabled until ≥1 selected.
- **A selected session dies between open and send:** `pty.input` to a dead
  termId is a harmless no-op in the main process; no special handling.
- **Body empty:** Send is a no-op / disabled.
- **Confirm declined (3+):** nothing is sent; composer stays open with the draft
  intact.

## Testing

- Unit-test `broadcast.ts`: `groupTargets` (grouping + first-seen order, agents
  only) and `presetSelection` (all/project/idle/none, active-project scoping),
  mirroring `tests/deck.test.ts`.
- Component + integration verified with the run-app skill (build `out/` first):
  open the composer, select two agents across the list, fire a prompt, confirm
  both terminals received the input; verify the 3+ confirm appears for a
  three-target send.

## Implementation shape (for the plan)

1. Add pure `broadcast.ts` + unit tests.
2. Add store `broadcast(termIds, text)` action + interface entry.
3. Extend `PromptComposer.tsx`: target-selector UI, local selection state,
   preset handling, multi-send with the 3+ confirm; update the head/enabled
   logic.
4. Add CSS for the selector (checkbox rows grouped by project, preset row) using
   existing tokens.
5. `npm test`; verify with run-app.
