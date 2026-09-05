# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DevDeck survivable for a stranger's first five minutes — fix the crash that permanently bricks the app, delete six surfaces and 78 skins that cost more to carry than they return, then label the navigation and tell the truth about a missing folder.

**Architecture:** Three phases with hard gates. Phase 0 is a main-process bug fix at the `pty.ts` seam. Phase 1 is deletion — it runs before any polish, because polishing a surface you are about to delete is the only genuinely wasted work available. Phase 2 is the stranger's path: landing view, empty state, labels, one verb for "open", and an honest three-state folder probe.

**Tech Stack:** Electron 43, electron-vite 5, React 19, TypeScript, zustand, vitest 4 (`environment: "node"`), `@lydell/node-pty`.

**Spec:** `docs/superpowers/specs/2026-09-04-ui-ux-overhaul-design.md` — read it first; every task argues from it.

## Global Constraints

- **`npm run typecheck` must stay at zero errors.** The build does not typecheck. Run it before every commit.
- **`npm test` must stay green.** It is 1,536 specs. Phase 1 deletes code that some specs cover — deleting those specs *with* their code is correct; silently letting the count drop without saying so is not. Every deletion task states its expected test-count delta.
- **A test-count delta is only meaningful on a tree no other agent is touching.**
  Measured on `main` at 448b0bd: **1,536 passed, 1 skipped**. During wave 1 the
  Task 1 agent measured 1,548 and concluded the baseline was stale — it was not.
  A concurrently-running agent had an untracked `tests/themeFallback.test.ts` on
  disk, and vitest runs every test file it finds, committed or not. Before quoting
  a delta, run `git status --short` and confirm no untracked test files belong to
  someone else. Two agents in one working tree cannot both report counts.
- **A green suite proves nothing about a deletion.** There are no component tests, and ~99 hand-written `window.api` stubs are cast through `unknown`, so renaming or removing an IPC channel leaves every suite green. Deletions are verified by grepping bare channel names and by driving the built app.
- **No component tests. No `.test.tsx`.** `vitest.config.ts` is `environment: "node"`. Logic testable in isolation gets a unit test; anything else gets a `run-app` observation. Do not add a DOM environment.
- **`run-app` requires a scratch profile.** A real DevDeck holds Electron's single-instance lock, so always pass `{ debugPort: <unique>, userDataDir: "<scratch>/udata-<task>" }` or the renderer target never appears. A scratch dir also gives the true zero-projects first-run state.
- **Design tokens are the source of truth.** Change the token (`themes.ts`, `styles.css`), never hard-code a colour or size in a component.
- **One accent per screen. No warning colour, ever.** State carries a form marker (dot/pill/stripe) as well as colour.
- **Three states where there are three, never two.** Absent, unknown and zero are different things. Nothing on screen may claim knowledge the app does not have.
- **No emoji or Unicode glyphs in chrome**, and no glyph carries two meanings.
- **Conventional commits.** 4-space indent, double quotes.
- **Do not edit `src/` while `npm run dev` is running** — HMR on a mid-edit state crashes the dev process.

## Parallelization

Phases are gates: **Phase 0 and Phase 1 may run concurrently; Phase 2 starts only when Phase 1 is merged.** Within a phase, these file sets are disjoint and safe to run in parallel:

| Lane | Tasks | Owns |
|---|---|---|
| **A — main process** | 1, 2, 3 | `src/main/pty.ts`, `src/main/index.ts`, `src/main/workspace.ts` |
| **B — public docs** | 4 | `README.md`, `site/index.html` |
| **C — skins** | 12 | `src/renderer/src/themes.ts`, `styles.css` |
| **D — surface deletions** | 5–11 | `App.tsx` + one component each — **serial within the lane**, because every task touches `App.tsx` |

Lanes A, B, C, D run concurrently. Task 5 additionally requires Task 4 to be committed first (docs before the code they describe is removed).

---

# PHASE 0 — The crash

Reproduced four times by `qa`. A project whose folder no longer exists crashes the main process on `+ Terminal` and persists the failed tab, so every later launch crashes before the UI loads. Recovery requires hand-editing userData.

### Task 1: Refuse to spawn into a directory that is not there

**Files:**
- Modify: `src/main/pty.ts` (the `create` path, around the existing try/catch at `:230`)
- Test: `tests/ptyCwd.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `create()` emits the existing `data` + `exit` corpse pair for a missing cwd, exactly as it already does for a missing shell. No new exported symbol. Later tasks rely on the corpse notice text differing between the shell-missing and cwd-missing cases.

**Why the existing guard does not cover this:** `pty.ts:230` catches the *synchronous* throw `nodePty.spawn` raises for a missing shell. A missing cwd throws *asynchronously* from inside node-pty's `WindowsPtyAgent._completePtyConnection` (`error code: 267`), outside the try/catch entirely, and reaches Electron's fatal main-process dialog.

- [ ] **Step 1: Write the failing test**

`tests/ptyCwd.test.ts`. Follow the `electron`-mocking pattern in `tests/projects.test.ts`; mock `@lydell/node-pty` so the test never spawns a real process.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp/devdeck-test" } }))

const spawn = vi.fn()
vi.mock("@lydell/node-pty", () => ({ spawn }))

describe("create() with a cwd that does not exist", () => {
    beforeEach(() => {
        vi.resetModules()
        spawn.mockReset()
    })

    it("never reaches node-pty", async () => {
        const pty = await import("../src/main/pty")
        pty.create("t1", { cwd: "C:/definitely/not/here", shell: { file: "powershell.exe", args: [] } })
        // The whole point: node-pty's Windows agent throws asynchronously for a
        // bad cwd, outside any try/catch, and kills the main process.
        expect(spawn).not.toHaveBeenCalled()
    })

    it("reports through the same corpse surface a real death uses", async () => {
        const pty = await import("../src/main/pty")
        const seen: { data: string[]; exits: number[] } = { data: [], exits: [] }
        pty.ptyEvents.on("data", (e: { id: string; data: string }) => seen.data.push(e.data))
        pty.ptyEvents.on("exit", (e: { exitCode: number }) => seen.exits.push(e.exitCode))

        pty.create("t2", { cwd: "C:/definitely/not/here", shell: { file: "powershell.exe", args: [] } })

        expect(seen.exits).toEqual([1])
        const notice = seen.data.join("")
        expect(notice).toContain("folder")
        // Must NOT send the user to fix a shell that is fine.
        expect(notice).not.toContain("Settings -> Terminal")
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ptyCwd.test.ts`
Expected: FAIL — `spawn` was called, because no cwd check exists.

- [ ] **Step 3: Add the check**

In `src/main/pty.ts`, import `statSync` from `fs` and guard immediately **before** `ptyEvents.emit("spawn", …)`. Reuse the corpse-writing block that already follows the catch — extract it to a local helper rather than duplicating it, so both failures stay one surface.

```typescript
// node-pty's Windows agent throws for a missing cwd from inside
// _completePtyConnection - asynchronously, outside the try/catch below, which
// means it lands on Electron's fatal main-process dialog and takes the whole
// app down. Checking first is the only place this can be caught at all.
let cwdOk = false
try {
    cwdOk = statSync(opts.cwd).isDirectory()
} catch {
    cwdOk = false
}
if (!cwdOk) {
    reportDead(id, [
        "",
        "DevDeck could not start this terminal.",
        `  folder: ${opts.cwd}`,
        "That folder isn't there right now. It may have been moved or renamed,",
        "or be on a drive that isn't connected.",
        ""
    ].join("\r\n"))
    return
}
```

- [ ] **Step 4: Run the test and the suite**

Run: `npx vitest run tests/ptyCwd.test.ts && npm test && npm run typecheck`
Expected: new specs PASS, 1,536 + 2 pass, zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/pty.ts tests/ptyCwd.test.ts
git commit -m "fix(pty): a missing project folder took the whole app down

node-pty's Windows agent throws error 267 for a bad cwd from inside
_completePtyConnection - asynchronously, so pty.ts's existing try/catch
(which covers the synchronous missing-shell throw) never saw it and the
throw reached Electron's fatal main-process dialog. Check the directory
first and report through the same corpse + exit surface a real death
uses, with copy that names the folder instead of sending the user to fix
a shell that is fine."
```

### Task 2: Never persist a tab that never started

**Files:**
- Modify: `src/renderer/src/store.ts` (the workspace-save path)
- Test: `tests/workspacePersist.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's `exit` event with `exitCode: 1`.
- Produces: nothing new; a behavioural guarantee later tasks depend on — a session that never produced a live pty is absent from `workspace.json`.

The crash is survivable. The crash *loop* is what makes it unrecoverable: the failed tab is written to `workspace.json` and re-attempted on every launch.

- [ ] **Step 1: Write the failing test**

Drive the store through a stubbed `window.api`, the pattern in `tests/paneHold.test.ts`.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

describe("workspace persistence after a failed spawn", () => {
    it("does not save a session that never started", async () => {
        const saved: unknown[] = []
        // Build the window.api stub exactly as tests/paneHold.test.ts does,
        // recording workspace.save calls into `saved`.
        // ... create a project, open a terminal whose spawn immediately exits 1 ...
        const tabs = (saved.at(-1) as { tabsByProject: Record<string, unknown[]> })
        expect(Object.values(tabs.tabsByProject).flat()).toHaveLength(0)
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/workspacePersist.test.ts`
Expected: FAIL — the dead tab is present in the saved payload.

- [ ] **Step 3: Implement**

Exclude sessions that reached `exit` without ever emitting `data` from a live process from the workspace payload. Prefer filtering at save time over mutating state on exit — a corpse must stay visible in the UI for the user to read its notice; it just must not be *restored* next launch.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/workspacePersist.test.ts && npm test && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store.ts tests/workspacePersist.test.ts
git commit -m "fix(workspace): a tab that never started is no longer restored

It was written to workspace.json and re-attempted on every launch, which
turned one crash into a permanent one - the app died before the UI was
usable and the only recovery was hand-editing userData. The corpse still
renders this session so its notice can be read; it just does not come back."
```

### Task 3: A main-process backstop, and a diagnostics record of it

**Files:**
- Modify: `src/main/index.ts`
- Test: none — an `uncaughtException` handler cannot be unit-tested at this seam. Verified by `run-app`.

**Interfaces:**
- Consumes: the diagnostics sink already used by the crash card.
- Produces: nothing importable.

This is the backstop, **not** the fix. Tasks 1 and 2 are the fix.

- [ ] **Step 1: Add the handler**

`process.on("uncaughtException", …)` in the main process: append to the existing capped/deduped/redacted diagnostics record, then show a DevDeck-shaped error dialog naming the diagnostics button, rather than Electron's raw "A JavaScript error occurred in the main process".

- [ ] **Step 2: Verify in the real app**

Delete a project's folder while DevDeck runs, click `+ Terminal`, and confirm Task 1's notice appears in the pane and the app stays alive. Then confirm the app relaunches cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "fix(main): route an uncaught main-process throw into diagnostics

Electron's default dialog says 'A JavaScript error occurred in the main
process' and nothing a user can act on or hand back. This is a backstop
behind the pty cwd check, not a substitute for it."
```

---

# PHASE 1 — The cut

**Gate: Task 4 must be committed before Task 5.** The homepage carries the code-signing policy being filed with SignPath; it must not advertise a feature that was deleted an hour earlier.

### Task 4: Rewrite the public claims first

**Files:**
- Modify: `README.md:3` (the lede), `README.md:171` (Browser bullet), `README.md:176` (Settings section list)
- Modify: `site/index.html:7` (meta description), `site/index.html:194` (the Network bullet)

**Interfaces:**
- Consumes: nothing.
- Produces: public copy that survives Task 5.

- [ ] **Step 1: Edit the README lede**

Drop "and network debugging" from `README.md:3`. Keep the browser's comment-mode bullet at `:171` — it stays, and it still captures failed requests via `browserNet.ts`.

- [ ] **Step 2: Edit the Settings list**

`README.md:176` lists `Proxy` among Settings sections. **It stays** — Settings → Proxy is `<h3>Corporate proxy</h3>` and is not being deleted (see the spec's correction table). Rename it in the README to **`Corporate proxy`** so the name stops reading as the capture proxy.

- [ ] **Step 3: Edit the homepage**

`site/index.html:194` currently reads *"**Network.** A local capture proxy, plus an embedded browser…"*. Replace with a Browser-only bullet:

```html
<li><b>Browser.</b> <span>An embedded browser with a comment mode that hands an agent the element you clicked, the console errors, and the failed requests around it.</span></li>
```

Update the `<meta name="description">` at `:7` to drop "network capture".

- [ ] **Step 4: Verify no other public claim survives**

Run: `grep -rn -i "capture proxy\|network debugging\|network capture" README.md site/index.html CHANGELOG.md PRODUCT.md`
Expected: no hits outside `CHANGELOG.md` (history is not rewritten).

- [ ] **Step 5: Commit**

```bash
git add README.md site/index.html
git commit -m "docs: stop advertising the capture proxy, ahead of removing it

The homepage carries the code-signing policy going to SignPath, so it must
not describe a feature deleted an hour later. Settings -> Proxy is NOT the
capture proxy - it is corporate-proxy support and it stays - so it is
renamed 'Corporate proxy' here rather than removed."
```

### Task 5: Delete the Network view and the capture proxy

**Files:**
- Delete: `src/renderer/src/components/NetworkPanel.tsx`, `src/main/proxy.ts`, `tests/proxy.test.ts`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/components/ViewKeys.tsx` (`DECK_VIEWS`), `src/renderer/src/store.ts` (`MainView` union), `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/styles.css`, `src/renderer/src/components/Icon.tsx` (only if an icon becomes unused)
- **Do NOT touch:** `src/main/netproxy.ts`, `src/main/browserNet.ts`, `tests/netproxy.test.ts`, the `ProxySection` in `SettingsModal.tsx`

**Interfaces:**
- Consumes: Task 4's committed docs.
- Produces: `DECK_VIEWS` drops to **7** entries. Every later task that counts view keys (Task 15's `Ctrl + 1 … N` row, the `minWidth` maths) reads the new length rather than a literal.

- [ ] **Step 1: Confirm the three modules are distinct before deleting anything**

Run: `grep -rn "from \"./proxy\"\|from \"./netproxy\"\|from \"./browserNet\"" src/main/index.ts`
Expected: three separate imports. Only the `./proxy` one goes.

- [ ] **Step 2: Delete the panel and its view key**

Remove `NetworkPanel.tsx`, its route in `App.tsx`, and its `DECK_VIEWS` entry. Remove `"network"` from the `MainView` union in `store.ts` and let the typecheck find every remaining reference.

- [ ] **Step 3: Delete the main-process proxy and its IPC**

Remove `src/main/proxy.ts`, its import and every `ipcMain` handler for it in `index.ts`, and its surface in `src/preload/index.ts`.

- [ ] **Step 4: Grep for orphans — the suite will not find these**

Run: `grep -rn "proxy:" src/ | grep -v netproxy` and `grep -rn "network" src/renderer/src/ --include=*.tsx -i`
Expected: no hits referring to the deleted capture proxy. **This grep is the verification, not the test run** — the `window.api` stubs are cast through `unknown`, so a dangling channel leaves every spec green.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: zero type errors. Test count drops by `tests/proxy.test.ts`'s spec count — **record the exact delta in the commit message** so the drop is never mistaken for a regression.

- [ ] **Step 6: Verify in the real app**

`run-app` on a scratch profile: the deck shows 7 view keys, `Ctrl+1..7` all resolve, `Ctrl+8` does nothing, and the Browser's `→ Agent` payload still carries failed requests (that path is `browserNet.ts` and must be unaffected).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: delete the Network view and the local capture proxy

A general-purpose forward proxy for arbitrary client traffic, with no
agent edge - the job belongs to Fiddler, mitmproxy or browser devtools.
Ruled to fail the product's own test in an earlier audit and shipped
anyway.

KEPT, because the name collides three ways: main/netproxy.ts and
Settings -> Proxy are CORPORATE-proxy support (upstream proxy applied to
every spawned child so npm/git/dotnet work behind a firewall), and
main/browserNet.ts feeds the browser's -> Agent payload and the MCP
tools through its own browser:net* channels.

Deck view keys 8 -> 7. Tests NNNN -> NNNN (tests/proxy.test.ts removed
with its subject; verified by grep, because ~99 untyped window.api stubs
mean a dangling IPC channel would leave every spec green)."
```

### Task 6: Delete ReleaseBoard

**Files:**
- Delete: `src/renderer/src/components/ReleaseBoard.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/components/DeckStatus.tsx` (its permanent icon), `src/renderer/src/styles.css`

**Interfaces:** Produces one fewer permanent icon in `DeckStatus`.

- [ ] **Step 1: Delete the component and its route**
- [ ] **Step 2: Remove its DeckStatus icon and any store state it owned**
- [ ] **Step 3: Grep** — `grep -rn -i "releaseboard\|release-board" src/` → no hits
- [ ] **Step 4: Verify** — `npm run typecheck && npm test`
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete ReleaseBoard

A deployment tracker, and a team artifact, in a single-developer cockpit.
GitHub Environments and the CI system own this. It also held a permanent
seat in DeckStatus, which is the scarcest chrome in the app."
```

### Task 7: Delete StandupModal

**Files:**
- Delete: `src/renderer/src/components/StandupModal.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/components/ApiPanel.tsx`, `src/renderer/src/components/NetworkPanel.tsx` *(already gone after Task 5 — if Task 5 is merged, only ApiPanel remains)*

**Note:** the `NetworkPanel.tsx` reference disappears with Task 5. If tasks run out of order, remove the reference wherever it still lives.

- [ ] **Step 1: Delete the component, its route, and the two call sites**
- [ ] **Step 2: Grep** — `grep -rn -i "standup" src/` → no hits
- [ ] **Step 3: Verify** — `npm run typecheck && npm test`
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete StandupModal

It generates a standup. A single-developer cockpit does not have a standup;
the team's standup is not a product feature."
```

### Task 8: Delete DotnetPanel — and the shortcut that opened it

**Files:**
- Delete: `src/renderer/src/components/DotnetPanel.tsx`, `tests/dotnet.test.ts`
- Modify: `src/renderer/src/App.tsx` (route **and** the `Ctrl+Shift+B` binding), `src/renderer/src/shortcuts.ts`, `src/renderer/src/components/CommandPalette.tsx` (if it lists the action)

**Interfaces:** Produces a `shortcuts.ts` with the `Ctrl + Shift + B` row removed. `tests/shortcuts.test.ts` asserts no duplicate chords and every chord has a description — both still hold.

**This is the one deletion with a keyboard consequence.** `Ctrl+Shift+B` is bound in `App.tsx` and advertised in `shortcuts.ts`, which is rendered by both the F1 overlay and Settings → Shortcuts. Removing the panel without removing the row leaves the reference lying — the exact defect fixed in `c160c9c`.

- [ ] **Step 1: Delete the component, its route, and its `Ctrl+Shift+B` handler**
- [ ] **Step 2: Remove the `["Ctrl + Shift + B", "Build / test (.NET)"]` row from `shortcuts.ts`**
- [ ] **Step 3: Grep** — `grep -rn -i "dotnet\|\.NET" src/renderer/src/ src/main/` → only unrelated hits (e.g. corporate-proxy comments naming `dotnet` as an inheriting child process, which stay)
- [ ] **Step 4: Verify** — `npx vitest run tests/shortcuts.test.ts && npm test && npm run typecheck`
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete DotnetPanel, and the Ctrl+Shift+B row with it

It jumps to file:line - i.e. it helps you author, which is Visual Studio's
job - and it is stack-specific in a stack-agnostic product. The shortcut
row goes in the same commit: a reference that outlives its feature is the
defect c160c9c just finished fixing."
```

### Task 9: Delete RecordingsModal and terminal record/replay

**Files:**
- Delete: `src/renderer/src/components/RecordingsModal.tsx`, `tests/recorderOwnership.test.ts`, `tests/recPlayback.test.ts`, `tests/runRecorder.test.ts`, and the recorder module(s) they cover
- Modify: `src/renderer/src/App.tsx`, the `⋯` overflow menu in `ToolCluster.tsx`, `src/main/index.ts` + `src/preload/index.ts` if recording has IPC

**Interfaces:** Produces a shorter `⋯` overflow menu.

- [ ] **Step 1: Map the surface** — `grep -rln -i "record" src/ tests/` and read the hits before deleting. Distinguish recording from unrelated uses of the word (the run *ledger* records runs and **stays**).
- [ ] **Step 2: Delete the modal, its overflow entry, the recorder module and its IPC**
- [ ] **Step 3: Grep** — `grep -rn -i "asciicast\|recording" src/` → only `asciicast.ts` if it is used by something surviving; otherwise delete it too
- [ ] **Step 4: Verify** — `npm run typecheck && npm test`; **record the test-count delta**
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete terminal recording and its modal

Buried under the overflow menu, never promoted, no agent edge. asciinema
owns this. NOTE: the run ledger also 'records' and is untouched - it prices
real tokens from Claude Code's transcripts and is load-bearing."
```

### Task 10: Delete the Canvas terminal layout

**Files:**
- Delete: `src/renderer/src/components/CanvasView.tsx`
- Modify: `src/renderer/src/components/TerminalView.tsx` (layout switcher), `src/renderer/src/store.ts` (layout union + persisted positions), `src/renderer/src/styles.css`

**Interfaces:** Produces a layout union of exactly `tabs | grid` (plus Overview, which is a separate cross-project view and **stays**).

- [ ] **Step 1: Delete the component and its entry in the layout switcher**
- [ ] **Step 2: Remove the persisted canvas positions from the workspace shape**

Migration: a `workspace.json` written by 0.12.0 may hold `canvas` as the active layout. Reading it must fall back to `grid`, not crash or render nothing. State this fallback explicitly in the code.

- [ ] **Step 3: Grep** — `grep -rn -i "canvas" src/renderer/src/` → no hits except unrelated `<canvas>` DOM usage, if any
- [ ] **Step 4: Verify** — `npm run typecheck && npm test`, then `run-app` with a `workspace.json` whose layout is `"canvas"` and confirm it opens on Grid
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete the Canvas terminal layout

A third layout doing what Grid does, carrying drag positions, zoom and SVG
connectors. Two layouts is a choice; three is a hobby. A workspace.json
that names canvas falls back to grid rather than rendering nothing."
```

### Task 11: Demote Mission's SYSTEM section

**Files:**
- Modify: `src/renderer/src/components/MissionControl.tsx:469`

**Interfaces:** Produces a collapsed-by-default section. Task 14 renders the empty state above it.

Two independent audits called this the loudest object on a stranger's first project screen: ~18 port pills belonging to Steam and SQL Server. It is ambient machine state with no agent edge. **Hidden, not deleted** — it is real content in the wrong place.

- [ ] **Step 1: Collapse it by default and rename it**

Heading `SYSTEM` → **`Ports in use on this PC`**, with a caption: *"every process listening right now, not only DevDeck"*. Collapsed by default; the open/closed state persists per user.

- [ ] **Step 2: Verify in the real app** — open a fresh project, confirm the ports wall is not the loudest thing on screen
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(mission): collapse the ports wall a stranger lands on

18 port pills belonging to Steam and SQL Server were the loudest object on
the first project screen, and the heading said SYSTEM, which names an
internal concept rather than what the list is."
```

### Task 12: 84 skins → 6

**Files:**
- Modify: `src/renderer/src/themes.ts`, `src/renderer/src/styles.css` (8,716 lines; the `[data-style]` blocks), `src/renderer/src/components/SettingsModal.tsx` (Appearance section)

**Interfaces:** Produces `THEMES` of length 3 and `STYLES` of length 2. `SettingsModal`'s Appearance section maps over both and needs no change beyond whatever assumes a longer list.

**Keep:** themes **Slate** (`slate`, default dark), **Washi** (`washi`, light), **Sumi** (`sumi`, the wabi-sabi north star) × styles **Modern Pro** (`modern` — the shipped default) and **Wabi-sabi** (`wabi`).
**Delete:** themes `graphite`, `zen`, `aurora`, `neo`; styles `minimal`, `neon`, `flat`, `bauhaus`, `crt`, `lacquer`, `modernplus`, `aurora`, `neo`, `kinetic`.

**Migration is mandatory.** A user (including the author's real profile) may have `settings.json` naming a deleted theme or style. Reading an unknown id must fall back to the default, not render an unstyled app.

- [ ] **Step 1: Write the failing test**

`tests/themeFallback.test.ts` — this one *is* unit-testable, because `themes.ts` is pure.

```typescript
import { describe, it, expect } from "vitest"
import { THEMES, STYLES } from "../src/renderer/src/themes"

describe("the reduced skin set", () => {
    it("keeps exactly the three themes and two styles that were ruled to stay", () => {
        expect(Object.keys(THEMES).sort()).toEqual(["slate", "sumi", "washi"])
        expect(Object.keys(STYLES).sort()).toEqual(["modern", "wabi"])
    })

    it("falls back to the default for a skin id that no longer exists", () => {
        // A settings.json written by 0.12.0 may name "aurora" or "kinetic".
        expect(resolveTheme("aurora").id).toBe("slate")
        expect(resolveStyle("kinetic").id).toBe("modern")
    })
})
```

**Id trap — verified, do not get this wrong.** `"Modern Pro"` is the id **`modern`**.
`modernplus` is a *different* style labelled `"Modern+"` and is **on the delete
list**. `settings.ts:491` confirms the shipped default is `style: "modern"`, so
deleting `modern` by mistake would leave every existing install unstyled.
`THEMES` and `STYLES` are `Record<Id, …>` objects, not arrays — use `Object.keys`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/themeFallback.test.ts`
Expected: FAIL — 7 themes, 12 styles, and no `resolveTheme` export.

- [ ] **Step 3: Cut the theme and style tables, and add the resolvers**

Export `resolveTheme(id)` / `resolveStyle(id)` that return the named entry or the default. Route `applyTheme`/`applyStyle` through them.

- [ ] **Step 4: Cut the CSS**

Delete the `[data-style="…"]` blocks for the ten removed styles. Work from `grep -n 'data-style' src/renderer/src/styles.css` and delete whole blocks — do not leave orphaned selectors.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/themeFallback.test.ts && npm test && npm run typecheck`, then `run-app`: cycle all 6 combinations and screenshot each. **Also** launch once with a `settings.json` naming `"kinetic"` and confirm it opens on the default rather than unstyled.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(themes): 84 skins to 6

Every UI change for the next six months has to be verified against the
skin matrix, and 84 combinations is what makes each one expensive - the
label change in this same plan overflowed the app's own minimum window in
Bauhaus and nobody would have found it without measuring all twelve.

Keeps Slate (default), Washi (light) and Sumi (the stated wabi-sabi north
star) x Modern Pro and Wabi-sabi. Deletes ten styles and four themes,
including Aurora Glass, Neo Holographic and Kinetic Minimal, which a
recorded identity candidate named - the conflict was surfaced and the cut
was chosen anyway. It is reversible; the CSS is in git.

A settings.json naming a deleted skin now falls back to the default
instead of rendering an unstyled window."
```

---

# PHASE 2 — The stranger's path

**Gate: Phase 1 is merged.** Task 15's width maths depends on the 7-key deck and the reduced skin set.

### Task 13: Land a new project where it can teach

**Files:**
- Modify: `src/renderer/src/store.ts:1301`
- Test: `tests/landingView.test.ts` (create)

**Interfaces:** Produces: activating a project with no recorded view resolves to `"terminal"`. A project with a recorded view is untouched.

- [ ] **Step 1: Write the failing test**

```typescript
it("lands a never-opened project on Terminal, not Mission", () => {
    // viewByProject has no entry for this id
    expect(resolveViewFor("new-project-id", { viewByProject: {}, view: "mission" })).toBe("terminal")
})

it("still restores a returning project's remembered view", () => {
    expect(resolveViewFor("seen", { viewByProject: { seen: "editor" }, view: "mission" })).toBe("editor")
})
```

- [ ] **Step 2: Run it and watch it fail** — today `s.viewByProject[id] ?? s.view` resolves to Mission
- [ ] **Step 3: Implement** — `s.viewByProject[id] ?? (isFirstOpen ? "terminal" : s.view)`
- [ ] **Step 4: Verify** — `npm test && npm run typecheck`
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(store): a new project opens on Terminal, not Mission

CommandLauncher is the only screen in the app that answers all three of a
stranger's questions - what is this for, what do I press, what could go
wrong - and it was three steps and one guess away. A returning project
keeps its remembered view; this changes first contact only."
```

### Task 14: The second empty state

**Files:**
- Modify: `src/renderer/src/components/MissionControl.tsx:248`

**Interfaces:** Consumes Task 11's collapsed SYSTEM section.

A project with zero sessions must present **one accent control that starts an agent**, on the screen the user lands on — replacing muted prose that points at an icon-only `＋`. This is the same defect class 0.12.0 fixed one step earlier.

- [ ] **Step 1: Replace the prose with a real control** — one accent button, labelled with the act it performs, using `CommandLauncher`'s empty state as the template (it is the best-written surface in the app)
- [ ] **Step 2: Verify in the real app** — open a fresh project, screenshot, confirm exactly one accent target
- [ ] **Step 3: Commit**

### Task 15: Labels on the view keys, and the window that must hold them

**Files:**
- Modify: `src/renderer/src/styles.css:7926` (`.deck-view-name`), `src/main/index.ts:127` (`minWidth`), `src/renderer/src/components/ViewKeys.tsx`, the topbar's Run icon

**Interfaces:** Consumes Phase 1's 7-key deck.

Unanimous across all four audits. Measured: 8 icon-only keys = 348px, labelled = 683px, in a 1386px bar with 511px to spare.

- [ ] **Step 1: Show every label** — delete `.deck-view-name { display: none }` and the `.deck-view.on` special case. Active state moves fully onto the underline it already has.
- [ ] **Step 2: Raise `minWidth` 900 → 1040** and order the responsive collapse to drop the *verify* group's labels before the supervision three
- [ ] **Step 3: Fix the glyph collision** — the same `play` triangle means "Scripts" on the deck and "Run project" on the topbar. Give one of them a different icon. No glyph carries two meanings.
- [ ] **Step 4: Verify across every surviving skin** — `run-app`, screenshot the deck in all 6 combinations at 1040px and at 1386px, and confirm no clipping in any
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(deck): label every view key

Four independent audits reached this by four routes: measured widths, a
count that 14 of 22 first-run instructions exist only to name an
unlabelled control, a ruling on register, and the finding that the keys
carry no per-key tooltip at all. Active-label-only spent the label on the
one view whose identity the user already knew.

minWidth 900 -> 1040 ships in this commit, not after it: a labelled deck
measured 978px in Bauhaus, which overflowed the app's own minimum window."
```

### Task 16: A disabled control must still be readable

**Files:**
- Modify: `src/renderer/src/components/ViewKeys.tsx`, `src/renderer/src/App.tsx` (the `Ctrl+1..N` handler)
- Modify: `DESIGN.md` — add the rule

On first run all view keys are `disabled` with **both `data-tip` and `aria-label` null**. Chromium fires no mouse events from a disabled button, so those glyphs cannot be named by hovering, by screen reader, or by any means at all — at the very first moment of the product. Separately, `Ctrl+1..N` bypasses the disabled state: the topbar changes while the first-run panel stays up.

- [ ] **Step 1: Give every key a permanent `aria-label`**, present whether or not it is disabled
- [ ] **Step 2: Make `Ctrl+1..N` respect the same disabled condition the buttons do**
- [ ] **Step 3: Add the rule to `DESIGN.md`:** *a disabled control must still say what it is and why it is off*
- [ ] **Step 4: Verify** — `run-app` on a zero-project profile: Tab reaches the keys, each announces itself, and `Ctrl+3` does not change the topbar
- [ ] **Step 5: Commit**

### Task 17: One verb for one act

**Files:**
- Modify: `src/renderer/src/components/NoProjects.tsx:35`, `ProjectSwitcher.tsx:163`, `CommandPalette.tsx:163`, `Deck.tsx:34-39`, `src/main/projects.ts:89` (dialog title)

Five labels ship for one act, and `Deck.tsx:38`'s "Add or open a project" does neither — it opens the switcher, putting the folder dialog three hops away.

- [ ] **Step 1: One verb everywhere — `Open folder…`**
- [ ] **Step 2: Fix the deck control** — two states: no projects at all → `Open folder…` calling `addProject()`; projects exist but none active → `Choose a project` calling `openSwitcher()`. Give it the existing `.deck-add` dashed-border treatment; it must **not** take an accent fill, because the accent CTA already lives on the panel above.
- [ ] **Step 3: Verify** — `run-app`, confirm one click reaches the dialog from the deck
- [ ] **Step 4: Commit**

### Task 18: An application menu, and `Ctrl+O`

**Files:**
- Modify: `src/main/index.ts` (add `Menu`; decide `autoHideMenuBar` at `:131`), `src/renderer/src/App.tsx` (`Ctrl+O`)

`src/main/index.ts` never imports `Menu`, so **`Ctrl+O` — the first thing a Windows user tries — is a dead end.**

**Decision required before implementing:** the file sets `autoHideMenuBar: true`, so a menu added naively stays hidden until Alt. Either set it `false` (costs ~20px, and a visible menu bar is itself an affordance for a stranger) or accept that the menu exists only to register accelerators. **Ask the user; do not let the default decide.**

- [ ] **Step 1: Build the menu** — `File → Open Folder… (Ctrl+O)`, `Open Recent`, `Close Project`, `Exit`; `Help → Keyboard Shortcuts (F1)`, `About DevDeck`
- [ ] **Step 2: Bind `Ctrl+O`** in `App.tsx` alongside `Ctrl+K`
- [ ] **Step 3: Add both to `shortcuts.ts`** so the F1 overlay and Settings → Shortcuts stay the single source of truth
- [ ] **Step 4: Verify** — `run-app`: press `Ctrl+O`, confirm the dialog opens
- [ ] **Step 5: Commit**

### Task 19: Make the drag-and-drop that already animates actually work

**Files:**
- Modify: `src/preload/index.ts` (expose `webUtils.getPathForFile`), `src/renderer/src/components/ProjectSwitcher.tsx:144`, `src/renderer/src/App.tsx` (move the drop target to the app root)

`ProjectSwitcher.tsx:144` reads `File.path`, removed in Electron 32; the app is on 43 and `webUtils` is absent from the preload (confirmed: zero occurrences). The dashed accent outline lights up on drag and the drop silently does nothing — a promised feature that fails quietly, which is worse than not having one.

- [ ] **Step 1: Expose `webUtils.getPathForFile` through the contextBridge**
- [ ] **Step 2: Replace the dead `File.path` read**
- [ ] **Step 3: Move the drop target to the app root** so it works whether or not the switcher is open
- [ ] **Step 4: Add the wrong-type case** — dropping a file rather than a folder shows a toast: *"That's a file, not a folder. DevDeck opens folders."*
- [ ] **Step 5: Verify** — **manual, not CDP.** HTML5 drag-and-drop cannot be simulated over the DevTools Protocol. Drag a real folder onto the window by hand and confirm it opens.
- [ ] **Step 6: Commit**

### Task 20: Tell the truth about a folder that is not there

**Files:**
- Modify: `src/main/projects.ts` (add the probe), `src/preload/index.ts`, `src/renderer/src/components/ProjectChip.tsx`, `ProjectSwitcher.tsx`, the notice bar
- Test: `tests/folderProbe.test.ts` (create)

**Interfaces:** Produces `probeProject(path): "ok" | "missing" | "unchecked"`. Task 21 consumes the same states.

No path validation exists anywhere. A project whose folder is gone renders as perfectly healthy.

**Three states, reusing the existing command-presence grammar verbatim** — do not invent a second vocabulary:

| State | Meaning | Form (three channels, none of them hue) |
|---|---|---|
| `ok` | folder resolved | **nothing** — a healthy project does not grow by a pixel |
| `missing` | `stat` succeeded and said "not there" | chip `filter: grayscale(1) opacity(.6)` · path gets a 1px dashed rule · pill reading `FOLDER MISSING` |
| `unchecked` | the `stat` *itself* failed — permission denied, unmounted path, timeout | chip **keeps full colour** · **solid**-bordered pill reading `UNCHECKED` |

`unchecked` is not a weaker `missing`: nothing about the *project* is qualified, only our knowledge of it. **Before the first check lands there is no marker at all.**

**A marker is not a gate.** A missing project still activates and still opens a terminal — a path can come back (a VPN, a sleeping NAS). What changes is that the failure is finally attributed.

- [ ] **Step 1: Write the failing test** — the three states, including that a `stat` which *throws* yields `unchecked` and not `missing`
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement the probe** in `src/main/projects.ts` (grayscale via `filter`, not `color` — `ProjectChip` renders a user-set emoji that paints its own colours and ignores `color`)
- [ ] **Step 4: Add the notice bar for the active project**

> `DevDeck can't find this folder.` `<code>{path}</code>`
> `It may have moved, been renamed, or be on a drive that isn't connected.`
> Actions: `Locate…` (accent) · `Remove from DevDeck` (secondary)

Never "deleted" — DevDeck cannot know that. Only the non-destructive action takes the accent.

- [ ] **Step 5: Verify** — `npm test`, then `run-app`: delete a project's folder live and confirm the marker appears and the terminal still opens
- [ ] **Step 6: Commit**

### Task 21: Stop three features misattributing the same failure

**Files:**
- Modify: `src/main/git.ts:183`, `src/renderer/src/components/Topbar.tsx:29`, `src/main/pty.ts` (the corpse notice from Task 1)

**Interfaces:** Consumes Task 20's states.

- [ ] **Step 1: `git.ts` returns `changes: null`, not `0`,** when `execFile` fails ENOENT on the cwd. The file's own doc comment already insists unknown is not zero, and `DeckStatus` already renders `? changes` correctly when given `null` — the UI work is done.
- [ ] **Step 2: `Topbar.tsx:29`** stops saying "No runnable project type detected" when the folder does not exist → *"This project's folder isn't there right now."*
- [ ] **Step 3: `pty.ts`'s corpse notice** branches on which of shell/cwd failed (Task 1 established both texts)
- [ ] **Step 4: Verify** — `npm test && npm run typecheck`, then `run-app` on a project whose folder is gone: all three messages now name the folder
- [ ] **Step 5: Commit**

### Task 22: Error boundaries on the remaining overlays

**Files:**
- Modify: the overlays still lacking a `RegionBoundary`, `WorktreesModal` first

`WorktreesModal` is confirmed reachable and blanks the window. A stranger who whitescreens on day one gives you an uninstall, not evidence. Phase 1 removed roughly 6 of the 17 unguarded overlays, so scope this against what actually survives.

- [ ] **Step 1: Enumerate** — `grep -rLn "RegionBoundary\|ErrorBoundary" src/renderer/src/components/*Modal.tsx`
- [ ] **Step 2: Wrap each**, `WorktreesModal` first
- [ ] **Step 3: Verify** — throw deliberately inside one and confirm the app survives
- [ ] **Step 4: Commit**

### Task 23: Copy and safety

**Files:** `src/renderer/src/settings.ts:163`, `TaskBoard.tsx:309`, `MissionControl.tsx`, `TerminalView.tsx:103,126,407,440`, `TerminalPane.tsx:259`, `Topbar.tsx`

- [ ] **Step 1: `Claude YOLO` → `Claude (no permission prompts)`** plus a bare uppercase `SKIPS PROMPTS` micro-label (`--faint`, letter-spaced; *not* a filled badge, which is reserved). DESIGN.md's risk marker specifies a `--danger` stripe **plus** full-`--text` description colour; the stripe exists, the word does not. **User ruled: keep the preset, label it loudly.**
- [ ] **Step 2: `worktree` → "Give the agent its own worktree", default `false`** (`useState(true)` today — a side-effecting default behind bare lowercase jargon)
- [ ] **Step 3: Kill the second accent** — `Resume` drops to `.secondary`, and hides entirely until a resumable session has existed
- [ ] **Step 4: One label for one act** — `+ Terminal` and `+ New terminal` become `New terminal`
- [ ] **Step 5: Reconcile the two "primary agent" definitions** — `Ctrl+Shift+Enter` (`agents[0]`) adopts the button's `agents.find(a => a.runMode !== "normal") ?? agents[0]`
- [ ] **Step 6: Add a spawning state** — `Starting {shell}…`, becoming `Still starting {shell}…` after 5s. Measured silence today is 4s (shell) / 12s (agent), visually identical to a hung spawn. No spinner: a static line survives `prefers-reduced-motion` unchanged.
- [ ] **Step 7: Copy fixes** — `REVIEW QUEUE` → "Uncommitted changes"; "No runnable project type detected" → "No start command found — DevDeck looks for a package.json, a .sln/.csproj, or a go.mod in this folder."
- [ ] **Step 8: Verify and commit** — `npm test && npm run typecheck`, plus a `run-app` pass over the terminal launcher

### Task 24: Rewrite `PRODUCT.md`

**Files:** `PRODUCT.md`

ROADMAP step 8 claimed this and did not do it. It must not ship a false validation claim on the public flip.

- [ ] **Step 1: Replace the validation section** with what is actually true: no external user has run this app, and the milestone is 5–10
- [ ] **Step 2: Reconcile the feature list** with everything Phase 1 deleted
- [ ] **Step 3: Commit**

---

### Task 25: Reconcile the README with what Phase 1 actually deleted

**Files:** `README.md`

**Interfaces:** Consumes the finished state of Tasks 5, 10 and 12. **Runs last in
Phase 1**, because two of its numbers are outputs of other tasks.

Found by the Task 4 agent, which correctly refused to fix them as out of scope:
the plan assigned `README.md` to Task 4 only, so three lines were left with no
owner and would have shipped describing deleted features.

- [ ] **Step 1: `README.md:157`** — "four ways to arrange sessions… a free-form
  **Canvas** you pan and position by hand" → three ways, Canvas removed (Task 10)
- [ ] **Step 2: `README.md:174`** — "7 color themes (Sumi, Washi, Slate, Graphite,
  Zen, Aurora, Neo) × 12 design styles" → the real surviving counts and names
  (Task 12). Default stays "Slate + Modern Pro"
- [ ] **Step 3: `README.md:133`** — `npm test  # 1,530 unit tests`. Already stale
  before this plan (the suite was 1,536), and every Phase 1 deletion moves it.
  Set it to the number `npm test` actually prints at this point
- [ ] **Step 4: The skin matrix is claimed in four more places, none of them README**

Task 12's agent flagged two and could not reach the rest. All four now describe a
matrix the code no longer has:

- `src/renderer/src/tileState.ts:78` — "the tile has to stay legible in all 84 skins"
- `DESIGN.md:95` — the Styles list still names Modern Minimal, Bauhaus, Flat Vector
  and the rest; `:186` uses "Bauhaus is 0, Flat Vector is generous" as its worked
  example of the radius dial, and that example now references two deleted styles
- `.claude/skills/devdeck-design/SKILL.md:41, :49, :131` — states "**7 themes × 12
  styles = 84 combinations**" three times. **This is the highest-priority one and
  it is not documentation:** it is the skill every future design agent loads before
  touching UI, so leaving it stale makes every later design decision argue against
  a constraint that no longer exists
- `CHANGELOG.md` — history, correctly left alone

Rewrite the first three to the real 3 × 2. Keep each one's *rationale* — the reason
a form marker must survive every skin is unchanged; only the arithmetic moved.

- [ ] **Step 5: Re-run Task 4's grep, which only comes back clean now**

Run: `grep -rn -i "capture proxy|network debugging|network capture" README.md site/index.html PRODUCT.md`
`PRODUCT.md:3` and `:8` still carry capture-proxy claims — those belong to **Task 24**,
so hits there are expected until Task 24 runs. Hits in `README.md` or
`site/index.html` are not.

- [ ] **Step 6: Commit**

```bash
git add README.md DESIGN.md src/renderer/src/tileState.ts .claude/skills/devdeck-design/SKILL.md
git commit -m "docs: the README describes what Phase 1 left behind

Canvas, the skin counts and the test count all moved underneath it. The
plan gave README.md to the docs task only, so these three lines had no
owner - caught by that task's agent rather than by anything automated."
```

---

## Self-review

**Spec coverage:** §2 → Tasks 1–3. §3 → Tasks 4–12 (including the corrected `netproxy`/`browserNet` carve-out in Task 5). §4.1 → 13, 14. §4.2 → 15. §4.3 → 16. §4.4 → 17, 18, 19. §4.5 → 20, 21. §4.6 → 22. §4.7 → 23. §4.8 → 24. §5 fixed points are in Global Constraints. §6 deferrals have no tasks, by design.

**Known gaps, deliberate:**
- Task 14's accent control has no code block — the exact markup depends on Task 11's collapsed section landing first. The executor reads `CommandLauncher`'s empty state as the stated template.
- Task 2's test is a sketch, not runnable code; it needs the `window.api` stub from `tests/paneHold.test.ts`, which is ~99 properties and must not be copied inline into a plan.
- Task 9 requires mapping before deleting: "record" is overloaded, and the run **ledger** must survive.

**Open decision blocking Task 18:** `autoHideMenuBar`. Flagged in-task; do not let the default decide it.
