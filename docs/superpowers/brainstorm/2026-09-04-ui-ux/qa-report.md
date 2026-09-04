# DevDeck — measured first-run and click-path facts

Everything below was observed in a running build. Where I could not observe
something I say "not observed" and why. Nothing here is inferred from source
unless the line is explicitly labelled **[source-read, not measured]**.

## Method

- Build: `npx electron-vite build` on `main` @ `a65595b` (package.json version
  `0.12.0`), clean tree. Build succeeded in 50.35 s.
- Driver: `.claude/skills/run-app/cdp.js` (`withApp`), every run with its own
  `debugPort` (9432–9449) and its own scratch `userDataDir`, so the user's real
  DevDeck kept its single-instance lock and was never touched. Confirmed at the
  end: no orphaned `electron.exe`; the five `claude.exe` processes on the machine
  are all 30–37 min old, i.e. the user's, not mine. I killed nothing of theirs.
- Window under test: **1386 × 863 CSS px** (outer 1401 × 900), `devicePixelRatio`
  1.5. Narrow widths were produced with `Emulation.setDeviceMetricsOverride`.
- Scenario scripts and every screenshot are in this scratchpad
  (`s1-…` … `s12-…`, `shots/`).

## What this method cannot see (stated up front)

- **HTML5 drag-and-drop was not tested.** It cannot be simulated over CDP. Any
  drag affordance in the deck, the tab bar or the switcher is unverified.
- **The native folder picker cannot be driven.** `dialog.showOpenDialog` is a
  main-process modal; CDP cannot click it. Every step that needed a real folder
  choice is labelled **seeded** below.
- The renderer store is not exposed on `window`; all driving was via the DOM and
  `window.api.*`.
- `Browser.getWindowForTarget` is not available on this page target, so I could
  **not** resize the real OS window. Narrow-width results are emulation only.
- No touch, no soft keyboard, no real mobile browser was involved anywhere.

---

## 1. Cold start with no projects

Fresh `userDataDir` that had never been launched. `window.api.projects.list()`
returned `{"projects":[],"activeId":null}` — a genuine zero state.

### Timing (one sample, single run)

| Mark | Value |
|---|---|
| `Date.now()` immediately before spawning Electron | 1788464125525 |
| Renderer `performance.timeOrigin` | 1788464126222.5 (**+697 ms**) |
| `first-paint` == `first-contentful-paint` | +908 ms after timeOrigin |
| **Spawn → first contentful paint** | **≈ 1605 ms** |
| `domContentLoadedEventEnd` / `loadEventEnd` | 464.9 / 465.1 ms after timeOrigin |

One sample only; I did not repeat it, so treat it as an order of magnitude, not
a benchmark.

### Everything on screen, and what it does

Full body text at rest:

```
No project / Mission        Search or run…  Ctrl+Shift+P
DevDeck
A cockpit for the projects you already have: terminals, agent sessions,
an editor and git status, one folder at a time.
[Open a project folder]
DevDeck runs agent CLIs you install yourself — claude, codex, gemini.
Found on your PATH: claude, codex, gemini.
Ctrl+K reopens this list later.
Add or open a project
```

Every element matching `button, a, [role=button], [role=tab], input, select,
textarea, [onclick]` — 18 in total, all visible:

| # | Selector / label | Enabled | Tooltip (`data-tip`) | Observed behaviour |
|---|---|---|---|---|
| 1 | `.topbar-run-btn` (▷ glyph, no text) | **disabled** | "No runnable project type detected" (`aria-label` says "No runnable project") | Real mouse click: nothing. No feedback. |
| 2 | `.topbar-proj-btn` "No project ⌄" | yes | "Open a project (Ctrl+K)" | Opens the **project switcher** overlay |
| 3 | `.cmd-pill` "Search or run… Ctrl+Shift+P" | yes | "Command palette (Ctrl+Shift+P)" | Opens the command palette |
| 4 | `.accent` "Open a project folder" | yes | none | Opens the **native folder dialog** |
| 5 | `.deck-empty` "Add or open a project" | yes | none | Opens the **project switcher** overlay |
| 6–13 | 8 × `.deck-view` (Mission, Tasks, Terminal, API, Database, Browser, Network, Editor) | **all disabled** | none on the buttons; one on the parent `.deck-views`: "Add a project to use the views." | Nothing (see §3) |
| 14 | `.deck-tool` ▶ | yes | "Scripts & saved commands" | Opens an **empty** popover (see §3) |
| 15 | `.deck-tool` 📖 | yes | "Agent context files" | Popover reading "No active project." |
| 16 | `.deck-tool` 📊 | yes | "AI usage" | Opens the AI-usage modal, fully populated |
| 17 | `.deck-tool` ⚙ | yes | "Settings" | Opens Settings |
| 18 | `.deck-tool` ⋯ | yes | "More" | Context menu: Work / Activity / Standup / Release / Keyboard shortcuts (F1) |

Shell geometry at 1386 × 863: `.topbar` 1386×49 at y0, `.main` 1386×795,
`.deck` 1386×69 at y795 (`.deck-strips` 1386×38, `.deck-bar` 1386×30),
`.deck-views` 309 px wide, `.deck-tools` 148 px wide, **`.deck-status` 885 × 0 px
with empty `innerText`** — 64 % of the deck bar is empty space at zero projects.

### Is there more than one way to open a project? Yes — three, and they differ

| Entry point | What it actually does | Clicks to a chosen folder |
|---|---|---|
| "Open a project folder" (`.accent`, the one accent-coloured control) | fires the native folder dialog **immediately** | 1 + dialog |
| "Add or open a project" (`.deck-empty`, bottom-left) | opens the switcher overlay, which contains "+ Add folder" | 2 + dialog |
| "No project ⌄" (`.topbar-proj-btn`) | opens the **same** switcher overlay | 2 + dialog |
| Ctrl+K | opens the same switcher overlay | 1 key + 1 click + dialog |

So the three visible controls are **not** equivalent: one is a one-click path,
two are two-click paths through an intermediate overlay whose entire content at
zero projects is `+ Add folder` / "No projects yet. Add a folder to start." /
"↑↓←→ to move · Enter to open · Esc to close" — an overlay with exactly one
button in it.

### The PATH probe line

At the first sample after mount the `.first-run-probe` paragraph was **empty**
(the block reserves its space, so the panel visibly re-flows when it fills). By
the next sample, 2.5 s later, it read "Found on your PATH: claude, codex,
gemini." I sampled at two points only, so the true latency is somewhere in
(0, 2.5 s]; **not measured precisely**.

---

## 2. Click path to a running agent

Native dialog steps are marked **[dialog — not driven]**. The project seed is
marked **[seeded]**: `window.api.projects.addPath("…/proj demo")` followed by
`Page.reload`, which stands in for choosing the folder in the picker. Everything
after the seed was driven with real `Input.dispatchMouseEvent` clicks at real
coordinates.

Project used: `…/scratchpad/proj demo` — deliberately **a path containing a
space**, with a `package.json` and a git repo.

### (a) Project open — stranger, first launch

1. Click "Open a project folder" *(driven)*
2. Pick a folder in the Windows dialog *(**[dialog — not driven]** — a stranger's
   real cost here is unknown; it is at minimum one navigation + one confirm)*

**= 1 in-app click + 1 native dialog.**

### (b) A plain shell terminal

Measured from a cold launch with the project already in the list (the returning
user). Landing view was **Terminal**, because the view is persisted per project
from the previous session — a first-time user lands on **Mission** instead
(observed separately, §"Mission" below).

| Step | Control | Note |
|---|---|---|
| 1 | `.deck-view` #3 (Terminal) | icon-only key; no-op here since it was already the view, but it is a required click for anyone landing on Mission |
| 2 | `+ Terminal` in `.term-actions` (tip "New shell tab (Ctrl+Shift+T)") | |

Result after ~3.5 s: one pane (`data-term-id` present), tab titled "shell 1",
xterm content `PS C:\…\proj demo>`. A real PowerShell.

**= 2 clicks from Mission, 1 click from Terminal.** No keystrokes needed.

The empty Terminal view also offers a second path: a "Launch a command" card
grid with 9 `launch-card` entries (Claude, Claude Opus, Claude YOLO, Codex,
Gemini, Dev server, Build, Test) plus "+ New terminal" and "Settings" —
i.e. the same actions exist in three places on one screen (toolbar buttons,
the caret menu, and the card grid).

### (c) An agent session running

| Step | Control |
|---|---|
| 1 | `.deck-view` #3 (Terminal) |
| 2 | `.term-launch-new` — "+ Claude", tip "New Claude session (Ctrl+Shift+Enter)" |

**= 2 clicks from Mission; 1 click from the Terminal view.**
Total measured from a cold launch that landed on Terminal: **3 clicks** to have
both a shell and an agent running (1 no-op view key + 1 shell + 1 agent).

Result observed: tab "claude 2", deck strip became `PROJ DEMO / claude 2 /
CLAUDE`, and the real `claude` CLI started in the pane. Within ~11 s it was
sitting on Claude Code's own "Quick safety check … Yes, I trust this folder"
prompt (screenshot `shots/29-agent.png`) — DevDeck's strip shows the session as
live while it is in fact blocked waiting for a keypress; nothing in DevDeck's
chrome distinguishes "running" from "waiting for you".

The launch menu behind the caret (`.agent-menu`) contains: CLAUDE / OPUS / YOLO /
CODEX / GEMINI, Dev server, Build, Test, then `SHELLS` (PowerShell, Command
Prompt, Git Bash, WSL, Custom shell), then `PIPELINES` (Investigate → Fix →
Verify) — 14 launch targets in one flat popover.

---

## 3. Dead ends

Ranked by damage × likelihood for one developer running several agent terminals.

### D1 — CONFIRMED, CRITICAL: a missing project folder hard-freezes the app, permanently

**Reproduced 4 times across 4 separate launches.**

Setup: a `projects.json` whose one project points at a path that does not exist
(`C:/Users/Admin/AppData/Local/Temp/claude/NO_SUCH_FOLDER_12345`). This is what
a user gets by deleting, renaming or moving a project folder, or by opening a
project on a drive that is not mounted.

Steps: launch → the app looks completely normal (project name in the topbar, all
8 view keys **enabled**, Mission renders) → Ctrl+3 / click Terminal → click
"+ Terminal".

Observed: **the entire app stops responding within 1 s.** All CDP calls time out
(`Runtime.evaluate` and `Page.captureScreenshot` both), for the full 40 s I
waited, and again for 70 s in a second run. No renderer console output, no toast,
no error boundary.

An OS-level desktop capture (`shots/52-desktop-during-hang.png`) shows what the
user actually sees: **Electron's default modal "A JavaScript error occurred in
the main process" dialog**, on top of a DevDeck window that has already drawn a
`shell 1` tab and an empty pane:

```
Uncaught Exception:
Error: Cannot create process, error code: 267
    at WindowsPtyAgent._completePtyConnection
       (…/node_modules/@lydell/node-pty-win32-x64/lib/windowsPty…:36)
    at EventEmitter2.fire (…/eventEmitte…:22)
    at Worker.<anonymous> (…/windowsCo…:36)
    at Worker.emit (node:events:509:28)
    …
```

(267 is Windows `ERROR_DIRECTORY`.) The pty spawn failure is unhandled in the
main process.

**It gets worse: the failure is persisted.** The tab that never started was
written to `workspace.json`:

```json
"tabsByProject": { "gone-1": [{ "id": "…", "name": "shell 1",
  "root": { "kind": "leaf", "termId": "12b4135a-…" } }] },
"view": "terminal"
```

so the **next launch restores it, respawns into the missing cwd, and crashes
before the UI is usable at all**. I confirmed this on two further cold launches:
the very first probe at t+2 s was already unresponsive, with no click from me.
The only recovery is hand-editing `%APPDATA%` — nothing in the product offers a
way out.

For a user running several agents at once, worktrees and branch switches make
"the folder moved" an everyday event.

### D2 — CONFIRMED: the "Scripts & saved commands" popover opens completely empty

Zero projects → click the ▶ tool. A grey capsule roughly 315 × 22 px opens with
**`innerText === ""`** (`shots/13-scripts-popover.png`). No message, no reason,
no dismissal hint. The neighbouring "Agent context files" popover in the same
state correctly says "No active project." — so the empty one is not a deliberate
minimalism, it is an unwritten empty state.

### D3 — CONFIRMED: the 8 view keys are silent when clicked

With zero projects all 8 keys have `disabled` and `opacity: 0.4`. A **real**
`Input.dispatchMouseEvent` press+release at the centre of the Mission key
produced a byte-identical DOM snapshot: no view change, no toast, no ripple, no
console output — nothing at all.

The shared explanation *does* exist and *does* work: hovering any key surfaces
"Add a project to use the views." (from the `data-tip` on the parent
`.deck-views`) after **1246 ms measured on this control** — but only on hover,
and it is positioned so that it **covers the "Add or open a project" button**
directly above it (`shots/06-tip-disabled-key.png`), i.e. the explanation
occludes the fix.

They are also **invisible to the keyboard** — see §4.

### D4 — CONFIRMED: Ctrl+1..8 bypasses the disabled state and lies

With zero projects, `Ctrl+3` and `Ctrl+8` both fired. The topbar breadcrumb
changed from "Mission" to "Terminal" and then to "Editor" — **while the screen
kept showing the first-run panel and no deck key lit up**. So at zero projects
the app tells you you are in the Editor, shows you the welcome screen, and shows
you eight dark keys none of which is marked active. `Ctrl+1` produced no change
because "mission" was already the stored view.

The topbar makes the same claim before any key is pressed: at a true cold start
with zero projects it reads **"No project / Mission"** while rendering
`NoProjects`, not Mission.

### D5 — CONFIRMED: a corrupt `projects.json` is presented as "you have no projects"

`projects.json` truncated mid-object, `workspace.json` invalid. The app booted
and showed a banner for one of them only:

> `workspace.json` could not be read, so your tabs and layout are not being saved
> this session. **[Reload]**

`window.api.projects.list()` returned `{"projects":[],"activeId":null,
"unreadable":true}` — the main process *knows* the project list is unreadable —
but the UI renders the ordinary first-run "DevDeck / Open a project folder"
screen and says nothing. A user in this state is being told their projects are
gone. Whether adding a project then overwrites the unreadable file is
**not observed** (it needs the native dialog).

### D6 — CONFIRMED: double-clicking "+ Claude" launches two agents

Two `mousePressed/mouseReleased` pairs dispatched back to back at the same
coordinates produced tabs `claude 3` **and** `claude 4`. There is no debounce and
no in-flight state on the button. Every extra agent is a real process and real
tokens.

### D7 — CONFIRMED: the disabled run button explains the wrong thing

`.topbar-run-btn` is disabled at zero projects with tip "No runnable project type
detected". There is no project at all, so the sentence describes a detection that
never ran. Its `aria-label` ("No runnable project") and its tooltip also disagree.

### D8 — CONFIRMED: the whole right-hand 885 px of the deck bar is empty

`.deck-status` measures 885 × 0 px with empty `innerText` at zero projects, and
its `innerText` was **still empty** with a shell and an agent running (a single
small glyph is visible at the far right in `shots/29-agent.png`; I did not
identify it). At the app's smallest allowed window it is still ~367 px of nothing.

### D9 — OBSERVED, minor: the project switcher at 30 projects

`shots/44-many-switcher.png`. Cards 1–9 carry a numeric quick-pick badge; **21 of
30 have none**, so the advertised "Ctrl+K then 1-9 to pick" reaches 30 % of the
list. The grid is visually cut mid-row at card ~24 with the "↑↓←→ to move" footer
across it. The keyboard cursor started on **card 14**, not on card 1 which was
the active project; I could not explain that and did not chase it.

---

## 4. The icon question, measured

### Tooltip delay — **430 ms**

Measured inside the page (a capture-phase `mouseover` listener stamps
`performance.now()`, a `MutationObserver` stamps the moment `.tip` appears), so
the number excludes CDP round-trip. Cursor parked away for 1.8 s first to clear
the 500 ms "warm" window. Five trials, one per tool icon:

| Control | Delay |
|---|---|
| Scripts & saved commands | 430 ms |
| Agent context files | 428 ms |
| AI usage | 432 ms |
| Settings | 430 ms |
| More | 433 ms |

**Mean 430.6 ms, spread 5 ms.** No long tasks recorded during the run
(`PerformanceObserver({entryTypes:["longtask"]})` collected zero entries).

*(An earlier attempt that polled over CDP reported 651–1292 ms. That was my
instrument, not the app. Discard it; 430 ms is the number.)*

The disabled view-key group tip measured **1246 ms** in a single trial — I did
not repeat it, and I cannot explain the difference from 430 ms, so treat it as
one observation rather than a second number. The "warm" hop between adjacent
tools was **not measured** — my mutation observer missed it because React updates
the existing tip node's text rather than replacing the node.

### Does every icon-only control have a tooltip?

14 controls on the zero-project screen render an `<svg>` and no visible text:

- 5 × `.deck-tool` — **all have both `data-tip` and `aria-label`.** ✅
- 1 × `.topbar-run-btn` — has both, but they disagree (D7).
- 8 × `.deck-view` — **`data-tip` is `null` on every one of them.** The group
  carries the shared sentence instead. With a project open they each gain
  "Mission (Ctrl+1)" … "Editor (Ctrl+8)".

Confusable pairs, by eye on `shots/01-coldstart.png`: the Terminal key `>_` and
the Editor key `<>`; the Browser key (window outline) and the layout/split icons
that appear in the terminal toolbar; and the Tasks key (list) against the
Scripts tool — which the code comments say were once literally the same `list`
icon. **This is my judgement of the rendered pixels, not a user test.** No
discoverability testing with a human was done.

### Are the view keys reachable by keyboard?

**No.** A 16-press Tab walk from `document.body` at zero projects visits exactly
**9 stops**, then wraps:

```
topbar-proj-btn → cmd-pill → accent("Open a project folder") → deck-empty
→ deck-tool ▶ → deck-tool 📖 → deck-tool 📊 → deck-tool ⚙ → deck-tool ⋯ → (wrap)
```

The 8 view keys and the disabled run button are skipped (disabled buttons are not
tabbable). So at zero projects a keyboard user can reach 9 of the 18 controls on
screen. Focus is clearly visible (orange ring) and keyboard focus correctly
surfaces the tooltip via `:focus-visible` — that part works well
(`shots/07-tab-focus.png`).

**Not observed:** the tab order with a project open; arrow-key/roving-tabindex
behaviour inside the `role="tablist"`; any screen reader.

---

## 5. Keyboard reality

Fired from a cold zero-project state via `Input.dispatchKeyEvent` with correct
`code` and modifier bitmasks. "No visible change" means a byte-identical DOM
snapshot (topbar text, active keys, modals, panel, toasts, body length).

| Chord | Advertised in the F1 overlay | Result at zero projects |
|---|---|---|
| **F1** | "This shortcuts list" | ✅ opens the overlay (body text 371 → 1558 chars) |
| **Ctrl+K** | "Switch project" | ✅ opens the switcher |
| **Ctrl+1** | "Switch view" | fires, but nothing changes (already `mission`) |
| **Ctrl+3** | "Switch view" | ⚠️ fires — topbar says "Terminal", screen unchanged, no key lights (D4) |
| **Ctrl+8** | "Switch view" | ⚠️ same, topbar says "Editor" |
| **Ctrl+Shift+T** | "New shell terminal" | ❌ **dead** — no visible change |
| **Ctrl+Shift+Enter** | "New session with your primary agent" | ❌ **dead** — no visible change |
| **Ctrl+Shift+P** | "Command palette" | ✅ opens (body 370 → 2376) |
| **Ctrl+Shift+I** | "Prompt composer" | ❌ dead |
| **Ctrl+Shift+F** | "Search across projects" | ✅ opens |
| **Ctrl+Shift+R** | "Review changes" | ✅ opens |
| **Ctrl+Shift+J** | "Jump to the agent waiting longest" | ❌ dead |
| **Ctrl+Tab** | "Next session" | ❌ dead |
| **Escape** | (not listed) | ✅ closes each overlay above |

The F1 overlay (`shots/09-f1.png`) lists **25 bindings in 4 groups** with no
indication of which apply. At zero projects at least 6 of them do nothing and 3
of them do something invisible. The overlay's own footnote says only "Terminal
shortcuts apply in the Terminal view" — which does not cover Ctrl+Shift+J,
Ctrl+Tab or Ctrl+Shift+I, all listed under **Global**.

**Not observed:** the same chords with a project open (except Ctrl+1..8, which
work correctly once a project exists — all 8 keys become enabled with tips
"Mission (Ctrl+1)" … "Editor (Ctrl+8)").

---

## 6. Anything that breaks

### Renderer console

**Zero** `console.error`, `console.warn` and zero `Runtime.exceptionThrown` events
across all 8 scenario runs — cold start, keyboard sweep, tooltip sweep, entry
points, click path, agent launch, corrupt store, 30 projects. No error boundary
tripped anywhere. The only crash was in the **main** process (D1), which is why
the renderer console is clean.

### Layout at width

Tested with `Emulation.setDeviceMetricsOverride`, height 800.

At **zero projects** nothing reflows at any width — `.deck-views` stays at
[10, 319] and `.deck-tools` at [331, 479] regardless. The break is at
**innerWidth < 479 px**: `documentElement.scrollWidth` sticks at 479 while
`innerWidth` falls, so the page overflows horizontally, `.deck-bar` clips, and
the ⋯ tool leaves the screen. Below ~389 px the topbar clips too and the
"Search or run…" pill's text spills outside its own rounded box across three
lines (`shots/narrow-440.png`).

With **a project open** the active view key expands from 36 px to 91 px (its
label appears), pushing `.deck-tools` right to 533, so the same break arrives
earlier — at **innerWidth < 533 px**, where the term-tab bar clips and the whole
`.term-actions` cluster (+ Terminal, + Claude, Resume, splits, search) goes
off-screen with no overflow affordance.

**Important caveat:** the BrowserWindow sets `minWidth: 900, minHeight: 600`
**[source-read at `src/main/index.ts:127-128`, not measured — I could not resize
the real window over CDP]**. At 900 px I measured no overflow and no clipping.
So this breakage is real in the DOM but a user probably cannot reach it by
dragging the window edge; it would matter on a small screen, under OS display
scaling above 150 %, or if the minimum is ever relaxed.

### Other observations, no severity attached

- The Mission view at zero sessions renders a **SYSTEM / containers & listening
  ports** block listing every listening port on the machine — including `:9436`,
  my own CDP debug port. It is the loudest object on a first-open project screen.
- Mission's agent empty state says *"Start one from the deck (＋) or the command
  palette."* The ＋ does exist — `.deck-add`, tip "Start an agent session here…"
  — but only inside a project strip, icon-only, with no text, and it does not
  exist at all until a project is open.
- The AI-usage modal opens fine at zero projects and shows **$577.73 / 787.7 M
  tokens** read from the machine's Claude Code transcripts, labelled "outside
  DevDeck projects", alongside "0 sessions launched". That is real data on this
  machine; a stranger's would read $0. Noted because it is DevDeck's only
  first-run screen that shows a number, and the number is not about DevDeck.
- While the native folder dialog is open, the renderer is completely inert — no
  dimming, no spinner, no "waiting" state. Body text is byte-identical to before
  the click. If the dialog opens behind the window, the app looks frozen.
