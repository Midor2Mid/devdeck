# Performance brainstorm — 2026-09-10

Seat: performance-analyst (first run on this project). Nobody has measured DevDeck
before this. Everything below is either a direct measurement from this machine or
explicitly marked as inference/unmeasured.

## Method, stated once

- Machine: this dev machine (author's), Windows 11, self-signed release build
  environment. No access to a second, weaker machine — see **Unmeasured**.
- Build: `npx electron-vite build` (clean, current HEAD `9a9a283`).
- Driver: `run-app` skill's CDP harness (`.claude/skills/run-app/cdp.js`), extended
  with two throwaway scripts (`coldstart.js`, `memtest.js`, `flood.js`) in the
  scratchpad — never edited under `src/`.
- **State safety**: every run used `--user-data-dir` pointed at a scratch folder
  under `%TEMP%/claude/.../scratchpad/userdata-*`. The real
  `%APPDATA%/devdeck/{workspace,projects,settings}.json` were backed up before
  starting and diffed byte-identical against the backup at the end — **confirmed
  untouched**, so no restore was actually needed. No electron.exe processes were
  running before or after (verified via `tasklist`); none were disturbed.
- Every number below states its own sample size. Where n=1, that's stated, not
  hidden behind a percentage.

---

## 1. Cold start

Two scenarios, both launched via CDP, timestamped from process-spawn:

**True first launch** (empty `userData`, nothing persisted — what a brand-new
beta user hits before adding any project). n=3, fresh empty directory each run:

| run | spawn→deck mounted |
|---|---|
| 1 | 3549 ms |
| 2 | 1873 ms |
| 3 | 2951 ms |

Avg **2791 ms**, spread **1676 ms** (min 1873, max 3549). Wide spread because each
run was genuinely disk-cold (fresh directory, no prior shader/GPU cache). This is
the true worst case a stranger sees.

**Restored workspace** (4 projects, 8 configured terminal panes across projects,
default shell, no agent commands — see workspace construction below), n=3, each
on a `userData` dir that had one prior launch (so Chromium's own shader/GPU
caches were warm — a second-launch number, not a true-cold one; stated honestly):

| run | spawn→page target | spawn→deck mounted | spawn→panes ready (usable) |
|---|---|---|---|
| 1 | 921 ms | 1551 ms | 1583 ms |
| 2 | 1092 ms | 1719 ms | 1729 ms |
| 3 | 1192 ms | 1869 ms | 1916 ms |

Avg **1743 ms** to usable, spread 333 ms.

**Breakdown of the restored-workspace average (1743 ms)**:
- **~1068 ms**: process spawn → renderer HTML target visible. This covers
  Electron/Chromium process boot *and* the main process's synchronous module
  init, which happens before `app.whenReady()`.
- **~645 ms**: renderer target → React shell mounted (bundle parse/eval + IPC
  round-trips to restore projects/workspace state).
- **~30 ms**: deck mounted → terminal panes visibly attached. Pty spawn is fast.

**Only the active project's active tab restores panes.** The 8-pane workspace
I built (4 projects × up to 3 leaves) mounted exactly the 2 panes belonging to
the active tab — confirmed via `.xterm` DOM count and via checking that other
projects' pty sessions don't exist until visited (see §3). Cold start does
**not** scale with total configured panes across a workspace — only with the
panes in the one tab shown at launch. This is `PRODUCT.md`'s "lazy-mount panels"
working as intended, and it's a real, verified mitigant for cold start, not just
for later memory.

**What's inside the ~1068ms pre-window phase**: isolated `require()` timing (n=3,
sequential in one Node process) of the four D1-candidate DB drivers, which are
imported **eagerly, at the top of `out/main/index.js`, before `app.whenReady()`**
(confirmed: `db.ts`'s static imports land as top-level `require()` calls at lines
33–36 of the bundled main script):

| run | pg | mysql2 | node-sqlite3-wasm | mssql | total |
|---|---|---|---|---|---|
| 1 | 91 ms | 157 ms | 12 ms | 705 ms | 965 ms |
| 2 | 74 ms | 163 ms | 12 ms | 428 ms | 676 ms |
| 3 | 44 ms | 91 ms | 7 ms | 707 ms | 849 ms |

Avg **830 ms** (n=3, range 676–965 ms), almost all of it `mssql` (its `tedious`
dependency tree). This is real synchronous main-process boot cost, and it
overlaps directly with the measured ~1068 ms pre-window phase above.

---

## 2. Memory per terminal pane

n=1 per pane count (time-boxed), but the per-unit arithmetic across three
independent OS process buckets lands on the same linear increment three times
over — internally consistent, not noise. Workload: one project, one tab, N leaf
terminals (balanced split tree), **default shell (`powershell.exe -NoLogo`),
no agent CLI running** — a floor, not a ceiling (see caveat below). Measured via
`Get-CimInstance Win32_Process` working-set sum over the whole process tree,
~4s after panes mounted.

| N panes | electron.exe (all Chromium-side procs) | conhost.exe | powershell.exe | **Total tree** | JS heap used | DOM nodes |
|---|---|---|---|---|---|---|
| 0 | 560 MB | – | – | **560 MB** | 11.14 MB | 780 |
| 1 | 570 MB | 7.4 MB | 67.2 MB | **645 MB** | 11.82 MB | 776 |
| 5 | 610 MB | 37.1 MB | 337.2 MB | **985 MB** | 12.60 MB | 1076 |
| 10 | 654 MB | 74.2 MB | 672.7 MB | **1401 MB** | 13.85 MB | 1451 |

**Shape: linear, not quadratic**, on all three buckets (~9.4 MB/pane on the
Chromium/renderer side, ~7.4 MB/pane conhost, ~67 MB/pane powershell — each
constant across 1→5→10). JS heap grows ~0.27 MB/pane; DOM nodes ~70/pane.

**The marginal cost is dominated by the shell, not DevDeck.** Of the ~84 MB
added per pane, only ~9–10 MB is DevDeck's own renderer (xterm + React); ~67 MB
is `powershell.exe`'s own baseline working set (a Windows/PowerShell cost that
exists with or without DevDeck) and ~7 MB is `conhost.exe`. **This is a floor**:
these are idle shells. A target user's actual habit — several *live coding
agents* (`claude`, `codex`, etc., each a Node.js process with its own runtime
footprint, commonly 100–300 MB) — was not measured here and will cost
meaningfully more per pane than this table shows. Flagged in Unmeasured.

---

## 3. Output flood

Workload: a Node one-liner (`flood-gen.js`) writing 300,000 lines (~19–21 MB) as
fast as `process.stdout.write` allows, fed into a live pty via
`window.api.pty.input` (not simulated DOM typing), n=2 runs on the foreground
pane (25.1s, 26.6s wall) plus one background-pane run.

- **Raw baseline**: the same script to a plain file redirect does 21.5 MB in
  1.3s (~16.5 MB/s) — this is Node's ceiling, not DevDeck's.
- **Through the real pipeline** (pty → main → IPC → xterm): 300,000 lines
  completed in **24.9–26.6 s**, i.e. **~11,700–12,000 lines/sec, ~860 KB/s
  sustained** — about 19× slower than the raw baseline. That gap is the pty +
  IPC + capture plumbing, not a single obvious hot spot; sampling showed
  throughput *increasing* over the run (~5,400 lines/sec in the first 300ms
  window, ~14,000 lines/sec by the 24s mark) — no backpressure spiral, no
  slowdown. **This is the flood rate ceiling on this machine.**
- **UI responsiveness during the flood**: CDP round-trip ping (a proxy for
  main-thread jank — it queues behind the same JS event loop a click would)
  stayed at avg 1.6–1.9 ms, max 4–9 ms, for the entire 25s/300k-line flood.
  **The renderer never got janky.**
- **Buffer cap holds, exactly as coded**: `BUFFER_CAP = 256 * 1024` in
  `src/main/pty.ts` — measured final buffer length 262,081 / 262,079 bytes
  against a 262,144-byte constant. Verified in practice, not just read in code.
- **DOM cost is capped independent of flood size**: DOM node count went
  778 → 12,888 and JS heap +4.3 MB regardless of the fact 300,000 lines were
  produced — bounded by xterm.js's default ~1000-line scrollback, not by the
  flood's total volume.
- **A background (unmounted) pane costs zero, not "the same as visible."**
  Sending the identical flood to a terminal in a *non-active* tab produced an
  empty buffer the entire time (`window.api.pty.buffer` returned `""`)  —
  confirmed separately: querying that pane's buffer *before* any input showed
  no session exists at all. Lazy-mount in this app isn't just DOM-lazy, it's
  **process-lazy**: a background tab's pty is never spawned until the tab is
  visited. A flooding background pane isn't possible in the configuration
  tested — the flood only ever reaches a pane you're looking at.

---

## 4. The renderer bundle (~6.1 MB) and the D1 decision

Measured directly from the build output (`out/renderer/assets/`):

| chunk | size | loaded |
|---|---|---|
| `index-*.js` (app entry) | **5.9 MB** (6,112 KB reported) | at cold start, blocks first paint |
| `ts.worker-*.js` | 12.0 MB | lazily, in a Web Worker, only if a `.ts`/`.tsx` file opens |
| `css.worker-*.js` | 1.8 MB | same, only for CSS |
| `html.worker-*.js` | 1.2 MB | same, only for HTML |
| `json.worker-*.js` | 784 KB | same, only for JSON |
| `editor.worker-*.js` | 492 KB | same, Monaco's generic worker |

The entry chunk contains React/ReactDOM, zustand, xterm.js core, Monaco's core
editor API, and all of DevDeck's own component code (string `"monaco"` appears
393 times in it — Monaco's core is a real fraction of the 5.9 MB, not the
workers). The five worker chunks are Monaco's own architecture: they're always
loaded via `new Worker(...)`, so by construction they run off the render
thread — I verified this structurally (the files exist as separate chunks
fetched on demand) but did **not** live-trace a large-file Monaco open with the
DevTools Performance panel this session; that's in Unmeasured.

**D1's actual effect, directly measured — and it is NOT what the ~6.1 MB number
suggests:**

- **Renderer bundle: 0 bytes saved.** Grepped `out/renderer/assets/index-*.js`
  for `mysql2`, `mssql`, `node-sqlite3-wasm` — **zero matches**. These drivers
  are main-process-only; they never touch the renderer bundle. Removing them
  will not move the "6.1 MB" number at all.
- **Cold start: real, measured savings.** `src/main/db.ts` statically imports
  all four drivers, and they land as top-level `require()` calls at the very
  top of `out/main/index.js` (lines 33–36), executed synchronously **before**
  `app.whenReady()`. Isolated timing (§1) puts that at **avg 830 ms, range
  676–965 ms (n=3)** — nearly all of it `mssql`. This overlaps with the ~1068 ms
  pre-window phase of the cold-start measurement. D1 is a cold-start fix, not a
  bundle-size fix, and the number to cite for it is ~830 ms, not "6.1 MB."
- **Disk footprint**: the four packages' own files total **~2.7 MB**
  (`pg` 138 KB + `mysql2` 813 KB + `mssql` 537 KB + `node-sqlite3-wasm` 1.3 MB).
  Their transitive dependency trees (mssql's `tedious` in particular pulls in
  more) were **not measured** — would need an actual before/after
  `npm ls`/install-size diff, flagged in Unmeasured.
- The three UI panels D1 also removes were not individually size-profiled
  (would need per-component bundle analysis); flagged in Unmeasured.

**Recommendation on D1**: ship it — but justify it by the ~830 ms cold-start
number (measured, real, on the exact code path a beta user's first launch
executes), not by the renderer-bundle size (measured, real, unaffected).

---

## 5. A machine weaker than this one

Cannot get one. What's honestly inferable vs. not:

- **The 830 ms DB-driver require cost is CPU + disk bound**, and the spread I
  already see on *this* machine (676–965 ms, same code, same disk) shows it's
  sensitive to OS file-cache state. A beta laptop with a slower single-core
  clock and a spinning or lower-end SSD should be expected to see this number
  larger, plausibly by seconds rather than milliseconds on a cold-cache first
  launch — this is inference from the measured spread, not a new measurement.
- **PowerShell's ~67 MB/pane baseline is OS/shell overhead, not CPU-speed
  dependent** — it will look about the same on any Windows machine with the
  same shell default. What *will* differ is how much headroom a beta laptop has
  before that starts to matter: on an 8 GB machine already running a browser
  and Slack, 5–10 panes each also running a live agent CLI (unmeasured, but
  commonly 100–300 MB per Node-based CLI) is a real path to swapping. This
  wasn't measured — no real agent CLI was run in this session — and it's the
  single most likely first bad experience a beta user on modest hardware hits.
- Cannot honestly infer anything about GPU-constrained rendering (integrated
  graphics driving xterm's canvas/DOM renderer at scale) — no way to simulate
  weaker GPU here.

---

## 6. Roadmap gaps, performance grounds only

- **No cold-start budget in CI.** Nothing today would catch a future PR quietly
  adding another eager main-process import the way the four DB drivers already
  do. A cheap regression guard (assert main "ready" fires under some ms budget
  in a smoke test) would have caught this exact class of cost before it needed
  a performance seat to find it.
- **No user-visible signal when pane/agent count gets heavy.** If a beta user
  on a modest laptop opens enough live agents to start swapping, DevDeck gives
  them nothing to tell "this is DevDeck" from "this is my machine." Even a
  minimal running-pane-count-plus-rough-memory readout would help exactly the
  five people this seat exists for, self-diagnose without filing a confused bug.
- **D1's cold-start number needs to travel with the change**, not the bundle
  number — otherwise the changelog will (correctly, on current evidence) get
  challenged for citing an improvement it didn't produce.

**Nothing measured here should block or delay the beta.** Cold start (1.7–2.8 s),
memory scaling (linear, modest for DevDeck's own code), flood handling (capped,
responsive, verified) and background-pane cost (zero) are all within normal
range for an Electron+Monaco app and none of them are correctness or stability
risks. D1 is worth doing before the beta because it's a real, already-measured,
low-risk win on the very first thing a new user experiences — not because
anything here is broken.

---

## What is fine (measured, not assumed)

- Cold start to a usable restored workspace: **~1.7 s** (n=3, warm-cache
  second-launch), **~2.8 s** true first launch (n=3, cold-cache) — both normal
  for Electron+Monaco.
- Memory-per-pane growth is **linear**, not quadratic, across three independent
  process buckets, 0→10 panes.
- A 300,000-line/~20 MB output flood **never made the renderer janky**
  (ping latency stayed under 9 ms throughout) and **the 256 KB buffer cap held
  exactly** as coded.
- Background (unmounted) panes cost **nothing** — no pty process exists until
  the tab is visited.
- Monaco's language workers are architecturally off the main thread by
  construction (separate lazily-fetched chunks) — structurally verified.
- The DB drivers slated for D1 removal contribute **zero bytes** to the
  renderer bundle today — the "6.1 MB" number was never their fault.

## What is not (ranked by how many users reach it)

1. **~830 ms of eager, main-process-blocking `require()` for 4 DB drivers**,
   on the path every single user's cold start executes, every launch. Shape:
   fixed constant per launch (not scaling with anything), measured directly.
   Fix: D1 (already authorized).
2. **Idle-shell memory floor (~67 MB/pane) plus unmeasured live-agent cost**
   reaches only users who open several panes — likely all five beta users,
   since the target workflow is "several agents across more than one repo."
   Not a DevDeck bug (PowerShell's own baseline), but combined with real agent
   CLIs it's the most plausible bad first experience on modest hardware.
   Unmeasured piece flagged above, not yet a recommendation.
3. Everything else measured this session was fine at the scale tested.

## The recommendation

**Ship D1** (already authorized) and cite it by its measured effect: ~830 ms
(range 676–965 ms, n=3) off the pre-window phase of cold start, not by any
renderer-bundle-size change (there is none — measured, zero bytes). To prove it
worked: rerun this session's isolated-require timing (same 3x sequential
`require()` script) and the restored-workspace cold-start harness
(`coldstart.js`, same 4-project/8-pane synthetic workspace) after D1 lands, and
confirm the ~1068 ms pre-window phase drops by roughly that amount. If the
honest answer were "nothing needs doing," I'd say so — but this one is real,
already measured twice in different ways (isolated require timing and the
live cold-start trace), and cheap to prove again after the change.

## Unmeasured

- **Real agent-CLI memory** (actual `claude`/`codex` processes running in
  panes, not idle shells) — needs the same memtest harness with a real launched
  agent per pane instead of a bare shell; time-boxed out this session.
- **Live Monaco trace** (DevTools Performance panel while opening a large file
  and several tabs, to directly observe worker-thread attribution rather than
  infer it from the build's chunk structure) — structure verified, live
  behavior not driven this session.
- **D1's transitive node_modules savings** — only the four packages' own file
  sizes were measured (~2.7 MB); a real before/after install-size diff
  (`npm ls`, or an actual `npm uninstall` + size diff) would be needed for the
  true number, since `mssql`'s `tedious` dependency tree is not trivial.
- **Long-session growth** (hours, not minutes) — explicitly out of scope for a
  single sitting; needs a multi-hour unattended run with periodic memory
  sampling, which this session didn't have time for. This is the failure
  PRODUCT.md is most worried about and it has the least evidence of the six
  areas asked for.
- **Weaker hardware**, per §5 — inference only, no second machine available.
- **True disk-cold first run** on a machine that has genuinely never had
  Electron/Chromium DLLs touch its file cache before (this session's "first
  launch" numbers still ran on a machine that had built and run DevDeck many
  times before; a stranger's machine is colder than that).
