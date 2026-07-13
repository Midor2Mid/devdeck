# 002 — Animate progress fills on the GPU (`width` → `transform: scaleX`)

- **Status**: DONE
- **Commit**: 8e7f85d
- **Severity**: MEDIUM
- **Category**: Performance + Easing
- **Estimated scope**: 3 files (2 CSS rules + 2 TSX style props)

## Problem

Two determinate progress fills animate their `width`, which is not
GPU-composited — every frame triggers layout + paint + composite instead of a
cheap compositor transform. The replay scrubber is the hot path: its fill
updates continuously during playback, so the layout thrash happens many times
per second. Both also use an `ease`/`linear` timing that should be `linear`
(constant, determinate motion uses `linear`).

Current state:

```css
/* src/renderer/src/styles.css:3519 — replay scrubber fill (hot path) */
.replay-progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.08s linear;
}

/* src/renderer/src/styles.css:3621 — pipeline progress fill */
.pipeline-progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
}
```

```tsx
/* src/renderer/src/components/RecordingsModal.tsx:222 */
<div className="replay-progress-fill" style={{ width: pct + "%" }} />

/* src/renderer/src/components/PipelineBar.tsx:62 */
<div className="pipeline-progress-fill" style={{ width: pct + "%" }} />
```

`pct` is a 0–100 percentage in both.

## Target

Drive the fills with `transform: scaleX(...)` (0–1) from a full-width base, so
the browser animates them on the compositor. `transform-origin: left` makes the
bar grow from the left edge. Use `linear` easing (determinate progress).

```css
/* target */
.replay-progress-fill {
    height: 100%;
    background: var(--accent);
    width: 100%;
    transform-origin: left;
    transition: transform 0.08s linear;
}

.pipeline-progress-fill {
    height: 100%;
    background: var(--accent);
    width: 100%;
    transform-origin: left;
    transition: transform 0.3s linear;
}
```

```tsx
/* target */
<div className="replay-progress-fill" style={{ transform: "scaleX(" + pct / 100 + ")" }} />
<div className="pipeline-progress-fill" style={{ transform: "scaleX(" + pct / 100 + ")" }} />
```

## Repo conventions to follow

- Inline dynamic style via a `style={{ ... }}` object on the fill div (that is
  exactly how it's done today — see the two TSX lines above). Keep the class
  names; only change the style property.
- Fills sit inside an `overflow: hidden` rounded track (e.g.
  `.usage-bar-track` at `styles.css:5854-5861` shows the pattern:
  `overflow: hidden`), so a `scaleX(≤1)` fill stays clipped inside the track.
  Verify the replay and pipeline tracks likewise clip; if a track does not have
  `overflow: hidden`, that is a drift — STOP and report rather than adding it.

## Steps

1. `styles.css:3519` `.replay-progress-fill`: add `width: 100%;` and
   `transform-origin: left;`, and change `transition: width 0.08s linear;` →
   `transition: transform 0.08s linear;` (final rule as in Target).
2. `styles.css:3621` `.pipeline-progress-fill`: add `width: 100%;` and
   `transform-origin: left;`, and change `transition: width 0.3s ease;` →
   `transition: transform 0.3s linear;` (final rule as in Target).
3. `RecordingsModal.tsx:222`: verify `pct` is 0–100 (read its definition just
   above the JSX). If 0–100, change `style={{ width: pct + "%" }}` →
   `style={{ transform: "scaleX(" + pct / 100 + ")" }}`. If `pct` is already
   0–1, use `scaleX(" + pct + ")` and note the deviation.
4. `PipelineBar.tsx:62`: same as step 3 for its `pct`.

## Boundaries

- Scope is EXACTLY these two fills. Do NOT convert `.usage-bar-fill`
  (`styles.css:5863`) — it is a low-frequency stats meter that relies on
  `min-width: 3px` to keep a visible sliver at tiny values; `scaleX` would break
  that guarantee and the perf win is negligible. Leave it on `width`.
- Do NOT change the tracks' markup, size, `border-radius`, or `overflow`.
- Do NOT change any duration (0.08s and 0.3s stay).
- Do NOT add dependencies.
- If `pct` is computed/clamped differently than described, or a cited line has
  drifted since commit 8e7f85d, STOP and report instead of guessing.

## Verification

- **Mechanical**: `npm test` passes 252/252; `npx tsc --noEmit` yields no *new*
  errors (ignore the pre-existing unrelated `EditorPanel.tsx` monaco error). Do
  NOT run a renderer build directly (OOMs); use `npx electron-vite build` only
  via the run-app harness.
- **Feel check**: build `out/` (`npx electron-vite build`) and drive the app:
  - **Replay**: open Recordings, replay a session. The fill should track
    playback smoothly and grow from the LEFT edge (not center, not right). In
    DevTools → Performance, record during playback and confirm the fill updates
    no longer show purple "Layout" bars each frame (compositor-only).
    - Watch for stretched corners: `scaleX` distorts horizontal `border-radius`.
      For these thin fills inside a clipping track it should be invisible — if
      the leading edge looks visibly ovalised, note it (do not fix in this plan).
  - **Pipeline**: run a pipeline; the progress fill grows left-to-right at a
    steady (linear) rate with no easing hitch at start/end.
- **Done when**: both fills use `transform: scaleX()` from `transform-origin:
  left` with `linear` timing, `.usage-bar-fill` is untouched, and the replay
  fill is composited (no per-frame layout) in the Performance trace.
