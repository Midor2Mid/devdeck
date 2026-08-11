# Agent Bake-Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dispatch one board card to two or three agents at once, each in its own git worktree; eliminate any whose gate command fails; let the user pick a survivor and land its diff onto the working tree for review.

**Architecture:** A new pure module `src/renderer/src/race.ts` holds the state machine, parsing and selectors with no React and no IPC, so all the logic is unit-testable. A `races` slice in the store owns the lifecycle and polling. Two new main-process git handlers do the work that must not cross IPC as data. One `RaceModal` renders it. The existing `worktreeAdd`, `newTab`, `checks.run`, `usage.window`, `worktreeRemove` and `openChanges` are reused unchanged.

**Tech Stack:** TypeScript, React 18, zustand, vitest, Electron.

**Spec:** `docs/superpowers/specs/2026-08-11-agent-bake-off-design.md`

## Global Constraints

- 4-space indentation, double quotes for strings.
- **No hard-coded colors or sizes in components** — design tokens only (`var(--muted)`, `var(--radius)`, …). The app ships 7 themes × 12 styles that re-bind the same custom properties; a literal would be the one element that never re-themes.
- **State shown in form, not colour alone** — a dot *and* a word, never colour on its own.
- **Exactly one accent in the frame**, marking the one actionable thing.
- **No emoji, no decorative Unicode in chrome.** Icons come from `src/renderer/src/components/Icon.tsx`.
- `npm run typecheck` must end at **zero errors** — the build does not typecheck, so nothing else catches this.
- `npx vitest run` must pass. Baseline is **497 tests**.
- A zustand selector returning a fresh array or object causes an infinite render loop that no test or typecheck catches. Select the stable slice and derive outside.
- Conventional commit messages.
- **Never run `npm run dev`** — live HMR on a mid-edit state crashes the dev process.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/renderer/src/race.ts` | Race/entrant types, state machine, shortstat parsing, selectors. Pure. | **Create** |
| `tests/race.test.ts` | Unit tests for all of the above. | **Create** |
| `src/main/git.ts` | `shortstat` and `landFrom` implementations. | Modify |
| `src/main/index.ts` | Two IPC handlers, both guarded. | Modify |
| `src/preload/index.ts` | Two `window.api.git` methods + types. | Modify |
| `src/renderer/src/store.ts` | `races` slice: start, poll, land, abandon. | Modify |
| `src/renderer/src/components/RaceModal.tsx` | The race UI. | **Create** |
| `src/renderer/src/components/TaskBoard.tsx` | A `Race` action on a todo card. | Modify |
| `src/renderer/src/App.tsx` | Mount `RaceModal`. | Modify |
| `src/renderer/src/styles.css` | `.race-*` rules. | Modify |

---

### Task 1: `race.ts` — types, state machine, parsing

Pure module. No React, no IPC, no `window`. Everything here is unit-testable.

**Files:**
- Create: `src/renderer/src/race.ts`
- Test: `tests/race.test.ts`

**Interfaces produced:**

```ts
export type EntrantStatus = "starting" | "working" | "gating" | "passed" | "failed" | "nocommit"
export interface Entrant { … }          // full shape in Step 3
export interface Race { … }
export const RACE_TIMEOUT_MS = 1_200_000
export const RACE_POLL_MS = 5000
export function parseShortstat(out: string): { added: number; removed: number }
export function entrantBranch(title: string, agentName: string, agentId: string): string
export function isTerminal(s: EntrantStatus): boolean
export function survivors(race: Race): Entrant[]
export function raceSettled(race: Race): boolean
export function raceSpend(race: Race): number
```

- [ ] **Step 1: Write the failing tests**

Create `tests/race.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import {
    parseShortstat,
    entrantBranch,
    isTerminal,
    survivors,
    raceSettled,
    raceSpend,
    type Entrant,
    type Race
} from "../src/renderer/src/race"

function ent(over: Partial<Entrant>): Entrant {
    return {
        agentId: "a", agentName: "Agent", worktree: "/w", branch: "b",
        baseHead: "1111111", status: "working", ...over
    }
}

function race(entrants: Entrant[]): Race {
    return {
        cardId: "c1", projectId: "p1", projectPath: "/proj", title: "add a button",
        gateCommand: "npm test", startedAt: 0, entrants
    }
}

describe("parseShortstat", () => {
    it("reads insertions and deletions", () => {
        expect(parseShortstat(" 3 files changed, 47 insertions(+), 3 deletions(-)")).toEqual({
            added: 47,
            removed: 3
        })
    })

    it("handles insertions only", () => {
        expect(parseShortstat(" 1 file changed, 12 insertions(+)")).toEqual({ added: 12, removed: 0 })
    })

    it("handles deletions only", () => {
        expect(parseShortstat(" 1 file changed, 5 deletions(-)")).toEqual({ added: 0, removed: 5 })
    })

    it("handles the singular forms git uses for one line", () => {
        expect(parseShortstat(" 1 file changed, 1 insertion(+), 1 deletion(-)")).toEqual({
            added: 1,
            removed: 1
        })
    })

    it("returns zeroes for empty or unrecognised output", () => {
        expect(parseShortstat("")).toEqual({ added: 0, removed: 0 })
        expect(parseShortstat("fatal: bad revision")).toEqual({ added: 0, removed: 0 })
    })
})

describe("entrantBranch", () => {
    it("combines the card title with the agent id", () => {
        expect(entrantBranch("Add pull button", "Claude", "claude-opus")).toBe(
            "Add pull button claude-opus"
        )
    })

    it("separates the built-in presets that share a prefix", () => {
        // claude / claude-opus / claude-yolo all start with "claude", so any
        // truncation of the id collapses the most likely race there is.
        const b = ["claude", "claude-opus", "claude-yolo"].map((id) => entrantBranch("card", "n", id))
        expect(new Set(b).size).toBe(3)
    })

    it("gives two agents on one card different branches", () => {
        // A collision would put two agents in one worktree and silently invalidate
        // both their cost figures — this is the test that matters most here.
        expect(entrantBranch("same card", "Opus", "id-1")).not.toBe(
            entrantBranch("same card", "Haiku", "id-2")
        )
    })

    it("separates two presets that share a name", () => {
        // AgentPreset.name is user-editable and duplicates are entirely plausible;
        // only the id is guaranteed unique, so the branch has to carry it.
        expect(entrantBranch("same card", "Claude", "id-1")).not.toBe(
            entrantBranch("same card", "Claude", "id-2")
        )
    })
})

describe("isTerminal", () => {
    it("is true only for finished states", () => {
        expect(isTerminal("passed")).toBe(true)
        expect(isTerminal("failed")).toBe(true)
        expect(isTerminal("nocommit")).toBe(true)
        expect(isTerminal("starting")).toBe(false)
        expect(isTerminal("working")).toBe(false)
        expect(isTerminal("gating")).toBe(false)
    })
})

describe("survivors", () => {
    it("returns only entrants that passed their gate", () => {
        const r = race([
            ent({ agentId: "x", status: "passed" }),
            ent({ agentId: "y", status: "failed" }),
            ent({ agentId: "z", status: "nocommit" }),
            ent({ agentId: "w", status: "working" })
        ])
        expect(survivors(r).map((e) => e.agentId)).toEqual(["x"])
    })

    it("is empty when everyone was eliminated", () => {
        expect(survivors(race([ent({ status: "failed" }), ent({ status: "nocommit" })]))).toEqual([])
    })
})

describe("raceSettled", () => {
    it("is true only when every entrant is terminal", () => {
        expect(raceSettled(race([ent({ status: "passed" }), ent({ status: "failed" })]))).toBe(true)
        expect(raceSettled(race([ent({ status: "passed" }), ent({ status: "gating" })]))).toBe(false)
    })

    it("is false for a race with no entrants", () => {
        // Nothing has finished because nothing started; "settled" would be a lie.
        expect(raceSettled(race([]))).toBe(false)
    })
})

describe("raceSpend", () => {
    it("totals what the race has cost so far", () => {
        expect(raceSpend(race([ent({ cost: 0.42 }), ent({ cost: 0.06 }), ent({})]))).toBeCloseTo(0.48, 5)
    })

    it("is zero before anything has been priced", () => {
        expect(raceSpend(race([ent({}), ent({})]))).toBe(0)
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/race.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/race.ts`:

```typescript
/**
 * Agent bake-off: race two or three agents on one card, each in its own worktree.
 *
 * Pure state and parsing only — no React, no IPC — so the whole state machine is
 * testable without Electron. The store owns the lifecycle; this module owns what
 * a race *is*.
 */

export type EntrantStatus =
    | "starting" // worktree made, session spawning
    | "working" // dispatched, no commit yet
    | "gating" // committed; gate command running
    | "passed" // gate exit 0 — a survivor
    | "failed" // gate non-zero — eliminated
    | "nocommit" // never committed inside the timeout

export interface Entrant {
    agentId: string
    agentName: string
    termId?: string
    worktree: string
    branch: string
    /** Worktree HEAD at dispatch. A change from this is the finish line. */
    baseHead: string
    head?: string
    status: EntrantStatus
    gateExit?: number
    gateMs?: number
    gateOutput?: string
    cost?: number
    costTokens?: number
    added?: number
    removed?: number
}

export interface Race {
    cardId: string
    projectId: string
    projectPath: string
    title: string
    gateCommand: string
    startedAt: number
    entrants: Entrant[]
}

/** How long an entrant gets to produce a commit before it is counted out. */
export const RACE_TIMEOUT_MS = 1_200_000

/** How often the poll checks worktree heads. */
export const RACE_POLL_MS = 5000

/**
 * Read `git diff --shortstat`. Git writes singular forms for one line ("1
 * insertion(+)"), and omits either clause entirely when it is zero.
 */
export function parseShortstat(out: string): { added: number; removed: number } {
    return {
        added: Number(out.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0),
        removed: Number(out.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0)
    }
}

/**
 * The branch argument for one entrant's worktree. Deliberately NOT slugged here:
 * `worktrees.addWorktree` already runs `safeBranch` over whatever it is given, and
 * a second naming scheme would be one more thing to keep in sync.
 *
 * The agent id is what guarantees two entrants differ, and it is used WHOLE. The
 * name alone is not enough — AgentPreset.name is user-editable and two presets
 * called "Claude" are entirely plausible. Nor is a prefix of the id: the built-in
 * presets are `claude`, `claude-opus` and `claude-yolo`, so any slice shorter than
 * the full string collapses the most likely race of all — Claude against Claude
 * Opus — into a single branch.
 *
 * A collision is not cosmetic. Two entrants sharing a branch share a worktree, and
 * cost here is attributed per directory, so both their figures become meaningless
 * while still rendering as if they were real. The ids are readable enough
 * (`claude-opus`) to serve as the branch's human label too.
 */
export function entrantBranch(title: string, agentName: string, agentId: string): string {
    return `${title} ${agentName}`
}

export function isTerminal(s: EntrantStatus): boolean {
    return s === "passed" || s === "failed" || s === "nocommit"
}

/** Entrants whose gate passed — the only ones the user may choose between. */
export function survivors(race: Race): Entrant[] {
    return race.entrants.filter((e) => e.status === "passed")
}

/** Every entrant finished. False for an empty race: nothing finished, nothing started. */
export function raceSettled(race: Race): boolean {
    return race.entrants.length > 0 && race.entrants.every((e) => isTerminal(e.status))
}

/** What the race has cost so far, across all entrants. */
export function raceSpend(race: Race): number {
    return race.entrants.reduce((sum, e) => sum + (e.cost ?? 0), 0)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/race.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/race.ts tests/race.test.ts
git commit -m "feat(race): race state machine, shortstat parsing and selectors"
```

---

### Task 2: The two main-process git operations

Both do work that must not cross IPC as data. `landFrom` reads a patch and applies
it entirely inside main — a large diff would otherwise be serialised through the
bridge for no reason.

**Files:**
- Modify: `src/main/git.ts` (add after `gitStatus`)
- Modify: `src/main/index.ts` (handlers, after the `guardRepo` definition around line 406)
- Modify: `src/preload/index.ts` (`git` object, after `pull`)

**Interfaces:**
- Consumes: nothing from Task 1 — this task is independent.
- Produces:
  - `export function shortstat(cwd: string, fromRef: string): Promise<string>` — raw git output; parsing lives in `race.ts`
  - `export function landFrom(worktree: string, baseHead: string, target: string): Promise<{ ok: boolean; error?: string }>`
  - `window.api.git.shortstat(cwd, fromRef)` and `window.api.git.landFrom(worktree, baseHead, target)`

- [ ] **Step 1: Implement in `src/main/git.ts`**

Add after `gitStatus`:

```typescript
/**
 * A ref we are willing to interpolate into an argv slot git may read as an option.
 *
 * Both functions below build `<ref>..HEAD` as a single argument. execFile does not
 * involve a shell, so there is no command injection — but a ref beginning with `-`
 * is still parsed by git as a FLAG, not a revision: `--output=/tmp/x` becomes
 * `--output=/tmp/x..HEAD`, a real `git diff` option that writes an attacker-chosen
 * file. guardRepo constrains the directory arguments and does nothing for this one.
 *
 * Every ref reaching these functions is a commit sha read out of `git worktree
 * list` (see parseWorktreeList), so requiring hex is exact rather than restrictive.
 */
export function isCommitSha(ref: string): boolean {
    return /^[0-9a-fA-F]{7,40}$/.test(ref)
}

/**
 * Diffing and applying are not status polls: on a large repo they take seconds,
 * and `OPTS`'s 4s leash would kill them. A timeout kill mid-`git apply` is the one
 * way that command can leave a partial tree, so the budget has to be generous.
 */
const SLOW_OPTS = { timeout: 60000, windowsHide: true } as const

/** Raw `git diff --shortstat <fromRef>..HEAD` for a worktree; "" on any failure. */
export function shortstat(cwd: string, fromRef: string): Promise<string> {
    return new Promise((resolve) => {
        if (!isCommitSha(fromRef)) {
            resolve("")
            return
        }
        execFile("git", ["diff", "--shortstat", `${fromRef}..HEAD`], { ...SLOW_OPTS, cwd }, (err, out) => {
            resolve(err ? "" : out.trim())
        })
    })
}

/**
 * Land a race entrant's work: take everything it committed in its worktree and
 * apply it to the target tree as unstaged changes.
 *
 * Both halves run here rather than in the renderer so a large patch never crosses
 * IPC. `--binary` so image and asset changes survive.
 *
 * Deliberately NOT `--3way`. Three-way apply implies `--index`, so on a conflict
 * git writes conflict markers into the working tree AND unmerged entries into the
 * index before exiting non-zero — leaving exactly the half-applied mess this
 * function must never produce, and reachable in the ordinary case where the target
 * branch moved on while the race ran. Plain `git apply` is all-or-nothing: it
 * either applies cleanly or touches nothing, which is the behaviour worth having
 * when the fallback is simply "the worktree is still there, look at it yourself".
 * It also leaves the work unstaged, which is the point of landing rather than
 * merging — you stage and describe the change instead of inheriting an agent's
 * commit — so no follow-up reset is needed.
 *
 * The clean-tree requirement is enforced HERE rather than trusted to the caller.
 * A precondition documented in one module and checked in another is a precondition
 * that eventually stops being checked.
 */
export function landFrom(
    worktree: string,
    baseHead: string,
    target: string
): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
        // See isCommitSha: a ref starting with "-" would be read by git as a flag.
        if (!isCommitSha(baseHead)) {
            resolve({ ok: false, error: "refusing to land from an unrecognised revision" })
            return
        }
        execFile("git", ["status", "--porcelain"], { ...OPTS, cwd: target }, (eDirty, dirty) => {
            if (eDirty) {
                resolve({ ok: false, error: "could not read the target repository" })
                return
            }
            if (dirty.trim()) {
                resolve({ ok: false, error: "the target working tree has uncommitted changes" })
                return
            }
            execFile(
                "git",
                ["diff", "--binary", `${baseHead}..HEAD`],
                // encoding "buffer" so the patch is never decoded as UTF-8 and
                // re-encoded on the way into stdin — a repo with cp1252 sources git
                // does not classify as binary would round-trip through U+FFFD and
                // land corrupted, which is precisely what --binary exists to prevent.
                { ...SLOW_OPTS, cwd: worktree, maxBuffer: 64 * 1024 * 1024, encoding: "buffer" },
                (err, patch) => {
                    if (err) {
                        const tooBig =
                            (err as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
                        resolve({
                            ok: false,
                            error: tooBig
                                ? "the winner's diff is too large to land"
                                : "could not read the winner's diff"
                        })
                        return
                    }
                    if (!patch.length) {
                        resolve({ ok: false, error: "the winner committed nothing to land" })
                        return
                    }
                    const child = execFile(
                        "git",
                        ["apply", "--whitespace=nowarn"],
                        { ...SLOW_OPTS, cwd: target },
                        (e2, _o, stderr) =>
                            resolve(
                                e2
                                    ? {
                                          ok: false,
                                          error:
                                              String(stderr || "").trim().split("\n")[0] ||
                                              "git apply failed"
                                      }
                                    : { ok: true }
                            )
                    )
                    // Without this, a child that dies before draining stdin (timeout
                    // kill, spawn failure, git missing) raises EPIPE on an unhandled
                    // stream — an uncaught exception in the Electron main process,
                    // which has no global handler.
                    child.stdin?.on("error", () => undefined)
                    child.stdin?.end(patch)
                }
            )
        })
    })
}
```

- [ ] **Step 2: Add the IPC handlers**

In `src/main/index.ts`, extend the import on line 13 with `shortstat` and `landFrom`, then add after the `git:pull` handler:

```typescript
    ipcMain.handle("git:shortstat", (_e, { cwd, fromRef }: { cwd: string; fromRef: string }) => {
        guardRepo(cwd)
        return shortstat(cwd, fromRef)
    })
    ipcMain.handle(
        "git:landFrom",
        (_e, { worktree, baseHead, target }: { worktree: string; baseHead: string; target: string }) => {
            // guardRepo alone is too weak here. It is pure string containment (see
            // files.isWithinRoots), so "both are inside some open project" would
            // still allow landing a patch into a DIFFERENT project, or into a
            // subdirectory — and git apply resolves patch paths relative to cwd, so
            // a subdirectory target silently nests the whole change one level down.
            // Require the target to BE a project root, and the worktree to belong to
            // that same project.
            const norm = (p: string): string => resolve(p).replace(/[\\/]+$/, "").toLowerCase()
            const roots = projects.listProjects().projects.map((p) => p.path)
            if (!roots.some((r) => norm(r) === norm(target)))
                throw new Error("Land target must be an open project root.")
            if (!files.isWithinRoots(worktree, [worktrees.worktreeBase(target)]))
                throw new Error("That worktree does not belong to this project.")
            return landFrom(worktree, baseHead, target)
        }
    )
```

- [ ] **Step 3: Expose in the preload**

In `src/preload/index.ts`, inside the `git` object after `pull`:

```typescript
        /** Raw `git diff --shortstat <fromRef>..HEAD`; parse it in the renderer. */
        shortstat: (cwd: string, fromRef: string): Promise<string> =>
            ipcRenderer.invoke("git:shortstat", { cwd, fromRef }),
        /** Apply everything committed in `worktree` since `baseHead` onto `target`. */
        landFrom: (
            worktree: string,
            baseHead: string,
            target: string
        ): Promise<{ ok: boolean; error?: string }> =>
            ipcRenderer.invoke("git:landFrom", { worktree, baseHead, target }),
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4b: Prove the ref guard**

**Export `isCommitSha`** and test it directly. Tests in this repo already import
main-process pure functions (`tests/git-parse.test.ts` imports from
`../src/main/worktrees`), so this is the established pattern, and a named, tested
guard is worth more than keeping it private.

Add to `tests/git-parse.test.ts`:

```typescript
describe("isCommitSha", () => {
    it("accepts the short and full shas git actually produces", () => {
        expect(isCommitSha("1a2b3c4")).toBe(true)
        expect(isCommitSha("0e375ccbc867f1e52fe81d169b211d7b08ccc655")).toBe(true)
        expect(isCommitSha("ABCDEF1")).toBe(true)
    })

    it("rejects anything git could read as an option", () => {
        // "--output=<file>" is a real git diff flag. Interpolated into
        // `${ref}..HEAD` it becomes "--output=/tmp/x..HEAD" and writes a file of
        // the caller's choosing — argument injection without a shell in sight.
        expect(isCommitSha("--output=/tmp/pwned")).toBe(false)
        expect(isCommitSha("-n")).toBe(false)
        expect(isCommitSha("--upload-pack=touch /tmp/x")).toBe(false)
    })

    it("rejects refs that are not shas at all", () => {
        expect(isCommitSha("HEAD")).toBe(false)
        expect(isCommitSha("main")).toBe(false)
        expect(isCommitSha("")).toBe(false)
        expect(isCommitSha("1a2b3c")).toBe(false) // too short to be a git short sha
        expect(isCommitSha("1a2b3c4z")).toBe(false)
    })
})
```

Note `resolve` must be added to the `path` import at the top of `src/main/index.ts`,
which currently imports only `join`.

- [ ] **Step 5: Verify the two operations against a real repo**

Four cases, all against a scratch repo outside DevDeck, all with real output recorded:

1. **Happy path** — worktree commits, land, target shows the change **unstaged**
   (`git diff --cached` empty, `git diff` non-empty).
2. **Conflict** — advance the target's own branch so the patch cannot apply, then
   land. Confirm it fails AND that the target is left **completely untouched**: no
   conflict markers in any file, `git status` clean, `git diff --cached` empty.
   This is the case that failed under `--3way`; it is the reason for this round and
   asserting it is not enough.
3. **Dirty target** — an uncommitted edit in the target, then land. Confirm it
   refuses with the uncommitted-changes error and changes nothing.
4. **Empty diff** — a worktree with no commits past base, then land. Confirm the
   "committed nothing to land" path.

These touch git, so prove them before building UI on top. In a scratch directory
(NOT the DevDeck repo), create a repo, make a worktree, commit a change in it, and
confirm `git diff --binary <base>..HEAD | git apply --3way` in the main tree
reproduces the change. Record the exact commands and output in the task report.

- [ ] **Step 6: Commit**

```bash
git add src/main/git.ts src/main/index.ts src/preload/index.ts
git commit -m "feat(race): shortstat and land-from-worktree git operations"
```

---

### Task 3: The `races` store slice

Owns the lifecycle: start, poll, land, abandon. This is the task with real
concurrency in it — read it fully before writing anything.

**Files:**
- Modify: `src/renderer/src/store.ts`

**Interfaces:**
- Consumes: everything exported from `race.ts` (Task 1); `window.api.git.shortstat` and `window.api.git.landFrom` (Task 2).
`races` is **runtime state only** — it is not added to the `Persisted` interface and
not written to workspace.json. If the app restarts mid-race the worktrees survive
and appear in the existing worktrees UI, which is a sufficient recovery story for
v1. `BoardTask` is **not** extended: its single `termId`/`worktree` pair describes a
normal dispatch and must keep meaning exactly that.

- Produces on the store:
  - `races: Record<string, Race>` — keyed by card id
  - `startRace(cardId: string, agentIds: string[], gateCommand: string): Promise<void>`
  - `landRaceWinner(cardId: string, agentId: string): Promise<void>`
  - `abandonRace(cardId: string): Promise<void>`
  - `raceCardId: string | null` + `openRace(cardId)` / `closeRace()` for the modal

- [ ] **Step 1: Add state and the start action**

`startRace` must, in this order:

1. Look up the card and its project; bail if either is missing.
2. `confirm({...})` naming the agents, the card and the gate command, and stating
   that this spends money N times — an accidental click here costs several times
   what a normal dispatch does. Bail on cancel.
3. `await get().setActiveProject(proj.id)` — `newTab` spawns into the *active*
   project, and this is why entrants cannot be started in parallel.
4. For each agent, **sequentially**:
   - `worktreeAdd(proj.path, entrantBranch(task.title, agent.name, agent.id))`; on failure
     record that entrant as `nocommit` with the error in `gateOutput` and continue
     with the others rather than aborting the whole race.
   - Read the new worktree's head via `window.api.git.worktrees(proj.path)` and
     store it as `baseHead`.
   - `newTab(agent.id, undefined, "race " + agent.name, worktreePath)`.
   - `await sleep(2800)` then `pty.input(termId, prompt + "\r")`, where the prompt
     is the card title plus, on its own line:
     `When you are finished, commit all your work in this worktree with a short message. Do not push.`
   - Set that entrant `working`.
5. Store the race and start the poll.

- [ ] **Step 2: Add the poll**

One interval per race at `RACE_POLL_MS`, held in a module-level
`Map<cardId, ReturnType<typeof setInterval>>` beside the existing timer maps —
**not** in the store, so it never triggers a render.

Each tick:

1. Skip entirely if `document.hidden` — matches how the rest of this app polls.
2. `const wts = await window.api.git.worktrees(race.projectPath)` — **one call for
   the whole race**. `parseWorktreeList` already returns every worktree with its
   head, so polling cost does not grow with the number of entrants.
3. For each entrant still `working`: if its worktree's head differs from
   `baseHead`, it committed. Set `gating`, then:
   - `const r = await window.api.checks.run(entrant.worktree, race.gateCommand)`
     — **the entrant's worktree, not the project root.** Running it at the root
     would verify the user's tree instead of the entrant's and score every entrant
     identically. This is the single most damaging thing to get wrong.
   - `passed` when `r.exitCode === 0`, else `failed`; keep `r.ms` and the first
     ~400 characters of `r.output` for display.
   - Then `usage.window(entrant.worktree, race.startedAt, Date.now())` for cost and
     `git.shortstat(entrant.worktree, entrant.baseHead)` → `parseShortstat` for the
     diffstat.
4. Any entrant still `working` past `RACE_TIMEOUT_MS` from `race.startedAt` becomes
   `nocommit`.
5. When `raceSettled(race)`, clear the interval. Leave the race in the store — the
   user still has to choose.

The shape of one tick, since this is where a subtle bug would live:

```typescript
const tick = async (cardId: string): Promise<void> => {
    if (document.hidden) return
    const r = get().races[cardId]
    if (!r) return
    // ONE call for the whole race: parseWorktreeList already returns every
    // worktree with its head, so polling cost does not grow with entrant count.
    const wts = await window.api.git.worktrees(r.projectPath).catch(() => [])
    const headOf = new Map(wts.map((w) => [w.path, w.head]))

    for (const e of r.entrants) {
        if (e.status !== "working") continue
        const head = headOf.get(e.worktree)
        if (head && head !== e.baseHead) {
            setEntrant(cardId, e.agentId, { status: "gating", head })
            // The ENTRANT'S worktree, never race.projectPath. Running the gate at
            // the project root verifies the user's tree instead of this entrant's
            // and scores every entrant identically.
            const res = await window.api.checks.run(e.worktree, r.gateCommand)
            setEntrant(cardId, e.agentId, {
                status: res.exitCode === 0 ? "passed" : "failed",
                gateExit: res.exitCode,
                gateMs: res.ms,
                gateOutput: (res.output || "").slice(0, 400)
            })
            const [usage, stat] = await Promise.all([
                window.api.usage.window(e.worktree, r.startedAt, Date.now()),
                window.api.git.shortstat(e.worktree, e.baseHead)
            ])
            setEntrant(cardId, e.agentId, {
                cost: usage.cost,
                costTokens: usage.tokens,
                ...parseShortstat(stat)
            })
        } else if (Date.now() - r.startedAt > RACE_TIMEOUT_MS) {
            setEntrant(cardId, e.agentId, { status: "nocommit" })
        }
    }
    if (raceSettled(get().races[cardId])) stopPoll(cardId)
}
```

`setEntrant(cardId, agentId, patch)` is a small local helper that rewrites one
entrant immutably inside `set()`. Note the loop re-reads nothing from `r` after
awaiting — each `setEntrant` goes through `set()` against current state, so a
stale `r` cannot clobber a concurrent update.

- [ ] **Step 3: Add land and abandon**

`landRaceWinner(cardId, agentId)`:

1. Refuse and report if `(await window.api.git.status(projectPath)).changes > 0` —
   landing onto a dirty tree makes a mixed working tree that cannot be unpicked.
2. `window.api.git.landFrom(winner.worktree, winner.baseHead, projectPath)`; stop
   and surface the error on failure, leaving every worktree in place so nothing is
   lost.
3. On success: remove **all** race worktrees (`worktreeRemove(projectPath, e.worktree, e.branch)`),
   clear the interval, delete the race, move the card to `review`, and
   `openChanges(projectPath, projectName)`.

`abandonRace(cardId)`: `confirm` naming what will be deleted, then close every
entrant's session, remove every worktree with its branch, clear the interval and
delete the race. This is the only exit that discards work.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run typecheck && npx vitest run`
Expected: zero errors; 497 + Task 1's new tests, all green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store.ts
git commit -m "feat(race): race lifecycle — start, poll, land, abandon"
```

---

### Task 4: `RaceModal`

**Files:**
- Create: `src/renderer/src/components/RaceModal.tsx`
- Modify: `src/renderer/src/components/TaskBoard.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: the store slice from Task 3; `survivors`, `raceSpend`, `raceSettled` from Task 1.
- Produces: no new exports beyond the component.

- [ ] **Step 1: The setup state**

With no race for this card yet, the modal is a short form: checkboxes for which
agent presets enter (AI-mode only — `agents.filter(a => a.runMode !== "normal")`,
memoised, **never filtered inside a `useStore` selector**), a text input for the
gate command prefilled from `settings.projectCommands[projectId]?.[0]?.command`, and
one accent `Start race` button. Two or three entrants; disable the button outside
that range.

- [ ] **Step 2: The running state**

One row per entrant:

```
● opus     committed   ✓ 18s    $0.42   +47 −3   [diff]
● haiku    working     …                          [jump]
○ sonnet   failed      ✗ exit 1 · 2 tests failed  [output]
```

- Status is a **dot plus a word** — colour alone would not survive a theme switch.
- Cost and diffstat in mono with `font-variant-numeric: tabular-nums`.
- `[diff]` calls `openChanges(entrant.worktree, entrant.agentName)`; the existing
  modal already takes a cwd and a label, so no new diff viewer is needed.
- `[jump]` calls `jumpToTerm(entrant.termId)`.
- A `nocommit` row reads **"no commit"**, never "failed" — an agent that ignored
  the instruction did not write bad code, and the row must not say it did.
- Header carries the gate command and the live `raceSpend` total, because a race
  costs several times one card and that should be visible while it happens.

- [ ] **Step 3: The footer**

Selecting a survivor row focuses it. **One** accent button — `Land <agent>` — in
the footer, plus a neutral `Abandon`. A Land button on each survivor would put two
accents on screen.

Disable Land with a stated reason when the project tree is dirty. When
`raceSettled` and `survivors` is empty, show no Land button and say plainly that
every entrant was eliminated, keeping the gate output visible — an all-failed race
is a useful result about the card, usually that it was underspecified.

- [ ] **Step 4: Wire it up**

- `TaskBoard.tsx`: a neutral `Race` button beside `Dispatch` on a `todo` card,
  calling `openRace(t.id)`. `Dispatch` keeps the accent — it stays the primary
  action.
- `App.tsx`: mount `<RaceModal />` alongside the other modals.
- `styles.css`: `.race-*` rules using existing tokens only. Check the
  `[data-style=...]` blocks for anything that overrides the selectors you reuse.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npm run typecheck && npx vitest run`
Expected: zero errors, all green.

- [ ] **Step 6: Verify in the running app**

There is no headless renderer, and a React render loop is invisible to both the
build and the typecheck — only running catches it.

```bash
npx electron-vite build
```

Use the **`run-app` skill**. Launch with an **isolated `userDataDir`** — the
default profile holds real projects and a live client agent session. Open the
board, open the race modal on a card, and screenshot the setup state. Confirm no
render loop and no console errors. Check **Slate and Washi**.

Do not start a real race in this step — that spends money. Task 5 covers the live
run deliberately and separately.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/RaceModal.tsx src/renderer/src/components/TaskBoard.tsx src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat(race): race modal, board action and styles"
```

---

### Task 5: One real race, end to end

Everything before this is verified in pieces. This is the only step that proves the
feature works, and it is the one that spends money — so it runs once, deliberately.

**Files:** none. Verification and documentation only.

- [ ] **Step 1: Run a real two-agent race**

Build, launch via the `run-app` skill against a **scratch git repo** you create for
the purpose — not the DevDeck repo and not a real project. Add a trivial card
("add a function that returns the sum of two numbers, with a test"), set the gate to
that repo's test command, and race two agent presets.

Watch for and record:
- both worktrees created with distinct branches;
- each entrant reaching `working`, then `gating` when it commits;
- the gate running **inside each worktree** — verify by making one agent's work
  fail the gate and confirming the other still passes;
- cost appearing per entrant, and the header total being their sum;
- landing a winner applying its diff to the scratch repo's tree as unstaged
  changes, and every race worktree being removed afterwards.

- [ ] **Step 2: Prove the dirty-tree refusal**

With an uncommitted change in the scratch repo, confirm Land is disabled and states
why. This guard is what stops a mixed working tree that cannot be unpicked.

- [ ] **Step 3: Record what you learned**

Append to `NOTES.md` under a dated heading: what worked, what the agents actually
did with the commit instruction, and any way an entrant lost on something other
than the merits. That last one is the known weakness in the spec and the live run
is the first real evidence about it.

- [ ] **Step 4: Commit**

```bash
git add NOTES.md
git commit -m "docs(notes): what the first real bake-off showed"
```

---

## Definition of done

- `npm run typecheck` at zero and `npx vitest run` fully green.
- A real two-agent race completes: both worktrees made, gates run in the right
  trees, one entrant eliminated on a genuine gate failure, per-entrant cost shown.
- Landing a winner leaves its changes unstaged in the target tree and removes every
  race worktree.
- Land refuses on a dirty tree, with the reason shown.
- The modal reads correctly in Slate and Washi, with no console errors and no
  render loop.
