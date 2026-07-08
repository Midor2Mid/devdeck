# Task Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-project kanban (Todo·Doing·Review·Done) as a new deck view, where a task is dispatched to an agent in its own git worktree and auto-moves to Review when that agent idles.

**Architecture:** A pure domain module (`board.ts`) owns the task types + grouping/parsing helpers. The store gains a persisted `boardTasks` slice and actions (add/move/remove/dispatch) plus an idle-hook that advances a dispatched card to Review. A new `TaskBoard` view renders the columns and reuses the existing `startWork`-style dispatch (`git.worktreeAdd` → `newTab` → boot delay → `pty.input`).

**Tech Stack:** Electron + electron-vite + React 18 + TypeScript, Zustand (`store.ts`), Vitest (`tests/`), CSS custom properties (`styles.css`).

## Global Constraints

- **4-space indent; double quotes for strings.**
- **Conventional commits** (`feat:`, `docs:`…); commit after each task.
- **Persist `boardTasks` in `workspace.json`** (the store's `Persisted` slice), not settings.
- **Dispatch defaults to an isolated git worktree** (per-card toggle to opt out); reuse the `startWork` spawn pattern (`git.worktreeAdd` → `newTab(cwd)` → `await sleep(2800)` → `pty.input(title + "\r")`).
- **No parsing of agent output.** A card reaches Review via the agent's idle transition; Done is a human move.
- **Design tokens only** in CSS (`var(--bg)`, `--bg-2`, `--panel`, `--border`, `--accent`, `--muted`, `--radius`…); no hard-coded palette values.
- **Icons:** use existing `Icon` names only.
- **Tests:** pure logic gets a Vitest unit test; components verified by `npx electron-vite build` + run-app. `npm test` must pass before a task is done.
- **Don't edit `src/` while `npm run dev` runs** — build/verify via `npx electron-vite build` + run-app. HTML5 drag can't be driven over CDP — verify drag manually; the per-card move buttons are the testable path.
- Branch: `task-board` (spec already committed there).

## File structure

**Create**
- `src/renderer/src/board.ts` — pure task types (`BoardTask`, `BoardColumn`) + `COLUMNS`, `tasksByColumn`, `parseChecklist`.
- `tests/board.test.ts` — unit tests for the above.
- `src/renderer/src/components/TaskBoard.tsx` — the kanban view.

**Modify**
- `src/renderer/src/store.ts` — `"tasks"` in `MainView`; `boardTasks` persisted slice; `addBoardTask`/`moveBoardTask`/`removeBoardTask`/`dispatchBoardTask`; idle → Review hook.
- `src/renderer/src/components/ViewKeys.tsx` — add the `tasks` deck view.
- `src/renderer/src/App.tsx` — render the `TaskBoard` panel.
- `src/renderer/src/components/CommandPalette.tsx` — a "Task board" action.
- `src/renderer/src/styles.css` — board CSS.

**Reuse as-is:** `git.worktreeAdd(repoPath, branch, base?)` → `WorktreeAddResult { ok, path?, branch?, error? }`; `newTab(agentId, initialCommand?, label?, cwd?, shellKind?)`; `setActiveProject`, `jumpToTerm`, `openChanges(cwd, label)`, `agentStatus`, the store's `sleep`/`newId`/`persist`/`pushActivity`.

---

### Task 1: Pure board module (`board.ts`)

Pure — no React/Electron. Owns the task domain types so both the store and the view import from one place.

**Files:**
- Create: `src/renderer/src/board.ts`
- Test: `tests/board.test.ts`

**Interfaces:**
- Produces:
  - `type BoardColumn = "todo" | "doing" | "review" | "done"`
  - `interface BoardTask { id: string; projectId: string; title: string; column: BoardColumn; termId?: string; worktree?: string; createdAt: number }`
  - `const COLUMNS: BoardColumn[]`
  - `tasksByColumn(tasks: BoardTask[], projectId: string): Record<BoardColumn, BoardTask[]>`
  - `parseChecklist(text: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/board.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { COLUMNS, tasksByColumn, parseChecklist, type BoardTask } from "../src/renderer/src/board"

function task(over: Partial<BoardTask>): BoardTask {
    return { id: "t", projectId: "p", title: "x", column: "todo", createdAt: 0, ...over }
}

describe("COLUMNS", () => {
    it("is the four columns in order", () => {
        expect(COLUMNS).toEqual(["todo", "doing", "review", "done"])
    })
})

describe("tasksByColumn", () => {
    it("filters to the project and groups by column, preserving order", () => {
        const g = tasksByColumn(
            [
                task({ id: "a", projectId: "p1", column: "todo" }),
                task({ id: "b", projectId: "p2", column: "todo" }),
                task({ id: "c", projectId: "p1", column: "doing" }),
                task({ id: "d", projectId: "p1", column: "todo" })
            ],
            "p1"
        )
        expect(g.todo.map((t) => t.id)).toEqual(["a", "d"])
        expect(g.doing.map((t) => t.id)).toEqual(["c"])
        expect(g.review).toEqual([])
        expect(g.done).toEqual([])
    })
})

describe("parseChecklist", () => {
    it("splits lines and strips bullet / numbering / checkbox markers", () => {
        expect(parseChecklist("- one\n* two\n1. three\n[ ] four\n[x] five")).toEqual([
            "one",
            "two",
            "three",
            "four",
            "five"
        ])
    })
    it("skips blank lines and trims", () => {
        expect(parseChecklist("  a  \n\n   \n b ")).toEqual(["a", "b"])
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- board`
Expected: FAIL — cannot resolve `../src/renderer/src/board`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/board.ts`:

```ts
export type BoardColumn = "todo" | "doing" | "review" | "done"

export interface BoardTask {
    id: string
    projectId: string
    /** The task text — sent to the agent verbatim as its prompt on dispatch. */
    title: string
    column: BoardColumn
    /** Linked agent session once dispatched. */
    termId?: string
    /** Worktree path if dispatched isolated. */
    worktree?: string
    createdAt: number
}

export const COLUMNS: BoardColumn[] = ["todo", "doing", "review", "done"]

/** Filter tasks to a project and group them by column (insertion order preserved). */
export function tasksByColumn(tasks: BoardTask[], projectId: string): Record<BoardColumn, BoardTask[]> {
    const out: Record<BoardColumn, BoardTask[]> = { todo: [], doing: [], review: [], done: [] }
    for (const t of tasks) {
        if (t.projectId === projectId) out[t.column].push(t)
    }
    return out
}

/** Split pasted text into task titles, one per non-blank line, stripping list markers. */
export function parseChecklist(text: string): string[] {
    return text
        .split("\n")
        .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)]|\[[ xX]?\])\s*/, "").trim())
        .filter(Boolean)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- board`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/board.ts tests/board.test.ts
git commit -m "feat(board): pure task types + grouping/checklist helpers"
```

---

### Task 2: Store slice + actions + idle→Review hook

**Files:**
- Modify: `src/renderer/src/store.ts`

**Interfaces:**
- Consumes: `BoardTask`, `BoardColumn`, `parseChecklist` (Task 1); `git.worktreeAdd`, `newTab`, `setActiveProject`, `pty.input`, `sleep`, `newId`, `persist`, `pushActivity`.
- Produces (on `AppState`):
  - `boardTasks: BoardTask[]`
  - `addBoardTask: (projectId: string, title: string) => void`
  - `moveBoardTask: (id: string, column: BoardColumn) => void`
  - `removeBoardTask: (id: string) => void`
  - `dispatchBoardTask: (id: string, opts: { worktree: boolean }) => Promise<void>`
  - `"tasks"` added to `MainView`

- [ ] **Step 1: Add the import + MainView member**

At the top of `store.ts`, after the existing `reviewLenses` import line (`import { LENSES, reviewPrompt, type Lens } from "./reviewLenses"`), add:

```ts
import { parseChecklist, type BoardTask, type BoardColumn } from "./board"
```

Change the `MainView` type to include `tasks`:

```ts
export type MainView = "mission" | "tasks" | "terminal" | "editor" | "api" | "database" | "browser" | "network"
```

- [ ] **Step 2: Add `boardTasks` to the persisted slice (4 sites)**

In the `interface Persisted { … }` block, after `canvasLinks: CanvasLink[]`, add:

```ts
    boardTasks: BoardTask[]
```

In `writeNow()`'s saved object, after `canvasLinks: s.canvasLinks`, add:

```ts
            boardTasks: s.boardTasks,
```

In the initial state object (where defaults like `canvasLinks: []` live), after `canvasLinks: [],` add:

```ts
        boardTasks: [],
```

In `init()`'s `set({ … })` load block, after `canvasLinks: w.canvasLinks ?? []`, add:

```ts
                boardTasks: w.boardTasks ?? [],
```

- [ ] **Step 3: Declare the actions on `AppState`**

In the `AppState` interface, add these lines next to the other view/session actions (e.g. right after `setView: (view: MainView) => void`):

```ts
    boardTasks: BoardTask[]
    addBoardTask: (projectId: string, title: string) => void
    moveBoardTask: (id: string, column: BoardColumn) => void
    removeBoardTask: (id: string) => void
    dispatchBoardTask: (id: string, opts: { worktree: boolean }) => Promise<void>
```

- [ ] **Step 4: Add the idle → Review hook**

In `onPtyData`'s idle timer, change the idle line (currently
`if (get().agentStatus[id] === "working") setStatus(id, "idle")`) to also advance a linked task:

```ts
                    if (get().agentStatus[id] === "working") {
                        setStatus(id, "idle")
                        // A dispatched task whose agent just finished a turn is ready for review.
                        set((s) => ({
                            boardTasks: s.boardTasks.map((t) =>
                                t.termId === id && t.column === "doing" ? { ...t, column: "review" } : t
                            )
                        }))
                    }
```

- [ ] **Step 5: Implement the actions**

Add these to the store's returned object, next to `setView` (they use the in-scope `sleep`, `newId`, `persist`, `pushActivity`, and `get`/`set`):

```ts
        addBoardTask: (projectId, title) => {
            const titles = parseChecklist(title)
            if (titles.length === 0) return
            const now = Date.now()
            const created: BoardTask[] = titles.map((t) => ({
                id: newId(),
                projectId,
                title: t,
                column: "todo",
                createdAt: now
            }))
            set((s) => ({ boardTasks: [...s.boardTasks, ...created] }))
            persist()
        },

        moveBoardTask: (id, column) => {
            set((s) => ({
                boardTasks: s.boardTasks.map((t) => (t.id === id ? { ...t, column } : t))
            }))
            persist()
        },

        removeBoardTask: (id) => {
            set((s) => ({ boardTasks: s.boardTasks.filter((t) => t.id !== id) }))
            persist()
        },

        dispatchBoardTask: async (id, opts) => {
            const task = get().boardTasks.find((t) => t.id === id)
            if (!task) return
            const proj = get().projects.find((p) => p.id === task.projectId)
            if (!proj) return
            const agentId = useSettings.getState().agents[0]?.id ?? "claude"
            // newTab spawns into the active project — make sure it's this task's.
            await get().setActiveProject(proj.id)

            let worktreePath: string | undefined
            if (opts.worktree) {
                const res = await window.api.git.worktreeAdd(proj.path, task.title)
                if (!res.ok || !res.path) {
                    pushActivity("attention", "", `worktree failed: ${res.error ?? "error"}`)
                    return
                }
                worktreePath = res.path
            }
            const label = "task " + task.title.slice(0, 24)
            const termId = get().newTab(agentId, undefined, label, worktreePath)
            if (!termId) return
            set((s) => ({
                boardTasks: s.boardTasks.map((t) =>
                    t.id === id ? { ...t, column: "doing", termId, worktree: worktreePath } : t
                )
            }))
            persist()
            // Let the agent CLI boot, then send the task as its first prompt.
            await sleep(2800)
            window.api.pty.input(termId, task.title + "\r")
            set({ lastAgentTermId: termId })
        },
```

- [ ] **Step 6: Verify build + tests**

Run: `npx electron-vite build`
Expected: build succeeds (no TS errors).

Run: `npm test`
Expected: full suite green (226: prior 222 + Task 1's 4).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/store.ts
git commit -m "feat(board): persisted boardTasks slice + dispatch + idle→review hook"
```

---

### Task 3: TaskBoard view + wiring

**Files:**
- Create: `src/renderer/src/components/TaskBoard.tsx`
- Modify: `src/renderer/src/components/ViewKeys.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/components/CommandPalette.tsx`, `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `tasksByColumn`, `COLUMNS`, `BoardColumn` (Task 1); store `boardTasks`, `addBoardTask`, `moveBoardTask`, `removeBoardTask`, `dispatchBoardTask`, `jumpToTerm`, `openChanges`, `agentStatus`, `activeProject`.

- [ ] **Step 1: Create the view**

Create `src/renderer/src/components/TaskBoard.tsx`:

```tsx
import { useState } from "react"
import { useStore } from "../store"
import { tasksByColumn, COLUMNS, type BoardColumn } from "../board"

const COL_LABEL: Record<BoardColumn, string> = {
    todo: "Todo",
    doing: "Doing",
    review: "Review",
    done: "Done"
}

export function TaskBoard(): JSX.Element {
    const activeProject = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const boardTasks = useStore((s) => s.boardTasks)
    const agentStatus = useStore((s) => s.agentStatus)
    const addBoardTask = useStore((s) => s.addBoardTask)
    const moveBoardTask = useStore((s) => s.moveBoardTask)
    const removeBoardTask = useStore((s) => s.removeBoardTask)
    const dispatchBoardTask = useStore((s) => s.dispatchBoardTask)
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const openChanges = useStore((s) => s.openChanges)

    const [draft, setDraft] = useState("")
    const [worktree, setWorktree] = useState(true)

    if (!activeProject) {
        return (
            <div className="empty-state">
                <p>No project selected.</p>
            </div>
        )
    }

    const grouped = tasksByColumn(boardTasks, activeProject.id)
    const add = (): void => {
        if (draft.trim()) {
            addBoardTask(activeProject.id, draft)
            setDraft("")
        }
    }
    const idx = (c: BoardColumn): number => COLUMNS.indexOf(c)

    return (
        <div className="board">
            <div className="board-cols">
                {COLUMNS.map((col) => (
                    <div
                        key={col}
                        className="board-col"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            const id = e.dataTransfer.getData("text/board-task")
                            if (id) moveBoardTask(id, col)
                        }}
                    >
                        <div className="board-col-head">
                            <span className="section-label">{COL_LABEL[col]}</span>
                            <span className="muted small">{grouped[col].length}</span>
                        </div>

                        {col === "todo" && (
                            <div className="board-add">
                                <textarea
                                    className="board-add-input"
                                    placeholder="New task… (Ctrl+Enter to add; paste a checklist for many)"
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                            e.preventDefault()
                                            add()
                                        }
                                    }}
                                />
                                <div className="board-add-foot">
                                    <label className="board-wt">
                                        <input
                                            type="checkbox"
                                            checked={worktree}
                                            onChange={(e) => setWorktree(e.target.checked)}
                                        />
                                        worktree
                                    </label>
                                    <button className="accent" onClick={add} disabled={!draft.trim()}>
                                        Add
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="board-cards">
                            {grouped[col].map((t) => {
                                const status = t.termId ? agentStatus[t.termId] : undefined
                                return (
                                    <div
                                        key={t.id}
                                        className="board-card"
                                        draggable
                                        onDragStart={(e) => e.dataTransfer.setData("text/board-task", t.id)}
                                    >
                                        <div className="board-card-title">{t.title}</div>
                                        <div className="board-card-foot">
                                            {status && <span className={"tab-dot claude status-" + status} />}
                                            {t.column === "todo" && (
                                                <button
                                                    className="board-btn accent"
                                                    onClick={() => void dispatchBoardTask(t.id, { worktree })}
                                                >
                                                    Dispatch
                                                </button>
                                            )}
                                            {t.termId && (t.column === "doing" || t.column === "review") && (
                                                <button className="board-btn" onClick={() => jumpToTerm(t.termId!)}>
                                                    Jump
                                                </button>
                                            )}
                                            {t.column === "review" && (
                                                <button
                                                    className="board-btn"
                                                    onClick={() => openChanges(t.worktree ?? activeProject.path, t.title)}
                                                >
                                                    Diff
                                                </button>
                                            )}
                                            {idx(t.column) > 0 && (
                                                <button
                                                    className="board-btn"
                                                    data-tip="Move back"
                                                    onClick={() => moveBoardTask(t.id, COLUMNS[idx(t.column) - 1])}
                                                >
                                                    ‹
                                                </button>
                                            )}
                                            {idx(t.column) < COLUMNS.length - 1 && (
                                                <button
                                                    className="board-btn"
                                                    data-tip="Move forward"
                                                    onClick={() => moveBoardTask(t.id, COLUMNS[idx(t.column) + 1])}
                                                >
                                                    ›
                                                </button>
                                            )}
                                            <button
                                                className="board-btn board-del"
                                                data-tip="Delete"
                                                onClick={() => removeBoardTask(t.id)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Add the deck view**

In `src/renderer/src/components/ViewKeys.tsx`, add the `tasks` entry right after the `mission` entry in `DECK_VIEWS`:

```tsx
    { view: "mission", icon: "activity", name: "Mission" },
    { view: "tasks", icon: "list", name: "Tasks" },
    { view: "terminal", icon: "terminal", name: "Terminal" },
```

(Confirm `list` and `activity` exist in `Icon.tsx` — they do; used by the deck tools.)

- [ ] **Step 3: Mount the panel in App**

In `src/renderer/src/App.tsx`, add the import next to the other view imports:

```tsx
import { TaskBoard } from "./components/TaskBoard"
```

In the `panels` block, add a panel right after the Mission panel:

```tsx
                        <div className="panel" style={{ display: view === "tasks" ? "flex" : "none" }}>
                            <TaskBoard />
                        </div>
```

(The existing `Ctrl+1…9` handler already indexes `DECK_VIEWS`, so Tasks becomes `Ctrl+2` automatically — no keyboard change needed.)

- [ ] **Step 4: Command palette entry**

In `src/renderer/src/components/CommandPalette.tsx`, after the `act:search` push, add:

```tsx
        cmds.push({ id: "act:tasks", section: "Actions", title: "Task board", run: () => store.setView("tasks") })
```

- [ ] **Step 5: Add the board CSS**

Append to `src/renderer/src/styles.css`:

```css
/* ---------- Task board ---------- */
.board {
    height: 100%;
    width: 100%;
    overflow: hidden;
    padding: 14px 16px;
}
.board-cols {
    display: flex;
    gap: 12px;
    height: 100%;
    align-items: flex-start;
}
.board-col {
    flex: 1;
    min-width: 0;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg-2);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius, 8px);
    padding: 8px;
}
.board-col-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 2px 4px;
}
.board-add {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.board-add-input {
    resize: vertical;
    min-height: 44px;
    background: var(--bg-3);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius, 6px);
    padding: 6px 8px;
    font: inherit;
}
.board-add-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.board-wt {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
}
.board-wt input {
    accent-color: var(--accent);
}
.board-cards {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    min-height: 0;
}
.board-card {
    background: var(--panel);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius, 7px);
    padding: 8px 10px;
    cursor: grab;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.board-card-title {
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
}
.board-card-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}
.board-btn {
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: var(--radius, 6px);
    padding: 1px 8px;
    font-size: 12px;
    cursor: pointer;
}
.board-btn:hover {
    color: var(--text);
    border-color: var(--accent);
}
.board-btn.accent {
    background: var(--accent);
    color: var(--bg);
    border-color: transparent;
}
.board-del {
    margin-left: auto;
}
```

- [ ] **Step 6: Verify build + tests + real app**

Run: `npx electron-vite build`
Expected: build succeeds.

Run: `npm test`
Expected: 226 green.

Then run-app: press `Ctrl+2` (or the Tasks deck key). Add a task in Todo; use the `›`/`‹` buttons to move it across Todo→Doing→Review→Done; reload/relaunch and confirm it persisted. **Do not click Dispatch in the automated harness** — it spawns a real agent CLI and a git worktree; the dispatch path reuses the proven `startWork`/`newTab`/`worktreeAdd` primitives. (Drag-between-columns is a manual check — CDP can't drive HTML5 DnD.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/TaskBoard.tsx src/renderer/src/components/ViewKeys.tsx src/renderer/src/App.tsx src/renderer/src/components/CommandPalette.tsx src/renderer/src/styles.css
git commit -m "feat(board): Task Board view + deck view/palette wiring"
```

---

## Self-review

**Spec coverage:**
- Manual kanban + dispatch → Tasks 2 (`dispatchBoardTask`) + 3 (view). ✅
- New `tasks` deck view (Ctrl+2) → Task 2 (`MainView`) + 3 (ViewKeys/App). ✅
- Worktree default + per-card toggle → Task 3 (`worktree` state, default `true`) + 2 (`dispatchBoardTask({worktree})`). ✅
- Todo·Doing·Review·Done + auto-move to Review on idle → Task 1 (`COLUMNS`) + 2 (idle hook). ✅
- Review actions (Jump/Diff/→Done via `›`/Reopen via `‹`) → Task 3. ✅
- Persist in `workspace.json` → Task 2 (4-site `Persisted` wiring). ✅
- Reuse `startWork` pattern / `setActiveProject` before `newTab` → Task 2. ✅
- Error handling (no project, worktree fail, blank titles, closed session) → Task 3 (`!activeProject`, blank filtered by `parseChecklist`), Task 2 (`res.ok` guard, `jumpToTerm` guards), spec. ✅
- Tests: pure `board.ts` unit-tested; view via build + run-app → Tasks 1, 3. ✅

**Placeholder scan:** none — every code step is complete; the run-app step names concrete actions and explicitly defers Dispatch.

**Type consistency:** `BoardTask`/`BoardColumn`/`COLUMNS`/`tasksByColumn`/`parseChecklist` (Task 1) are consumed with matching signatures in Tasks 2 & 3; `dispatchBoardTask(id, { worktree })`, `moveBoardTask(id, column)`, `addBoardTask(projectId, title)` are declared (Task 2) and called (Task 3) identically; `newTab(agentId, undefined, label, worktreePath)` matches the real `newTab(agentId, initialCommand?, label?, cwd?, …)`; `worktreeAdd` result fields (`ok`/`path`/`error`) match preload's `WorktreeAddResult`.
