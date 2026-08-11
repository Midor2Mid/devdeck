# Mission trace — output-rate traces on the agent tiles

**Status:** approved design, not yet implemented
**Date:** 2026-08-11

## The idea

Every Mission Control agent tile gains a **two-minute trace of its agent's real
output rate** along its bottom edge. The trace is exactly as wide as the stall
threshold, so *for a working session, a fully flat trace **is** stalled*. The
ribbon stops describing the picture; the picture becomes the fact.

The status qualifier is load-bearing, not a caveat. A flat trace on an `idle`
session means the agent is finished and quiet, which is unremarkable; the same
flat trace on a `working` one means it should be producing output and isn't. The
tile's existing status dot supplies that context, which is why the trace never
needs a colour of its own to signal alarm.

## Why

`MissionControl.tsx` is the default view and the place you watch work from, but
its tiles are static between output changes. Two specific gaps:

1. **`isStalled` only fires after 120s of silence** (`missionTail.ts:89`). Until
   then, "thinking hard" and "quietly wedged" render identically. A trace tells
   them apart the moment the output stops.
2. **A tile shows presence, not pace.** An agent grinding through a large refactor
   and one dribbling a line a minute both read as `working`.

A trace also gives the view continuous, information-bearing motion — the thing
that makes an instrument panel watchable — without animating anything that isn't
a measurement.

## What is measured

The sample is **committed printable characters**, not raw pty bytes.

Raw bytes would lie. Claude Code's spinner emits a few bytes many times a second,
so a wedged agent that is still spinning would draw a healthy trace — precisely
the false negative that would make the whole feature untrustworthy.

`cleanTail` (`missionTail.ts:14`) is the wrong measure for this, despite being
right for its own job: it rewrites `\r` to `\n`, so every spinner frame would
count as a completed line. The rate needs its own pass:

```
printableDelta(chunk):
  1. strip OSC / CSI / OTHER / CTRL   (the existing regexes, missionTail.ts:7-11)
  2. walk the result, maintaining a pending segment:
       '\n' -> commit the pending segment, start a new one
       '\r' -> DISCARD the pending segment (a carriage return overwrites the line)
       else -> append
  3. return the count of non-whitespace characters in committed segments
```

Step 2 is the whole feature. A spinner rewriting one line in place commits
nothing, and scores zero, which is the truth about it. Text that actually
scrolled past scores its length.

The trailing uncommitted segment is intentionally not counted — it will be
counted when its line completes, at most one bucket later.

### Scale

Height is **logarithmic** against a fixed ceiling:

```
height = log(1 + chars) / log(1 + CEILING)      CEILING = 4096 chars per bucket
```

Not a per-session rolling max: that would normalise every agent to "equally
busy" and destroy comparison between tiles. Not linear either: one chatty agent
would peg the scale while everyone else flatlines. Log keeps the quiet and the
loud both legible in twelve pixels.

## Where the data lives

In `missionTail.ts`, beside `recordTail` / `getLastAt` — **module-level, outside
the store, deliberately**. Sixty samples times N sessions in zustand would
re-render the app once a second, and a selector returning the sample array would
walk into the fresh-array trap that already caused a render loop in this codebase.

```ts
const BUCKET_MS = 2000                      // one sample every 2s
const BUCKETS   = 60                        // 60 x 2s
export const STALL_MS = BUCKET_MS * BUCKETS // 120_000 — the trace IS the threshold
```

`isStalled`'s `thresholdMs` default must be changed to derive from `STALL_MS`
rather than repeating `120000`. The design claims the flatline and the stall are
the same fact; if the two constants can drift, that claim becomes a lie in some
future edit.

New module surface:

```ts
/** Add a raw pty chunk's committed printable characters to the current bucket. */
export function recordRate(id: string, chunk: string): void

/** The session's samples, oldest first, each 0..1 after log scaling. */
export function getTrace(id: string): number[]

/** True when every bucket is empty — the visual definition of stalled. */
export function isFlat(trace: number[]): boolean
```

Mechanics:

- One app-wide interval advances the ring for every session — **not** a timer per
  tile. It is started lazily on first `recordRate` and stopped when no sessions
  remain.
- `recordRate(id, chunk)` is called from the same place `recordTail` already is,
  in `onPtyData` (`store.ts:481-521`). One new call, one argument, already in hand.
- `forgetTail` (`missionTail.ts:70`) also drops the ring, so a closed session
  leaks nothing.
- A session with no ring yet returns an all-zero trace of length `BUCKETS`, so the
  component never has to branch on absence.

No IPC, no main-process change, no new poll — Mission Control's existing 1 Hz
`setTick` (`MissionControl.tsx:49-54`) already re-renders the tiles, and it is
already gated on the view being active.

## Rendering

An inline SVG in the tile:

```jsx
<svg className="mission-trace" viewBox="0 0 60 12" preserveAspectRatio="none"
     aria-hidden="true" focusable="false">
    <path d={barsPath(trace)} />
</svg>
```

- **One `<path>` of bars**, not sixty elements. Bars read better than a polyline
  at twelve pixels tall, and match the existing visual register.
- **`currentColor` at `--muted`.** It re-themes across all 7 themes x 12 styles
  for free and needs no entry in any `[data-style]` block.
- **Not accent-coloured.** The trace is not actionable, and the tile's existing
  status classes already carry the emphasis. `.mission-tile.status-attention`
  may brighten it; that is the only status coupling.
- **Empty buckets draw a 1px baseline**, so silence reads as a *line* rather than
  as absence. This is what makes a flatline a positive signal.
- No CSS transition on the path. The data moves; the chrome does not. Nothing here
  needs a `prefers-reduced-motion` branch because nothing is animated — the trace
  redraws with its data, which is information, not decoration.

`barsPath(trace)` is a pure function and gets unit tests.

## What it replaces

The change adds one strip and removes two things, so net chrome is zero:

| Out | In |
| --- | --- |
| `.mission-tile-stalled` ribbon (`MissionControl.tsx:203-205`) | flatline |
| `· 4m02s` relative-time text (`MissionControl.tsx:187-190`) | trace width |

The stall text survives as the tile's `data-tip` and `aria-label` — a sparkline is
invisible to a screen reader, and "stalled — no output 4m" is exactly the sentence
a non-visual user needs. The SVG itself is `aria-hidden`.

`relTime` (`missionTail.ts:76`) has exactly one caller today, the line being
removed. It is not deleted: it moves into the tooltip and aria-label that replace
both rows, so the "4m" is still computed the same way, just no longer spent on
resting pixels.

## Testing

`missionTail.ts` is plain module state with no Electron dependency, so this is
unit-testable in the existing `tests/missionTail.test.ts`:

- `printableDelta`: plain text scores its non-whitespace length; a `\r`-redraw
  spinner frame scores **0**; an ANSI-only chunk scores 0; a `\n`-terminated line
  scores; a trailing unterminated segment scores 0 until its line completes.
- Ring buffer: advance, wraparound past `BUCKETS`, and that a session with no
  data returns `BUCKETS` zeroes.
- Log scaling: 0 chars → 0; `CEILING` chars → 1; monotonic in between; above
  `CEILING` clamps to 1.
- `barsPath`: bar count matches sample count, and an all-zero trace still emits a
  baseline.
- **The load-bearing one:** for a `working` session, `isFlat(getTrace(id))` agrees
  with `isStalled(status, lastAt, now)` across a matrix of silence durations
  either side of the threshold. The design asserts these are the same fact; the
  test is what keeps them so as the constants move.
  The complement is asserted too, because it is the case that would otherwise
  cause a false alarm: a flat trace on an `idle` or `waiting` session is **not**
  stalled, and must not be reported as such.

`npm run typecheck` at zero and the full suite green, per the repo's standing bar.

## Verification in the real app

Per `CLAUDE.md`, there is no headless renderer. Verify with the `run-app` skill:
build, launch, open Mission Control with at least one live agent, and confirm the
trace draws, moves, and flatlines when the agent goes quiet. Check Slate and Washi
— the trace must take its colour from the theme in both.

## Out of scope

Each of these is its own piece of work; this spec is the data layer they would sit
on, and none of them are required for it to be useful:

- The away-debrief ("while you were away: 3 ran, 47 files, $2.14, 1 wants you").
- A cross-project cost/token summary bar.
- Gates or checks attached to board cards.
- Anything touching the pipeline runner or `PipelineBar`.
- Dense one-line trace rows as an alternative tile layout.
