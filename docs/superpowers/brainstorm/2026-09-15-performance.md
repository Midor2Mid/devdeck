# Performance brainstorm — 2026-09-15

Seat: performance-analyst. Baseline is my own 2026-09-10 pass
(`docs/superpowers/brainstorm/2026-09-10-performance.md`) — read first, not
re-derived. This pass re-measures cold start, per-pane memory, the palette
under load, and the stall clock against that baseline, on the same machine.

## Method, stated once

- Machine: this dev machine, Windows 11. HEAD `b167753`, clean tree, fresh
  `npx electron-vite build`.
- Driver: `run-app`'s CDP harness, extended with throwaway scripts in the
  scratchpad (`coldstart.js`, `gen-workspace.js`, `gen-panes.js` reused
  byte-for-byte from the baseline session for apples-to-apples; `memtest3.js`,
  `stall-lib.js`, `palette-load.js`, `gen-big-workspace.js` new this session).
- **State safety**: every run used a scratch `--user-data-dir`
  (`scratchpad/userdata-*`). Real `%APPDATA%/devdeck/{workspace,projects,
  settings}.json` backed up before starting and diffed byte-identical after —
  confirmed untouched. **The owner's 5 live `DevDeck.exe` processes (PIDs
  3140/22380/10756/12472/36816) were checked before and after every run and
  never touched**; all memory figures below are from freshly-spawned
  scratch-profile instances, not the owner's processes.
- A methodology bug this session found and fixed: my first pass at per-pane
  memory showed **zero** PowerShell/conhost growth at any pane count. Direct
  investigation (screenshot + `window.api.pty.buffer()` + a live prompt check)
  showed the automated window was OS-occluded (`document.hidden: true`,
  `document.visibilityState: "hidden"`) despite `hasFocus():true` — an artifact
  of launching via CDP without real desktop activation, not a DevDeck code
  gate (grepped: no `document.hidden` check anywhere near pty/spawn code).
  `Emulation.setFocusEmulationEnabled(true)` fixed it in under a second (a
  real shell prompt appeared). **Every memory/palette run below has focus
  emulation enabled**; cold-start timing does not need it (DOM-based, not
  content-based). Orphaned shell processes from the pre-fix runs self-exited
  within minutes on their own (checked: gone by the time of writing) — a
  ConPTY/taskkill process-tree quirk in my *test harness's* forced kill, not a
  DevDeck leak (a real user quit calls `pty.kill()` by handle, not by Win32
  tree walk).

---

## 1. Cold start

Restored workspace (4 projects, 8 panes, active tab's 2 panes), n=3, one prior
launch per dir (warm shader/GPU cache, matching baseline's method):

| run | spawn→page target | spawn→deck mounted | spawn→panes ready |
|---|---|---|---|
| 1 | 728 ms | 1433 ms | 1439 ms |
| 2 | 446 ms | 1116 ms | 1125 ms |
| 3 | 962 ms | 1695 ms | 1706 ms |

Avg **1423 ms** to usable (spread 581 ms) vs baseline's **1743 ms** (spread
333 ms). **Saved ~320 ms (18%).** Breakdown vs baseline:

- spawn→page target: **712 ms avg** (was ~1068 ms) — **saved ~356 ms**. This is
  exactly the phase the four DB drivers' eager `require()`s lived in.
- page target→deck mounted: **703 ms avg** (was ~645 ms) — **grew ~58 ms**,
  plausibly the palette's extra store subscriptions and the new attention/
  stall/badge wiring initializing; not isolated further this session.
- deck→panes ready: **9 ms avg** (was ~30 ms) — noise, both trivial.

True first-run (empty profile), n=3: avg **1144 ms** (836–1512) vs baseline's
**2791 ms**. **Flagged, not trusted at face value**: this session ran dozens
of launches back-to-back, so the OS file cache for `electron.exe`'s own DLLs
was far warmer than baseline's single-session-old first pass. The *restored*
comparison above, where both sessions used the same one-prior-launch warm-up
protocol, is the credible number.

**Did the 830 ms leave? Partially — and that's the headline.** `node_modules`
has zero trace of `pg`/`mysql2`/`mssql`/`node-sqlite3-wasm` (not just
unimported — not installed). Fresh `out/main/index.js` greped for
`require(...)`: the only requires are `@lydell/node-pty`, `electron-updater`,
`selfsigned`, `ws`, and Node builtins — **zero DB drivers**, confirmed on the
current build, not carried over from baseline. But the isolated-`require()`
floor (830 ms, 676–965 ms) predicted savings of that rough size in the
pre-window phase; the actual measured saving in that exact phase is **356 ms**,
about 43% of the prediction. The isolated-require number was measured in a
bare Node process with nothing else competing for the CPU/disk; a real
Electron launch has other main-process and Chromium-side work occupying that
same wall-clock window, so removing 830 ms of blocking JS does not linearly
buy back 830 ms of wall time. I did not instrument `app.whenReady()` directly
(would need a source edit I'm not permitted to make) — this is inference from
two wall-clock measurements, not a trace, and is flagged as such.

---

## 2. Memory per terminal pane

Same synthetic workspace generator as baseline (`gen-panes.js`, one project,
N leaf panes, default shell). Measured via **PID-set diffing**
(`tasklist` before/after launch, not a parent-tree walk) — baseline's own
tree-walk method (`Win32_Process.ParentProcessId`) was retested this session
and returned `COUNT=5` (electron-only) at every N, because ConPTY's
conhost/shell children are **not** Win32 children of `electron.exe` in this
session's environment (verified: a live shell process existed system-wide but
outside the walked tree). PID-diffing sidesteps that; used with focus
emulation on (see Method).

| N panes | electron.exe (5 procs) | powershell.exe | conhost.exe | **Total new** |
|---|---|---|---|---|
| 0 | 535.2 MB | – | – | **535.2 MB** |
| 1 | 550.3 MB (+15.1) | 64.4 MB ×1 | 7.1 MB ×1 | **621.8 MB** |
| 5 | 587.1 MB (+51.9) | 321.6 MB ×5 | 57.5 MB ×7 | **966.2 MB** |
| 10 | 630.4 MB (+95.2) | 643.6 MB ×10 | 70.8 MB ×10 | **1344.9 MB** |

Per-pane marginal cost: renderer/electron side **~9.5–10.4 MB/pane** (baseline
~9.4 MB/pane — **unchanged** despite D1a's panel deletion; panels are a
different code path from terminal panes, as expected). PowerShell **~64.3
MB/pane** (baseline ~67 MB) and conhost **~7–8 MB/pane** (baseline ~7.4 MB) —
both consistent with baseline within normal machine-state noise. **Shape:
linear across 0→1→5→10 on every bucket**, confirmed again. Total marginal
cost ~81 MB/pane vs baseline's ~84 MB/pane — no material change.

---

## 3. The palette under load

Workload: 20 projects × 3 tabs × 2 panes = **120 panes, 40 agent-tagged
sessions** (`gen-big-workspace.js`), opened via the real `.cmd-pill` button,
typed into `.switcher-search` character-by-character via native input events.
Ping = CDP round-trip (`1+1` eval), the same main-thread-jank proxy baseline's
flood test used.

| phase | ping (ms) |
|---|---|
| idle before open | 0–2 |
| per keystroke (9 chars) | 2–9 (max on first keystroke, settles to 2) |
| idle after filter | 0–1 |
| held open+filtered, ~4s, 10 samples | 1–2, flat, **no upward trend** |

581 DOM rows at open, 268 after filtering to "project-1". No jank, no growth
over the 4s hold — **no render loop found** at this scale, despite the
`useStore()` full-store subscription plus 7 explicit slices in
`CommandPalette.tsx`. This does not rule out a loop at higher session counts
or over longer holds than tested; flagged in Unmeasured.

---

## 4. The stall clock

Instrumented `window.setTimeout`/`clearTimeout` via
`Page.addScriptToEvaluateOnNewDocument` (before any app code runs) to log
every currently-armed timer's delay.

- **Idle** (baseline's 4-project/8-pane restored workspace, no board task, no
  pipeline), 8 s: **zero timers armed at all**, at any delay. Confirms the
  claim directly: nothing near `STALL_MS` (120,000 ms) exists when nothing is
  awaited.
- **One board card moved into `doing`, wired to a live agent pane** (Resume
  clicked on the restored hold): a timer with **delay = 120000 ms** appears
  immediately, matching `STALL_MS` exactly. A second, short (6000 ms) timer
  also appears (unrelated to the stall clock — not investigated further).

This is a clean, controlled before/after: the alarm is measurably absent when
idle and measurably present, at the documented interval, only when a card is
in `doing`.

---

## 5. Anything worse, unpredicted

- Nothing in the *product* regressed under measurement. The zero-shell-memory
  result in my first per-pane pass looked like a serious regression (a
  terminal pane silently producing no output) until traced to the test
  harness's window-occlusion state, not app code — see Method. I want to be
  explicit this was a real scare and is now resolved with a direct, repeatable
  experiment (buffer empty under occlusion → non-empty within 1s of forcing
  focus, same build, same workspace).
- Renderer entry chunk: **6014.18 KB** now vs baseline's **6112 KB** — down
  ~98 KB, roughly matching D1a's claimed ~117 KB panel removal (some of that
  is offset by new palette/attention/badge code added since).
- No new eager main-process cost found: grepped `out/main/index.js`'s
  top-level requires again post-rebuild — same 5 packages as prod deps, no
  regression there from the badge/MCP-hook/attention additions.

---

## What is fine (measured, not assumed)

- Cold start to a usable restored workspace: **~1.4 s** (n=3), down from
  ~1.7 s, real and attributable mostly to D1b.
- Per-pane memory is still **linear**, and the per-pane cost (~81 MB, mostly
  PowerShell's own baseline, not DevDeck's) is **unchanged** from baseline —
  D1a's panel deletion didn't touch this path, as expected.
- The palette holds up under a 120-pane/20-project/40-session synthetic load:
  ping stays under 9 ms, no render-loop signature over a 4 s hold.
- The stall clock is genuinely free when idle (zero timers) and arms exactly
  one timer, at the documented delay, when something is actually awaited.

## What is not (ranked by how many users reach it)

1. **The 830 ms prediction landed at ~356 ms in practice.** Every user's
   cold start still improved, just by less than the isolated measurement
   suggested. Shape: fixed, not scaling — same class of fix as before, smaller
   real-world yield than predicted.
2. Everything else measured this session was fine at the scale tested.

## The recommendation

**No new change to recommend.** D1b's cold-start win is real (measured twice:
the isolated require floor at baseline, and the wall-clock pre-window delta
this session) even though smaller in practice than the floor suggested — the
existing changelog claim should be softened from "~830 ms" to "measurably
faster, ~300–360 ms of it traceable to this specific phase" if it hasn't
shipped with a number yet. Nothing else measured this session (palette,
memory, stall clock) shows a regression that needs work before the beta.

## Unmeasured

- **A direct `app.whenReady()` trace** to fully explain the 830→356 ms gap —
  needs a source-level timestamp I'm not permitted to add here.
- **Real agent-CLI memory** — still not measured with actual `claude`/`codex`
  processes in panes (confirmed both are on PATH on this machine, unused this
  session for time).
- **Long-session growth** (hours) — still out of scope for one sitting.
- **Weaker hardware** — still no second machine.
- **The palette at higher scale or over a longer hold** than the 120-pane/4 s
  test here.
