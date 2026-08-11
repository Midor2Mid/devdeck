# Mission Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Mission Control agent tile a two-minute trace of its agent's real output rate, sized so that for a `working` session a flat trace is exactly what `isStalled` reports.

**Architecture:** All new state lives in `src/renderer/src/missionTail.ts` as module-level maps, deliberately outside the zustand store — the pty stream is fast, and putting 60 samples per session into the store would re-render the app every second. There is no timer: each session's ring records the start time of its newest bucket and rolls forward on read or write, so every function is pure enough to test with an injected `now`. The renderer is one inline SVG `<path>` per tile in `currentColor`.

**Tech Stack:** TypeScript, React 18, zustand, vitest, Electron (renderer only — no main-process or IPC changes in this plan).

**Spec:** `docs/superpowers/specs/2026-08-11-mission-trace-design.md`

## Global Constraints

- 4-space indentation, double quotes for strings (repo-wide style).
- **No hard-coded colors or sizes in components** — tokens only (`var(--muted)`, `var(--radius)`, …). A hard-coded hex is a bug in this codebase: a theme switch would leave it behind. See `DESIGN.md`.
- **No emoji and no decorative Unicode in chrome.** Icons come from `src/renderer/src/components/Icon.tsx`.
- **State must be shown in form, not color alone** — the app ships 7 themes × 12 styles.
- `npm run typecheck` must end at **zero errors**. The build does not typecheck, so nothing else catches this.
- `npm test` (vitest) must pass — currently 469 tests.
- Conventional commit messages (`feat:`, `fix:`, `docs:`, `refactor:`, …).
- **Do not edit files under `src/` while `npm run dev` is running** — live HMR on a mid-edit state crashes the dev process.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/renderer/src/missionTail.ts` | All trace measurement, storage, and the SVG path helper. Pure/module-level, no React, no IPC. | Modify (+~80 lines) |
| `tests/missionTail.test.ts` | Unit tests for all of the above. | Modify |
| `src/renderer/src/store.ts` | One call added in `onPtyData` to feed the rate. | Modify (1 line + import) |
| `src/renderer/src/components/MissionControl.tsx` | Renders the trace; later drops the ribbon and time text. | Modify |
| `src/renderer/src/styles.css` | `.mission-trace` rules; later deletes `.mission-tile-stalled`. | Modify |

No new files. `missionTail.ts` ends at roughly 190 lines, well under the 500-line guideline.

---

### Task 1: `printableDelta` — measure output, not spinner noise

This is the crux of the whole feature. Raw pty bytes would lie: Claude Code's spinner emits a few bytes many times a second, so a wedged agent still spinning would draw a healthy trace.

`cleanTail` cannot be reused, despite living in the same file and stripping the same escape sequences: it rewrites `\r` to `\n` (correct for a readable peek), which would score every spinner frame as a completed line. This function needs `\r` to **discard** the pending segment, which is what a carriage return actually does to a terminal line.

**Files:**
- Modify: `src/renderer/src/missionTail.ts` (add after `lastLines`, around line 40)
- Test: `tests/missionTail.test.ts`

**Interfaces:**
- Consumes: the existing module-private regexes `OSC`, `CSI`, `OTHER`, `CTRL` (`missionTail.ts:7-11`). Note `CTRL` deliberately does not strip `\r` (0x0d falls between its `\x0c` and `\x0e-\x1f` ranges), so the carriage returns survive to be interpreted here.
- Produces: `export function printableDelta(chunk: string): number`

- [ ] **Step 1: Write the failing tests**

Add to `tests/missionTail.test.ts`. Import `printableDelta` by adding it to the existing import on line 2.

```typescript
describe("printableDelta", () => {
    it("counts non-whitespace characters in completed lines", () => {
        expect(printableDelta("hello world\n")).toBe(10)
    })

    it("scores a carriage-return spinner frame as zero", () => {
        // A spinner rewrites one line in place and never commits it.
        expect(printableDelta("\r| Thinking...")).toBe(0)
        expect(printableDelta("\r/ Thinking...\r- Thinking...")).toBe(0)
    })

    it("scores an ANSI-only chunk as zero", () => {
        expect(printableDelta("\x1b[2K\x1b[1G")).toBe(0)
        expect(printableDelta("\x1b[31m\x1b[0m")).toBe(0)
    })

    it("does not count a trailing unterminated segment", () => {
        expect(printableDelta("done\nbut not this")).toBe(4)
    })

    it("counts a line that a carriage return revised before committing", () => {
        // The final revision is what reached the screen.
        expect(printableDelta("draft\rfinal\n")).toBe(5)
    })

    it("ignores whitespace and tabs in the count", () => {
        expect(printableDelta("  a\tb  \n")).toBe(2)
    })

    it("returns zero for an empty chunk", () => {
        expect(printableDelta("")).toBe(0)
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: FAIL — `printableDelta is not a function` / TypeScript cannot resolve the import.

- [ ] **Step 3: Write the implementation**

Add to `src/renderer/src/missionTail.ts`, directly after `lastLines` (line 40):

```typescript
/**
 * Committed printable characters in a raw pty chunk — the trace's unit of work.
 *
 * Deliberately NOT cleanTail: that rewrites \r to \n, which is right for a
 * readable peek and wrong here, because every spinner frame would then look like
 * a completed line and a wedged agent would draw a healthy trace. Here \r
 * discards the pending segment, the way a carriage return overwrites a terminal
 * line, so redraw-in-place scores zero and only text that actually scrolled past
 * counts.
 */
export function printableDelta(chunk: string): number {
    const s = chunk.replace(OSC, "").replace(CSI, "").replace(OTHER, "").replace(CTRL, "")
    let committed = ""
    let pending = ""
    for (const ch of s) {
        if (ch === "\n") {
            committed += pending
            pending = ""
        } else if (ch === "\r") {
            pending = ""
        } else {
            pending += ch
        }
    }
    return committed.replace(/\s/g, "").length
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: PASS, all seven new assertions green, existing tests untouched.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/missionTail.ts tests/missionTail.test.ts
git commit -m "feat(mission): measure committed printable output per pty chunk"
```

---

### Task 2: The ring buffer, log scale, and the stall constant

Sixty two-second buckets per session, rolled forward from the clock rather than by a timer.

The scale is logarithmic against a fixed ceiling. Not a per-session rolling max — that would normalise every agent to "equally busy" and destroy comparison between tiles. Not linear — one chatty agent would peg the scale while everyone else flatlines.

**Files:**
- Modify: `src/renderer/src/missionTail.ts`
- Test: `tests/missionTail.test.ts`

**Interfaces:**
- Consumes: `printableDelta(chunk: string): number` from Task 1.
- Produces:
  - `export const STALL_MS: number` (= 120000)
  - `export function recordRate(id: string, chunk: string, now?: number): void`
  - `export function getTrace(id: string, now?: number): number[]` — always length 60, oldest first, each value 0..1
  - `export function isFlat(trace: number[]): boolean`
  - `isStalled`'s `thresholdMs` default changes from the literal `120000` to `STALL_MS`

- [ ] **Step 1: Write the failing tests**

Add to `tests/missionTail.test.ts`, extending the line-2 import with `recordRate`, `getTrace`, `isFlat`, and `STALL_MS`.

```typescript
describe("trace ring", () => {
    const T0 = 1_700_000_000_000

    it("returns 60 empty buckets for an unknown session", () => {
        const tr = getTrace("never-seen", T0)
        expect(tr).toHaveLength(60)
        expect(tr.every((v) => v === 0)).toBe(true)
    })

    it("puts a chunk in the newest bucket", () => {
        recordRate("r1", "hello\n", T0)
        const tr = getTrace("r1", T0)
        expect(tr[59]).toBeGreaterThan(0)
        expect(tr.slice(0, 59).every((v) => v === 0)).toBe(true)
    })

    it("rolls older samples left as time passes", () => {
        recordRate("r2", "hello\n", T0)
        // Two buckets later the sample has moved two places left.
        const tr = getTrace("r2", T0 + 4000)
        expect(tr[57]).toBeGreaterThan(0)
        expect(tr[58]).toBe(0)
        expect(tr[59]).toBe(0)
    })

    it("clears entirely once the whole window has elapsed", () => {
        recordRate("r3", "hello\n", T0)
        expect(getTrace("r3", T0 + STALL_MS + 1).every((v) => v === 0)).toBe(true)
    })

    it("accumulates several chunks inside one bucket", () => {
        recordRate("r4", "aaa\n", T0)
        recordRate("r4", "bbb\n", T0 + 500)
        const one = getTrace("r4", T0)[59]
        recordRate("r5", "aaa\n", T0)
        expect(one).toBeGreaterThan(getTrace("r5", T0)[59])
    })

    it("scales logarithmically, clamped to 1", () => {
        recordRate("r6", "x".repeat(4096) + "\n", T0)
        expect(getTrace("r6", T0)[59]).toBeCloseTo(1, 2)
        recordRate("r7", "x".repeat(100000) + "\n", T0)
        expect(getTrace("r7", T0)[59]).toBe(1)
    })

    it("gives a spinner-only session a flat trace", () => {
        recordRate("r8", "\r| Thinking...", T0)
        expect(isFlat(getTrace("r8", T0))).toBe(true)
    })

    it("STALL_MS is the width of the whole window", () => {
        expect(STALL_MS).toBe(120000)
    })
})

describe("flatline agrees with isStalled", () => {
    const T0 = 1_700_000_000_000

    it("a working session that has gone quiet past the window is both flat and stalled", () => {
        recordRate("s1", "hello\n", T0)
        const now = T0 + STALL_MS + 1000
        expect(isFlat(getTrace("s1", now))).toBe(true)
        expect(isStalled("working", T0, now)).toBe(true)
    })

    it("a working session inside the window is neither", () => {
        recordRate("s2", "hello\n", T0)
        const now = T0 + 30000
        expect(isFlat(getTrace("s2", now))).toBe(false)
        expect(isStalled("working", T0, now)).toBe(false)
    })

    it("a flat trace on a non-working session is NOT stalled", () => {
        // The false alarm this design must never produce: a finished agent is
        // quiet on purpose.
        recordRate("s3", "hello\n", T0)
        const now = T0 + STALL_MS + 1000
        expect(isFlat(getTrace("s3", now))).toBe(true)
        expect(isStalled("idle", T0, now)).toBe(false)
        expect(isStalled("waiting", T0, now)).toBe(false)
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: FAIL — `recordRate`/`getTrace`/`isFlat`/`STALL_MS` are not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/renderer/src/missionTail.ts`, after the `tails`/`lastAt` maps (line 45):

```typescript
const BUCKET_MS = 2000
const BUCKETS = 60
/**
 * The trace window and the stall threshold are the same number by construction.
 * The design claims a flat trace on a working session IS a stall; deriving one
 * from the other is what stops that claim quietly becoming false in a later edit.
 */
export const STALL_MS = BUCKET_MS * BUCKETS
/** Characters in one bucket that count as a full-height bar. */
const CEILING = 4096

interface Ring {
    /** Oldest first, newest last; always BUCKETS long. */
    buckets: number[]
    /** Start time of the newest bucket. */
    at: number
}
const rings = new Map<string, Ring>()

/** Advance a ring to `now`, zero-filling the buckets that elapsed. */
function roll(r: Ring, now: number): void {
    const steps = Math.floor((now - r.at) / BUCKET_MS)
    if (steps <= 0) return
    r.at += steps * BUCKET_MS
    if (steps >= BUCKETS) {
        r.buckets.fill(0)
        return
    }
    for (let i = 0; i < steps; i++) {
        r.buckets.shift()
        r.buckets.push(0)
    }
}

/** Log scale against a fixed ceiling, so quiet and loud agents both stay legible. */
function scale(chars: number): number {
    if (chars <= 0) return 0
    return Math.min(1, Math.log(1 + chars) / Math.log(1 + CEILING))
}

/**
 * Add a pty chunk's committed output to a session's current bucket. Called from
 * the same place as recordTail; a chunk that scores zero still keeps the ring
 * current, so a spinning agent flatlines rather than showing no trace at all.
 */
export function recordRate(id: string, chunk: string, now = Date.now()): void {
    let r = rings.get(id)
    if (!r) {
        r = { buckets: new Array<number>(BUCKETS).fill(0), at: now }
        rings.set(id, r)
    }
    roll(r, now)
    r.buckets[BUCKETS - 1] += printableDelta(chunk)
}

/** A session's trace, oldest first, each sample 0..1. Always BUCKETS long. */
export function getTrace(id: string, now = Date.now()): number[] {
    const r = rings.get(id)
    if (!r) return new Array<number>(BUCKETS).fill(0)
    roll(r, now)
    return r.buckets.map(scale)
}

/**
 * Every bucket empty. Read together with the session's status: flat + working is
 * a stall, flat + idle is just a finished agent being quiet. Exported because the
 * test suite asserts it agrees with isStalled — that agreement is the design.
 */
export function isFlat(trace: number[]): boolean {
    return trace.every((v) => v === 0)
}
```

Then change `forgetTail` (currently `missionTail.ts:70-73`) to drop the ring too:

```typescript
/** Drop a terminal's tail and trace when its session closes. */
export function forgetTail(id: string): void {
    tails.delete(id)
    lastAt.delete(id)
    rings.delete(id)
}
```

And change `isStalled`'s default threshold (currently `missionTail.ts:93`) from the literal to the derived constant:

```typescript
export function isStalled(
    status: AgentStatus,
    lastAt: number | undefined,
    now: number,
    thresholdMs = STALL_MS
): boolean {
    return status === "working" && !!lastAt && now - lastAt > thresholdMs
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: PASS. The pre-existing `isStalled` tests pass an explicit `2 * 60000` threshold, so changing the default does not affect them.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all tests pass, zero type errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/missionTail.ts tests/missionTail.test.ts
git commit -m "feat(mission): per-session output-rate ring buffer with log scale"
```

---

### Task 3: `barsPath` — the SVG path helper

One `<path>` of bars, not sixty elements. Bars read better than a polyline at twelve pixels tall. Empty buckets still draw a 1-unit baseline, so silence reads as a *line* rather than as absence — that is what makes a flatline a positive signal instead of a blank tile.

**Files:**
- Modify: `src/renderer/src/missionTail.ts`
- Test: `tests/missionTail.test.ts`

**Interfaces:**
- Consumes: a `number[]` trace from `getTrace` (Task 2).
- Produces: `export function barsPath(trace: number[], height?: number): string`

- [ ] **Step 1: Write the failing tests**

Add `barsPath` to the line-2 import, then:

```typescript
describe("barsPath", () => {
    it("emits one closed sub-path per sample", () => {
        const d = barsPath([0, 0.5, 1])
        expect(d.split("Z").length - 1).toBe(3)
    })

    it("draws a baseline for empty buckets rather than nothing", () => {
        const d = barsPath([0])
        expect(d).toContain("Z")
        expect(d.length).toBeGreaterThan(0)
    })

    it("makes a full sample taller than a quiet one", () => {
        const tall = barsPath([1], 12)
        const short = barsPath([0.1], 12)
        // Bar tops are the second Y coordinate in each sub-path.
        const topOf = (d: string): number => Number(d.split("L")[1].trim().split(" ")[1])
        expect(topOf(tall)).toBeLessThan(topOf(short))
    })

    it("returns an empty string for an empty trace", () => {
        expect(barsPath([])).toBe("")
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: FAIL — `barsPath` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/renderer/src/missionTail.ts`, after `isFlat`:

```typescript
/**
 * An SVG path of one bar per sample, for a `0 0 <len> <height>` viewBox drawn
 * with preserveAspectRatio="none". Bars are 0.7 units wide on a 1-unit pitch, so
 * the gap is part of the path rather than a separate element. Empty samples get a
 * 1-unit stub, which is the baseline that makes silence read as a flat line.
 */
export function barsPath(trace: number[], height = 12): string {
    return trace
        .map((v, i) => {
            const h = Math.max(1, v * height)
            const top = height - h
            return `M${i} ${height} L${i} ${top} L${i + 0.7} ${top} L${i + 0.7} ${height} Z`
        })
        .join(" ")
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/missionTail.ts tests/missionTail.test.ts
git commit -m "feat(mission): svg bar path helper for the output trace"
```

---

### Task 4: Feed the rate and draw the trace

After this task the trace is visible and moving. Nothing is removed yet — that is Task 5, so a reviewer can accept the addition and reject the removal independently.

**Files:**
- Modify: `src/renderer/src/store.ts:21` (import) and `:484` (call)
- Modify: `src/renderer/src/components/MissionControl.tsx:3` (import) and `:160-208` (tile)
- Modify: `src/renderer/src/styles.css` (add after `.mission-tile-peek`, around line 613)

**Interfaces:**
- Consumes: `recordRate`, `getTrace`, `barsPath` from Tasks 2 and 3.
- Produces: no new exports. A `.mission-trace` SVG inside each `.mission-tile`.

- [ ] **Step 1: Feed the rate from the pty stream**

In `src/renderer/src/store.ts`, extend the import on line 21:

```typescript
import { recordTail, forgetTail, recordRate } from "./missionTail"
```

Then in `onPtyData`, immediately after the existing `recordTail(id, data)` on line 484:

```typescript
        // Keep a cleaned tail of this agent's output for the Mission Control peek.
        recordTail(id, data)
        // …and its committed-output rate, for the tile's trace.
        recordRate(id, data)
```

No cleanup call is needed here: `forgetTail` already runs on session close (`store.ts:528`) and Task 2 made it drop the ring.

- [ ] **Step 2: Render the trace in the tile**

In `src/renderer/src/components/MissionControl.tsx`, extend the import on line 3:

```typescript
import { getTail, getFullTail, getLastAt, relTime, sortForFollow, isStalled, getTrace, barsPath } from "../missionTail"
```

Inside the `sessions.map` callback, alongside the existing `const stalled = …` (line 163):

```typescript
                            const trace = getTrace(s.termId)
```

Then add the SVG as the last child of the tile, immediately after the `{stalled && …}` block (line 205) and before the closing `</div>`:

```jsx
                                    <svg
                                        className="mission-trace"
                                        viewBox={`0 0 ${trace.length} 12`}
                                        preserveAspectRatio="none"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <path d={barsPath(trace)} />
                                    </svg>
```

The tile already re-renders every second from the existing `setTick` interval (`MissionControl.tsx:49-54`), which is gated on the Mission view being active — no new polling.

- [ ] **Step 3: Add the CSS**

In `src/renderer/src/styles.css`, after the `.mission-tile-peek` rule (ends line 613):

```css
/* Output-rate trace. Quiet by default and never accent-coloured: it is a reading,
   not something to act on, and the tile's status classes already carry emphasis.
   currentColor means it re-themes with everything else and needs no [data-style]
   override. */
.mission-trace {
    display: block;
    width: 100%;
    height: 12px;
    margin-top: 2px;
    color: var(--muted);
}
.mission-trace path {
    fill: currentColor;
}
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run typecheck && npx vitest run`
Expected: zero type errors, all tests pass.

- [ ] **Step 5: Verify in the real app**

There is no headless renderer, and neither the build nor the typecheck catches a React render loop — only running does.

```bash
npx electron-vite build
```

Then use the **`run-app` skill** (`.claude/skills/run-app/`): launch, switch to the Mission view, and confirm with a screenshot that tiles draw a trace. With at least one live agent, confirm the trace moves between two screenshots taken ~10s apart.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store.ts src/renderer/src/components/MissionControl.tsx src/renderer/src/styles.css
git commit -m "feat(mission): draw a two-minute output trace on each agent tile"
```

---

### Task 5: Pay for it — drop the ribbon and the relative time

The trace states both of these in form, so they come off the tile. Net chrome added by the whole feature is zero. The stall sentence moves to the tooltip and `aria-label`, because a sparkline says nothing to a screen reader.

The `.mission-tile.stalled` left border stripe **stays** — that is the container-level form marker, and it is what makes a stalled tile findable when scanning a full grid.

**Files:**
- Modify: `src/renderer/src/components/MissionControl.tsx:165-206`
- Modify: `src/renderer/src/styles.css:621-624` (delete `.mission-tile-stalled`)

**Interfaces:**
- Consumes: `relTime` and `isStalled`, both already imported.
- Produces: no new exports.

- [ ] **Step 1: Move the stall sentence to the tile's accessible name and tooltip**

In `MissionControl.tsx`, replace the tile's opening element (currently lines 165-171):

```jsx
                                <div
                                    key={s.termId}
                                    className={"mission-tile status-" + s.status + (stalled ? " stalled" : "")}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => jumpToTerm(s.termId)}
                                >
```

with:

```jsx
                                <div
                                    key={s.termId}
                                    className={"mission-tile status-" + s.status + (stalled ? " stalled" : "")}
                                    role="button"
                                    tabIndex={0}
                                    // The trace shows silence as a flatline, which a screen reader
                                    // cannot see — so the sentence it replaces lives here.
                                    aria-label={
                                        `${s.sessionName} · ${s.projectName} · ${s.status}` +
                                        (stalled ? ` · stalled, no output ${ago}` : ago ? ` · last output ${ago} ago` : "")
                                    }
                                    data-tip={
                                        stalled
                                            ? `Stalled — no output ${ago}`
                                            : ago
                                              ? `Last output ${ago} ago`
                                              : undefined
                                    }
                                    onClick={() => jumpToTerm(s.termId)}
                                >
```

- [ ] **Step 2: Drop the relative time from the project line**

Replace lines 187-190:

```jsx
                                    <div className="mission-tile-proj muted small">
                                        {s.projectName}
                                        {ago ? ` · ${ago}` : ""}
                                    </div>
```

with:

```jsx
                                    <div className="mission-tile-proj muted small">{s.projectName}</div>
```

`ago` is still computed on line 161 — it now feeds the tooltip and aria-label instead of resting pixels. Do **not** delete it.

- [ ] **Step 3: Drop the stalled ribbon**

Delete lines 203-205 entirely:

```jsx
                                    {stalled && (
                                        <div className="mission-tile-stalled">stalled — no output {ago}</div>
                                    )}
```

Leave the `{s.status === "attention" && …}` "needs you" block above it alone — attention is a different signal, and the trace says nothing about it.

- [ ] **Step 4: Delete the now-dead CSS**

In `src/renderer/src/styles.css`, delete the `.mission-tile-stalled` rule (lines 621-624):

```css
.mission-tile-stalled {
    font-size: 11px;
    color: var(--clay);
}
```

Keep `.mission-tile.stalled` (lines 618-620) — that is the border stripe, and it stays.

Confirm nothing else references the class:

```bash
grep -rn "mission-tile-stalled" src/
```

Expected: no matches.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npm run typecheck && npx vitest run`
Expected: zero type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/MissionControl.tsx src/renderer/src/styles.css
git commit -m "refactor(mission): the trace replaces the stall ribbon and time text"
```

---

### Task 6: Verify across themes, then document

A change that looks right in Slate can be invisible in Washi. `DESIGN.md`'s review rubric requires a dark and a light theme, and the trace's whole claim is that `currentColor` re-themes it for free — that claim needs to be seen to be believed.

**Files:**
- Modify: `DESIGN.md` (Components section)

**Interfaces:** none — verification and docs only.

- [ ] **Step 1: Build and drive the app**

```bash
npx electron-vite build
```

Use the **`run-app` skill**. With at least one agent session live:
1. Switch to the Mission view and screenshot in **Slate** (dark).
2. Settings → Appearance → **Washi** (light), screenshot again.
3. Read both screenshots. The trace must be legible in each and take its colour from the theme — if it looks identical in both, something is hard-coded.

- [ ] **Step 2: Confirm the flatline reads**

In the running app, evaluate over CDP that a quiet session's trace is flat and a busy one is not:

```js
document.querySelectorAll(".mission-trace path").length
```

Expected: one path per visible tile. Take two screenshots ~10 s apart with an agent working and confirm the bars differ.

- [ ] **Step 3: Record the component in DESIGN.md**

Add to the **Components** list in `DESIGN.md` (the bulleted list under "### Components"):

```markdown
- **trace:** a two-minute output-rate sparkline on an agent tile, drawn as one SVG
  path in `currentColor` at `--muted`. Never accent-coloured — it is a reading,
  not an action. Empty buckets draw a baseline, so silence reads as a flat line;
  read together with the tile's status, flat + working is a stall.
```

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): record the agent tile output trace"
```

---

## Definition of done

- `npm run typecheck` at zero errors and `npx vitest run` fully green.
- The flatline/`isStalled` agreement test passes in both directions, including the "flat but idle is not stalled" case.
- Traces are visible, moving, and theme-coloured in both Slate and Washi, confirmed by screenshots.
- `grep -rn "mission-tile-stalled" src/` returns nothing.
- `DESIGN.md` describes what the code actually does.
