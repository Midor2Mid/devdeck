# Run Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what each unit of agent work cost and produced, durably, so a race's or a pipeline's spend survives the thing that spent it — without ever summing costs that cannot honestly be added.

**Architecture:** A new main-process `src/main/ledger.ts` appends JSONL to `runs.jsonl` under `userData` — the app's first genuinely append-only store. A pure `src/renderer/src/ledgerView.ts` owns the summing and the exclusivity arithmetic. Four call sites in the store write a record at the moment a run ends. A Runs section in the existing usage panel displays it.

**Tech Stack:** TypeScript, Electron main process, React 18, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-run-ledger-design.md`

## Global Constraints

- 4-space indentation, double quotes for strings.
- **No hard-coded colours or sizes in components** — design tokens only; 7 themes × 12 styles re-bind them.
- **State in form, not colour alone.** Icons from `Icon.tsx`. No emoji. One accent per frame.
- `npm run typecheck` must end at **zero errors** — the build does not typecheck.
- `npx vitest run` must pass. Baseline is **655 tests**.
- **A zustand selector returning a fresh array or object causes an infinite render loop** that neither the build nor typecheck catches.
- Conventional commit messages. **Never run `npm run dev`.**
- **Never present a total that includes a non-exclusive cost.** `costInWindow` is an attribution over a directory and a window, not a receipt; two runs overlapping in one project each record both. Summing them is the confident-wrong-number failure this feature exists to avoid.
- Cost is estimated from a hardcoded rate table, not billed truth. Say so where figures are shown.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/main/ledger.ts` | Append/read/clear `runs.jsonl`; cap and rotation. | **Create** |
| `tests/ledger.test.ts` | Store behaviour with `electron` mocked. | **Create** |
| `src/renderer/src/ledgerView.ts` | Totals, exclusion arithmetic, formatting. Pure. | **Create** |
| `tests/ledgerView.test.ts` | Unit tests for the above. | **Create** |
| `src/main/index.ts` | IPC for append/read/clear. | Modify |
| `src/preload/index.ts` | `window.api.ledger.*` + types. | Modify |
| `src/renderer/src/store.ts` | Four write sites; exclusivity decision. | Modify |
| `src/renderer/src/components/UsagePanel.tsx` | The Runs section. | Modify |
| `src/renderer/src/styles.css` | `.runs-*` rules. | Modify |

---

### Task 1: `ledger.ts` — the append-only store

**Files:**
- Create: `src/main/ledger.ts`
- Test: `tests/ledger.test.ts`

**Interfaces produced:**

```ts
export type RunKind = "card" | "race" | "pipeline" | "session"
export interface RunRecord {
    id: string
    kind: RunKind
    projectId: string
    projectName: string
    label: string
    startedAt: number
    endedAt: number
    agentIds: string[]
    cost: number
    tokens: number
    exclusive: boolean
    outcome?: "landed" | "abandoned" | "done" | "failed" | "stopped"
    added?: number
    removed?: number
    winner?: string
    eliminated?: number
}
export const RUN_CAP = 5000
export const RUN_KEEP = 4000
export function appendRun(rec: RunRecord): void
export function readRuns(limit?: number): RunRecord[]
export function clearRuns(): void
```

Follow `src/main/aikeys.ts` for the file-location and error-handling shape — read it first — but **not** its read-whole/write-whole persistence. This store appends.

- [ ] **Step 1: Write the failing tests**

Create `tests/ledger.test.ts`, mocking `electron` exactly as `tests/aikeys.test.ts` does, including pointing `app.getPath("userData")` at a temp directory so tests never touch the real store. Read that file first and copy its mock setup.

```typescript
function rec(over: Partial<RunRecord> = {}): RunRecord {
    return {
        id: "r1", kind: "card", projectId: "p1", projectName: "Proj",
        label: "Fix the login redirect", startedAt: 1000, endedAt: 2000,
        agentIds: ["claude"], cost: 0.42, tokens: 1234, exclusive: true, ...over
    }
}

describe("appendRun / readRuns", () => {
    it("round-trips a record", () => {
        appendRun(rec())
        expect(readRuns()).toEqual([rec()])
    })

    it("returns newest first", () => {
        appendRun(rec({ id: "a", endedAt: 1 }))
        appendRun(rec({ id: "b", endedAt: 2 }))
        expect(readRuns().map((r) => r.id)).toEqual(["b", "a"])
    })

    it("honours a limit, taking the newest", () => {
        for (const id of ["a", "b", "c"]) appendRun(rec({ id }))
        expect(readRuns(2).map((r) => r.id)).toEqual(["c", "b"])
    })

    it("skips an unparseable line instead of throwing", () => {
        // The case that justifies JSONL: a crash mid-append leaves a torn final
        // line. Losing one record must not lose the file.
        appendRun(rec({ id: "good" }))
        appendFileSync(storePath(), '{"id":"torn","kind":"car\n')
        appendRun(rec({ id: "after" }))
        expect(readRuns().map((r) => r.id)).toEqual(["after", "good"])
    })

    it("returns empty when the file does not exist", () => {
        expect(readRuns()).toEqual([])
    })

    it("rotates once past the cap, keeping the most recent in order", () => {
        for (let i = 0; i < RUN_CAP + 5; i++) appendRun(rec({ id: `r${i}`, endedAt: i }))
        const all = readRuns()
        expect(all).toHaveLength(RUN_KEEP)
        expect(all[0].id).toBe(`r${RUN_CAP + 4}`)
    })

    it("clears", () => {
        appendRun(rec())
        clearRuns()
        expect(readRuns()).toEqual([])
    })
})
```

`storePath()` is a test-only export naming the file, so the torn-line test can write to it directly. Mark it as such in a comment.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/ledger.test.ts`

- [ ] **Step 3: Implement**

Points the implementation must honour:

- **Append with `appendFileSync`**, one `JSON.stringify(rec)` plus `"\n"` per record. Do not read the file to append.
- **`readRuns` skips unparseable lines** rather than throwing, and skips empty ones. A record missing required fields is also skipped — a half-written line that happens to parse must not become a row with `cost: undefined`.
- **Records are stored oldest-first** (append order) and **returned newest-first**, so the reader reverses. Sort by nothing — append order *is* the order; sorting by `endedAt` would reorder records written out of clock order and is not what "newest first" means here.
- **The cap rewrites once** when the line count exceeds `RUN_CAP`, keeping the last `RUN_KEEP` lines via `atomicWrite`. Check the count after appending, not before.
- Every filesystem call is wrapped; a failure logs and does not throw into a caller that is finishing a race.

- [ ] **Step 4: Tests, suite, typecheck**

Run: `npx vitest run tests/ledger.test.ts && npx vitest run && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/main/ledger.ts tests/ledger.test.ts
git commit -m "feat(ledger): append-only run record store"
```

---

### Task 2: `ledgerView.ts` — the arithmetic that must not lie

**Files:**
- Create: `src/renderer/src/ledgerView.ts`
- Test: `tests/ledgerView.test.ts`

**Interfaces:**
- Consumes: `RunRecord` from Task 1 (import the type only).
- Produces:

```ts
export interface RunTotals {
    /** Summed cost of exclusive runs only. */
    cost: number
    tokens: number
    /** How many rows contributed. */
    counted: number
    /** How many were left out because their cost was an attribution, not a receipt. */
    excluded: number
}
export function runTotals(runs: RunRecord[]): RunTotals
export function filterRuns(runs: RunRecord[], kind?: RunKind, projectId?: string): RunRecord[]
export function formatDuration(ms: number): string
```

- [ ] **Step 1: Write the failing tests**

```typescript
describe("runTotals", () => {
    it("sums only exclusive runs and reports the exclusions", () => {
        const t = runTotals([
            rec({ cost: 1, tokens: 10, exclusive: true }),
            rec({ cost: 2, tokens: 20, exclusive: true }),
            rec({ cost: 99, tokens: 990, exclusive: false })
        ])
        expect(t).toEqual({ cost: 3, tokens: 30, counted: 2, excluded: 1 })
    })

    it("reports zero with the exclusion count when nothing is eligible", () => {
        // Not an empty string, not a dash: the honest answer is $0 plus the
        // reason the rows on screen did not contribute to it.
        expect(runTotals([rec({ cost: 5, exclusive: false })])).toEqual({
            cost: 0, tokens: 0, counted: 0, excluded: 1
        })
    })

    it("is zero for no runs at all", () => {
        expect(runTotals([])).toEqual({ cost: 0, tokens: 0, counted: 0, excluded: 0 })
    })
})

describe("filterRuns", () => {
    it("filters by kind and by project independently and together", () => {
        const runs = [
            rec({ id: "a", kind: "card", projectId: "p1" }),
            rec({ id: "b", kind: "race", projectId: "p1" }),
            rec({ id: "c", kind: "card", projectId: "p2" })
        ]
        expect(filterRuns(runs, "card").map((r) => r.id)).toEqual(["a", "c"])
        expect(filterRuns(runs, undefined, "p1").map((r) => r.id)).toEqual(["a", "b"])
        expect(filterRuns(runs, "card", "p1").map((r) => r.id)).toEqual(["a"])
        expect(filterRuns(runs).map((r) => r.id)).toEqual(["a", "b", "c"])
    })
})

describe("formatDuration", () => {
    it("reads in the largest sensible unit", () => {
        expect(formatDuration(45_000)).toBe("45s")
        expect(formatDuration(90_000)).toBe("1m 30s")
        expect(formatDuration(3_700_000)).toBe("1h 1m")
    })
    it("never renders a negative or nonsense duration", () => {
        expect(formatDuration(-5)).toBe("0s")
        expect(formatDuration(NaN)).toBe("0s")
    })
})
```

- [ ] **Step 2–4: Fail, implement, verify**

Run the tests, confirm they fail, implement, confirm they pass, then `npx vitest run && npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ledgerView.ts tests/ledgerView.test.ts
git commit -m "feat(ledger): totals that exclude non-exclusive attributions"
```

---

### Task 3: IPC and the four write sites

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/store.ts`

- [ ] **Step 1: IPC and preload**

`ledger:append`, `ledger:read`, `ledger:clear` beside the existing `usage:*` handlers. Preload exposes `window.api.ledger.*` and **imports the `RunRecord` type from main** rather than restating it — the remote-hardening work found that a re-declared type across the preload boundary is exactly where a renamed field produces no error anywhere.

- [ ] **Step 2: The exclusivity decision**

Add one helper in the store, used by every write site:

```typescript
/**
 * Was this run's cost a receipt or an attribution? costInWindow sums every
 * transcript in a project directory over a window, so a second agent working in
 * the same directory is counted too. A worktree is its own directory, so a run
 * confined to one is exclusive by construction. Otherwise it is only exclusive
 * if nothing else was running in that directory.
 */
const wasExclusive = (cwd: string, ownTermId: string): boolean =>
    get().agentSessions().every((s) => s.termId === ownTermId || (termCwd[s.termId] ?? s.projectPath) !== cwd)
```

Read the real session/cwd accessors before writing this — the shape above is
illustrative, not verbatim. A run in its own worktree passes trivially because no
other session shares that path.

This is a **snapshot at the end of the run**, which is an approximation: a session
that overlapped and closed before the end is missed. Say so in the comment. It is
the honest side of the error — it can only mark something exclusive that was
briefly shared, never the reverse — and it is far better than not asking.

- [ ] **Step 3: The four sites**

| Kind | Where | Notes |
| --- | --- | --- |
| `card` | Where a card's column becomes `"done"` and `endedAt` is stamped | Use the card's existing cost fields; do not re-read. |
| `race` | `landRaceWinner` and `abandonRace`, **before** the race is deleted | One record: summed entrant costs, `winner`, `eliminated`, outcome `landed`/`abandoned`. Every entrant has its own worktree, so `exclusive: true` by construction — assert that rather than computing it. |
| `pipeline` | Where a run reaches a terminal status | Read `usage.window(projectPath, startedAt, now)` once and record it; the bar's figure is currently discarded. |
| `session` | Where an agent pane closes and `logUsageEnd` fires | Pairs with `usageLog`, carrying the cost that log omits. |

**A failure to write a record must never break the run it describes.** Wrap each
call; a ledger that throws inside `landRaceWinner` would cost the user their work
to record that they had it.

- [ ] **Step 4: Typecheck and suite**

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/store.ts
git commit -m "feat(ledger): record a run when it ends"
```

---

### Task 4: The Runs section

**Files:**
- Modify: `src/renderer/src/components/UsagePanel.tsx`, `src/renderer/src/styles.css`

- [ ] **Step 1: The section**

In the existing usage panel, which already explains that cost is estimated. Newest
first: date, kind, label, project, agents, duration, cost. Filters for kind and
project. No charts — the panel already has by-model and by-day.

**The total is the part that must be right.** Show the exclusive total, and next to
it the excluded count in words: "12 runs · $4.18 · 3 excluded from the total
(shared a project with another session)". When nothing is eligible, show `$0` and
the reason — never a blank or a dash.

**A non-exclusive row must be legible as an attribution**, in form and not colour
alone: mark the figure itself (a `~` prefix, a distinct label) so it cannot be read
as a number you could add up.

Memoise the filter and the totals over the stable runs array; never call
`runTotals` or `filterRuns` inside a `useStore`/`useSettings` selector.

- [ ] **Step 2: Typecheck, suite, and the app**

`npm run typecheck && npx vitest run`, then `npx electron-vite build` and verify
with the **`run-app` skill** using an **isolated `userDataDir`**. Seed a few records
directly into `runs.jsonl` — including at least one non-exclusive — and confirm the
total excludes it and says so. Check **Slate and Washi**.

`Page.captureScreenshot` times out in this environment; `Runtime.evaluate` +
`getComputedStyle` is the working fallback.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/UsagePanel.tsx src/renderer/src/styles.css
git commit -m "feat(ledger): the Runs section"
```

---

### Task 5: Document

**Files:** `CHANGELOG.md` (Unreleased), `NOTES.md`.

- [ ] **Step 1**

The changelog says what a user gets: a race's or pipeline's cost now survives the
run. State plainly that **totals exclude runs that shared a project with another
session**, and why — because that cost is an attribution over a directory, not a
receipt, and adding those numbers would double-count.

`NOTES.md`: record that this is the app's first append-only store and why JSONL
rather than the read-whole/write-whole pattern everything else uses; that
exclusivity is a snapshot at run end and therefore misses a session that
overlapped and closed early; and that cost-aware routing is now possible but
deliberately not built.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md NOTES.md
git commit -m "docs: record the run ledger"
```

---

## Definition of done

- `npm run typecheck` at zero, `npx vitest run` green.
- A race's cost survives landing or abandoning it; a pipeline's survives finishing.
- Deleting a card does not delete its record.
- **No total anywhere includes a non-exclusive cost**, and the excluded count is
  always stated alongside.
- A torn final line in `runs.jsonl` costs one record, not the file.
