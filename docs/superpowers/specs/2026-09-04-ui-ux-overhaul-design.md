# UI/UX overhaul — design

**Date:** 2026-09-04 · **Status:** approved in outline, awaiting spec review
**Milestone:** ROADMAP step 9 — 5–10 real external users. Nobody outside the
author's machine has ever opened this app.

Sources: four parallel agent audits, all of which drove the built app on a scratch
`userDataDir` rather than reading source alone. Full reports in
`docs/superpowers/brainstorm/2026-09-04-ui-ux/`:
`designer-report.md`, `product-director-report.md`, `docs-writer-report.md`,
`qa-report.md`.

---

## 1. What was decided, and by whom

The user's brief asked to "enhance massively the UI/UX", naming two flows (open a
project; open a terminal for it) and one question (icon, or icon with name).

Four decisions were taken by the user during the brainstorm. They are recorded here
because the rest of this document follows from them and must not be silently
re-opened:

| Decision | Ruling | Consequence |
|---|---|---|
| **Audience** | Serve the **5–10 strangers** first when they conflict with the daily driver | Labels over icons. No density setting, no progressive disclosure — the reversible option was offered and declined |
| **Scope** | **Cut first, then fix** | The kill list executes before any polish. Polishing a surface about to be deleted is the only genuinely wasted work available |
| **Skins** | **84 → 6**, as ruled | Overrides the recorded identity candidate naming Aurora Glass / Neo Holographic / Kinetic Minimal (`.remember/recent.md:13`). The conflict was surfaced and the cut was chosen anyway |
| **Network view** | **Delete — docs first** | `README.md:3` and `site/index.html:194` advertise the capture proxy and must be rewritten *before* the code is removed; that homepage is being filed with SignPath |
| **`Claude YOLO`** | **Keep, label loudly** | Designer's spec applies: rename + a `SKIPS PROMPTS` word marker. Not removed from the defaults |

**The premise was contested and the contest was upheld.** `product-director` ruled
against a massive overhaul, on two facts: there are no component tests, and ~99
untyped `window.api` stubs mean a renamed IPC channel leaves all 1,536 specs green.
A sweeping redesign would run without a regression net, weeks before ten strangers
install it — and changing everything at once destroys the ability to attribute any
beta feedback to any change. This document is therefore **deletions plus a small
number of proven fixes**, not a redesign.

---

## 2. Phase 0 — the crash (not a design decision)

This was found by `qa`, reproduced four times, and confirmed independently by
`designer` from the other end. It ships in 0.12.0 today.

**A project whose folder no longer exists permanently bricks the app.** Click
`+ Terminal` on such a project and Electron shows a fatal main-process modal —
`Error: Cannot create process, error code: 267` from
`WindowsPtyAgent._completePtyConnection` — within one second. The failed tab is then
written to `workspace.json`, so **every subsequent launch crashes before the UI is
usable.** The only recovery is hand-editing userData. Worktrees and branch switches
make this an everyday trigger.

**Why the existing guard does not catch it.** `pty.ts:230` already wraps
`spawnShell` in a try/catch — Experiment E2, 2026-08-29 — but that catches the
*synchronous* throw for a missing **shell**. A missing **cwd** throws
asynchronously, from inside node-pty's connection completion, outside the try/catch
entirely. No amount of widening that block fixes this.

**Fix, three parts:**

1. **Validate the cwd before spawning.** `pty.ts` performs no `existsSync`/`statSync`
   on the working directory anywhere. A missing cwd must produce the same *corpse +
   notice + exit event* path the missing-shell branch already produces, with copy
   naming the folder rather than sending the user to Settings → Terminal.
2. **Do not persist a tab that never started.** The crash is survivable; the crash
   *loop* is what makes it unrecoverable.
3. **A main-process `uncaughtException` guard** that logs to the diagnostics record
   and shows a DevDeck-shaped error instead of Electron's raw modal. This is the
   backstop, not the fix — items 1 and 2 are the fix.

**Verification:** a regression test at the `pty.ts` seam (main-process modules are
tested by mocking `electron` — `tests/projects.test.ts` is the pattern), plus a
`run-app` observation on a project whose folder is deleted live.

---

## 3. Phase 1 — the kill list

Executes first. Everything below it is cheaper afterwards, and it removes roughly
6 of the 17 unguarded overlays that Phase 2 item 4 would otherwise have to wrap.

**Delete:**

| Surface | Approx. lines | Why it fails the product's own test |
|---|---|---|
| Network view — `NetworkPanel.tsx` + `main/proxy.ts` + Settings → Proxy | ~713 | A general-purpose forward proxy for arbitrary client traffic. No agent edge. **`browserNet.ts` survives** — it feeds the `→ Agent` payload and passes the test |
| `ReleaseBoard` + its permanent `DeckStatus` icon | 282 | A deployment tracker, and a *team* artifact in a single-developer cockpit |
| `StandupModal` | 119 | A single developer does not have a standup |
| `DotnetPanel` | 148 | Jumps to `file:line` — helps you *author*. Also stack-specific in a stack-agnostic product |
| `RecordingsModal` + terminal record/replay | 270 | Buried under `⋯`, never promoted, no agent edge |
| `CanvasView` terminal layout + connectors + persisted positions | 210+ | A third layout doing what Grid does. Two layouts is a choice; three is a hobby |

**Hide (real content, wrong prominence):** Mission's `SYSTEM` section (Docker +
listening ports, `MissionControl.tsx:469`). Two independent audits called it the
loudest object on a stranger's first project screen; it is ambient machine state
with no agent edge.

**Skins, 84 → 6.** Keep **Slate** (default dark), **Washi** (light), **Sumi** (the
wabi-sabi north star) × **Modern Pro** and **Wabi-sabi**. Delete themes Graphite,
Zen, Aurora, Neo; delete styles Minimal, Neon, Flat, Bauhaus, CRT, Lacquer,
Modern+, Aurora Glass, Neo Holographic, Kinetic Minimal. This is what makes every
subsequent UI change roughly an order of magnitude cheaper to verify, and the next
six months are UI change and beta reports. It also materially shrinks an
8,716-line `styles.css`. **It is reversible — the CSS is in git.** Do not replace it
with a "more themes coming" note.

**Explicitly NOT cut**, so nobody re-litigates: API, Database, Browser, Editor.
Each carries a `→ Agent` edge and answers *did the agent's change actually work*.
The Editor stays demoted: a reader and a diff surface, never a language server,
debugger, refactoring engine or Git GUI.

**Net effect:** 8 view keys → 7 · 3 terminal layouts → 2 · 15 settings sections → 13
· 20 overlays → 16 · 84 skins → 6.

**Ordering constraint:** `README.md:3` ("network debugging in one window"),
`README.md:176` (Settings list includes Proxy), and `site/index.html:194` ("A local
capture proxy") are rewritten **before** the proxy code is deleted. The homepage is
the page carrying the code-signing policy for the SignPath application.

**Verification — read this twice.** With no component tests and ~99 untyped
`window.api` stubs, deleting the proxy's IPC channels **will not fail a single
test**. A green suite proves nothing here. Deletions are verified by grepping for
bare channel names and by driving the built app, exactly as the `@xterm/xterm`
dependency audit taught: *read the hits; do not trust the count.*

---

## 4. Phase 2 — the stranger's path

Ordered. Each item passes one test: *does this get a stranger closer to running
DevDeck and saying something back?*

### 4.1 The second empty state — highest value in the document

`addProject()` never sets `view`, so opening a folder lands the user on Mission
(`store.ts:1301` resolves a never-opened project to the fresh-install default,
`mission`). There, `MissionControl.tsx:248` is muted prose pointing at an icon-only
`＋`. This is the *same defect class* 0.12.0 fixed one step earlier, still live one
step later.

**Fix:** a project with zero sessions presents one accent control that starts an
agent, on the screen the user actually lands on. Additionally, per `designer`:
**default a never-opened project to the Terminal view.** `CommandLauncher` is the
only screen in the app that answers all three of a stranger's questions — what is
this for, what do I press, what could go wrong — and it is currently three steps and
one guess away. A returning project keeps its remembered view; this changes first
contact only.

**No auto-spawn.** Not an agent (these are paid CLIs, and the codebase already
argues this at `ProjectStrip.tsx:48`), and not even a plain shell — a spawned pane
*replaces* the launcher, the only teaching screen, with a blank prompt. Auto-spawn
buys one click and costs the app's only onboarding.

### 4.2 Labels on the view keys

**Unanimous across all four audits, by four independent routes:** designer measured
the widths, `docs-writer` counted that **14 of 22 first-run instructions exist only
to name an unlabelled control**, `product-director` ruled on register, `qa` found
the eight view keys carry **no `data-tip` at all** (group-level only).

- **Labels always, on all seven remaining view keys.** Kill active-label-only
  (today's behaviour) — it spends the label on the one view whose identity the user
  already knows. Kill hover labels (a tooltip with extra steps) and a user setting
  (a stranger cannot find a setting to make the app legible).
- **Tool cluster stays icon-only** — it already carries both `data-tip` and
  `aria-label` on all five icons, which the view keys do not.
- **Active state moves fully onto the underline** it already has.
- **Fix the `play` glyph collision:** the same triangle means "Scripts" on the deck
  and "Run project" on the topbar. No glyph carries two meanings.

**The window constraint, and it must ship in the same commit.** Labelled deck
widths were measured across all 12 styles: Bauhaus **978px** (its `button` rule
forces uppercase + 700 + tracking, and `.deck-view` is a button), CRT 916px, Flat
935px — against `minWidth: 900` in `src/main/index.ts:127`. **Bauhaus overflows the
app's own minimum window by 78px.** Raise `minWidth` to 1040 and order the collapse
to drop the *verify* group's labels before the supervision three. *(Note: after
Phase 1 both Bauhaus and CRT are deleted, which removes the worst two cases — but
the `minWidth` change stands on the remaining measurements.)*

### 4.3 A disabled control must still be readable

On first run all eight view keys are `disabled` with **both `data-tip` and
`aria-label` null**. Chromium fires no mouse events from a disabled button, so those
glyphs cannot be named by hovering, by screen reader, or by any means at all — at
the very first moment of the product. `qa` also measured that `Ctrl+1..8` bypasses
the disabled state entirely: the topbar changes to "Terminal" while the first-run
panel stays up and no key lights.

This is general enough to belong in `DESIGN.md` as a rule, not just a fix.

### 4.4 Opening a project — one verb, and real entry points

Five labels ship for one act, and `Deck.tsx:38`'s "Add or open a project" **does
neither** — it opens the switcher, making the folder dialog three hops away.
`addProject()` already adopts main's `activeId`, so adding *always* activates; only
the interface pretends there is a distinction.

- **One verb everywhere: `Open folder…`** — `NoProjects`, the switcher header, the
  command palette, the deck, and the OS dialog's own title.
- **An application menu.** `src/main/index.ts` never imports `Menu`, so **`Ctrl+O`
  — the first thing a Windows user tries — is a dead end.** `File → Open Folder…`,
  `Open Recent`, `Close Project`; `Help → Keyboard Shortcuts (F1)`, `About`. Cheapest
  discoverability win in the audit: zero new renderer pixels, and it also fixes the
  absence of any help affordance in persistent chrome.
  **Caveat none of the audits caught:** the only occurrence of the string `Menu` in
  that file is `autoHideMenuBar: true` (`index.ts:131`). Adding a menu therefore
  does *not* make it visible — the bar stays hidden until Alt is pressed. Either
  set `autoHideMenuBar: false` (costs ~20px of chrome, and a visible menu bar is
  itself a discoverability affordance for a stranger), or accept that the menu
  exists only to register the accelerators. **Decide this explicitly; do not let
  the default decide it.** The accelerator registration alone is still worth it,
  because `Ctrl+O` is the failing case.
- **Fix the dead drag-and-drop.** `ProjectSwitcher.tsx:144` reads `File.path`,
  removed in Electron 32; the app is on 43 and `webUtils` is absent from the
  preload. The dashed accent outline lights up on drag and the drop silently does
  nothing — a promised feature that fails quietly, which is worse than not having
  it. Add `webUtils.getPathForFile` to the bridge and move the drop target to the
  app root.

### 4.5 The moved/deleted folder, told honestly

No path validation exists anywhere (`main/projects.ts:84`). A project whose folder
is gone renders as perfectly healthy, and three features then misattribute the
failure: git returns `changes: 0`, Run says "No runnable project type detected", and
the terminal tells you to fix a shell that is fine.

**Three states, reusing the existing command-presence grammar verbatim** — no second
vocabulary for the same idea:

| State | Meaning | Form (three channels, none of them hue) |
|---|---|---|
| `ok` | folder resolved | **nothing** — a healthy project does not grow by a pixel |
| `missing` | `stat` succeeded and said "not there" | chip greyscaled · path gets a 1px dashed rule · pill reading `FOLDER MISSING` |
| `unchecked` | the `stat` *itself* failed — permission denied, unmounted path, timeout | chip keeps full colour · **solid**-bordered pill reading `UNCHECKED` |

`unchecked` is not a weaker `missing`: nothing about the *project* is qualified,
only our knowledge of it. Before the first check lands there is **no marker at
all** — absence is the honest default while a probe is in flight.

**A marker is not a gate.** A missing project still activates and still opens a
terminal, because a path can come back (a VPN, a sleeping NAS, an unmounted drive).
What changes is that the failure is finally *attributed*.

Downstream corrections this unlocks: `git.ts:181` returns `changes: null` not `0`
on cwd ENOENT (its own doc comment already insists "unknown is not zero", and
`DeckStatus` already renders `? changes` correctly when given `null`);
`Topbar.tsx:29` stops claiming "no runnable project type"; `pty.ts:249`'s corpse
notice branches on which of shell/cwd actually failed.

### 4.6 Error boundaries on the remaining overlays

`WorktreesModal` is confirmed reachable and blanks the window. A stranger who
whitescreens on day one gives you an uninstall, not evidence.

### 4.7 Copy and safety

- **`Claude YOLO` → `Claude (no permission prompts)`**, plus a bare uppercase
  `SKIPS PROMPTS` micro-label. `DESIGN.md`'s risk marker specifies a `--danger`
  stripe **plus** full-`--text` description colour; the stripe is present, the word
  is not. A 2px stripe and a hover tooltip is not enough marking for the one control
  that lets an agent edit and run anything without asking. *(User ruled: keep the
  preset, label it loudly.)*
- **`worktree`** — bare, lowercase, unexplained, and **checked by default**
  (`TaskBoard.tsx:309`) → "Give the agent its own worktree", default **off**.
- `SYSTEM` → "Ports in use on this PC"; `REVIEW QUEUE` → "Uncommitted changes".
- "No runnable project type detected" → "No start command found — DevDeck looks for
  a package.json, a .sln/.csproj, or a go.mod in this folder."
- **Two accents side by side** in the terminal tab bar (`+ Claude` accent-filled and
  `Resume` accent-outlined) violates the one-accent rule; `Resume` drops to
  `.secondary` and hides entirely until a resumable session has existed.
- **One label for one act:** `+ Terminal` and `+ New terminal` are the same action
  under two labels, visible within one second of each other.
- **Reconcile the two "primary agent" definitions** — the button uses
  `agents.find(runMode !== "normal")`, `Ctrl+Shift+Enter` uses `agents[0]`
  (`TerminalView.tsx:103` vs `:126`). A chord and a button with the same name do
  different things as soon as a normal-mode command sits first in Settings.
- **A spawning state.** Between click and first byte the pane is an unlabelled black
  rectangle for a measured 4s (shell) / 12s (agent), visually identical to a hung
  spawn. Render `Starting {shell}…`, becoming `Still starting {shell}…` after 5s.
  No spinner — a static line survives `prefers-reduced-motion` unchanged.

### 4.8 Rewrite `PRODUCT.md`

ROADMAP step 8 claimed this and did not do it. It must not ship a false validation
claim on the public flip.

---

## 5. Fixed points — off-limits to this work

A proposal violating one of these is refused without discussion of its merits.

1. **One main view at a time, full width.** Mechanism, not taste: pty `cols` →
   prompt wrapping → `detectApproval` → Approve/Deny vanishes from the tile,
   Overview *and the phone*, silently.
2. **The agent population is visible from every view.**
3. **One accent per screen. No warning colour, ever.** Attention carries a form
   marker and may use accent only in addition.
4. **Three states where there are three, never two.** Absent, unknown and zero are
   different things.
5. **One count per question.** `wantsYou` in `tileState.ts` is the only computation
   of "who needs me".
6. **Nothing is transmitted.** Diagnostics go to the clipboard. A UI overhaul is
   exactly when someone proposes onboarding analytics — refused in advance.
7. **One inline-SVG line icon set. No emoji or Unicode glyphs in chrome**, and no
   glyph carries two meanings. *(The seeded agent presets currently ship literal
   `✳ ✦ ⚡ ◆ ◇ ▶ ⚒ ✓` pictographs — shipped defaults must obey the rubric; the
   user's own free-text field is unaffected.)*
8. **A project is the unit of context.**

---

## 6. Deferred — decisions, not omissions

- **Any redesign of the deck's geometry.** You would be redesigning a shell one
  person has ever used. The existing reopening trigger requires a verbatim
  `NOTES.md` complaint that only the beta can produce. **Trigger: five recorded
  first sessions.**
- **The new-project → new-terminal *mechanics*.** The user asked about this
  directly, so the deferral is explicit: `+ Add folder` is already a labelled
  button, and starting an agent is already one click or one chord. The only defect
  provable today is the empty state (§4.1). Changing mechanics before watching
  someone fail at them is guessing. **Trigger: two of the first five hesitate.**
- **Pinning and manual project ordering** — power-user work at a 5–10-stranger
  milestone.
- **The phone client's visual audit** — it has its own hard-coded palette and does
  not participate in the skin system.
- **All motion and theme work.**
- **A guided tour / onboarding modal.** Refused, not deferred: the fix for "the app
  explains itself once" is self-describing empty states, not a modal dismissed in
  two seconds. Strangers-first does not license onboarding chrome.

---

## 7. Open question for the next session

`docs-writer` could not verify four things over CDP and they remain unobserved: the
native folder dialog (and `addProjectByPath` failing silently on a bad path),
`F1`/`Ctrl+K` via synthetic keys, the "none found on your PATH" state, and the crash
card. These need a human at the keyboard, or a different harness.
