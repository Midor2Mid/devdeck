# Decide from Mission — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put one honest state chip — and only the action that answers it — on every Mission agent tile, so eight terminals stop needing eight visits.

**Architecture:** A pure resolver (`tileState.ts`) turns facts DevDeck already knows exactly — agent status, a detected permission prompt, a recorded pty exit code, last-output time, and the count of files changed since the session's baseline — into one chip plus an ordered action set, first match wins. Two facts are missing today and this plan adds them: the pty **exit code** is currently written into the dead terminal as text and discarded (a new module Map in `termExit.ts`, fed by a global `pty.onExit` subscription), and the **per-session changed count** is computed from the git read Mission's ownership poll already makes (no new git calls). `MissionControl.tsx` renders the chip in place of the two conditional lines it replaces, and wires the actions to store actions that already exist.

**Tech Stack:** Electron + electron-vite + React 18 + TypeScript, Zustand store, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-mission-decide-design.md` — read it before Task 1. It carries the reasoning this plan implements; where they disagree, the spec wins.

## Global Constraints

- **A state may only be derived from something DevDeck already knows exactly.** No state on the tile may be inferred from prose. Every state's source is named in the spec's table.
- **No parsing of tool output** for failures, test counts, or diagnostics. Explicitly cut.
- **No AI-generated summaries.** No model call anywhere in this feature.
- **No new git polling.** The changed count reuses `MissionControl.tsx`'s existing 8s ownership poll (`MissionControl.tsx:130-161`), which already calls `window.api.git.changes(sessionCwd(termId))` per agent session, gated on the Mission view being active and `document.hidden` being false. Adding a second poll, or shortening this one, is out of scope.
- **No change to `agentStatus`, the idle timer, or `waitForIdle`.** Those values are read as control flow by the pipeline runner and cross the process boundary into the mobile client.
- **No new diff surface.** Review opens the existing one via `openChanges(cwd, label)`.
- **The Inbox drawer is not deleted**, even though this subsumes its reply box.
- **No new surface, no new dashboard.** Everything lands on the tiles that are already on screen.
- **Tokens only.** No hard-coded colors or sizes in components or CSS — change the token (`src/renderer/src/themes.ts`, `src/renderer/src/styles.css`) and let the cascade apply it. One accent; state must differ in **form** (glyph/shape), not only in hue, because it has to survive all 84 skins. `--ok` / `--danger` are semantic only (success and destructive) and never stand in for the accent.
- **Code style:** 4-space indent, double quotes, JSDoc on exported functions, conventional commits.
- **`npm test` and `npm run typecheck` must both be clean before every commit.** The build does not typecheck.
- Do **not** edit files under `src/` while `npm run dev` is running.

---

### Task 1: Record the pty exit code per session

Today `TerminalPane.tsx:155-156` writes `exitNotice(exitCode, IS_WINDOWS)` into the terminal and throws the code away. Nothing stores it, so no other surface can know a process died or why — and `isStalled`'s `alive` argument (`!!termAgents[id]`) stays true for a pane whose process is dead but whose tab is still open, so a corpse reads as merely quiet.

**Files:**
- Modify: `src/renderer/src/termExit.ts` (append after `exitNotice`)
- Modify: `src/renderer/src/store.ts:647-650` (`onPtyData`), `:783-787` (`forget`), `:1164-1168` (`init`), and the import block at `:20-35`
- Test: `tests/termExit.test.ts` (append), `tests/exitRecord.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `recordExit(id: string, exitCode: number): void`, `exitCodeOf(id: string): number | undefined`, `clearExit(id: string): void` — all from `src/renderer/src/termExit.ts`. Task 3 consumes `exitCodeOf`'s return type; Task 5 calls `exitCodeOf`.

- [ ] **Step 1: Write the failing unit tests for the record**

Append to `tests/termExit.test.ts`:

```ts
describe("the per-session exit record", () => {
    it("reads undefined for a session that has not exited", () => {
        clearExit("t-none")
        expect(exitCodeOf("t-none")).toBeUndefined()
    })

    it("records a code and reads it back", () => {
        recordExit("t-1", 1)
        expect(exitCodeOf("t-1")).toBe(1)
        clearExit("t-1")
    })

    // 0 is falsy: every consumer must test `!== undefined`, never truthiness,
    // or a clean exit reads as a running process.
    it("distinguishes a clean exit from no exit at all", () => {
        recordExit("t-0", 0)
        expect(exitCodeOf("t-0")).toBe(0)
        expect(exitCodeOf("t-0")).not.toBeUndefined()
        clearExit("t-0")
    })

    it("clears a session's code", () => {
        recordExit("t-2", FASTFAIL)
        clearExit("t-2")
        expect(exitCodeOf("t-2")).toBeUndefined()
    })
})
```

…and extend that file's import to:

```ts
import { exitNotice, FASTFAIL, recordExit, exitCodeOf, clearExit } from "../src/renderer/src/termExit"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/termExit.test.ts`
Expected: FAIL — `recordExit is not a function` (or a TS resolution error on the import).

- [ ] **Step 3: Implement the record in `termExit.ts`**

Append to `src/renderer/src/termExit.ts`:

```ts
/**
 * The code each session's process exited with, if it has exited.
 *
 * The notice above is written into the dead pane and then gone — nothing stored
 * it, so no surface outside that terminal could tell a dead session from a
 * silent one. `isStalled`'s `alive` argument is `!!termAgents[id]`, which stays
 * true for a pane whose process died but whose tab is still open, so without
 * this every corpse also read as stalled.
 *
 * A module Map, like missionTail's tails: written from the pty stream, read by
 * a polling consumer, never React state.
 */
const exitCodes = new Map<string, number>()

/** Record the code a session's process exited with. */
export function recordExit(id: string, exitCode: number): void {
    exitCodes.set(id, exitCode)
}

/**
 * The code this session's process exited with, or undefined if it is running.
 *
 * Callers must test `!== undefined`: a clean exit is 0, which is falsy.
 */
export function exitCodeOf(id: string): number | undefined {
    return exitCodes.get(id)
}

/**
 * Forget a session's exit. Called by the store's `forget()` on close, like
 * every other per-session record, and on the first output after a respawn — a
 * pane re-run in place would otherwise read EXITED for the rest of its life.
 */
export function clearExit(id: string): void {
    exitCodes.delete(id)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/termExit.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing store-wiring test**

Create `tests/exitRecord.test.ts`. This pins the three wiring facts the tile depends on: the exit arrives, later output clears it, and closing the pane clears it.

```ts
import { describe, it, expect, beforeAll } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { exitCodeOf, clearExit } from "../src/renderer/src/termExit"
import { leaf } from "../src/renderer/src/layout"

const TERM = "t-exit"

/** The pty handlers the store registers in init() — the way into both streams. */
let ptyData: (e: { id: string; data: string }) => void = () => undefined
let ptyExit: (e: { id: string; exitCode: number }) => void = () => undefined

/** Only the namespaces this path touches, as in tests/cardReview.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (fn: (e: { id: string; data: string }) => void): (() => void) => {
                    ptyData = fn
                    return (): void => undefined
                },
                onExit: (fn: (e: { id: string; exitCode: number }) => void): (() => void) => {
                    ptyExit = fn
                    return (): void => undefined
                },
                kill: (): void => undefined,
                input: (): void => undefined
            },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                })
            },
            workspace: { load: async (): Promise<null> => null, save: (): void => undefined },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

/** One live agent session in one project, the way Mission would see it. */
function seedSession(): void {
    useStore.setState({
        view: "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: {},
        agentStatus: {},
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: {},
        notifications: [],
        activity: []
    })
}

describe("the exit code reaching the store", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    it("records the code the pty reported", () => {
        clearExit(TERM)
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        expect(exitCodeOf(TERM)).toBe(1)
    })

    // A pane re-run in place produces output again. The corpse has to stop
    // being a corpse, or the tile says EXITED over a live agent.
    it("clears the code once the session produces output again", () => {
        clearExit(TERM)
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        ptyData({ id: TERM, data: "back from the dead\n" })
        expect(exitCodeOf(TERM)).toBeUndefined()
    })

    it("clears the code when the session closes", () => {
        clearExit(TERM)
        seedSession()
        ptyExit({ id: TERM, exitCode: 0 })
        useStore.getState().closePane(TERM)
        expect(exitCodeOf(TERM)).toBeUndefined()
    })
})
```

> `closePane` (`store.ts:2697`) is the action that calls the internal `forget(termId)`. On its way there it kills the pty and files a usage record, which the stub above covers (`pty.kill`, `ledger`, `settings`). If it turns out to need more seeded state, add it — the assertion stays as written.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/exitRecord.test.ts`
Expected: FAIL — `exitCodeOf(TERM)` is `undefined` after `ptyExit`, because nothing subscribes to `pty.onExit`.

- [ ] **Step 7: Wire the store**

In `src/renderer/src/store.ts`, add to the existing import block (near the `missionTail` imports at `:20-35`):

```ts
import { recordExit, exitCodeOf, clearExit } from "./termExit"
```

In `init()`, inside the existing `if (!dataSubscribed)` guard (`:1164-1168`), beside the `onData` subscription:

```ts
if (!dataSubscribed) {
    window.api.pty.onData(onPtyData)
    // App-global, not per-pane: TerminalPane's own onExit only fires while a
    // pane is mounted, and Mission has to know about a process that died in a
    // tab you were not looking at.
    window.api.pty.onExit(({ id, exitCode }) => recordExit(id, exitCode))
    window.api.triggers.onFired(({ triggerId }) => get().fireTrigger(triggerId))
    dataSubscribed = true
}
```

In `onPtyData`, immediately after the `isAgentId` guard and before `recordTail` (`:647-650`):

```ts
const onPtyData = ({ id, data }: { id: string; data: string }): void => {
    if (!isAgentId(get().agentOf(id))) return
    // Output after an exit means the pane was re-run in place. Guarded so the
    // hot path does a Map delete only on the one chunk that follows a respawn.
    if (exitCodeOf(id) !== undefined) clearExit(id)
    // Keep a cleaned tail of this agent's output for the Mission Control peek.
    recordTail(id, data)
```

In `forget()` (`:783-787`), beside the other per-session records:

```ts
forgetTail(termId)
forgetSignals(termId)
clearExit(termId)
```

- [ ] **Step 8: Run the tests and the typechecker**

Run: `npx vitest run tests/exitRecord.test.ts tests/termExit.test.ts && npm run typecheck`
Expected: PASS, and typecheck reports zero errors.

- [ ] **Step 9: Run the whole suite**

Run: `npm test`
Expected: all tests pass (no existing test asserts on exit-code behaviour, so nothing should move).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/termExit.ts src/renderer/src/store.ts tests/termExit.test.ts tests/exitRecord.test.ts
git commit -m "feat(term): remember that a process died, and with what code

The exit code was written into the dead pane as text and discarded, so no
surface outside that terminal could tell a corpse from a quiet agent -
isStalled's alive argument is true for both. Recorded per session now,
cleared on respawn and on close like every other per-session record."
```

---

### Task 2: One gate for "is this session asking permission?"

`OverviewView.tsx:76-81` holds the only correct call site of `detectApproval`: it is gated on `isAgent` and a status of `attention`/`waiting`, which is `approval.ts`'s stated contract for any caller that will **act** on the match ("acting on a wrong guess sends the wrong keystroke to a live agent"). Mission is about to become a second such caller. Move the gate somewhere both can use it rather than copying it, so there is one rule and one place to fix it.

**Files:**
- Modify: `src/renderer/src/missionTail.ts` (append near `sortForFollow`)
- Modify: `src/renderer/src/components/OverviewView.tsx:76-81` (delete the local `approvalFor`, import the shared one)
- Test: `tests/missionTail.test.ts` (append)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `promptFor(s: AnySession): ApprovalPrompt | null` from `src/renderer/src/missionTail.ts`. Task 5 calls it; Task 3 receives its return value as the resolver's `prompt` field.

- [ ] **Step 1: Write the failing test**

Append to `tests/missionTail.test.ts` (the file already imports `recordTail`, `forgetTail`, and a `sess(over: Partial<AnySession>)` factory — reuse them; add `promptFor` to the import list):

```ts
describe("promptFor", () => {
    const TAIL =
        "Do you want to make this edit to store.ts?\n" +
        "❯ 1. Yes\n" +
        "  2. No, and tell Claude what to do differently (esc)\n"

    afterEach(() => forgetTail("p-1"))

    it("returns the detected prompt for an agent flagged attention", () => {
        recordTail("p-1", TAIL)
        const p = promptFor(sess({ termId: "p-1", isAgent: true, status: "attention" }))
        expect(p?.kind).toBe("menu")
        expect(p?.approve).toBe("1")
    })

    it("returns the detected prompt for an agent flagged waiting", () => {
        recordTail("p-1", TAIL)
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "waiting" }))).not.toBeNull()
    })

    // The gate, not the detector: the same tail on a working or idle session is
    // mid-stream output, and answering it sends a keystroke nobody asked for.
    it("returns null for a session that is not flagged attention or waiting", () => {
        recordTail("p-1", TAIL)
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "working" }))).toBeNull()
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "idle" }))).toBeNull()
    })

    it("returns null for a plain shell", () => {
        recordTail("p-1", TAIL)
        expect(promptFor(sess({ termId: "p-1", isAgent: false, status: "attention" }))).toBeNull()
    })

    it("returns null when the tail holds no prompt", () => {
        recordTail("p-1", "compiling…\ndone\n")
        expect(promptFor(sess({ termId: "p-1", isAgent: true, status: "attention" }))).toBeNull()
    })
})
```

If `afterEach` is not yet imported in that file, add it to the `vitest` import.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: FAIL — `promptFor` is not exported.

- [ ] **Step 3: Implement `promptFor`**

Add to `src/renderer/src/missionTail.ts`. It needs one new import at the top of the file:

```ts
import { detectApproval, type ApprovalPrompt } from "./approval"
```

(`approval.ts` imports nothing, so there is no cycle.) Then, next to `sortForFollow`:

```ts
/**
 * The permission prompt this session is blocked on, or null.
 *
 * The gate, not the detector. `approval.ts` is deliberately conservative but
 * still asks its callers to run it only for sessions already flagged
 * attention/waiting, because a surface that ACTS on a match sends a keystroke
 * to a live agent. Mission and Overview are both such surfaces, so the rule
 * lives here once instead of being copied into each of them.
 *
 * 16 lines is the same window Overview has always read.
 */
export function promptFor(s: AnySession): ApprovalPrompt | null {
    if (!s.isAgent || (s.status !== "attention" && s.status !== "waiting")) return null
    return detectApproval(getFullTail(s.termId, 16))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: PASS.

- [ ] **Step 5: Point Overview at the shared gate**

In `src/renderer/src/components/OverviewView.tsx`, delete the local helper (`:74-81`):

```tsx
/** A permission prompt detected in a session's output an agent already ran, if
 *  any — only computed for sessions flagged attention/waiting to avoid noise. */
function approvalFor(s: AnySession): ApprovalPrompt | null {
    if (!s.isAgent || (s.status !== "attention" && s.status !== "waiting")) return null
    return detectApproval(getFullTail(s.termId, 16))
}
```

Update the imports at the top of the file:

```tsx
import { getTail, getFullTail, peekLine, sortForFollow, promptFor } from "../missionTail"
import { type ApprovalPrompt } from "../approval"
```

Then replace every `approvalFor(` call site with `promptFor(`. Find them with:

```bash
grep -n "approvalFor\|getFullTail\|detectApproval" src/renderer/src/components/OverviewView.tsx
```

If `getFullTail` has no remaining use in the file after the helper is gone, drop it from the import; the same for `detectApproval`. Leave `ApprovalPrompt` imported — `ApprovalActions` types its prop with it.

- [ ] **Step 6: Verify nothing moved**

Run: `npm test && npm run typecheck`
Expected: all tests pass; typecheck reports zero errors (an unused import is a typecheck error under this project's settings, so this step catches a stale one).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/missionTail.ts src/renderer/src/components/OverviewView.tsx tests/missionTail.test.ts
git commit -m "refactor(approval): one gate for 'is this session asking?'

approval.ts asks callers that will act on a match to run it only for
sessions flagged attention/waiting. Mission is about to become a second
such caller, so the rule moves out of OverviewView into promptFor rather
than being copied - one rule, one place to fix it."
```

---

### Task 3: The state resolver

The whole feature's judgement, as one pure function over facts the caller already holds. First match wins; the precedence is the spec's table, and pinning it is the point of the tests.

**Files:**
- Create: `src/renderer/src/tileState.ts`
- Test: `tests/tileState.test.ts` (create)

**Interfaces:**
- Consumes: `ApprovalPrompt` (from `src/renderer/src/approval.ts`), `AgentStatus` (from `src/renderer/src/store.ts`), `isStalled` and `relTime` (from `src/renderer/src/missionTail.ts`), `FASTFAIL` (from `src/renderer/src/termExit.ts`).
- Produces, from `src/renderer/src/tileState.ts`:
  - `type TileActionKind = "approve" | "deny" | "reply" | "review"`
  - `type TileTone = "attention" | "warn" | "neutral" | "quiet"`
  - `interface TileStateInput { status: AgentStatus; prompt: ApprovalPrompt | null; exitCode: number | undefined; lastAt: number | undefined; changedCount: number; awaited: boolean; alive: boolean }`
  - `interface TileState { kind: "needs-you" | "exited" | "asking" | "stalled" | "changed" | "working" | "quiet"; chip: string; mark: string; tone: TileTone; detail?: string; actions: TileActionKind[] }`
  - `function resolveTileState(input: TileStateInput, now: number): TileState`

  Task 5 imports `resolveTileState`, `TileState`, and `TileActionKind`.

- [ ] **Step 1: Write the failing tests**

Create `tests/tileState.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { resolveTileState, type TileStateInput } from "../src/renderer/src/tileState"
import { STALL_MS } from "../src/renderer/src/missionTail"
import { FASTFAIL } from "../src/renderer/src/termExit"
import type { ApprovalPrompt } from "../src/renderer/src/approval"

const NOW = 1_700_000_000_000

const PROMPT: ApprovalPrompt = {
    kind: "menu",
    question: "Do you want to make this edit to store.ts?",
    approve: "1",
    deny: "\x1b"
}

/** A live, awaited, working session that just spoke — the neutral starting point. */
function input(over: Partial<TileStateInput> = {}): TileStateInput {
    return {
        status: "working",
        prompt: null,
        exitCode: undefined,
        lastAt: NOW - 1000,
        changedCount: 0,
        awaited: true,
        alive: true,
        ...over
    }
}

describe("resolveTileState precedence", () => {
    it("a prompt outranks everything", () => {
        const s = resolveTileState(
            input({
                status: "attention",
                prompt: PROMPT,
                exitCode: 1,
                lastAt: NOW - STALL_MS - 1,
                changedCount: 9
            }),
            NOW
        )
        expect(s.kind).toBe("needs-you")
        expect(s.chip).toBe("NEEDS YOU")
        expect(s.detail).toBe(PROMPT.question)
        expect(s.actions).toEqual(["approve", "deny"])
    })

    // The concrete reason EXITED sits above STALLED: isStalled's `alive` is
    // `!!termAgents[id]`, true for a pane whose process is dead but whose tab
    // is open. Without the precedence every corpse also reads as stalled.
    it("a dead process that is also silent reads EXITED, not STALLED", () => {
        const s = resolveTileState(
            input({ status: "idle", exitCode: 1, lastAt: NOW - STALL_MS - 1 }),
            NOW
        )
        expect(s.kind).toBe("exited")
        expect(s.chip).toBe("EXITED 1")
    })

    it("an exit outranks attention that carries no parsable prompt", () => {
        const s = resolveTileState(input({ status: "attention", exitCode: 2 }), NOW)
        expect(s.kind).toBe("exited")
    })

    it("attention with no parsable prompt reads ASKING and offers a reply", () => {
        const s = resolveTileState(input({ status: "attention" }), NOW)
        expect(s.kind).toBe("asking")
        expect(s.chip).toBe("ASKING")
        expect(s.actions).toEqual(["reply"])
    })

    it("a silent awaited session reads STALLED with the silence in the chip", () => {
        const s = resolveTileState(input({ status: "idle", lastAt: NOW - 21 * 60_000 }), NOW)
        expect(s.kind).toBe("stalled")
        expect(s.chip).toBe("STALLED · silent 21m")
        expect(s.actions).toEqual(["reply"])
    })

    it("silence nobody is waiting on is not a stall", () => {
        const s = resolveTileState(
            input({ status: "idle", awaited: false, lastAt: NOW - 21 * 60_000 }),
            NOW
        )
        expect(s.kind).toBe("quiet")
    })

    it("changed files read CHANGED and offer Review", () => {
        const s = resolveTileState(input({ status: "idle", changedCount: 4 }), NOW)
        expect(s.chip).toBe("CHANGED · 4 files")
        expect(s.actions).toEqual(["review"])
    })

    it("singularises one changed file", () => {
        expect(resolveTileState(input({ status: "idle", changedCount: 1 }), NOW).chip).toBe(
            "CHANGED · 1 file"
        )
    })

    it("a working session with nothing changed reads WORKING and offers nothing", () => {
        const s = resolveTileState(input(), NOW)
        expect(s.kind).toBe("working")
        expect(s.chip).toBe("WORKING")
        expect(s.actions).toEqual([])
    })

    // Unawaited: the same silence with a card waiting on it is a STALL, which
    // the case above already pins.
    it("everything else is QUIET, with how long", () => {
        const s = resolveTileState(
            input({ status: "idle", awaited: false, lastAt: NOW - 8 * 60_000 }),
            NOW
        )
        expect(s.chip).toBe("QUIET 8m")
        expect(s.actions).toEqual([])
    })

    it("says QUIET without a duration when the session never spoke", () => {
        expect(resolveTileState(input({ status: "idle", lastAt: undefined }), NOW).chip).toBe("QUIET")
    })
})

describe("the exit chip", () => {
    it("names a clean exit without a code, and stays quiet in tone", () => {
        const s = resolveTileState(input({ exitCode: 0 }), NOW)
        expect(s.chip).toBe("EXITED")
        expect(s.tone).toBe("quiet")
    })

    it("carries the code in hex in the detail", () => {
        expect(resolveTileState(input({ exitCode: 1 }), NOW).detail).toContain("0x1")
    })

    it("marks the Windows fast-fail exit distinctly and names the cause", () => {
        const s = resolveTileState(input({ exitCode: FASTFAIL }), NOW)
        expect(s.chip).toBe("EXITED · KILLED")
        expect(s.detail).toContain("0xC0000409")
        expect(s.detail?.toLowerCase()).toContain("antivirus")
    })

    // Reply is meaningless to a dead process; Review is not, if it left work.
    it("offers Review on an exit only when the session changed files", () => {
        expect(resolveTileState(input({ exitCode: 1, changedCount: 0 }), NOW).actions).toEqual([])
        expect(resolveTileState(input({ exitCode: 1, changedCount: 3 }), NOW).actions).toEqual([
            "review"
        ])
    })
})

describe("form, not only colour", () => {
    // All 84 skins have to separate these, and two of the themes put --clay and
    // --danger a shade apart. Every state therefore carries its own glyph.
    it("gives every state a distinct mark", () => {
        const marks = [
            resolveTileState(input({ status: "attention", prompt: PROMPT }), NOW),
            resolveTileState(input({ exitCode: 1 }), NOW),
            resolveTileState(input({ status: "attention" }), NOW),
            resolveTileState(input({ status: "idle", lastAt: NOW - STALL_MS - 1 }), NOW),
            resolveTileState(input({ status: "idle", changedCount: 2 }), NOW),
            resolveTileState(input(), NOW),
            resolveTileState(input({ status: "idle" }), NOW)
        ].map((s) => s.mark)
        expect(new Set(marks).size).toBe(marks.length)
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tileState.test.ts`
Expected: FAIL — cannot resolve `../src/renderer/src/tileState`.

- [ ] **Step 3: Implement the resolver**

Create `src/renderer/src/tileState.ts`:

```ts
/**
 * What one Mission tile is saying right now, and the single action that answers
 * it. One chip per tile, FIRST MATCH WINS.
 *
 * Every state here is derived from something DevDeck knows exactly — a detected
 * prompt, a recorded exit code, a status, a timestamp, a count of paths — and
 * none of them from prose. This app has repeatedly shipped signals that lied (a
 * terminal title read as a bell, a one-second pause read as "finished", a stall
 * check that never fired) and each cost more trust than the signal was worth.
 * Parsing tool output for test failures would be the next one, and is cut.
 *
 * Pure and store-free: the caller passes the facts in, which is also what makes
 * the precedence testable without a renderer.
 */

import type { AgentStatus } from "./store"
import type { ApprovalPrompt } from "./approval"
import { isStalled, relTime } from "./missionTail"
import { FASTFAIL } from "./termExit"

export type TileActionKind = "approve" | "deny" | "reply" | "review"

/**
 * How loud the chip is. `attention` spends the accent and is reserved for the
 * states where the agent is blocked ON YOU; `warn` is the clay used for stalls;
 * `neutral` and `quiet` spend nothing. --ok and --danger are semantic (success,
 * destructive) and never stand in for the accent, so no state maps to them.
 */
export type TileTone = "attention" | "warn" | "neutral" | "quiet"

export type TileStateKind =
    | "needs-you"
    | "exited"
    | "asking"
    | "stalled"
    | "changed"
    | "working"
    | "quiet"

export interface TileStateInput {
    /** The store's agent status for this session. */
    status: AgentStatus
    /** A permission prompt this session is blocked on — missionTail's promptFor. */
    prompt: ApprovalPrompt | null
    /** The code its process exited with, if it has exited. 0 is an exit. */
    exitCode: number | undefined
    /** When it last produced output (ms epoch), stamped at launch if never. */
    lastAt: number | undefined
    /** Paths dirty now that were not dirty when the session started. */
    changedCount: number
    /** Is a board card or pipeline step actually waiting on this session? */
    awaited: boolean
    /** Is the session still on the grid (`!!termAgents[id]`)? */
    alive: boolean
}

export interface TileState {
    kind: TileStateKind
    /** The chip's text. Short enough to sit on one line of a dense tile. */
    chip: string
    /**
     * A glyph that differs per state. DESIGN.md requires state to read in FORM
     * as well as colour: --clay and --danger are a shade apart in Sumi and
     * Washi, and the tile has to stay legible in all 84 skins.
     */
    mark: string
    tone: TileTone
    /** Longer text for the tooltip, and for the question under NEEDS YOU. */
    detail?: string
    /** In render order. Empty for the states that cannot be answered. */
    actions: TileActionKind[]
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`

/** The exit chip: clean, fast-fail, or a code. */
function exited(code: number, changedCount: number): TileState {
    const hex = "0x" + (code >>> 0).toString(16).toUpperCase()
    // Review is the only action a dead process can still be given, and only if
    // it left something behind. Reply is meaningless: nothing is listening.
    const actions: TileActionKind[] = changedCount > 0 ? ["review"] : []
    if (code === 0) {
        return {
            kind: "exited",
            chip: "EXITED",
            mark: "□",
            tone: "quiet",
            detail: "The process exited cleanly.",
            actions
        }
    }
    if (code === FASTFAIL) {
        return {
            kind: "exited",
            chip: "EXITED · KILLED",
            mark: "□",
            tone: "warn",
            // The same cause termExit's notice names, minus the fix — the fix
            // is in the terminal, which is one click away and where you would
            // act on it.
            detail:
                `Killed before it could start (${code} / ${hex}) — on Windows this is ` +
                "usually antivirus terminating the shell. The terminal has the fix.",
            actions
        }
    }
    return {
        kind: "exited",
        chip: `EXITED ${code}`,
        mark: "□",
        tone: "warn",
        detail: `The process exited with code ${code} (${hex}).`,
        actions
    }
}

/**
 * Resolve one tile's state. Order is the contract — see the spec's table.
 */
export function resolveTileState(i: TileStateInput, now: number): TileState {
    // 1. Blocked on you, and we know exactly what it asked.
    if (i.prompt) {
        return {
            kind: "needs-you",
            chip: "NEEDS YOU",
            mark: "●",
            tone: "attention",
            detail: i.prompt.question,
            actions: ["approve", "deny"]
        }
    }
    // 2. Dead outranks silent: `alive` below is true for a pane whose process
    //    died but whose tab is still open, so without this every corpse would
    //    also read as stalled.
    if (i.exitCode !== undefined) return exited(i.exitCode, i.changedCount)
    // 3. It wants something, but nothing in the tail parses as a prompt we can
    //    answer with a keystroke. A sentence can still answer it.
    if (i.status === "attention") {
        return {
            kind: "asking",
            chip: "ASKING",
            mark: "◆",
            tone: "attention",
            detail: "Flagged for your attention, with no prompt we can answer for you.",
            actions: ["reply"]
        }
    }
    // 4. Silent, alive, and something is actually waiting on it.
    if (isStalled(i.lastAt, i.alive, i.awaited, now)) {
        const ago = relTime(now, i.lastAt)
        return {
            kind: "stalled",
            chip: `STALLED · silent ${ago}`,
            mark: "⋯",
            tone: "warn",
            detail: `No output for ${ago}, and something is waiting on this session.`,
            actions: ["reply"]
        }
    }
    // 5. It produced something you have not looked at. Above WORKING on
    //    purpose: work that exists is reviewable whether or not it is finished.
    if (i.changedCount > 0) {
        return {
            kind: "changed",
            chip: `CHANGED · ${plural(i.changedCount, "file")}`,
            mark: "▤",
            tone: "neutral",
            detail: `${plural(i.changedCount, "file")} changed since this session started.`,
            actions: ["review"]
        }
    }
    // 6. Mid-turn. Nothing to decide.
    if (i.status === "working") {
        return { kind: "working", chip: "WORKING", mark: "▶", tone: "neutral", actions: [] }
    }
    // 7. The resting state of an agent that finished and handed back to you.
    const ago = relTime(now, i.lastAt)
    return {
        kind: "quiet",
        chip: ago ? `QUIET ${ago}` : "QUIET",
        mark: "–",
        tone: "quiet",
        actions: []
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tileState.test.ts && npm run typecheck`
Expected: PASS, zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/tileState.ts tests/tileState.test.ts
git commit -m "feat(mission): resolve one honest state per agent tile

A pure function over facts DevDeck knows exactly - a detected prompt, a
recorded exit code, a status, a timestamp, a count of changed paths -
returning one chip and only the actions that state can use. First match
wins; EXITED sits above STALLED because isStalled's alive argument is
true for a dead pane whose tab is still open."
```

---

### Task 4: The changed count, from the git read Mission already makes

Mission's ownership poll (`MissionControl.tsx:130-161`) already fetches `window.api.git.changes(sessionCwd(termId))` for every agent session every 8s, gated on the view and `document.hidden`. It throws the per-session paths away into `buildOwnership`. The chip needs one number per session out of exactly that data — **no new git call, no shorter interval.**

**Files:**
- Modify: `src/renderer/src/agentSignals.ts` (append after `newPathsSince`)
- Test: `tests/agentSignals.test.ts` (append)

**Interfaces:**
- Consumes: `newPathsSince` and `baselineOf`, both already in `agentSignals.ts`.
- Produces: `newCounts(entries: readonly { termId: string; files: readonly string[] }[]): Record<string, number>` from `src/renderer/src/agentSignals.ts`. Task 5 calls it inside the existing ownership poll.

- [ ] **Step 1: Write the failing test**

Append to `tests/agentSignals.test.ts` (it already imports from `../src/renderer/src/agentSignals`; add `newCounts` and `adoptBaseline` to the import list if they are not there):

```ts
describe("newCounts", () => {
    afterEach(() => {
        forgetSignals("a")
        forgetSignals("b")
    })

    it("counts only paths that were not dirty when the session started", () => {
        adoptBaseline("a", ["src/old.ts"])
        const counts = newCounts([{ termId: "a", files: ["src/old.ts", "src/new.ts"] }])
        expect(counts.a).toBe(1)
    })

    // Unknown baseline means NO EVIDENCE, never "everything is new" - the whole
    // reason baselines exist is that a dirty repo would otherwise mark every
    // agent as productive forever.
    it("counts zero for a session with no baseline", () => {
        const counts = newCounts([{ termId: "b", files: ["src/a.ts", "src/b.ts"] }])
        expect(counts.b).toBe(0)
    })

    it("returns an entry per session, including empty ones", () => {
        adoptBaseline("a", [])
        adoptBaseline("b", [])
        const counts = newCounts([
            { termId: "a", files: ["x.ts"] },
            { termId: "b", files: [] }
        ])
        expect(counts).toEqual({ a: 1, b: 0 })
    })
})
```

If `afterEach` is not imported in that file, add it to the `vitest` import.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/agentSignals.test.ts`
Expected: FAIL — `newCounts` is not exported.

- [ ] **Step 3: Implement it**

Append to `src/renderer/src/agentSignals.ts`:

```ts
/**
 * How many paths each session has made dirty since it started, from a batch of
 * change reads the caller already has.
 *
 * Exists so Mission's tiles can show a changed count WITHOUT a second git poll:
 * the ownership map already reads every agent session's directory every 8s, and
 * this turns that same answer into per-session evidence. A session with an
 * unknown baseline counts 0 — newPathsSince fails closed, and so does this.
 */
export function newCounts(
    entries: readonly { termId: string; files: readonly string[] }[]
): Record<string, number> {
    const out: Record<string, number> = {}
    for (const e of entries) out[e.termId] = newPathsSince(baselineOf(e.termId), e.files).length
    return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/agentSignals.test.ts && npm run typecheck`
Expected: PASS, zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/agentSignals.ts tests/agentSignals.test.ts
git commit -m "feat(signals): per-session changed counts from a read we already make

Mission's ownership poll already fetches every agent session's dirty set
every 8s and throws the per-session paths away. newCounts turns that same
answer into evidence per session, so the tile chip costs no new git call."
```

---

### Task 5: The chip and its actions on the tile

The payload. The chip **replaces** two conditional lines (`needs you`, `stalled · silent 7m`), so most tiles get shorter; actions appear only on the states that can use them, so a tile grows a button row only when there is a decision to make.

**Files:**
- Modify: `src/renderer/src/store.ts` (add `replySession` beside `respondApproval` at `:2490`, and declare it in the store interface near `:321`)
- Modify: `src/renderer/src/components/MissionControl.tsx`
- Modify: `src/renderer/src/styles.css` (append a `Mission tile state chip` block after the existing `.mission-tile-*` rules, ~`:694`; the reduced-motion block is at `:800-804`)
- Test: `tests/exitRecord.test.ts` (append a `replySession` test — it already stubs `pty.input`)

**Interfaces:**
- Consumes: `resolveTileState` (Task 3); `promptFor` (Task 2); `exitCodeOf` (Task 1); `newCounts` (Task 4).
- Produces: `replySession(termId: string, text: string): void` on the store — sends `text + "\r"` to the pty and files an activity entry.

- [ ] **Step 1: Write the failing test for the reply action**

Append to `tests/exitRecord.test.ts`, and extend its `stubApi` so `pty.input` records what it was sent:

```ts
// at the top of the file, beside the other module-level captures
let sentInput: { id: string; data: string }[] = []
```

…and inside `stubApi`'s `pty` object, replace `input: (): void => undefined` with:

```ts
input: (id: string, data: string): void => {
    sentInput.push({ id, data })
},
```

Then append the test:

```ts
describe("replying to a session from a tile", () => {
    it("sends the text plus one carriage return, once", () => {
        seedSession()
        sentInput = []
        useStore.getState().replySession(TERM, "use the other branch")
        expect(sentInput).toEqual([{ id: TERM, data: "use the other branch\r" }])
    })

    it("sends nothing for an empty or whitespace-only reply", () => {
        seedSession()
        sentInput = []
        useStore.getState().replySession(TERM, "   ")
        expect(sentInput).toEqual([])
    })

    it("trims the reply", () => {
        seedSession()
        sentInput = []
        useStore.getState().replySession(TERM, "  ship it  ")
        expect(sentInput).toEqual([{ id: TERM, data: "ship it\r" }])
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/exitRecord.test.ts`
Expected: FAIL — `replySession` is not a function.

- [ ] **Step 3: Add `replySession` to the store**

In `src/renderer/src/store.ts`, declare it in the store interface beside `respondApproval` (`:321`):

```ts
respondApproval: (termId: string, keys: string) => void
/** Send a line of text to a session, as if typed into its terminal. */
replySession: (termId: string, text: string) => void
```

…and implement it beside `respondApproval` (`:2490`):

```ts
respondApproval: (termId, keys) => {
    window.api.pty.input(termId, keys)
    pushActivity("attention", termId, "answered prompt")
},

/**
 * Answer an agent in a sentence, from wherever you are.
 *
 * The same call the Inbox drawer's reply box makes, as a store action so
 * Mission's tiles and the drawer cannot drift on what "a reply" means.
 * Trims, and refuses to send an empty line: a bare carriage return into a
 * live agent is a keystroke nobody asked for.
 */
replySession: (termId, text) => {
    const line = text.trim()
    if (!line) return
    window.api.pty.input(termId, line + "\r")
    pushActivity("attention", termId, "replied")
},
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/exitRecord.test.ts && npm run typecheck`
Expected: PASS, zero type errors.

- [ ] **Step 5: Commit the store action**

```bash
git add src/renderer/src/store.ts tests/exitRecord.test.ts
git commit -m "feat(store): replySession, the Inbox reply box as a store action

Mission's tiles are about to send the same line the drawer sends. One
action so the two cannot drift, and it refuses an empty line - a bare
carriage return into a live agent is a keystroke nobody asked for."
```

- [ ] **Step 6: Feed the changed count from the existing ownership poll**

In `src/renderer/src/components/MissionControl.tsx`, extend the imports:

```tsx
import { buildOwnership, type OwnershipMap } from "../ownership"
import { newCounts } from "../agentSignals"
import { exitCodeOf } from "../termExit"
import { resolveTileState } from "../tileState"
```

…and add `promptFor` to the existing `../missionTail` import.

Add state beside `ownership` (`:129`):

```tsx
// Paths each session has made dirty since it started, from the SAME read the
// ownership map makes below — the chip adds no git call of its own.
const [changedBySession, setChangedBySession] = useState<Record<string, number>>({})
```

Inside the existing `fetchOwn` (`:133-154`), after `const entries = await Promise.all(...)`, and before the `setOwnership` call, replace the tail of the function with:

```tsx
if (!on) return
setOwnership(buildOwnership(entries))
setChangedBySession(newCounts(entries))
```

(The existing last line is `if (on) setOwnership(buildOwnership(entries))` — this replaces it.)

- [ ] **Step 7: Resolve the state per tile**

Still in `MissionControl.tsx`, inside `sessions.map((s) => { … })` (`:185-194`), replace the `stalled` computation with the full resolve. Keep `stalled` as a derived boolean — the tile's dashed left border still reads it:

```tsx
{sessions.map((s) => {
    const now = Date.now()
    const ago = relTime(now, getLastAt(s.termId))
    const isExpanded = expanded.has(s.termId)
    const trace = getTrace(s.termId)
    const st = resolveTileState(
        {
            status: s.status,
            prompt: promptFor(s),
            exitCode: exitCodeOf(s.termId),
            lastAt: getLastAt(s.termId),
            changedCount: changedBySession[s.termId] ?? 0,
            awaited: awaited.has(s.termId),
            alive: !!termAgents[s.termId]
        },
        now
    )
    const stalled = st.kind === "stalled"
    return (
```

- [ ] **Step 8: Render the chip in place of the two lines it replaces**

Replace the `aria-label` expression (`:206-219`) so the chip is what a screen reader hears — an `aria-label` overrides the tile's content entirely, so it has to carry everything a sighted user reads off the tile:

```tsx
aria-label={[s.sessionName, s.projectName, s.badge, st.chip, st.detail]
    .filter(Boolean)
    .join(" · ")}
data-tip={st.detail ?? (ago ? `Last output ${ago} ago` : undefined)}
```

Then delete both conditional lines (`:254-268`):

```tsx
{s.status === "attention" && (
    <div className="mission-tile-attn">needs you</div>
)}
{stalled && s.status !== "attention" && (
    <div className="mission-tile-stall">
        stalled · silent {ago}
    </div>
)}
```

…and put the chip where they were — after the peek/expanded block, before the `<svg className="mission-trace">`:

```tsx
<div className={"mtile-chip tone-" + st.tone}>
    <span className="mtile-mark" aria-hidden="true">
        {st.mark}
    </span>
    {st.chip}
</div>
{st.kind === "needs-you" && st.detail && (
    <div className="mtile-q" title={st.detail}>
        {st.detail}
    </div>
)}
```

- [ ] **Step 9: Render the actions, conditional on the state**

Immediately after the chip block (and still before the trace `<svg>`), add the action row. `stopPropagation` on the wrapper: the tile itself is a button that jumps to the terminal, which is exactly what these actions exist to avoid.

```tsx
{st.actions.length > 0 && (
    <div className="mtile-actions" onClick={(e) => e.stopPropagation()}>
        {st.actions.includes("approve") && prompt && (
            <>
                <button
                    className="ov-approve-yes"
                    data-tip="Send Yes to the agent"
                    onClick={() => respondApproval(s.termId, prompt.approve)}
                >
                    ✓ Approve
                </button>
                <button
                    className="ov-approve-no"
                    data-tip="Reject this action"
                    onClick={() => respondApproval(s.termId, prompt.deny)}
                >
                    ✕ Deny
                </button>
            </>
        )}
        {st.actions.includes("review") && (
            <button
                className="mtile-act"
                data-tip="Open this session's changes"
                onClick={() => openChanges(sessionCwd(s.termId), s.sessionName)}
            >
                Review
            </button>
        )}
        {st.actions.includes("reply") && (
            <input
                className="mtile-reply"
                placeholder="Reply…"
                value={drafts[s.termId] ?? ""}
                onChange={(e) =>
                    setDrafts((d) => ({ ...d, [s.termId]: e.target.value }))
                }
                onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    replySession(s.termId, drafts[s.termId] ?? "")
                    setDrafts((d) => ({ ...d, [s.termId]: "" }))
                }}
            />
        )}
    </div>
)}
```

For that to compile, three more things are needed in the component:

1. The prompt itself, so Approve/Deny have keystrokes to send. Inside the `map` callback, beside `const st = …`:

```tsx
const prompt = promptFor(s)
```

…and pass that same value into the resolver instead of calling `promptFor` twice:

```tsx
const prompt = promptFor(s)
const st = resolveTileState({ status: s.status, prompt, /* …the rest as in Step 7… */ }, now)
```

2. The store actions, with the other selectors at the top of the component (`:27-31`):

```tsx
const respondApproval = useStore((s) => s.respondApproval)
const replySession = useStore((s) => s.replySession)
const sessionCwd = useStore((s) => s.sessionCwd)
```

3. The reply drafts, beside `expanded` (`:58`):

```tsx
// Reply drafts per session. Local, and cleared on send: a half-typed reply is
// not worth persisting, and every tile holding one would be state churn on a
// component that re-renders once a second.
const [drafts, setDrafts] = useState<Record<string, string>>({})
```

- [ ] **Step 10: Style the chip**

Append to `src/renderer/src/styles.css`, after the existing `.mission-tile-full` rule (~`:694`). Delete the now-dead `.mission-tile-attn` and `.mission-tile-stall` rules (`:657-660`, `:668-671`) — keep `.mission-tile.stalled`'s dashed border (`:665-667`) and `.mission-tile.status-attention`'s solid one (`:615-617`), which still carry the same distinction at the tile level.

```css
/* ---------- Mission tile state chip ----------
   One chip per tile, replacing the `needs you` and `stalled · silent 7m` lines.
   Tone is carried by a TOKEN plus a per-state glyph, never by hue alone: --clay
   and --danger sit a shade apart in Sumi and Washi, and this has to separate in
   all 84 skins. --ok and --danger stay semantic (success, destructive) and are
   deliberately unused here. */
.mtile-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    align-self: flex-start;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--border-soft);
    color: var(--muted);
}
.mtile-mark {
    font-size: 9px;
    line-height: 1;
}
.mtile-chip.tone-attention {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.mtile-chip.tone-warn {
    color: var(--clay);
    border-color: color-mix(in srgb, var(--clay) 45%, var(--border));
    border-style: dashed;
}
.mtile-chip.tone-neutral {
    color: var(--text);
}
.mtile-chip.tone-quiet {
    color: var(--faint);
}
/* The question, under NEEDS YOU. One line: the tile is already dense, and the
   full text is in the tooltip and the terminal. */
.mtile-q {
    font-size: 11px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.mtile-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
}
.mtile-act {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    color: var(--text);
    background: transparent;
    cursor: pointer;
}
.mtile-act:hover {
    border-color: var(--accent);
    color: var(--accent);
}
.mtile-reply {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    font-family: inherit;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-1);
    color: var(--text);
}
.mtile-reply:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
}
```

> `--bg-1`, `--border-soft`, `--clay`, `--faint` must all already exist. Verify with `grep -n "\-\-bg-1\|--border-soft\|--clay\|--faint" src/renderer/src/themes.ts src/renderer/src/styles.css | head`. If any is not a real token, use the nearest one that is — **do not invent a token or hard-code a colour.**

- [ ] **Step 11: Verify the suite and the types**

Run: `npm test && npm run typecheck`
Expected: all tests pass; zero type errors.

Watch for the getSnapshot trap while you are here: none of the new selectors may return a fresh array or object. `useStore((s) => s.replySession)` and friends select stable function references, which is safe; `newCounts(...)` is called inside an effect and stored in `useState`, not inside a selector.

- [ ] **Step 12: Build**

Run: `npx electron-vite build`
Expected: build succeeds. (A segfault or OOM here is memory pressure, not code — free RAM and retry.)

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/components/MissionControl.tsx src/renderer/src/styles.css
git commit -m "feat(mission): decide from the tile, not from eight tabs

One chip per agent tile saying what it is doing, plus only the action that
answers it: Approve/Deny on a parsed prompt, Reply on a question or a
stall, Review on changed files. Net shorter on most tiles - the chip
replaces the 'needs you' and 'stalled' lines, and the quiet states gain
no buttons at all."
```

---

### Task 6: Verify it in the running app, and write it down

There is no headless renderer, and this is new chrome on the app's densest element. The chip has to be checked in the real window.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-mission-decide-design.md` (status line)
- Modify: `CHANGELOG.md`
- Modify: `DESIGN.md` if — and only if — the chip introduces a pattern worth recording there

- [ ] **Step 1: Launch and drive the app**

Use the **`run-app` skill** (`.claude/skills/run-app/`). Build first (`npx electron-vite build`); the harness loads `out/`.

Check, on the Mission view with at least one agent session running:
- A quiet tile shows one chip and **no** buttons — the common case must not have grown.
- Tiles are not taller than they were for the quiet states (the chip replaced two lines).
- The chip's text does not wrap or overflow its tile at a narrow window width.

- [ ] **Step 2: Check both themes and reduced motion**

Switch to a dark theme (Sumi) and a light one (Washi) and confirm every tone is legible in both — particularly `tone-warn` against `tone-attention`, the pair that has been indistinguishable before. Emulate `prefers-reduced-motion: reduce` (CDP: `Emulation.setEmulatedMedia`) and confirm nothing new animates.

- [ ] **Step 3: Screenshot the states you can produce**

At minimum capture QUIET and one of NEEDS YOU / ASKING / CHANGED. You can force a state without an agent by running, in the renderer console via CDP, a `useStore.setState` that flags a session `attention`, or by killing a pane's process to produce EXITED.

- [ ] **Step 4: Fix anything the app shows**

Anything found here is a bug in Task 5's work — fix it and re-verify before moving on. Commit fixes separately with `fix(mission): …`.

- [ ] **Step 5: Mark the spec shipped and write the changelog**

In `docs/superpowers/specs/2026-08-21-mission-decide-design.md`, change:

```markdown
**Status:** draft, awaiting review
```

to:

```markdown
**Status:** shipped 2026-08-24
```

Add a `CHANGELOG.md` entry under the current unreleased heading (match the file's existing format):

```markdown
- **Decide from Mission.** Every agent tile now carries one state chip — NEEDS
  YOU, EXITED, ASKING, STALLED, CHANGED, WORKING, QUIET — and only the action
  that answers it: Approve/Deny on a detected permission prompt, Reply on a
  question or a stall, Review on files the session changed. The chip replaces
  the old `needs you` and `stalled` lines, so quiet tiles got shorter, not
  taller. The pty exit code is now recorded per session, so a dead pane reads as
  dead instead of merely silent.
```

- [ ] **Step 6: Final gate**

Run: `npm test && npm run typecheck`
Expected: all pass, zero errors.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-08-21-mission-decide-design.md CHANGELOG.md
git commit -m "docs(mission): mark decide-from-Mission shipped"
```

---

## Notes for the executor

- **The one place this plan interprets the spec:** the spec's table puts `CHANGED` (#5) above `WORKING` (#6), so an agent that is mid-turn *and* has already changed files reads `CHANGED · n files` rather than `WORKING`. That is the spec's stated precedence and is implemented as written — work that exists is reviewable whether or not the agent is finished with it. If it reads wrong in the app during Task 6, raise it rather than silently reordering.
- **Do not shorten the 8s ownership poll** to make the changed count fresher. The spec is explicit: "If the changed-files count needs to be fresher than 8s, that is a caching problem to solve first, not a reason to poll harder."
- **`exitCode === 0` is an exit.** Every guard must be `!== undefined`.
- **Approve/Deny may only be offered when `promptFor` returned a prompt**, which is gated on `attention`/`waiting`. Never render them from `st.actions` alone without the prompt in hand — Step 9 guards on both for that reason.
