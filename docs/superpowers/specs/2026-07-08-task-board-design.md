# Task Board — design

**Date:** 2026-07-08
**Status:** Design — approved
**Roadmap:** #2 (the headline) of the trend-informed roadmap — a per-project
kanban where tasks are dispatched to agents (in worktrees) and tracked.

## Problem

DevDeck supervises live agents well (Mission Control), but there's no place to
**plan and track the work itself**: decompose a goal into tasks, hand each to an
agent, and watch it move to done. This is the headline gap the ecosystem is
converging on (vibe-kanban 27k★, cmux). DevDeck already has the dispatch
primitive (`startWork` spawns an agent in a worktree with a brief) — the board is
the persistent planning/tracking layer on top.

## Decisions (approved)

- **Core model:** manual kanban + dispatch (no parsing of agent output). You
  create task cards; dispatching one spawns an agent seeded with the task text.
- **Surface:** a new first-class deck view `tasks` (after Mission → `Ctrl+2`).
- **Isolation:** dispatch runs the agent in **its own git worktree by default**,
  with a per-card toggle to run in the project dir.
- **Columns / flow:** **Todo · Doing · Review · Done**. Dispatch → Doing; when the
  linked agent goes idle, the card auto-moves Doing → Review; the user reviews and
  moves to Done (or reopens to Doing).
- **Persistence:** `boardTasks` live in `workspace.json` (the store's persisted
  slice), alongside tabs/sessions — tasks are per-project workspace state and their
  `termId` links match persisted tab/session ids.
- **Deferred (out of first cut):** role-panel "lenses" on a worktree card (it
  targets the active project today); AI-decompose of a goal into cards.

## Data model

```ts
// store.ts
export type BoardColumn = "todo" | "doing" | "review" | "done"
export interface BoardTask {
    id: string
    projectId: string
    title: string          // the task text; sent to the agent verbatim as its prompt
    column: BoardColumn
    termId?: string        // linked agent session once dispatched
    worktree?: string      // worktree path if dispatched isolated (else undefined)
    createdAt: number
}
```
Added to the `Persisted` slice: `boardTasks: BoardTask[]` (flat list; filtered by
`projectId` in the UI). Persisted via the existing debounced `persist()`.

## Components

### `src/renderer/src/board.ts` (pure, unit-tested)
- `const COLUMNS: BoardColumn[] = ["todo", "doing", "review", "done"]`
- `tasksByColumn(tasks: BoardTask[], projectId: string): Record<BoardColumn, BoardTask[]>`
  — filter to the project, group by column, preserve insertion order.
- `parseChecklist(text: string): string[]` — split pasted text into task titles
  (one per non-blank line, stripping leading `-`, `*`, `[ ]`, numbering).

### store actions (runtime + persisted)
- `addBoardTask(projectId: string, title: string): void` — appends a Todo task
  (supports multi-line via `parseChecklist` → multiple tasks).
- `moveBoardTask(id: string, column: BoardColumn): void`
- `removeBoardTask(id: string): void`
- `dispatchBoardTask(id: string, opts: { worktree: boolean }): Promise<void>` —
  resolve task + its project; `agentId = settings.agents[0]?.id ?? "claude"`;
  `setActiveProject(task.projectId)` first (so `newTab` spawns into it). If
  `worktree`: `git.worktreeAdd(project.path, title)` → on failure, leave the card
  in Todo and surface an activity/error, return. Spawn via `newTab(agentId,
  undefined, label, worktreePath?)`; set the task `{ column: "doing", termId,
  worktree }`; `await sleep(2800)` then `pty.input(termId, title + "\r")`. Mirrors
  `startWork`.
- **Auto-review hook:** where an agent transitions to `idle` (the idle timer in
  `onPtyData`), if a `boardTasks` entry has `termId === id` and `column === "doing"`,
  move it to `review`. Small helper `reviewLinkedTask(termId)`.

### `src/renderer/src/components/TaskBoard.tsx` (new view) + CSS
- Header: project name + an add-task input (Enter adds; multi-line paste → many).
- 4 columns; each card shows title, and for dispatched cards a **live status dot**
  (`agentStatus[termId]`) + agent badge.
- **Todo card** actions: **Dispatch** (with a small worktree toggle), Delete.
- **Doing card:** status dot + **Jump** (`jumpToTerm`).
- **Review card:** **Jump**, **Diff** (`openChanges(task.worktree ?? project.path,
  task.title)`), **→ Done**, **↩ Reopen** (→ doing).
- **Done card:** Delete / **↩ Reopen**.
- Movement: HTML5 drag between columns **and** a per-card move control (buttons),
  so it's keyboard- and CDP-testable (drag is a manual-verify enhancement).
- Empty states: no project → "No project selected"; empty column → subtle hint.

### Wiring
- `store.ts`: add `"tasks"` to `MainView`; `boardTasks` to `Persisted` +
  initial state + `init()` load (`w.boardTasks ?? []`) + `writeNow()`.
- `ViewKeys.tsx`: add `{ view: "tasks", icon: "list", name: "Tasks" }` after
  Mission.
- `App.tsx`: render `<TaskBoard/>` panel for `view === "tasks"`.
- Command palette: `{ id: "act:tasks", title: "Task board", run: () =>
  store.setView("tasks") }`.

## Data flow

No new IPC beyond reused `git.worktreeAdd` / `pty.input`. Cards derive from the
persisted `boardTasks`; live status per dispatched card comes from `agentStatus`
(reactive). Auto-review is driven by the existing idle transition.

## Error handling & edge cases

- **No project:** board shows "No project selected"; add disabled.
- **Worktree add fails:** card stays in Todo; an activity entry notes the failure;
  no agent spawned.
- **Linked agent/session closed:** the card keeps its `termId` but the status dot
  reads idle/unknown; Jump no-ops safely (`jumpToTerm` guards). Reopen re-dispatches.
- **Empty title / blank paste lines:** ignored.
- **Dispatched task's project not active:** `dispatchBoardTask` sets the task's
  project active (`setActiveProject(task.projectId)`) **before** `newTab`, since
  `newTab` spawns into the active project — so the agent always lands in the right
  project/worktree.

## Testing

- Unit-test `board.ts`: `tasksByColumn` (project filter + grouping + order),
  `parseChecklist` (strips `-`/`*`/`[ ]`/numbering, skips blanks), `COLUMNS`.
- run-app: switch to the Tasks view, add a card, move it across columns via the
  per-card control, confirm persistence shape. **Dispatch is not auto-fired** in
  the harness (it spawns a live agent CLI / creates a worktree); the dispatch path
  reuses the proven `startWork`/`newTab` primitives.

## Build steps (for the plan)

1. `board.ts` (pure helpers) + unit tests.
2. store: `BoardTask`/`BoardColumn` types, `boardTasks` persisted slice, the four
   actions, and the idle → review hook.
3. `TaskBoard.tsx` + CSS; wire `MainView`/`ViewKeys`/App panel/palette; reconcile
   `Ctrl+digit`.
4. `npm test`; verify with run-app (create/move/persist).
