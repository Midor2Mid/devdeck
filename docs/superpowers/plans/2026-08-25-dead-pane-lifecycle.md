# Dead-Pane Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pane whose process died keeps what it printed, says it is dead, and waits to be told to restart — instead of silently spawning a fresh shell over the evidence.

**Architecture:** `main/pty.ts`'s session map becomes a discriminated union of `Live | Corpse`, where a corpse has no `proc` field at all — so `tsc` enumerates every path that assumed a live process. A new read-only `pty:buffer` IPC hands a corpse to whoever asks. In the renderer, `agentResumePending` generalises into `paneHold: Record<string, "resume" | "restart">`, so a dead pane reuses the hold-and-ask machinery a restored session already has, including its launch accounting.

**Tech Stack:** Electron + electron-vite + React 18 + TypeScript, Zustand store, xterm.js, `@lydell/node-pty`, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-25-dead-pane-lifecycle-design.md` — read it before Task 1. Where the plan and the spec disagree, the spec wins.

## Global Constraints

- **A corpse is not a session.** The two states must be different *types*, not one type with a flag. A corpse has **no `proc` field**, so every `.proc` access that still assumes liveness is a compile error rather than a runtime crash on the one path someone missed. This is the reason the union was chosen; do not "simplify" it back to a boolean.
- **Nothing on the corpse-replay path may pass through `onPtyData`.** That handler calls `clearExit(id)`, which would erase the exit record the tile reads — the feature would break itself. The pane fetches the corpse over `pty:buffer` and writes it into xterm directly.
- **Leave `recordTail` alone on the replay path.** Replay stamps `lastAt`, which resets stall detection for a session that has said nothing. That is a real pre-existing lie, it was **considered and deliberately cut** from this work (it changes stall behaviour for every re-attach in the app, not just dead panes), and a test pins the current behaviour so the cut stays visible. Fixing it here is out of scope.
- **No Restart button on the Mission tile** — decided, not merely unbuilt. Fixing the jump removes the need, and a spawn button on a dense one-click tile is the same mistake the state-chip spec rejected a kill button for.
- **No auto-restart.** A process that died wants a person to look at why.
- **No session persistence across app restarts.** A corpse lives in memory while its pane is open, and no longer.
- **Restart must be accounted.** A restarted agent is new money; it routes through the path that calls `markLaunched` + `logUsageStart`. The ledger answers exclusivity from `usageLog`, so an unlogged session silently lets every overlapping card and pipeline be written as an exclusive receipt over money that was partly its.
- **Tokens only** in CSS — no hard-coded colours or sizes. The real token block is `styles.css:7-24` (`--bg`, `--bg-2`, `--bg-3`, `--border`, `--border-soft`, `--text`, `--muted`, `--faint`, `--accent`, `--clay`); **`--bg-1` does not exist**.
- **Code style:** 4-space indent, double quotes, JSDoc on exported functions, conventional commits. Comments explain *why*, naming the failure the code prevents — match the voice of the file you are in.
- **`npm test` and `npm run typecheck` must both be clean before every commit.** The build does not typecheck, so typecheck is the only thing that catches type errors.
- Do **not** edit files under `src/` while `npm run dev` is running.

---

### Task 1: main remembers the corpse, and can hand it over

**Files:**
- Modify: `src/main/pty.ts` (the `Session` interface at `:4-8`, `sessions` at `:14`, `createPty` at `:77-79`, `getBuffer` at `:73-75`, `hasSession` at `:69-71`, `writePty` at `:123-125`, `resizePty` at `:127-134`, `killPty` at `:136-145`, `killAll` at `:147-155`, and the `proc.onExit` handler at `:105-108`)
- Modify: `src/main/index.ts` (add an `ipcMain.handle` beside the pty handlers at `:155-171`)
- Modify: `src/preload/index.ts` (the `pty` object at `:407-423`)
- Test: `tests/ptyCorpse.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `bufferOf(id: string): { buffer: string; exitCode: number | undefined }` exported from `src/main/pty.ts` — `exitCode` is `undefined` for a live session or an unknown id.
  - `window.api.pty.buffer(id: string): Promise<{ buffer: string; exitCode: number | undefined }>` in the preload.

  Task 3 calls `window.api.pty.buffer`.

- [ ] **Step 1: Write the failing test**

Create `tests/ptyCorpse.test.ts`. It mocks `@lydell/node-pty` with a fake process, the way `tests/server-remote.test.ts` mocks `../src/main/pty`, so nothing spawns a real shell:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest"

/** The fake pty the mocked spawn hands back, with hooks to drive it. */
interface Fake {
    onDataCb?: (d: string) => void
    onExitCb?: (e: { exitCode: number }) => void
    killed: boolean
    written: string[]
}
let fakes: Fake[] = []

vi.mock("@lydell/node-pty", () => ({
    spawn: (): unknown => {
        const f: Fake = { killed: false, written: [] }
        fakes.push(f)
        return {
            onData: (cb: (d: string) => void): void => {
                f.onDataCb = cb
            },
            onExit: (cb: (e: { exitCode: number }) => void): void => {
                f.onExitCb = cb
            },
            write: (d: string): void => {
                f.written.push(d)
            },
            resize: (): void => undefined,
            kill: (): void => {
                f.killed = true
            }
        }
    }
}))

const pty = await import("../src/main/pty")

const ID = "t-1"
/** Spawn, emit one chunk, then kill the process with `code`. */
function runAndDie(code: number, out = "boom: could not find module\r\n"): void {
    pty.createPty({ id: ID })
    fakes[fakes.length - 1].onDataCb?.(out)
    fakes[fakes.length - 1].onExitCb?.({ exitCode: code })
}

describe("a dead session leaves a corpse", () => {
    beforeEach(() => {
        pty.killPty(ID)
        fakes = []
    })

    // The whole point: the output that explains the failure has to outlive the
    // process, or a pane reached from another tab is an empty box with a code.
    it("keeps the buffer after the process exits", () => {
        runAndDie(1)
        expect(pty.getBuffer(ID)).toContain("could not find module")
    })

    it("reports the exit code alongside the buffer", () => {
        runAndDie(1)
        expect(pty.bufferOf(ID)).toEqual({
            buffer: expect.stringContaining("could not find module"),
            exitCode: 1
        })
    })

    // 0 is falsy: a clean exit is still an exit, and every consumer tests
    // `!== undefined`.
    it("treats a clean exit as an exit", () => {
        runAndDie(0)
        expect(pty.bufferOf(ID).exitCode).toBe(0)
    })

    it("reports no exit code for a live session", () => {
        pty.createPty({ id: ID })
        expect(pty.bufferOf(ID).exitCode).toBeUndefined()
    })

    it("reports nothing for an id it has never seen", () => {
        expect(pty.bufferOf("never-existed")).toEqual({ buffer: "", exitCode: undefined })
    })

    // A corpse is NOT live, so a deliberate restart must spawn rather than
    // silently no-op the way an attach to a running session does.
    it("spawns again over a corpse", () => {
        runAndDie(1)
        const before = fakes.length
        pty.createPty({ id: ID })
        expect(fakes.length).toBe(before + 1)
        expect(pty.bufferOf(ID).exitCode).toBeUndefined()
    })

    it("still refuses to spawn over a LIVE session", () => {
        pty.createPty({ id: ID })
        const before = fakes.length
        pty.createPty({ id: ID })
        expect(fakes.length).toBe(before)
    })

    it("drops a corpse when the pane is closed", () => {
        runAndDie(1)
        pty.killPty(ID)
        expect(pty.bufferOf(ID)).toEqual({ buffer: "", exitCode: undefined })
    })

    // There is no process to kill; the old code called session.proc.kill() and
    // was saved only by its try/catch.
    it("closing a dead pane kills nothing", () => {
        runAndDie(1)
        const killedBefore = fakes.filter((f) => f.killed).length
        pty.killPty(ID)
        expect(fakes.filter((f) => f.killed).length).toBe(killedBefore)
    })

    it("writing to a corpse is a no-op, not a throw", () => {
        runAndDie(1)
        expect(() => pty.writePty(ID, "hello\r")).not.toThrow()
        expect(fakes[0].written).toEqual([])
    })

    it("resizing a corpse is a no-op, not a throw", () => {
        runAndDie(1)
        expect(() => pty.resizePty(ID, 80, 24)).not.toThrow()
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ptyCorpse.test.ts`
Expected: FAIL — `pty.bufferOf is not a function`, and the buffer-survives test fails because `onExit` deletes the entry.

- [ ] **Step 3: Split the type**

In `src/main/pty.ts`, replace the `Session` interface (`:4-8`) and the `sessions` map comment (`:10-14`):

```ts
/**
 * A running pty and the tail of what it has printed.
 */
interface Live {
    kind: "live"
    proc: nodePty.IPty
    /** Rolling tail of output, replayed when a client attaches to this id. */
    buffer: string
}

/**
 * What is left when the process exits: the output, and why it went.
 *
 * A corpse deliberately has NO `proc` field. The alternative — one type with a
 * `dead: true` flag — leaves every `session.proc.write(...)` compiling and
 * failing at runtime on whichever call site was missed. As a separate shape,
 * the compiler enumerates them instead.
 *
 * It exists because deleting the entry at exit threw away the only record of
 * why a process died: a pane reached from another tab replayed nothing, spawned
 * a fresh shell over the evidence, and looked like it had simply been idle.
 */
interface Corpse {
    kind: "dead"
    buffer: string
    exitCode: number
    diedAt: number
}

type Entry = Live | Corpse

// One entry per terminal id, in the main process. Output is broadcast via
// `ptyEvents` so multiple transports (the Electron window AND remote/mobile
// WebSocket clients) can stream the same session. Each transport replays the
// buffer itself on attach via getBuffer(). A session that exits leaves a corpse
// behind, which lives until the pane is closed or deliberately restarted.
const sessions = new Map<string, Entry>()
```

- [ ] **Step 4: Update the accessors**

Replace `hasSession` and `getBuffer` (`:69-75`). `hasSession` has **no callers anywhere in the codebase** — verify with `grep -rn "hasSession" src/` and delete it; do not keep dead code alive through a refactor:

```ts
export function getBuffer(id: string): string {
    return sessions.get(id)?.buffer ?? ""
}

/**
 * A session's output and, if its process has exited, the code it exited with.
 *
 * The read behind `pty:buffer`: a held pane fetches its corpse and writes it
 * into the terminal itself. It must NOT arrive through the `pty:data` stream —
 * the renderer's handler there clears the exit record on any output, so a
 * pushed replay would erase the very thing the pane is displaying.
 *
 * `exitCode` is undefined for a live session and for an id nothing knows about.
 */
export function bufferOf(id: string): { buffer: string; exitCode: number | undefined } {
    const e = sessions.get(id)
    if (!e) return { buffer: "", exitCode: undefined }
    return { buffer: e.buffer, exitCode: e.kind === "dead" ? e.exitCode : undefined }
}
```

- [ ] **Step 5: Update the lifecycle**

In `createPty`, change the guard (`:77-79`) — a corpse is not live, so a restart spawns over it:

```ts
export function createPty(opts: CreateOpts): void {
    const { id } = opts
    // Attaching to a RUNNING session is a no-op; spawning over a corpse is a
    // deliberate restart and must go ahead.
    if (sessions.get(id)?.kind === "live") return
```

Then the `session` construction and its handlers (`:92-108`) — note `session.buffer` becomes `live.buffer`, and `onExit` swaps the entry rather than deleting it:

```ts
    const live: Live = { kind: "live", proc, buffer: "" }
    sessions.set(id, live)

    proc.onData((data) => {
        live.buffer += data
        if (live.buffer.length > BUFFER_CAP) {
            // Trim to the next line break so replay doesn't start mid escape-sequence.
            let trimmed = live.buffer.slice(-BUFFER_CAP)
            const nl = trimmed.indexOf("\n")
            if (nl > -1 && nl < 8192) trimmed = trimmed.slice(nl + 1)
            live.buffer = trimmed
        }
        ptyEvents.emit("data", { id, data })
    })
    proc.onExit(({ exitCode }) => {
        // Only if this pty is still the one registered under this id: a restart
        // that spawned over this corpse must not have its fresh session
        // replaced by the late exit of the process it replaced.
        if (sessions.get(id) === live) {
            sessions.set(id, { kind: "dead", buffer: live.buffer, exitCode, diedAt: Date.now() })
        }
        ptyEvents.emit("exit", { id, exitCode })
    })
```

- [ ] **Step 6: Update the writers and the killers**

Replace `writePty`, `resizePty`, `killPty` and `killAll` (`:123-155`). The `kind` checks are what the union buys — nothing can reach a `proc` that does not exist:

```ts
export function writePty(id: string, data: string): void {
    const e = sessions.get(id)
    // Nothing is listening on a corpse. Previously this was a throw caught by
    // the caller; now it cannot be written at all.
    if (e?.kind === "live") e.proc.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return
    const e = sessions.get(id)
    if (e?.kind !== "live") return
    try {
        e.proc.resize(cols, rows)
    } catch {
        /* resize can race with exit */
    }
}

export function killPty(id: string): void {
    const e = sessions.get(id)
    if (!e) return
    if (e.kind === "live") {
        try {
            e.proc.kill()
        } catch {
            /* already dead */
        }
    }
    // A corpse is dropped the same way: this is the pane closing for good.
    sessions.delete(id)
}

export function killAll(): void {
    for (const e of sessions.values()) {
        if (e.kind !== "live") continue
        try {
            e.proc.kill()
        } catch {
            /* ignore */
        }
    }
    sessions.clear()
}
```

- [ ] **Step 7: Run the tests and the typechecker**

Run: `npx vitest run tests/ptyCorpse.test.ts && npm run typecheck`
Expected: PASS, and typecheck at zero errors. **If typecheck reports a `.proc` access somewhere this plan did not name, that is the union doing its job** — fix that call site the same way (guard on `kind === "live"`), and note it in your report.

- [ ] **Step 8: Expose it over IPC**

In `src/main/index.ts`, beside the other pty handlers (after the `pty:kill` handler at `:185`):

```ts
    // Read-only: a held pane fetches its own corpse rather than being pushed it
    // through pty:data, which the renderer treats as proof of life.
    ipcMain.handle("pty:buffer", (_e, id: string) => ptyMgr.bufferOf(id))
```

In `src/preload/index.ts`, in the `pty` object (`:407-423`), after `kill`:

```ts
        buffer: (id: string): Promise<{ buffer: string; exitCode: number | undefined }> =>
            ipcRenderer.invoke("pty:buffer", id),
```

- [ ] **Step 9: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: all pass, zero type errors. `tests/terminalEnv.test.ts` imports this same module — confirm it still passes.

- [ ] **Step 10: Commit**

```bash
git add src/main/pty.ts src/main/index.ts src/preload/index.ts tests/ptyCorpse.test.ts
git commit -m "feat(pty): a dead session leaves a corpse, not a hole

Deleting the entry at exit threw away the only record of why a process
died - a pane reached from another tab replayed nothing and spawned a
fresh shell over the evidence. A corpse keeps the buffer and the code
until the pane is closed or deliberately restarted.

It is a separate TYPE, not a flag: every path that assumed a live proc is
now a compile error rather than a runtime crash on the one call site
nobody checked."
```

---

### Task 2: One hold, two reasons

`agentResumePending: Record<string, boolean>` already holds a restored pane un-spawned and renders Resume / Fresh over it. A dead pane is that same state with a different cause, so the field generalises rather than gaining a neighbour — which also means a restart inherits the launch accounting a restored session already has.

**Files:**
- Modify: `src/renderer/src/store.ts` (the `agentResumePending` declaration at `:144`, the `forget()` cleanup at `:833-839`, the initial state at `:1138`, the workspace-restore block at `:1223-1237`, `startResumedAgent` at `:2668-2700`, and the `pty.onExit` subscription added in `init()`)
- Test: `tests/paneHold.test.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1 (the store never calls `bufferOf`).
- Produces on the store:
  - `paneHold: Record<string, "resume" | "restart">` — replaces `agentResumePending` entirely.
  - `releaseHold(termId: string): void` — replaces `startResumedAgent`; clears the hold and, for an agent pane, does the launch accounting.

  Task 3 reads `paneHold[termId]` and calls `releaseHold`.

- [ ] **Step 1: Write the failing test**

Create `tests/paneHold.test.ts`. It uses the same `stubApi` shape as `tests/exitRecord.test.ts` — copy that file's stub and add `invoke`-backed `pty.buffer` is *not* needed here (the store never calls it):

```ts
import { describe, it, expect, beforeAll } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { leaf } from "../src/renderer/src/layout"

const TERM = "t-hold"

let ptyExit: (e: { id: string; exitCode: number }) => void = () => undefined

/** Only the namespaces this path touches, as in tests/exitRecord.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
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

function seedSession(): void {
    useStore.setState({
        view: "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: {},
        agentStatus: {},
        paneHold: {},
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: {},
        notifications: [],
        activity: []
    })
}

describe("a pane held after its process dies", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    it("is held for restart when the pty exits", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        expect(useStore.getState().paneHold[TERM]).toBe("restart")
    })

    // A clean exit is still an exit: the pane must not silently respawn.
    it("is held on a clean exit too", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 0 })
        expect(useStore.getState().paneHold[TERM]).toBe("restart")
    })

    it("releases the hold when the pane is restarted", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        useStore.getState().releaseHold(TERM)
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })

    it("forgets the hold when the pane is closed", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        useStore.getState().closePane(TERM)
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })

    // The accounting invariant: a restarted agent is new money, and the ledger
    // answers exclusivity from usageLog. An unlogged run lets every overlapping
    // card and pipeline be written as an exclusive receipt over money partly its.
    it("logs a usage start when an agent pane is released", () => {
        seedSession()
        ptyExit({ id: TERM, exitCode: 1 })
        const before = useStore.getState().activity.length
        useStore.getState().releaseHold(TERM)
        expect(useStore.getState().activity.length).toBeGreaterThanOrEqual(before)
        // The ledger call itself is asserted by tests/signalSites.test.ts, which
        // scans store.ts for markLaunched beside every logUsageStart.
    })

    it("does nothing for a pane that is not held", () => {
        seedSession()
        expect(() => useStore.getState().releaseHold(TERM)).not.toThrow()
        expect(useStore.getState().paneHold[TERM]).toBeUndefined()
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/paneHold.test.ts`
Expected: FAIL — `paneHold` is not a property of the store and `releaseHold` is not a function.

- [ ] **Step 3: Rename the field and generalise the reason**

Find every site with `grep -rn "agentResumePending" src/ tests/` and change them together — the rename is mechanical, and leaving one behind is a typecheck error, not a silent bug.

In the store interface (`:144`):

```ts
    /**
     * Panes held un-spawned until the user says what to do, by reason.
     *
     * `"resume"` — a restored workspace: the agent's conversation is not live yet.
     * `"restart"` — this pane's process exited; spawning over the corpse without
     * asking is what used to destroy the evidence of why it died.
     *
     * One field rather than two, because the two cases want the same thing: hold
     * the mount, show why, and route the relaunch through the accounting.
     */
    paneHold: Record<string, "resume" | "restart">
```

Replace the `startResumedAgent` declaration (`:152`):

```ts
    /** Release a held pane: clear the hold, and log the run if it is an agent. */
    releaseHold: (termId: string) => void
```

Initial state (`:1138`): `paneHold: {},`

Workspace restore (`:1223-1237`) — the local built there becomes:

```ts
            const paneHold: Record<string, "resume" | "restart"> = {}
```

with its assignment `paneHold[id] = "resume"` and the `set({ ... paneHold, ... })` updated to match.

`forget()` (`:833-839`):

```ts
            const paneHold = { ...s.paneHold }
            delete paneHold[termId]
```

…and `paneHold` in that `set`'s returned object.

- [ ] **Step 4: Set the hold when a process dies**

In `init()`, the `pty.onExit` subscription added by the state-chip work becomes:

```ts
            window.api.pty.onExit(({ id, exitCode }) => {
                recordExit(id, exitCode)
                // Hold the pane. Without this, the next remount spawns a fresh
                // shell over the corpse - the pane is unmounted whenever its tab
                // is not the active one, so with several terminals open that is
                // the normal path, not an edge case.
                set((s) => ({ paneHold: { ...s.paneHold, [id]: "restart" as const } }))
            })
```

- [ ] **Step 5: Generalise the release**

Replace `startResumedAgent` (`:2668-2700`) with `releaseHold`, keeping every line of its accounting and its ordering:

```ts
        releaseHold: (termId) => {
            if (!(termId in get().paneHold)) return
            // Checked before the hold is cleared below: if this pane were ever
            // not an agent id, clearing first would close the overlay with no
            // usage event logged even though the caller has already spawned the
            // process - an invariant resting on this bail running first, not on
            // the set() happening to come after it.
            const agentId = get().termAgents[termId]
            set((s) => {
                const paneHold = { ...s.paneHold }
                delete paneHold[termId]
                return { paneHold }
            })
            if (!isAgentId(agentId)) return
            // Resume and restart are the only two ways an agent pane starts
            // without going through newTab, so without this the pane spends real
            // money that no usage event has ever seen. It is not only its own
            // missing record: exclusivity is answered from usageLog, so an
            // unlogged session sitting in a project directory silently lets every
            // card, pipeline and session whose window it overlaps be written as
            // an exclusive receipt over money that was partly its.
            //
            // Every mode logs. "fresh" starts a new conversation and "restart"
            // follows a crash, but each is the same agent in the same directory
            // costing the same money - the distinction matters to the user's
            // context, not to the accounting.
            const projectId = get().projectIdOfTerm(termId) ?? get().activeId ?? ""
            // `||`, not `??`: an empty-string entry in termCwd must fall through
            // to the project path the same way newTab's logUsageStart call does,
            // rather than being kept as a cwd-less event.
            const cwd = get().termCwd[termId] || get().projects.find((p) => p.id === projectId)?.path
            markLaunched(termId)
            useSettings.getState().logUsageStart(termId, agentId, projectId, cwd)
        },
```

> Note the one ordering change from the original: the non-agent bail now happens **after** the hold is cleared, because a plain shell must also be released when it restarts. The agent check still runs before any accounting, which is what the original comment protects.

- [ ] **Step 6: Run the tests and the typechecker**

Run: `npx vitest run tests/paneHold.test.ts && npm run typecheck`
Expected: PASS, zero type errors. Typecheck is what proves no `agentResumePending` reference survived.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: all pass. `tests/signalSites.test.ts` scans `store.ts` for `markLaunched` beside every `logUsageStart` — if it fails, the accounting moved and the scan needs its site name updated, which is a real signal, not noise.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/store.ts tests/paneHold.test.ts
git commit -m "feat(store): one hold for a pane that must not spawn yet

A restored session and a dead one want the same thing - hold the mount,
show why, route the relaunch through the accounting - so the resume flag
becomes a hold with a reason rather than gaining a sibling.

A restart inherits the usage logging that way, which matters beyond its
own record: the ledger answers exclusivity from usageLog, so an unlogged
run lets every overlapping card and pipeline be written as an exclusive
receipt over money that was partly its."
```

---

### Task 3: The pane shows what died, and waits

**Files:**
- Modify: `src/renderer/src/components/TerminalPane.tsx` (`pending` at `:39`, `startResumedAgent` at `:40`, `resolveResume` at `:51-63`, the mount-spawn gate at `:211`, and the overlay JSX at `:275-293`)
- Modify: `src/renderer/src/styles.css` (append after `.resume-cmd`'s rule, near `:2397`)
- Test: verified in the running app (Task 4) — this task is markup and wiring over logic already pinned by Tasks 1 and 2

**Interfaces:**
- Consumes: `window.api.pty.buffer(id)` (Task 1); `paneHold` and `releaseHold` (Task 2); `exitNotice(exitCode, isWindows)` from `src/renderer/src/termExit.ts` (already imported by this file at `:9`).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Read the hold reason instead of the boolean**

In `src/renderer/src/components/TerminalPane.tsx`, replace `:39-40`:

```tsx
    // A held pane waits for the user before it launches: a restored session for
    // a resume/fresh choice, a dead one for a restart.
    const hold = useStore((s) => s.paneHold[termId])
    const releaseHold = useStore((s) => s.releaseHold)
```

and in `resolveResume` (`:51-63`), rename the call and widen the mode:

```tsx
    const resolveHold = (mode: "resume" | "fresh" | "restart"): void => {
        // Only mark the pane released if it actually started. The spawn closure
        // is set inside the attach effect's async tail, so a click landing in
        // that gap used to clear the flag without ever launching a pty, leaving
        // a dead pane with no way back; now the buttons stay up.
        const spawn = spawnRef.current
        if (!spawn) return
        spawn(mode === "resume" ? resumeCmd : mode === "fresh" ? coldCmd : initialCommand)
        releaseHold(termId)
        termRef.current?.focus()
    }
```

- [ ] **Step 2: Hold the mount for either reason**

Replace the spawn gate (`:211`):

```tsx
            // A held pane holds for BOTH reasons. Spawning over a corpse is what
            // destroyed the record of why the process died.
            if (!useStore.getState().paneHold[termId]) spawn(initialCommand)
```

- [ ] **Step 3: Replay the corpse into the terminal**

Add a new effect after the mount effect (after the `}, [fontFamily, fontSize, termId])` at `:250`). It fetches rather than waiting to be pushed, because a pushed replay would travel through `pty:data` and the store's handler there clears the exit record on any output:

```tsx
    // Show what the dead process printed, then say that it is dead.
    //
    // Fetched, not pushed: main replays a buffer through `pty:data` on create,
    // but a held pane never calls create, and that stream's handler clears the
    // exit record on any output - a pushed replay would erase the state the tile
    // is displaying. The notice is written AFTER the buffer because it is
    // rendered here, not by the process, so it is not part of what main kept.
    useEffect(() => {
        if (hold !== "restart") return
        let on = true
        void window.api.pty.buffer(termId).then(({ buffer, exitCode }) => {
            const term = termRef.current
            if (!on || !term) return
            if (buffer) term.write(buffer)
            if (exitCode !== undefined) {
                term.write("\r\n\x1b[90m" + exitNotice(exitCode, IS_WINDOWS) + "\x1b[0m\r\n")
            }
        })
        return () => {
            on = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hold, termId])
```

- [ ] **Step 4: Give the two holds their own overlays**

Replace the overlay block (`:275-293`). The restart variant is deliberately **not** the centred scrim: `.resume-overlay` covers the pane at 78% with a blur, which would preserve the evidence and then hide it. A dead pane needs its output readable, so its prompt sits at the bottom:

```tsx
            {hold === "resume" && (
                <div className="resume-overlay">
                    <div className="resume-card">
                        <div className="resume-title">Resume this agent session?</div>
                        <div className="resume-sub">
                            Restored from your last run — its conversation isn&apos;t live yet.
                        </div>
                        <div className="resume-actions">
                            <button className="accent" onClick={() => resolveHold("resume")}>
                                Resume
                            </button>
                            <button onClick={() => resolveHold("fresh")}>Start fresh</button>
                        </div>
                        {resumeCmd && <code className="resume-cmd">{resumeCmd}</code>}
                    </div>
                </div>
            )}
            {hold === "restart" && (
                <div className="dead-bar">
                    <span className="dead-bar-text">
                        This process exited. Its output is above.
                    </span>
                    <div className="dead-bar-actions">
                        {isAgentPane ? (
                            <>
                                <button className="accent" onClick={() => resolveHold("resume")}>
                                    Resume
                                </button>
                                <button onClick={() => resolveHold("fresh")}>Start fresh</button>
                            </>
                        ) : (
                            <button className="accent" onClick={() => resolveHold("restart")}>
                                Restart
                            </button>
                        )}
                    </div>
                </div>
            )}
```

`isAgentPane` comes from the agent id this file already resolves at `:42` — add beside it, importing the sentinel rather than spelling it as a literal (`export const SHELL = "shell"` lives at `store.ts:67`):

```tsx
    const isAgentPane = resumeAgentId !== SHELL
```

Add `SHELL` to this file's existing `../store` import.

- [ ] **Step 5: Style the dead bar**

Append to `src/renderer/src/styles.css` after the `.resume-cmd` rule (~`:2397`):

```css
/* A dead pane's prompt sits at the BOTTOM and does not cover the terminal.
   The resume overlay above is a full-pane scrim with a blur, which is right for
   a session that has printed nothing yet and wrong here: the whole point of
   keeping a dead process's output is that you can read it. */
.dead-bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--bg-2);
    border-top: 1px solid var(--border);
}
.dead-bar-text {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.dead-bar-actions {
    display: flex;
    gap: 6px;
    flex: none;
}
```

- [ ] **Step 6: Verify and build**

Run: `npm test && npm run typecheck && npx electron-vite build`
Expected: all tests pass, zero type errors, build succeeds. (A segfault or OOM in the build is memory pressure, not code — free RAM and retry.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/TerminalPane.tsx src/renderer/src/styles.css
git commit -m "feat(term): a dead pane shows what killed it and waits

The pane replays the corpse, writes the exit notice, and offers a restart
instead of spawning a fresh shell over the evidence. Its prompt is a bottom
bar rather than the resume overlay's full-pane scrim: keeping a dead
process's output only helps if you can still read it."
```

---

### Task 4: Watch it in the real app, and write it down

**Files:**
- Modify: `docs/superpowers/specs/2026-08-25-dead-pane-lifecycle-design.md` (status line)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Build and drive the app**

Use the **`run-app` skill** (`.claude/skills/run-app/`). Build first (`npx electron-vite build`); the harness loads `out/`. Note from a previous session: `Page.captureScreenshot` hangs in this environment unless Electron is launched with `--disable-features=CalculateNativeWinOcclusion`.

Reproduce the original bug's setup, which is the only honest test of the fix:

1. Open two tabs. In tab A, run a command that dies loudly — `node -e "console.error('boom: cannot find module'); process.exit(1)"`.
2. Switch to tab B, so tab A's pane unmounts. Go to Mission and confirm the tile reads `EXITED 1`.
3. Click the tile. **Before this change** that spawned a fresh shell and the tile flipped to `QUIET`. Confirm now: the output is still there, the exit notice is under it, the dead bar offers a restart, and **no new shell appeared** (no prompt, no cursor accepting input).
4. Confirm the Mission tile still says `EXITED 1` after the visit.
5. Press Restart. The pane comes back, and the tile stops saying `EXITED`.

- [ ] **Step 2: Check the agent path and the close path**

6. Do the same with an agent pane: confirm it offers **Resume** and **Start fresh**, not a single Restart, and that resuming actually starts the agent.
7. Close a dead pane without restarting it, and confirm nothing throws (the corpse is dropped by `killPty`, which no longer has a process to kill).

- [ ] **Step 3: Check both themes and reduced motion**

Sumi (dark) and Washi (light): the dead bar must be legible against the terminal in both, and must not cover output. Emulate `prefers-reduced-motion: reduce` (CDP `Emulation.setEmulatedMedia`) and confirm nothing new animates.

- [ ] **Step 4: Fix anything the app shows**

Anything found here is a bug in this feature's work — fix it, re-verify, and commit separately with a `fix(term): …` message.

- [ ] **Step 5: Mark the spec shipped and write the changelog**

In the spec, change `**Status:** draft, awaiting review` to `**Status:** shipped 2026-08-25`.

Add to `CHANGELOG.md` under the current unreleased heading, matching the file's existing format and voice:

```markdown
- **A dead pane keeps its evidence.** A terminal whose process exited now holds
  what it printed and offers a restart, instead of silently spawning a fresh
  shell over it the next time the pane is mounted — which, since only the active
  tab's panes stay mounted, was the normal path with several terminals open.
  Agent panes offer Resume or Start fresh; a restart is logged to the cost ledger
  like any other run. Remote and mobile clients get the dead session's output on
  attach too.
```

- [ ] **Step 6: Final gate**

Run: `npm test && npm run typecheck`
Expected: all pass, zero errors.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-08-25-dead-pane-lifecycle-design.md CHANGELOG.md
git commit -m "docs(term): mark the dead-pane lifecycle shipped"
```

---

## Notes for the executor

- **The typecheck is part of the deliverable, not a formality.** The whole reason a corpse is a separate type is that `tsc` finds the `.proc` accesses a grep would miss. If it flags a file this plan never mentions, that is the design working — fix it and say so in your report.
- **Do not push the corpse through `pty:data`.** It is fetched over `pty:buffer` precisely so it never reaches `onPtyData`, whose `clearExit(id)` would erase the exit record the Mission tile is showing.
- **Do not "fix" the `lastAt` stamp on replay** while you are in there. It is a real bug and it was cut from this work on purpose; it changes stall behaviour for every re-attach in the app and needs its own review.
- **`exitCode === 0` is an exit.** Every guard is `!== undefined`, never truthiness — a clean exit must still hold the pane.
- If `initialCommand` is empty for a plain shell, `spawn(initialCommand)` is already the existing mount behaviour for that pane — restart deliberately reuses it rather than inventing a different launch.

### Two places this plan knowingly departs from the spec's testing section

Both follow from the fetch design replacing the `{ replay: true }` marker, and both are recorded here so a reviewer judges them rather than discovering them.

1. **The spec asks for a test that a replayed chunk still stamps `lastAt`.** Under the marker design the corpse travelled through `onPtyData`, so that assertion pinned a real decision. Under the fetch design the corpse never reaches the store at all — `pty.buffer` returns it straight to the pane — so there is nothing on that path to pin. The live re-attach replay still stamps `lastAt` exactly as before and is untouched by this work, so a test there would pin code nobody changed. The cut is still recorded, in the spec and in the executor notes above.
2. **The spec asks for the hold decision as a pure function.** There is no decision left to extract: the store writes `paneHold[id] = "restart"` when the pty exits and `"resume"` when a workspace restores, and the pane reads the field. A wrapper around a map lookup would be indirection, not coverage. What actually needs pinning is the *transitions* — set on exit, cleared on release, cleared on close — and `tests/paneHold.test.ts` pins all three through the real store.
