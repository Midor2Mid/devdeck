# Supervision Cockpit (measurement first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DevDeck's agent signals mean what they say — a one-second pause must stop being filed as "finished a turn", a terminal-title escape must stop being filed as "needs you", and a stalled agent must actually be detectable — then let the deck say the app is a supervision cockpit by emphasis alone.

**Architecture:** Nothing in this plan edits the `AgentStatus` enum, the idle-timer transition, or `MainView`. Those are read as control flow by `waitForIdle` (an unbounded loop), by the deck badge, by inbox ordering, and by the mobile web client served from `main/server.ts` — editing them is a separate, deliberate follow-up. Instead, per-session facts (`quiet`, new-changes-since-launch) are derived in module-level state outside the store, the way `missionTail.ts` already does it, and consumed by the one caller that is currently wrong: the `doing → review` card auto-move.

**Tech Stack:** TypeScript, React, zustand, vitest. Renderer-side modules with no `electron` import stay directly unit-testable.

## Global Constraints

- 4-space indentation, double quotes.
- `npm run typecheck` must stay at **zero errors**. The build does not typecheck.
- `npx vitest run` must stay green. Baseline is **744 tests**; the count must rise.
- **Do not run `npm run dev`** — live HMR on a mid-edit state crashes the dev process.
- Do not launch the app; the controller owns the `run-app` verification pass.
- **No write path may gain an `await` that blocks it, and none may throw.** The card auto-move sits inside a pty data handler.
- Do not change the **`AgentStatus` enum**, the **status values the idle timer sets** (`waiting`/`idle` at `store.ts:611-618`), `waitForIdle`, or `MainView`. If a task seems to require it, stop and report.
  - Task 5 *does* edit the card-move block at `store.ts:619-623`, which sits inside that same timer callback. That is intended: the constraint is about the **status transition's semantics**, which `waitForIdle` and the mobile client read, not about those line numbers. Leave the `setStatus(id, away ? "waiting" : "idle")` call and its condition untouched; change only what happens to the card.
- Renderer modules must not import `electron`. Use `window.api`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/renderer/src/missionTail.ts` | modify — owns escape-sequence knowledge and per-session output timing. Gains `hasBell`, a launch stamp, and a rewritten `isStalled`. |
| `src/renderer/src/agentSignals.ts` | **create** — per-session change baselines and the pure "did this agent produce anything" derivation. No electron, no store. |
| `src/renderer/src/store.ts` | modify — call the new stamp/baseline on agent launch; re-key the card auto-move; use `hasBell` instead of a raw `\x07` test. |
| `src/renderer/src/settings.ts` | modify — clamp `agentIdleMs` in the setter and on load. |
| `src/renderer/src/components/SettingsModal.tsx` | modify — remove the unenforced 5s cap. |
| `src/renderer/src/components/ViewKeys.tsx` | modify — group separator in the deck. |
| `src/renderer/src/styles.css` | modify — the separator's one rule. |
| `tests/missionTail.test.ts` | modify — bell detection, launch stamp, rewritten `isStalled`. |
| `tests/agentSignals.test.ts` | **create** |
| `tests/settings.test.ts` or a new `tests/idleClamp.test.ts` | clamp tests (follow whichever the repo already uses for settings) |

---

### Task 1: Stop terminal titles from reading as "needs you"

`store.ts:594` tests `data.includes("\x07")` on the raw pty chunk. But `missionTail.ts:7` already encodes that `\x07` is how an **OSC sequence terminates** (`/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g`). An agent setting its terminal title (`ESC ] 0 ; title BEL`) therefore marks itself as needing attention. Claude Code sets terminal titles.

A per-chunk strip is not enough: pty chunks split anywhere, so an `ESC ]` can arrive in one chunk and its terminating `\x07` in the next. `hasBell` therefore keeps a per-session "inside an unterminated OSC" flag, mirroring how `recordTail` keeps per-id state.

**Files:**
- Modify: `src/renderer/src/missionTail.ts`
- Modify: `src/renderer/src/store.ts:594`
- Test: `tests/missionTail.test.ts`

**Interfaces:**
- Produces: `export function hasBell(id: string, chunk: string): boolean` — true only for a real BEL, never for an OSC terminator. Stateful per `id`; cleared by `forgetTail(id)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/missionTail.test.ts` (import `hasBell` and `forgetTail`):

```ts
describe("hasBell", () => {
    it("detects a real bell", () => {
        expect(hasBell("t1", "done\x07")).toBe(true)
        forgetTail("t1")
    })
    it("ignores the BEL that terminates an OSC title sequence", () => {
        expect(hasBell("t2", "\x1b]0;my-project\x07")).toBe(false)
        forgetTail("t2")
    })
    it("ignores an OSC split across chunks", () => {
        expect(hasBell("t3", "\x1b]0;my-pro")).toBe(false)
        expect(hasBell("t3", "ject\x07")).toBe(false)
        forgetTail("t3")
    })
    it("still sees a real bell after a split OSC closes", () => {
        expect(hasBell("t4", "\x1b]0;title")).toBe(false)
        expect(hasBell("t4", "\x07ding\x07")).toBe(true)
        forgetTail("t4")
    })
    it("sees a bell alongside an OSC in one chunk", () => {
        expect(hasBell("t5", "\x1b]0;title\x07\x07")).toBe(true)
        forgetTail("t5")
    })
    it("does not leak state between sessions", () => {
        expect(hasBell("t6", "\x1b]0;open")).toBe(false)
        expect(hasBell("t7", "\x07")).toBe(true)
        forgetTail("t6")
        forgetTail("t7")
    })
})
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: FAIL — `hasBell is not a function`.

- [ ] **Step 3: Implement `hasBell` in `missionTail.ts`**

> **The code below is WRONG and was superseded during implementation. Do not copy
> it — read the shipped `hasBell` in `src/renderer/src/missionTail.ts` instead.**
>
> It shipped in `f990ce9` and took two fix rounds (`dd20a62`, `25ea28c`) to
> correct. All three defects were the same shape — **a two-byte decision made
> with fewer than two bytes in hand**:
>
> 1. A split *opener* (`ESC` ends a chunk, `]` starts the next) went unrecognised,
>    so the OSC's terminating BEL read as a bell — the exact false positive this
>    task exists to remove.
> 2. A split *ST terminator* (`ESC` then `\`) left the session stuck open, and the
>    next genuine bell was swallowed as a phantom terminator — a false negative,
>    which is worse: a blocked agent is never flagged.
> 3. A zero-length chunk arriving mid-pairing discarded the carried `ESC`,
>    reopening both classes above.
>
> The fix carries a `pendingEsc` flag across chunks alongside the in-OSC flag, and
> resolves it only when there is actually a byte to resolve against. Each of the
> three was found by a reviewer **executing** the function; none was caught by
> reading it, including by me when I wrote this block.

Add beside the other module Maps (near `const lastAt = new Map<string, number>()`):

```ts
// True while a chunk ended inside an OSC sequence whose terminator has not
// arrived yet. Pty chunks split anywhere, so the BEL that closes an OSC can
// land in the *next* chunk — and a bare BEL is the only thing that means
// "the agent wants you".
const inOsc = new Map<string, boolean>()

/**
 * Does this chunk contain a real BEL — as opposed to the BEL that terminates an
 * OSC escape (a terminal-title set, an OSC 8 hyperlink)? Stateful per session so
 * an OSC split across chunks is not mistaken for a bell. Cleared by forgetTail.
 */
export function hasBell(id: string, chunk: string): boolean {
    let open = inOsc.get(id) ?? false
    let bell = false
    for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i]
        if (open) {
            // OSC ends at BEL or ST (ESC \). Either way it is not a bell.
            if (c === "\x07") open = false
            else if (c === "\x1b" && chunk[i + 1] === "\\") {
                open = false
                i++
            }
            continue
        }
        if (c === "\x1b" && chunk[i + 1] === "]") {
            open = true
            i++
            continue
        }
        if (c === "\x07") bell = true
    }
    inOsc.set(id, open)
    return bell
}
```

Then extend `forgetTail` so the flag does not leak:

```ts
export function forgetTail(id: string): void {
    // …existing deletes…
    inOsc.delete(id)
}
```

- [ ] **Step 4: Use it in the store**

In `src/renderer/src/store.ts`, add `hasBell` to the existing `missionTail` import, then change line 594 from:

```ts
        if (data.includes("\x07") && !visible) {
```

to:

```ts
        if (hasBell(id, data) && !visible) {
```

Leave the `!visible` guard and everything inside the branch exactly as they are.

- [ ] **Step 5: Verify**

Run: `npx vitest run` (expect 744 + 6 green) and `npm run typecheck` (zero).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/missionTail.ts src/renderer/src/store.ts tests/missionTail.test.ts
git commit -m "fix(agents): a terminal title is not a request for attention"
```

---

### Task 2: Make the idle threshold a real bound

`agentIdleMs` defaults to `1000` (`settings.ts:382`). Settings shows `min=300 max=5000` — but that is an HTML attribute only: `setAgentIdleMs` (`settings.ts:841-844`) does not clamp, the loader (`settings.ts:750`) does not clamp, and an emptied number field yields `Number("") === 0`, which would make every agent instantly "finished".

The spec removes the 5s ceiling (it was a correctness input only by accident) but the value must be a sane number.

**Files:**
- Modify: `src/renderer/src/settings.ts`
- Modify: `src/renderer/src/components/SettingsModal.tsx:1101-1108`
- Test: `tests/settings.test.ts` if it exists, else create `tests/idleClamp.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function clampIdleMs(ms: unknown): number` — exported from `settings.ts`, used by the setter and the loader.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest"
import { clampIdleMs, IDLE_MIN, IDLE_MAX, DEFAULT_IDLE_MS } from "../src/renderer/src/settings"

describe("clampIdleMs", () => {
    it("keeps a sane value", () => {
        expect(clampIdleMs(2500)).toBe(2500)
    })
    it("floors below the minimum", () => {
        expect(clampIdleMs(0)).toBe(IDLE_MIN)
        expect(clampIdleMs(-1)).toBe(IDLE_MIN)
    })
    it("caps absurd values", () => {
        expect(clampIdleMs(9_999_999)).toBe(IDLE_MAX)
    })
    it("falls back to the default for junk", () => {
        expect(clampIdleMs(Number.NaN)).toBe(DEFAULT_IDLE_MS)
        expect(clampIdleMs(undefined)).toBe(DEFAULT_IDLE_MS)
        expect(clampIdleMs("1200")).toBe(DEFAULT_IDLE_MS)
    })
    it("rounds to a whole millisecond", () => {
        expect(clampIdleMs(1500.7)).toBe(1501)
    })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/idleClamp.test.ts`
Expected: FAIL — `clampIdleMs is not a function`.

- [ ] **Step 3: Implement**

In `settings.ts`, near the `DEFAULTS` block:

```ts
export const IDLE_MIN = 300
// No practical ceiling — this is "how long before we call an agent quiet", not a
// claim that it finished. Bounded only so a typo cannot disable the signal.
export const IDLE_MAX = 600_000
export const DEFAULT_IDLE_MS = 1000

/** A usable idle threshold, whatever the input. Junk falls back to the default. */
export function clampIdleMs(ms: unknown): number {
    if (typeof ms !== "number" || !Number.isFinite(ms)) return DEFAULT_IDLE_MS
    return Math.min(IDLE_MAX, Math.max(IDLE_MIN, Math.ceil(ms)))
}
```

Use `DEFAULT_IDLE_MS` for the `agentIdleMs` entry in `DEFAULTS`, then apply the clamp in both places:

```ts
        setAgentIdleMs: (ms) => {
            set({ agentIdleMs: clampIdleMs(ms) })
            persist()
        },
```

and at `settings.ts:750`:

```ts
                    agentIdleMs: clampIdleMs(raw.agentIdleMs),
```

- [ ] **Step 4: Remove the unenforced cap in the UI**

In `SettingsModal.tsx`, drop `max={5000}` from the idle input and relabel so it stops implying doneness:

```tsx
                    <label>Quiet after (ms)</label>
                    <input
                        type="number"
                        min={300}
                        step={100}
                        value={agentIdleMs}
                        onChange={(e) => setAgentIdleMs(Number(e.target.value))}
                    />
```

- [ ] **Step 5: Verify**

Run: `npx vitest run` and `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git commit -am "fix(settings): actually clamp the agent idle threshold"
```

---

### Task 3: Make a stalled agent detectable

`isStalled` (`missionTail.ts:253`) has never returned true, for two independent reasons:

1. It requires `status === "working"`, but `working` cannot survive `agentIdleMs` (1s by default) — the timer flips it to `waiting`/`idle` long before `STALL_MS` (120s).
2. It requires `!!lastAt`, and `lastAt` is only stamped by `recordTail` on **actual output**. A session that launches and emits nothing — crashed CLI, missing binary — has `lastAt === undefined` and returns `false`. That is precisely the case a stall signal is for.

Fix both: stop reading the enum (which this plan must not change) and read liveness plus quiet duration instead; and stamp `lastAt` at launch so "emitted nothing since launch" is measurable.

`tests/missionTail.test.ts` currently asserts the old signature. Those assertions change **deliberately** — the behaviour they pin is the bug.

**Files:**
- Modify: `src/renderer/src/missionTail.ts`
- Modify: `src/renderer/src/store.ts` (launch stamp)
- Test: `tests/missionTail.test.ts`

**Interfaces:**
- Consumes: `forgetTail` already clears per-session state (Task 1 extended it).
- Produces:
  - `export function markLaunched(id: string, now?: number): void` — stamps `lastAt` so a session that never emits is still measurable.
  - `export function isStalled(lastAt: number | undefined, alive: boolean, now: number, thresholdMs?: number): boolean` — **signature change**, no longer takes `AgentStatus`.

- [ ] **Step 1: Rewrite the tests**

Replace the existing `isStalled` describe block in `tests/missionTail.test.ts` with:

```ts
describe("isStalled", () => {
    const now = 1_000_000
    it("flags a live session quiet past the threshold", () => {
        expect(isStalled(now - 10 * 60000, true, now, 2 * 60000)).toBe(true)
    })
    it("does not flag a session that spoke recently", () => {
        expect(isStalled(now - 30000, true, now, 2 * 60000)).toBe(false)
    })
    it("does not flag a dead session", () => {
        // Nothing to check on: the pane is gone, not stuck.
        expect(isStalled(now - 10 * 60000, false, now, 2 * 60000)).toBe(false)
    })
    it("flags a session that launched and never emitted anything", () => {
        // The crashed-CLI case, unreachable before markLaunched: lastAt is the
        // launch instant rather than undefined, so silence is measurable.
        expect(isStalled(now - 10 * 60000, true, now, 2 * 60000)).toBe(true)
    })
    it("cannot judge a session with no timestamp at all", () => {
        expect(isStalled(undefined, true, now, 2 * 60000)).toBe(false)
    })
})

describe("markLaunched", () => {
    it("stamps a last-output time so silence is measurable from launch", () => {
        markLaunched("boot", 5000)
        expect(getLastAt("boot")).toBe(5000)
        forgetTail("boot")
    })
    it("does not clobber a real output time", () => {
        markLaunched("boot2", 5000)
        recordTail("boot2", "hello")
        const after = getLastAt("boot2")
        markLaunched("boot2", 6000)
        expect(getLastAt("boot2")).toBe(after)
        forgetTail("boot2")
    })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: FAIL — `markLaunched is not a function`, plus arity errors on `isStalled`.

- [ ] **Step 3: Implement**

In `missionTail.ts`, replace `isStalled` with:

```ts
/**
 * A live session that has produced no output for longer than `thresholdMs` is
 * stalled — stuck in a loop, waiting on something that will not arrive, or dead
 * without exiting.
 *
 * This deliberately does NOT read AgentStatus. `working` cannot survive
 * `agentIdleMs` (1s by default), so a status-based stall check could never fire;
 * quiet duration plus liveness can. `lastAt` is stamped at launch by
 * markLaunched, so a session that crashed before printing anything still counts.
 */
export function isStalled(
    lastAt: number | undefined,
    alive: boolean,
    now: number,
    thresholdMs = STALL_MS
): boolean {
    return alive && !!lastAt && now - lastAt > thresholdMs
}

/**
 * Stamp a launch instant, so "has emitted nothing since it started" is a
 * measurable silence rather than an unknown. Never overwrites a real output
 * time — recordTail always wins.
 */
export function markLaunched(id: string, now = Date.now()): void {
    if (!lastAt.has(id)) lastAt.set(id, now)
}
```

- [ ] **Step 4: Stamp at launch, and fix the one existing caller**

In `store.ts`, inside the `if (isAgentId(agentId))` block that follows the `newTab` `set(...)` (beside the existing `pushActivity("start", …)` call at roughly `store.ts:2364`):

```ts
                markLaunched(termId)
```

Add `markLaunched` to the `missionTail` import. Then find the existing `isStalled(` call site (Mission Control's tile marker) and update it to the new signature, passing whether the session is still live — a session is live when `termAgents[termId]` is present.

Run `npm run typecheck` to locate every call site; there should be exactly one outside tests.

- [ ] **Step 5: Verify**

Run: `npx vitest run` and `npm run typecheck` (zero errors — the signature change must not leave a stale caller).

- [ ] **Step 6: Commit**

```bash
git commit -am "fix(agents): make a stalled agent detectable at all"
```

---

### Task 4: Know whether an agent actually produced anything

The card auto-move currently treats one second of silence as "finished a turn". Replacing that needs evidence the agent *did* something, and `git status` alone is not evidence: `listChanges` (`main/changes.ts:69`) has no baseline, so in a project that was already dirty every agent looks productive forever. `MissionControl.tsx:236` already admits the app cannot tell AI-written changes from hand-written ones.

So capture the changed-path set when a session starts, and compare later. This task is the module and its pure core only — nothing consumes it yet.

**Files:**
- Create: `src/renderer/src/agentSignals.ts`
- Modify: `src/renderer/src/store.ts` (capture on launch, clear on forget)
- Test: `tests/agentSignals.test.ts`

**Interfaces:**
- Consumes: `window.api.git.changes(cwd): Promise<ChangeFile[]>` (`preload/index.ts:640`). `ChangeFile` has a `path` field.
- Produces:
  - `export function newPathsSince(baseline: ReadonlySet<string> | undefined, current: readonly string[]): string[]` — pure; paths present now and not at baseline. An **unknown** baseline yields `[]`, never everything.
  - `export function captureBaseline(id: string, cwd: string): void` — fire-and-forget; never throws, never blocks.
  - `export function baselineOf(id: string): ReadonlySet<string> | undefined`
  - `export function forgetSignals(id: string): void`

- [ ] **Step 1: Write the failing tests**

`tests/agentSignals.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newPathsSince } from "../src/renderer/src/agentSignals"

describe("newPathsSince", () => {
    it("reports a path that appeared after the baseline", () => {
        expect(newPathsSince(new Set(["a.ts"]), ["a.ts", "b.ts"])).toEqual(["b.ts"])
    })
    it("ignores dirt that was already there", () => {
        // The dominant false positive: a project dirty before the agent started.
        expect(newPathsSince(new Set(["a.ts", "b.ts"]), ["a.ts", "b.ts"])).toEqual([])
    })
    it("treats an unknown baseline as no evidence, not as everything", () => {
        expect(newPathsSince(undefined, ["a.ts", "b.ts"])).toEqual([])
    })
    it("handles an empty baseline in a clean repo", () => {
        expect(newPathsSince(new Set(), ["new.ts"])).toEqual(["new.ts"])
    })
    it("does not report a path that disappeared", () => {
        expect(newPathsSince(new Set(["a.ts"]), [])).toEqual([])
    })
    it("returns paths in the order given", () => {
        expect(newPathsSince(new Set(), ["z.ts", "a.ts"])).toEqual(["z.ts", "a.ts"])
    })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/agentSignals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `agentSignals.ts`**

```ts
/**
 * Per-session evidence that an agent actually produced something.
 *
 * `git status` on its own is not that evidence: it has no baseline, so in a
 * project that was already dirty every agent reads as productive forever. We
 * therefore snapshot the changed-path set when a session starts and compare
 * against it later.
 *
 * Baselines live in a module Map rather than the store, like missionTail's
 * tails: the pty stream must never churn React state.
 */

const baselines = new Map<string, ReadonlySet<string>>()

/**
 * Paths dirty now that were not dirty when the session started.
 *
 * An UNKNOWN baseline returns [] — no evidence — never the whole list. Failing
 * closed matters here: the alternative marks every agent in a dirty repo as
 * having done work, which is the exact noise this module exists to prevent.
 */
export function newPathsSince(
    baseline: ReadonlySet<string> | undefined,
    current: readonly string[]
): string[] {
    if (!baseline) return []
    return current.filter((p) => !baseline.has(p))
}

/**
 * Snapshot the dirty set for a session's directory. Fire-and-forget: a failure
 * leaves the baseline unknown, which newPathsSince reads as "no evidence".
 * Never throws and never blocks the launch path it is called from.
 */
export function captureBaseline(id: string, cwd: string): void {
    if (!cwd) return
    void window.api.git
        .changes(cwd)
        .then((files) => {
            baselines.set(id, new Set(files.map((f) => f.path)))
        })
        .catch(() => {
            // Unknown baseline. Deliberately not an empty set, which would read
            // as "the repo was clean" and make pre-existing dirt look new.
        })
}

export function baselineOf(id: string): ReadonlySet<string> | undefined {
    return baselines.get(id)
}

export function forgetSignals(id: string): void {
    baselines.delete(id)
}
```

- [ ] **Step 4: Wire capture and cleanup into the store**

**There are four agent-launch paths, not one.** Task 3 shipped with the stamp on `newTab` alone and had to be fixed, because `splitActive`, `openWorkspacePreset` and `startResumedAgent` each create agent panes directly. Do not repeat that: `captureBaseline` goes **beside every `logUsageStart` call site**, which is the invariant Task 3 established and documented on `markLaunched`. Grep for `logUsageStart` and `markLaunched` in `store.ts` — they are already co-located at all four, and this is the third member of that group.

At each site, inside the existing `isAgentId(agentId)` gating so a plain shell never gets a baseline:

```ts
                captureBaseline(termId, cwd)
```

Pass the **same directory expression that site already passes to `logUsageStart`** — each of the four resolves it slightly differently (a worktree's `cwd`, the project path, a restored pane's `termCwd`), and the baseline must describe the directory the agent will actually work in. Match the neighbouring call rather than inventing a rule.

Then in `forget(termId)` (around `store.ts:631-670`), beside the existing `forgetTail(termId)` call, add:

```ts
        forgetSignals(termId)
```

- [ ] **Step 5: Verify**

Run: `npx vitest run` and `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/agentSignals.ts src/renderer/src/store.ts tests/agentSignals.test.ts
git commit -m "feat(agents): baseline a session's dirty set at launch"
```

---

### Task 5: Stop a one-second pause from filing a card as done

This is the live bug. At `store.ts:611-623`, when the idle timer fires the store sets `waiting`/`idle` **and** moves the dispatched card `doing → review`. With `agentIdleMs` at 1000 an agent that pauses to think has its card filed as ready for review.

The status transition stays exactly as it is (out of scope — `waitForIdle` and the mobile client read it). Only the **card move** is re-keyed: it now requires evidence the agent produced something, from Task 4.

`window.api.git.changes` is async and the timer callback is not. Read it without blocking, and let the card simply not move when there is no evidence — the card stays in `doing`, which is true.

**Files:**
- Modify: `src/renderer/src/store.ts:611-623`
- Test: `tests/agentSignals.test.ts` (extend) or a new `tests/cardReview.test.ts`, following how `tests/ledgerSites.test.ts` drives the store

**Interfaces:**
- Consumes: `newPathsSince`, `baselineOf` (Task 4); `window.api.git.changes`.

- [ ] **Step 1: Write the failing tests**

Create `tests/cardReview.test.ts`. Follow `tests/ledgerSites.test.ts` for the pattern: a `stubApi()` helper assigns `globalThis.window = { api: { … } }` with only the namespaces the path touches, and state is seeded with `useStore.setState`. Read that file first and match its shape — in particular `git.changes` returns `Promise<{ path: string }[]>` there.

`captureBaseline` is fire-and-forget, so seed baselines by calling it against a stub and awaiting a tick, or expose the same effect by stubbing `git.changes` for the capture call and then changing the stub before the idle fires. Set `agentIdleMs` low (e.g. `useSettings.setState({ agentIdleMs: 20 })`) and drive the pty data handler the way `ledgerSites` drives store actions, then `await` past the timer.

```ts
describe("a dispatched card reaching review", () => {
    it("moves when the agent produced a file that was not dirty before", async () => {
        // baseline: clean; after: one new path
        // expect column === "review"
    })

    it("leaves the card in doing when nothing changed", async () => {
        // baseline: clean; after: clean
        // expect column === "doing"
    })

    it("leaves the card in doing when the tree was already dirty", async () => {
        // THE REGRESSION. baseline: ["old.ts"]; after: ["old.ts"].
        // Today the card moves on a 1s pause regardless of evidence.
        // expect column === "doing"
    })

    it("leaves the card in doing when git fails, and does not throw", async () => {
        // git.changes rejects; expect column === "doing" and no unhandled rejection
    })

    it("does not move a card the user moved while the git read was in flight", async () => {
        // move the card to "done" after the idle fires but before git resolves;
        // expect it to stay "done", not be dragged back to "review"
    })
})
```

Fill each body in with the real seeding and assertions — the comments state the intent, not a substitute for the test.

- [ ] **Step 2: Run and confirm failure**

The third test is the one that must fail against current code: today the card moves regardless of evidence. Confirm that specific failure before changing `store.ts` — if it passes, the premise is wrong and you should stop and report.

- [ ] **Step 3: Implement**

Replace the card-move block inside the idle timer with an unawaited, self-contained read. The status `set` above it is untouched:

```ts
                        // A dispatched card moves to review only on EVIDENCE the
                        // agent produced something — not because it went quiet for
                        // a second. Unawaited so the timer stays synchronous, and
                        // fully caught: failing to move a card must never break a
                        // pty handler.
                        void (async () => {
                            try {
                                const task = get().boardTasks.find(
                                    (t) => t.termId === id && t.column === "doing"
                                )
                                if (!task) return
                                const cwd = get().termCwd[id]
                                if (!cwd) return
                                const files = await window.api.git.changes(cwd)
                                const fresh = newPathsSince(
                                    baselineOf(id),
                                    files.map((f) => f.path)
                                )
                                if (fresh.length === 0) return
                                set((s) => ({
                                    boardTasks: s.boardTasks.map((t) =>
                                        t.id === task.id && t.column === "doing"
                                            ? { ...t, column: "review" }
                                            : t
                                    )
                                }))
                            } catch {
                                // Leave the card in doing. "Still working" is the
                                // honest reading when we cannot tell.
                            }
                        })()
```

Note the re-check of `column === "doing"` inside `set` — the card may have been moved by hand while the git read was in flight.

- [ ] **Step 4: Verify**

Run: `npx vitest run` and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(tasks): a card reaches review on evidence, not on a pause"
```

---

### Task 6: Let the deck say what the app is for

Eight undifferentiated peer keys read as "IDE with an agent feature bolted on". The fix is emphasis, not restructuring: group the supervision views apart from the verification tools.

`DECK_VIEWS` (`ViewKeys.tsx:4-13`) is **already ordered** `mission, tasks, terminal, api, database, browser, network, editor` — which is exactly supervision-first. So this task adds a separator after `terminal` and changes **no keybinding**: `Ctrl+1..8` keep their current meanings, and no muscle memory is spent.

This is also why the spec dropped the nested "Verify" container: no `MainView` narrowing (it is persisted with no validation at `store.ts:1063`), no `<webview>` re-parent (which would reload `BrowserPanel`), no keystroke tax.

**Files:**
- Modify: `src/renderer/src/components/ViewKeys.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- `DECK_VIEWS` gains an optional field; it is consumed by both `ViewKeys` and the `Ctrl+N` handler (`App.tsx:216-223`), so the index order must not change.

- [ ] **Step 1: Add the group boundary to the data**

In `ViewKeys.tsx`, mark where the groups divide without reordering anything:

```ts
export const DECK_VIEWS: { view: MainView; icon: IconName; name: string; group?: "verify" }[] = [
    { view: "mission", icon: "activity", name: "Mission" },
    { view: "tasks", icon: "list", name: "Tasks" },
    { view: "terminal", icon: "terminal", name: "Terminal" },
    // Verification tools: where you check what an agent did. Grouped apart so the
    // deck reads supervision-first, without costing anyone a keystroke — the
    // order (and so Ctrl+1..8) is unchanged.
    { view: "api", icon: "send", name: "API", group: "verify" },
    { view: "database", icon: "database", name: "Database" },
    { view: "browser", icon: "appWindow", name: "Browser" },
    { view: "network", icon: "globe", name: "Network" },
    { view: "editor", icon: "code", name: "Editor" }
]
```

- [ ] **Step 2: Render the separator**

Inside the `.map`, add the class when a view opens the group:

```tsx
                    className={
                        "deck-view" +
                        (view === v.view ? " on" : "") +
                        (v.group === "verify" ? " group-start" : "")
                    }
```

- [ ] **Step 3: One CSS rule**

In `styles.css`, beside the other `.deck-view` rules:

```css
/* Supervision keys, then the verification tools. A hairline, not a border box:
   the deck should read as two groups without gaining chrome. */
.deck-view.group-start {
    margin-left: var(--sp-sm);
    border-left: 1px solid var(--border-soft);
    padding-left: var(--sp-sm);
}
```

Use existing tokens only — no hard-coded colour or off-scale spacing. Grep the `[data-style="…"]` blocks for `.deck-view` first: if a style overrides it, check the separator survives there, and remember `[data-style="bauhaus"]` zeroes every radius.

- [ ] **Step 4: Verify**

Run: `npm run typecheck` and `npx vitest run`. The controller verifies appearance in the running app (Slate and Washi) — there is no headless renderer.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(deck): group the supervision keys apart from the tools"
```

---

### Task 7: Documentation

**Files:**
- Modify: `CHANGELOG.md` (an `## Unreleased` section at the top; match the existing entry voice — plain prose, the reason before the mechanism)
- Modify: `NOTES.md`

- [ ] **Step 1: CHANGELOG**

Write the user-facing story, leading with the bug rather than the refactor: a dispatched card used to slide to *review* when its agent paused for a second; an agent setting its terminal title used to mark itself as needing you; a stalled agent could never be detected at all. Note that the deck now groups supervision keys apart from verification tools, **with no shortcut changes**.

- [ ] **Step 2: NOTES**

Record the two things a future reader will otherwise rediscover the hard way:

- **`\x07` is an OSC terminator as well as a bell**, so any BEL test must strip OSC first — and pty chunks split mid-sequence, hence the per-session flag.
- **`git status` has no baseline**, so "the tree is dirty" is never evidence that *this* agent did something. Baselines are captured at launch; an unknown baseline means no evidence, never everything.

Also note explicitly what was left alone and why: the `AgentStatus` enum, the idle transition and `waitForIdle`, because `waitForIdle` is an unbounded loop that exits only on `st === "idle"` and would hang every pipeline, and because the enum crosses into `main/server.ts`'s mobile client.

- [ ] **Step 3: Commit**

```bash
git commit -am "docs: record the agent-signal fixes"
```

---

## Two spec items this plan deliberately does not build

Both would be dead code today, so they belong with the queue that consumes them.

- **A named `quiet` fact.** The spec lists `quiet` alongside `ready`. In this plan
  nothing needs it as a separate helper: `isStalled` reads `lastAt` and a
  threshold directly (Task 3), and the card auto-move is triggered *by* the
  existing idle timer, which is already the quiet signal (Task 5). Adding a
  `quiet()` export with no caller would be YAGNI. It arrives with the queue.
- **`blocked` ranking on `detectApproval`.** The spec is right that
  `approval.ts`'s content-based detector, not BEL, is what `blocked` should rank
  on — but *ranking* only exists in the queue. This plan does the half that
  matters regardless: Task 1 stops BEL from firing on terminal titles, which is a
  live bug either way. `detectApproval` is already wired into
  `OverviewView.tsx:78-81` and needs no change until there is a queue.

## Deferred (not in this plan)

The attention queue, per the spec's four conditions: corrected signals observed over real use; a cwd-keyed cached git map with a TTL (today `git:changes` is affordable only because it is gated on `view === "mission" && !document.hidden`, and nothing is cached); a stated list of what the queue **deletes**; and two rows rather than four.

Also deferred: deleting `waiting` (needs `waitForIdle`, the deck badge and the mobile client handled deliberately), Monaco's diff editor inside `ChangesModal`, and any `MainView` change.
