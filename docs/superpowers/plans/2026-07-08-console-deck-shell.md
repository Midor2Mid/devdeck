# Console Deck Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DevDeck's Rail + Sidebar + StatusBar shell with a bottom **Console Deck** (live agent-session "keys" grouped by project) plus a slim **Topbar**, moving project management into an upgraded `Ctrl+K` switcher — chrome only; the single-focus main panel is unchanged.

**Architecture:** A new pure helper (`deck.ts`) groups `agentSessions()` into per-project strips; small presentational components (`AgentKey`, `ProjectStrip`, `ViewKeys`, `ToolCluster`, `DeckStatus`) compose into a `Deck` container mounted below the main panel, with a `Topbar` above it. `App.tsx` drops the Allotment sidebar split (main goes full-width) and stops rendering `Rail`/`Sidebar`/`StatusBar`. Every existing store action is reused — this is a re-parenting of behavior, not new backend logic.

**Tech Stack:** Electron + electron-vite + React 18 + TypeScript, Zustand store (`store.ts`), Vitest (`tests/`), CSS custom properties themed in `themes.ts` + `styles.css`.

## Global Constraints

Copied verbatim from the spec and project guides — every task implicitly includes these:

- **Indent 4 spaces; double quotes for strings** (global style).
- **Conventional commits** (`feat:`, `fix:`, `refactor:`, `docs:`); commit after each task.
- **Design tokens are the source of truth** — change the token / use existing tokens (`var(--bg)`, `var(--panel)`, `var(--border)`, `var(--accent)`, `var(--muted)`…); never hard-code a color/size where a token exists (DESIGN.md).
- **One accent on screen; show state in form (dot/pill/stripe) as well as color** (DESIGN.md).
- **Motion honors `prefers-reduced-motion: reduce`** — every deck transition disabled under it.
- **Icons:** use existing `Icon` names only (`components/Icon.tsx`); no Unicode glyphs/emoji in chrome.
- **Tests:** logic testable in isolation gets a Vitest unit test; components that need Electron are verified with the **run-app skill** (build `out/` first with `npx electron-vite build`). `npm test` must pass before a task is done.
- **Do NOT edit files under `src/` while `npm run dev` is running** (HMR on a mid-edit state crashes dev). Build/verify via `npx electron-vite build` + run-app.
- **HTML5 drag-and-drop can't be driven over CDP** — drag-to-agent and folder-drop are verified **manually**.
- Branch for this work: `console-deck-shell` (already created; the spec commit lives here).

## File structure

**Create**
- `src/renderer/src/deck.ts` — pure grouping + session-cycle helpers (`DeckStrip`, `deriveDeckStrips`, `nextSession`, `COMPRESS_THRESHOLD`).
- `src/renderer/src/components/AgentKey.tsx` — one agent session as a deck key.
- `src/renderer/src/components/ProjectStrip.tsx` — a project label + its agent keys + start-session button.
- `src/renderer/src/components/ViewKeys.tsx` — segmented main-view switch.
- `src/renderer/src/components/ToolCluster.tsx` — high-frequency tools + Tasks/Commands popover + overflow.
- `src/renderer/src/components/DeckStatus.tsx` — the dissolved StatusBar (git branch/changes/identity, attention/remote/release/version).
- `src/renderer/src/components/Deck.tsx` — bottom container composing the above.
- `src/renderer/src/components/Topbar.tsx` — ensō + project ▾ + view breadcrumb + command pill.
- `tests/deck.test.ts` — unit tests for `deck.ts`.

**Modify**
- `src/renderer/src/App.tsx` — mount Topbar + Deck; full-width main; drop Rail/Sidebar/StatusBar; add `Ctrl+1…6` and `Ctrl+Tab` shortcuts.
- `src/renderer/src/components/ProjectSwitcher.tsx` — upgrade into a light project manager + whole-window folder-drop.
- `src/renderer/src/components/ShortcutsModal.tsx` — document the new shortcuts.
- `src/renderer/src/styles.css` — add deck/topbar CSS + per-`[data-style]` treatments; remove rail/sidebar/statusbar rules.
- `DESIGN.md` — update the **Layout** section to describe the deck.

**Delete**
- `src/renderer/src/components/Rail.tsx`
- `src/renderer/src/components/Sidebar.tsx`
- `src/renderer/src/components/StatusBar.tsx` (superseded by `DeckStatus`)

**Reuse as-is (no change)**
- `store.ts` actions: `agentSessions`, `sessions`, `setView`, `setActiveProject`, `jumpToTerm`, `renameSession`, `newTabIn`, `newTab`, `moveProject`, `setProjectGroup`, `addProject`, `addProjectByPath`, `saveWorkspacePreset`, `openWorkspacePreset`, `deleteWorkspacePreset`, `setEnvEditorProject`, `setCommandsEditorProject`, `dragPayload`/`setDragPayload`, `activePaneByProject`, `activeId`, `view`, all overlay setters.
- `TaskRunner.tsx` (rendered inside the ToolCluster popover, unchanged).
- `contextmenu.ts` (`contextMenu(e, items)`), `confirm.ts` (`confirm(...)`), `Icon.tsx`, `Enso.tsx`.

---

### Task 1: Deck grouping + session-cycle logic

Pure, no React/Electron — fully unit-tested (mirrors `tests/projects.test.ts`).

**Files:**
- Create: `src/renderer/src/deck.ts`
- Test: `tests/deck.test.ts`

**Interfaces:**
- Consumes: `AnySession` from `store.ts` (`{ termId, projectId, projectName, sessionName, agentId, badge, isAgent, status }`).
- Produces:
  - `interface DeckStrip { projectId: string; projectName: string; keys: AnySession[]; compressed: boolean }`
  - `deriveDeckStrips(sessions: AnySession[], active?: { id: string; name: string }): DeckStrip[]`
  - `nextSession(sessions: AnySession[], currentTermId: string | null, dir: 1 | -1): string | null`
  - `const COMPRESS_THRESHOLD = 4`

- [ ] **Step 1: Write the failing test**

Create `tests/deck.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { deriveDeckStrips, nextSession, COMPRESS_THRESHOLD } from "../src/renderer/src/deck"
import type { AnySession } from "../src/renderer/src/store"

function sess(over: Partial<AnySession>): AnySession {
    return {
        termId: "t",
        projectId: "p",
        projectName: "P",
        projectPath: "",
        tabName: "tab",
        sessionName: "s",
        agentId: "claude",
        badge: "CL",
        isAgent: true,
        status: "idle",
        ...over
    }
}

describe("deriveDeckStrips", () => {
    it("groups agent sessions by project in first-seen order", () => {
        const strips = deriveDeckStrips([
            sess({ termId: "a", projectId: "p1", projectName: "One" }),
            sess({ termId: "b", projectId: "p2", projectName: "Two" }),
            sess({ termId: "c", projectId: "p1", projectName: "One" })
        ])
        expect(strips.map((s) => s.projectId)).toEqual(["p1", "p2"])
        expect(strips[0].keys.map((k) => k.termId)).toEqual(["a", "c"])
    })

    it("marks a strip compressed only past the threshold", () => {
        const many = Array.from({ length: COMPRESS_THRESHOLD + 1 }, (_, i) =>
            sess({ termId: "k" + i, projectId: "p1" })
        )
        expect(deriveDeckStrips(many)[0].compressed).toBe(true)
        expect(deriveDeckStrips(many.slice(0, COMPRESS_THRESHOLD))[0].compressed).toBe(false)
    })

    it("prepends an empty strip for the active (cold) project when it has no keys", () => {
        const strips = deriveDeckStrips([sess({ projectId: "p1" })], { id: "cold", name: "Cold" })
        expect(strips[0]).toMatchObject({ projectId: "cold", keys: [] })
        expect(strips).toHaveLength(2)
    })

    it("does not duplicate the active project when it already has keys", () => {
        const strips = deriveDeckStrips([sess({ projectId: "p1", projectName: "One" })], {
            id: "p1",
            name: "One"
        })
        expect(strips).toHaveLength(1)
    })
})

describe("nextSession", () => {
    const list = [sess({ termId: "a" }), sess({ termId: "b" }), sess({ termId: "c" })]
    it("cycles forward and wraps", () => {
        expect(nextSession(list, "a", 1)).toBe("b")
        expect(nextSession(list, "c", 1)).toBe("a")
    })
    it("cycles backward and wraps", () => {
        expect(nextSession(list, "a", -1)).toBe("c")
    })
    it("returns first when current is unknown, null when fewer than two", () => {
        expect(nextSession(list, null, 1)).toBe("a")
        expect(nextSession([sess({ termId: "a" })], "a", 1)).toBeNull()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- deck`
Expected: FAIL — cannot resolve `../src/renderer/src/deck`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/deck.ts`:

```ts
import type { AnySession } from "./store"

export interface DeckStrip {
    projectId: string
    projectName: string
    /** Agent sessions in this project (plain shells are excluded upstream). */
    keys: AnySession[]
    /** True when keys should render compressed (dot + badge, name hidden). */
    compressed: boolean
}

/** Max agent keys shown expanded per project before compression kicks in. */
export const COMPRESS_THRESHOLD = 4

/**
 * Group agent sessions into per-project deck strips, in first-seen project
 * order. A project with no agent sessions produces no strip — it is "cold" and
 * reachable from the switcher, not the deck. When `active` is supplied and has
 * no strip, an empty strip is prepended so the user can start its first session.
 */
export function deriveDeckStrips(
    sessions: AnySession[],
    active?: { id: string; name: string }
): DeckStrip[] {
    const order: string[] = []
    const byId = new Map<string, DeckStrip>()
    for (const s of sessions) {
        let strip = byId.get(s.projectId)
        if (!strip) {
            strip = { projectId: s.projectId, projectName: s.projectName, keys: [], compressed: false }
            byId.set(s.projectId, strip)
            order.push(s.projectId)
        }
        strip.keys.push(s)
    }
    const strips = order.map((id) => {
        const strip = byId.get(id)!
        return { ...strip, compressed: strip.keys.length > COMPRESS_THRESHOLD }
    })
    if (active && !byId.has(active.id)) {
        strips.unshift({ projectId: active.id, projectName: active.name, keys: [], compressed: false })
    }
    return strips
}

/**
 * The termId to jump to when cycling agent sessions (Ctrl+Tab). Cycles across
 * all sessions in order; wraps; returns the first when `current` is unknown and
 * null when there are fewer than two sessions.
 */
export function nextSession(
    sessions: AnySession[],
    currentTermId: string | null,
    dir: 1 | -1
): string | null {
    if (sessions.length < 2) return null
    const idx = sessions.findIndex((s) => s.termId === currentTermId)
    if (idx < 0) return sessions[0].termId
    return sessions[(idx + dir + sessions.length) % sessions.length].termId
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- deck`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/deck.ts tests/deck.test.ts
git commit -m "feat(deck): pure grouping + session-cycle helpers"
```

---

### Task 2: AgentKey component

One agent session rendered as a deck key. Preserves every Sidebar `claude-session` behavior: click = jump, double-click = rename, drop target for drag-to-agent, attention flag, state dot.

**Files:**
- Create: `src/renderer/src/components/AgentKey.tsx`

**Interfaces:**
- Consumes: `AnySession` (store), `jumpToTerm`, `renameSession`, `dragPayload`, `setDragPayload` (store), `window.api.pty.input`.
- Produces: `function AgentKey(props: { session: AnySession; active: boolean; compressed: boolean }): JSX.Element`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/AgentKey.tsx`:

```tsx
import { useState } from "react"
import { useStore } from "../store"
import type { AnySession } from "../store"

export function AgentKey({
    session,
    active,
    compressed
}: {
    session: AnySession
    active: boolean
    compressed: boolean
}): JSX.Element {
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const renameSession = useStore((s) => s.renameSession)
    const dragPayload = useStore((s) => s.dragPayload)
    const setDragPayload = useStore((s) => s.setDragPayload)
    const [renaming, setRenaming] = useState(false)
    const [text, setText] = useState("")
    const [over, setOver] = useState(false)

    const commit = (): void => {
        renameSession(session.termId, text)
        setRenaming(false)
    }

    return (
        <div
            className={
                "deck-key" +
                (active ? " active" : "") +
                (compressed ? " compressed" : "") +
                (dragPayload ? " drop-active" : "") +
                (over ? " drag-over" : "")
            }
            onClick={() => jumpToTerm(session.termId)}
            data-tip={
                dragPayload
                    ? "Drop to insert into this session"
                    : `${session.sessionName} · ${session.projectName} - ${session.status}`
            }
            data-tip-pos="top"
            onDragOver={(e) => {
                if (dragPayload) {
                    e.preventDefault()
                    setOver(true)
                }
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
                if (!dragPayload) return
                e.preventDefault()
                window.api.pty.input(session.termId, dragPayload)
                jumpToTerm(session.termId)
                setDragPayload(null)
                setOver(false)
            }}
        >
            <span className={"tab-dot claude status-" + session.status} />
            {!compressed &&
                (renaming ? (
                    <input
                        className="session-rename"
                        autoFocus
                        value={text}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setText(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commit()
                            else if (e.key === "Escape") setRenaming(false)
                        }}
                    />
                ) : (
                    <span
                        className="deck-key-name"
                        onDoubleClick={(e) => {
                            e.stopPropagation()
                            setText(session.sessionName)
                            setRenaming(true)
                        }}
                        data-tip="Double-click to rename this session"
                    >
                        {session.sessionName}
                    </span>
                ))}
            <span className="agent-badge sm">{session.badge}</span>
            {session.status === "attention" && <span className="claude-attn">!</span>}
        </div>
    )
}
```

- [ ] **Step 2: Typecheck via build**

Run: `npx electron-vite build`
Expected: build succeeds (no TS errors). AgentKey is not mounted yet, so no visual change.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/AgentKey.tsx
git commit -m "feat(deck): AgentKey — one agent session as a deck key"
```

---

### Task 3: ProjectStrip component

A project label (click = switch, right-click = the full project context menu identical to today's Sidebar) plus its agent keys and a start-session button.

**Files:**
- Create: `src/renderer/src/components/ProjectStrip.tsx`

**Interfaces:**
- Consumes: `DeckStrip` (deck.ts), `AgentKey` (Task 2), store actions (`setActiveProject`, `newTabIn`, `setEnvEditorProject`, `setCommandsEditorProject`, `setProjectGroup`, `saveWorkspacePreset`, `openWorkspacePreset`, `deleteWorkspacePreset`, `removeProject`, `activeId`, `activePaneByProject`, `view`, `projects`), `useSettings` (`agents`, `workspacePresets`), `contextMenu`, `confirm`.
- Produces: `function ProjectStrip(props: { strip: DeckStrip }): JSX.Element`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/ProjectStrip.tsx`:

```tsx
import { useStore } from "../store"
import { useSettings } from "../settings"
import { AgentKey } from "./AgentKey"
import { Icon } from "./Icon"
import { contextMenu } from "../contextmenu"
import { confirm } from "../confirm"
import type { DeckStrip } from "../deck"

export function ProjectStrip({ strip }: { strip: DeckStrip }): JSX.Element {
    const activeId = useStore((s) => s.activeId)
    const view = useStore((s) => s.view)
    const activePane = useStore((s) => (s.activeId ? s.activePaneByProject[s.activeId] : undefined))
    const setActiveProject = useStore((s) => s.setActiveProject)
    const newTabIn = useStore((s) => s.newTabIn)
    const projects = useStore((s) => s.projects)
    const presets = useSettings((s) => s.workspacePresets)
    const agents = useSettings((s) => s.agents)
    const defaultAgent = agents[0]?.id ?? "claude"

    const project = projects.find((p) => p.id === strip.projectId)
    const isActive = strip.projectId === activeId

    const menu = (): { label?: string; onClick?: () => void; danger?: boolean; separator?: boolean }[] => {
        if (!project) return []
        const s = useStore.getState()
        const groups = [...new Set(projects.map((p) => p.group).filter(Boolean))] as string[]
        const projPresets = presets.filter((pr) => pr.projectId === project.id)
        const hasTabs = (s.tabsByProject[project.id] ?? []).length > 0
        return [
            { label: "Open", onClick: () => setActiveProject(project.id) },
            { label: "Environment variables…", onClick: () => s.setEnvEditorProject(project.id) },
            { label: "Saved commands…", onClick: () => s.setCommandsEditorProject(project.id) },
            { separator: true },
            ...groups
                .filter((g) => g !== project.group)
                .map((g) => ({ label: "Move to " + g, onClick: () => s.setProjectGroup(project.id, g) })),
            ...(project.group ? [{ label: "Ungroup", onClick: () => s.setProjectGroup(project.id, "") }] : []),
            { separator: true },
            ...(hasTabs ? [{ label: "Save layout as preset", onClick: () => s.saveWorkspacePreset(project.id) }] : []),
            ...projPresets.map((pr) => ({ label: `Open ${pr.name}`, onClick: () => s.openWorkspacePreset(pr.id) })),
            ...projPresets.map((pr) => ({
                label: `Delete ${pr.name}`,
                danger: true,
                onClick: () => s.deleteWorkspacePreset(pr.id)
            })),
            { separator: true },
            {
                label: "Remove project",
                danger: true,
                onClick: async () => {
                    const ok = await confirm({
                        title: "Remove project",
                        message: `Remove "${project.name}" from DevDeck? The folder won't be deleted, but its tabs/sessions here will close.`,
                        confirmLabel: "Remove",
                        danger: true
                    })
                    if (ok) s.removeProject(project.id)
                }
            }
        ]
    }

    return (
        <div className={"deck-strip" + (isActive ? " active" : "")}>
            <button
                className="deck-strip-label"
                onClick={() => setActiveProject(strip.projectId)}
                onContextMenu={(e) => contextMenu(e, menu())}
                data-tip={project?.path}
                data-tip-pos="top"
            >
                {strip.projectName}
            </button>
            <div className="deck-strip-keys">
                {strip.keys.map((k) => (
                    <AgentKey
                        key={k.termId}
                        session={k}
                        active={view === "terminal" && k.termId === activePane}
                        compressed={strip.compressed}
                    />
                ))}
                <button
                    className="deck-add"
                    data-tip={`Start a ${agents[0]?.name ?? "agent"} session`}
                    data-tip-pos="top"
                    onClick={() => newTabIn(strip.projectId, defaultAgent)}
                >
                    <Icon name="more" size={14} />
                </button>
            </div>
        </div>
    )
}
```

> Note: `deck-add` uses the `more` icon as a "＋"; if `Icon.tsx` exposes a `plus`/`add` name, prefer that. Verify against `components/Icon.tsx` before finalizing and swap the name if a plus glyph exists.

- [ ] **Step 2: Typecheck via build**

Run: `npx electron-vite build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ProjectStrip.tsx
git commit -m "feat(deck): ProjectStrip — project label + agent keys + start button"
```

---

### Task 4: ViewKeys component

Segmented main-view switch (the 6 views), active key carries the accent stripe.

**Files:**
- Create: `src/renderer/src/components/ViewKeys.tsx`

**Interfaces:**
- Consumes: `view`, `setView` (store), `MainView` type, `Icon`.
- Produces: `function ViewKeys(): JSX.Element`; exported `const DECK_VIEWS: { view: MainView; icon: IconName; name: string }[]` (reused by the keyboard handler in Task 11).

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/ViewKeys.tsx`:

```tsx
import { useStore, type MainView } from "../store"
import { Icon, type IconName } from "./Icon"

export const DECK_VIEWS: { view: MainView; icon: IconName; name: string }[] = [
    { view: "terminal", icon: "terminal", name: "Terminal" },
    { view: "editor", icon: "code", name: "Editor" },
    { view: "api", icon: "send", name: "API" },
    { view: "database", icon: "database", name: "Database" },
    { view: "browser", icon: "appWindow", name: "Browser" },
    { view: "network", icon: "globe", name: "Network" }
]

export function ViewKeys(): JSX.Element {
    const view = useStore((s) => s.view)
    const setView = useStore((s) => s.setView)
    return (
        <div className="deck-views" role="tablist" aria-label="Main view">
            {DECK_VIEWS.map((v, i) => (
                <button
                    key={v.view}
                    className={"deck-view" + (view === v.view ? " on" : "")}
                    role="tab"
                    aria-selected={view === v.view}
                    data-tip={`${v.name} (Ctrl+${i + 1})`}
                    data-tip-pos="top"
                    onClick={() => setView(v.view)}
                >
                    <Icon name={v.icon} size={16} />
                    <span className="deck-view-name">{v.name}</span>
                </button>
            ))}
        </div>
    )
}
```

- [ ] **Step 2: Typecheck via build**

Run: `npx electron-vite build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ViewKeys.tsx
git commit -m "feat(deck): ViewKeys — segmented main-view switch"
```

---

### Task 5: ToolCluster component

High-frequency tools as keys (Tasks/Commands popover, Inbox with attention badge, AI usage, Settings) plus an overflow `⋯` menu for the long tail (Work, Activity, Standup, Release, Shortcuts).

**Files:**
- Create: `src/renderer/src/components/ToolCluster.tsx`

**Interfaces:**
- Consumes: store setters (`setInboxOpen`, `setUsageOpen`, `setWorkOpen`, `setActivityOpen`, `setStandupOpen`, `setReleaseOpen`, `setShortcutsOpen`), `useSettings.openSettings`, `agentStatus` (attention count), `contextMenu`, `Icon`, `TaskRunner`.
- Produces: `function ToolCluster(): JSX.Element`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/ToolCluster.tsx`:

```tsx
import { useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { Icon } from "./Icon"
import { contextMenu } from "../contextmenu"
import { TaskRunner } from "./TaskRunner"

export function ToolCluster(): JSX.Element {
    const setInboxOpen = useStore((s) => s.setInboxOpen)
    const setUsageOpen = useStore((s) => s.setUsageOpen)
    const openSettings = useSettings((s) => s.openSettings)
    const attention = useStore(
        (s) => Object.values(s.agentStatus).filter((x) => x === "attention").length
    )
    const [tasksOpen, setTasksOpen] = useState(false)

    const overflow = (e: React.MouseEvent): void => {
        const s = useStore.getState()
        contextMenu(e, [
            { label: "Work", onClick: () => s.setWorkOpen(true) },
            { label: "Activity", onClick: () => s.setActivityOpen(true) },
            { label: "Standup", onClick: () => s.setStandupOpen(true) },
            { label: "Release", onClick: () => s.setReleaseOpen(true) },
            { separator: true },
            { label: "Keyboard shortcuts (F1)", onClick: () => s.setShortcutsOpen(true) }
        ])
    }

    return (
        <div className="deck-tools">
            <div className="deck-tasks-wrap">
                <button
                    className="deck-tool"
                    data-tip="Tasks & saved commands"
                    data-tip-pos="top"
                    onClick={() => setTasksOpen((v) => !v)}
                >
                    <Icon name="list" size={16} />
                </button>
                {tasksOpen && (
                    <>
                        <div className="menu-backdrop" onClick={() => setTasksOpen(false)} />
                        <div className="deck-popover" onClick={(e) => e.stopPropagation()}>
                            <TaskRunner />
                        </div>
                    </>
                )}
            </div>
            <button
                className="deck-tool rail-inbox"
                data-tip="Agents inbox"
                data-tip-pos="top"
                onClick={() => setInboxOpen(true)}
            >
                <Icon name="inbox" size={16} />
                {attention ? <span className="rail-badge">{attention}</span> : null}
            </button>
            <button
                className="deck-tool"
                data-tip="AI usage"
                data-tip-pos="top"
                onClick={() => setUsageOpen(true)}
            >
                <Icon name="chart" size={16} />
            </button>
            <button
                className="deck-tool"
                data-tip="Settings"
                data-tip-pos="top"
                onClick={() => openSettings()}
            >
                <Icon name="settings" size={16} />
            </button>
            <button className="deck-tool" data-tip="More" data-tip-pos="top" onClick={overflow}>
                <Icon name="more" size={16} />
            </button>
        </div>
    )
}
```

- [ ] **Step 2: Typecheck via build**

Run: `npx electron-vite build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ToolCluster.tsx
git commit -m "feat(deck): ToolCluster — tools, tasks popover, overflow menu"
```

---

### Task 6: DeckStatus component (dissolve StatusBar)

Move the StatusBar's full content — git branch/changes, git-identity account picker, attention/remote/release indicators, version — into a deck status region. Logic (the 12s git poll with focus/visibility refresh) is preserved verbatim.

**Files:**
- Create: `src/renderer/src/components/DeckStatus.tsx`

**Interfaces:**
- Consumes: same store/settings/`window.api.git` as `StatusBar.tsx`.
- Produces: `function DeckStatus(): JSX.Element`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/DeckStatus.tsx` — port `StatusBar.tsx` verbatim, renaming the root class from `statusbar` to `deck-status` and keeping all `sb-*` inner classes (they are restyled in Task 10):

```tsx
import { useEffect, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import type { GitStatus, GitIdentity } from "../../../preload/index"
import { Icon } from "./Icon"

export function DeckStatus(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    const sessions = useStore((s) => s.sessions)
    const remoteEnabled = useSettings((s) => s.remote.enabled)
    const setReleaseOpen = useStore((s) => s.setReleaseOpen)
    const gitAccounts = useSettings((s) => s.gitAccounts)
    const [git, setGit] = useState<GitStatus | null>(null)
    const [identity, setIdentity] = useState<GitIdentity | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    const path = project?.path

    useEffect(() => {
        if (!path) {
            setGit(null)
            setIdentity(null)
            return
        }
        let on = true
        const tick = (): void => {
            if (document.hidden) return
            window.api.git.status(path).then((g) => on && setGit(g)).catch(() => undefined)
            window.api.git.getIdentity(path).then((i) => on && setIdentity(i)).catch(() => undefined)
        }
        tick()
        const iv = setInterval(tick, 12000)
        const onFocus = (): void => tick()
        window.addEventListener("focus", onFocus)
        document.addEventListener("visibilitychange", onFocus)
        return () => {
            on = false
            clearInterval(iv)
            window.removeEventListener("focus", onFocus)
            document.removeEventListener("visibilitychange", onFocus)
        }
    }, [path])

    const applyAccount = async (acc: (typeof gitAccounts)[number]): Promise<void> => {
        if (!path) return
        const next = await window.api.git.setIdentity(path, {
            name: acc.name,
            email: acc.email,
            sshCommand: acc.sshCommand
        })
        setIdentity(next)
        setPickerOpen(false)
    }

    const attention = sessions().filter((s) => s.status === "attention").length

    return (
        <div className="deck-status">
            {project ? (
                <span className="sb-item sb-project">{project.name}</span>
            ) : (
                <span className="sb-item muted">No project</span>
            )}
            {git?.isRepo && (
                <>
                    <span className="sb-item" data-tip="Current branch" data-tip-pos="top">
                        <Icon name="gitBranch" size={12} /> {git.branch}
                    </span>
                    {git.changes > 0 && (
                        <span className="sb-item sb-changes" data-tip="Uncommitted changes" data-tip-pos="top">
                            ● {git.changes} change{git.changes === 1 ? "" : "s"}
                        </span>
                    )}
                    <span className="sb-git-id">
                        <span
                            className="sb-item sb-identity"
                            data-tip="Git identity for this repo - click to switch account"
                            data-tip-pos="top"
                            onClick={() => setPickerOpen((v) => !v)}
                        >
                            <Icon name="user" size={12} /> {identity?.name || "set identity"}
                        </span>
                        {pickerOpen && (
                            <>
                                <div className="menu-backdrop" onClick={() => setPickerOpen(false)} />
                                <div className="sb-id-menu">
                                    <div className="group-menu-title">Apply git account</div>
                                    {gitAccounts.length === 0 && (
                                        <div className="muted small" style={{ padding: "4px 8px" }}>
                                            Add accounts in Settings → Git
                                        </div>
                                    )}
                                    {gitAccounts.map((a) => (
                                        <div key={a.id} className="group-menu-item" onClick={() => applyAccount(a)}>
                                            {a.label}
                                            <span className="muted small"> · {a.email}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </span>
                </>
            )}
            <span className="deck-status-spacer" />
            {attention > 0 && (
                <span className="sb-item sb-attn" data-tip="Agent sessions needing attention" data-tip-pos="top">
                    <Icon name="flag" size={12} /> {attention}
                </span>
            )}
            {remoteEnabled && (
                <span className="sb-item sb-remote" data-tip="Remote access enabled" data-tip-pos="top">
                    <Icon name="broadcast" size={12} /> remote
                </span>
            )}
            {project && (
                <span
                    className="sb-item sb-identity"
                    data-tip="Release board - promote Dev → UAT → PROD"
                    data-tip-pos="top"
                    onClick={() => setReleaseOpen(true)}
                >
                    <Icon name="release" size={12} /> release
                </span>
            )}
            <span className="sb-item muted">v{__APP_VERSION__ ?? ""}</span>
        </div>
    )
}
```

> Note: the old StatusBar showed the literal text `DevDeck` at the end. If a version constant like `__APP_VERSION__` is not already defined in the renderer, replace that final span with `<span className="sb-item muted">DevDeck</span>` to match today's behavior exactly. Do not invent a version source.

- [ ] **Step 2: Typecheck via build**

Run: `npx electron-vite build`
Expected: build succeeds. (Falls back to the `DevDeck` span if no version constant exists.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/DeckStatus.tsx
git commit -m "feat(deck): DeckStatus — relocated git/status region"
```

---

### Task 7: Deck container

Compose strips (row 1, horizontally scrollable) + ViewKeys/ToolCluster/DeckStatus (row 2). Derives strips from `agentSessions()` + active project.

**Files:**
- Create: `src/renderer/src/components/Deck.tsx`

**Interfaces:**
- Consumes: `agentSessions` (store), `activeProject` (store), `deriveDeckStrips` (Task 1), `ProjectStrip` (Task 3), `ViewKeys` (Task 4), `ToolCluster` (Task 5), `DeckStatus` (Task 6).
- Produces: `function Deck(): JSX.Element`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/Deck.tsx`:

```tsx
import { useStore } from "../store"
import { deriveDeckStrips } from "../deck"
import { ProjectStrip } from "./ProjectStrip"
import { ViewKeys } from "./ViewKeys"
import { ToolCluster } from "./ToolCluster"
import { DeckStatus } from "./DeckStatus"

export function Deck(): JSX.Element {
    // Subscribe to the raw state the derivation reads so the deck re-renders on
    // session/status/project changes (agentSessions() is a getter, not reactive).
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const termAgents = useStore((s) => s.termAgents)
    const termNames = useStore((s) => s.termNames)
    const projects = useStore((s) => s.projects)
    const activeId = useStore((s) => s.activeId)
    const agentSessions = useStore((s) => s.agentSessions)
    void tabsByProject
    void agentStatus
    void termAgents
    void termNames
    void projects

    const active = projects.find((p) => p.id === activeId)
    const strips = deriveDeckStrips(
        agentSessions(),
        active ? { id: active.id, name: active.name } : undefined
    )

    return (
        <div className="deck">
            <div className="deck-strips">
                {strips.length === 0 ? (
                    <button
                        className="deck-empty"
                        onClick={() => useStore.getState().openSwitcher()}
                    >
                        Add or open a project
                    </button>
                ) : (
                    strips.map((s) => <ProjectStrip key={s.projectId} strip={s} />)
                )}
            </div>
            <div className="deck-bar">
                <ViewKeys />
                <ToolCluster />
                <DeckStatus />
            </div>
        </div>
    )
}
```

> Rationale for the `void` subscriptions: `agentSessions()` reads state imperatively; subscribing to the underlying slices (the same pattern `StatusBar`/`Sidebar` use) forces the recompute. Do not select `agentSessions()` output directly — returning a fresh array from a selector trips zustand's getSnapshot loop (see the project's `zustand-getsnapshot-trap` note).

- [ ] **Step 2: Typecheck via build**

Run: `npx electron-vite build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Deck.tsx
git commit -m "feat(deck): Deck container composing strips + bar"
```

---

### Task 8: Topbar component

Extract the topbar into its own component: ensō mark, active project `▾` (opens switcher — the cold-start path), view breadcrumb, and the command pill.

**Files:**
- Create: `src/renderer/src/components/Topbar.tsx`

**Interfaces:**
- Consumes: `view`, `activeProject`, `openSwitcher`, `setPaletteOpen` (store), `DECK_VIEWS` (Task 4) for the view label, `Enso`, `Icon`.
- Produces: `function Topbar(): JSX.Element`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/Topbar.tsx`:

```tsx
import { useStore } from "../store"
import { Enso } from "./Enso"
import { Icon } from "./Icon"
import { DECK_VIEWS } from "./ViewKeys"

export function Topbar(): JSX.Element {
    const view = useStore((s) => s.view)
    const project = useStore((s) => s.activeProject())
    const openSwitcher = useStore((s) => s.openSwitcher)
    const setPaletteOpen = useStore((s) => s.setPaletteOpen)
    const viewLabel = DECK_VIEWS.find((v) => v.view === view)?.name

    return (
        <div className="topbar">
            <div className="topbar-crumb">
                <span className="topbar-brand">
                    <Enso size={18} strokeWidth={2.25} />
                </span>
                <button
                    className="topbar-proj-btn"
                    onClick={openSwitcher}
                    data-tip={project ? project.path : "Open a project (Ctrl+K)"}
                    data-tip-pos="bottom"
                >
                    {project ? project.name : "No project"}
                    <Icon name="chevronRight" size={14} className="topbar-proj-caret" />
                </button>
                <span className="crumb-sep">/</span>
                <span className="crumb-view">{viewLabel}</span>
            </div>
            <button
                className="cmd-pill"
                onClick={() => setPaletteOpen(true)}
                data-tip="Command palette (Ctrl+Shift+P)"
            >
                <Icon name="search" size={14} />
                <span>Search or run…</span>
                <span className="cmd-kbd">Ctrl+Shift+P</span>
            </button>
        </div>
    )
}
```

> Note: reuses the existing `chevronRight` icon rotated via CSS (Task 10) as the `▾` caret; if `Icon.tsx` has a `chevronDown`, use that instead and drop the rotation.

- [ ] **Step 2: Typecheck via build**

Run: `npx electron-vite build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Topbar.tsx
git commit -m "feat(deck): Topbar — brand, project switcher, breadcrumb, command pill"
```

---

### Task 9: Rewire App.tsx to the new shell

Mount `Topbar` above the (now full-width) main panel and `Deck` below it; stop rendering `Rail`, `Sidebar`, and `StatusBar`; drop the Allotment sidebar split.

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `Topbar` (Task 8), `Deck` (Task 7).
- Produces: no new exports.

- [ ] **Step 1: Swap imports**

In `src/renderer/src/App.tsx`, remove these imports:

```tsx
import { Allotment } from "allotment"
import { Sidebar } from "./components/Sidebar"
import { Rail } from "./components/Rail"
import { StatusBar } from "./components/StatusBar"
```

Add:

```tsx
import { Topbar } from "./components/Topbar"
import { Deck } from "./components/Deck"
```

Delete the now-unused `VIEWS` constant (lines ~39–46) — view labels come from `DECK_VIEWS`. Leave `Icon` imported only if still referenced elsewhere in the file; if not, remove it.

- [ ] **Step 2: Replace the shell markup**

Replace the entire `return (...)` shell — from `<div className="app">` down to the matching close of `</div>` that wraps `<StatusBar />` — so the body becomes Topbar → panels → Deck. Replace the `app-body`/`Rail`/`app-split`/`Allotment` block and the `topbar`/`panels` markup with:

```tsx
    return (
        <div className="app">
            <div className="app-body">
                <div className="main">
                    <Topbar />
                    <div className="panels">
                        {/* All panels stay mounted; visibility toggled so terminals keep running. */}
                        <div className="panel" style={{ display: view === "terminal" ? "flex" : "none" }}>
                            <TerminalView />
                        </div>
                        <div className="panel" style={{ display: view === "editor" ? "flex" : "none" }}>
                            <EditorPanel />
                        </div>
                        <div className="panel" style={{ display: view === "api" ? "flex" : "none" }}>
                            <ApiPanel />
                        </div>
                        <div className="panel" style={{ display: view === "database" ? "flex" : "none" }}>
                            <DbPanel />
                        </div>
                        <div className="panel" style={{ display: view === "browser" ? "flex" : "none" }}>
                            <BrowserPanel />
                        </div>
                        <div className="panel" style={{ display: view === "network" ? "flex" : "none" }}>
                            <NetworkPanel />
                        </div>
                    </div>
                </div>
            </div>
            <Deck />
            {settingsOpen && <SettingsModal />}
            {switcherOpen && <ProjectSwitcher />}
            {paletteOpen && <CommandPalette />}
            {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
            {activityOpen && <ActivityPanel />}
            {inboxOpen && <InboxPanel />}
            {usageOpen && <UsagePanel />}
            {envEditorProject && <ProjectEnvModal />}
            {commandsEditorProject && <CommandsModal />}
            {recordingsOpen && <RecordingsModal />}
            {worktreesOpen && <WorktreesModal />}
            {changesTarget && <ChangesModal />}
            {prTarget && <PrModal />}
            {workOpen && <WorkPanel />}
            {releaseOpen && <ReleaseBoard />}
            {standupOpen && <StandupModal />}
            <PipelineBar />
            <Toasts />
            <IntroTip />
            <ConfirmDialog />
            <TooltipLayer />
            <ContextMenuLayer />
        </div>
    )
```

Keep the `project` variable if still referenced; if the breadcrumb was its only use, remove the now-unused `const project = activeProject()` line to avoid an unused-var error.

- [ ] **Step 3: Build and verify in the real app**

Run: `npx electron-vite build`
Expected: build succeeds with no unused-import/var errors.

Then verify with the **run-app skill**: launch the built app and confirm — no left rail/sidebar; a bottom deck with the active project's strip; clicking a view key changes the main panel; the main panel spans full width. (Deck is unstyled until Task 10 — check structure/behavior, not looks.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "refactor(shell): mount Topbar + Deck, drop Rail/Sidebar/StatusBar"
```

---

### Task 10: Deck & topbar styling; remove old shell CSS

Style the deck/topbar from existing theme tokens (so all 7 themes × 12 styles reskin with no component change), add per-`[data-style]` treatments and the reduced-motion guard, and delete the rail/sidebar/statusbar rules.

**Files:**
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Remove obsolete shell CSS**

Delete these rule blocks (identified by the selectors at these locations; remove each rule and its body):
- The **rail** block: `.rail` through the rail `@media (prefers-reduced-motion)` guard (currently lines ~171–315).
- The **sidebar** blocks: `.sidebar`, `.sidebar-header`, `.sidebar-section-title` and descendants, `.project-*`, `.claude-*` session rows, `.task-*` **only if unused elsewhere** — `TaskRunner` still emits `.sidebar-section-title` and `.task-*`, so **keep `.sidebar-section-title`, `.section-add`, `.task-list`, `.task-chip`** (they now render inside the deck popover). Remove `.project-list`, `.project-item`, `.project-group*`, `.claude-list`, `.claude-session*`, `.sidebar-empty`, `.brand` (sidebar header) and the `.rail.expanded + .app-split .sidebar-header .brand` rule.
- The **statusbar** layout block `.statusbar { ... }` (lines ~327–338). **Keep** the `.sb-item`, `.sb-left`, `.sb-right`, `.sb-changes`, `.sb-attn`, `.sb-remote`, `.sb-identity`, `.sb-git-id`, `.sb-id-menu`, `.group-menu-*` rules — DeckStatus reuses them.
- The `.rail-inbox`, `.rail-badge`, `.rail-btn:active` rules (lines ~5553–5772) — but re-add `.rail-badge` styling under the deck (see Step 2, `.deck-tool .rail-badge`), since ToolCluster reuses that class name for the inbox badge. Simplest: **keep `.rail-badge` and `.rail-inbox`** and drop only `.rail-btn:active`.

Leave `.app`, `.app-body`, `.main`, `.panels`, `.panel`, `.topbar-crumb`, `.crumb-*`, `.cmd-pill`, `.cmd-kbd` — they are reused. Remove `.app-split`, `.topbar-project`, `.view-tabs`, `.view-tab*` (old rail-era topbar bits) if unreferenced after this change.

- [ ] **Step 2: Add deck + topbar CSS**

Append to `src/renderer/src/styles.css`:

```css
/* ---------- Console Deck (bottom control surface) ---------- */
.deck {
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-top: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
}
.deck-strips {
    display: flex;
    align-items: stretch;
    gap: 8px;
    min-height: 38px;
    padding: 4px 10px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
}
.deck-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 8px;
    border-right: 1px solid var(--border-soft);
    flex: none;
}
.deck-strip.active .deck-strip-label {
    color: var(--text);
}
.deck-strip-label {
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    white-space: nowrap;
    padding: 0 2px;
}
.deck-strip-label:hover {
    color: var(--text);
}
.deck-strip-keys {
    display: flex;
    align-items: center;
    gap: 4px;
}
.deck-key {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 8px;
    border-radius: var(--radius, 7px);
    background: var(--bg-2);
    color: var(--muted);
    cursor: pointer;
    max-width: 180px;
    transition: background var(--dur-fast, 120ms) var(--ease, ease), color var(--dur-fast, 120ms) var(--ease, ease);
}
.deck-key:hover {
    background: var(--panel);
    color: var(--text);
}
.deck-key.active {
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.deck-key.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: var(--accent);
}
.deck-key.compressed {
    padding: 0 6px;
}
.deck-key.drop-active {
    outline: 1px dashed var(--accent);
}
.deck-key.drag-over {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
}
.deck-key-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
}
.deck-add {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px dashed var(--border);
    background: transparent;
    color: var(--faint);
    border-radius: var(--radius, 7px);
    cursor: pointer;
}
.deck-add:hover {
    color: var(--accent);
    border-color: var(--accent);
}
.deck-empty {
    background: transparent;
    border: none;
    color: var(--faint);
    cursor: pointer;
    font-size: 12px;
    padding: 0 6px;
}
.deck-empty:hover {
    color: var(--text);
}

.deck-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 30px;
    padding: 0 10px;
    border-top: 1px solid var(--border-soft);
    font-size: 11px;
    color: var(--muted);
}
.deck-views {
    display: flex;
    gap: 2px;
    flex: none;
}
.deck-view {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--muted);
    padding: 3px 10px;
    border-radius: var(--radius, 7px);
    cursor: pointer;
}
.deck-view:hover {
    color: var(--text);
}
.deck-view.on {
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--accent);
    border-radius: 0;
}
.deck-view-name {
    font-size: 12px;
}
.deck-tools {
    display: flex;
    gap: 2px;
    flex: none;
}
.deck-tool {
    position: relative;
    display: grid;
    place-items: center;
    width: 28px;
    height: 24px;
    background: transparent;
    border: none;
    color: var(--muted);
    border-radius: var(--radius, 7px);
    cursor: pointer;
}
.deck-tool:hover {
    color: var(--text);
    background: var(--bg-2);
}
.deck-tasks-wrap {
    position: relative;
}
.deck-popover {
    position: absolute;
    bottom: 34px;
    left: 0;
    min-width: 220px;
    max-height: 50vh;
    overflow-y: auto;
    padding: 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius, 8px);
    box-shadow: var(--elev-2);
    z-index: 40;
}
.deck-status {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    justify-content: flex-end;
}
.deck-status-spacer {
    flex: 1;
}

/* ---------- Topbar brand + project button ---------- */
.topbar-brand {
    display: grid;
    place-items: center;
    color: var(--accent);
}
.topbar-proj-btn {
    display: flex;
    align-items: center;
    gap: 2px;
    background: transparent;
    border: none;
    color: var(--text);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    max-width: 40vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.topbar-proj-btn:hover {
    color: var(--accent);
}
.topbar-proj-caret {
    transform: rotate(90deg);
    color: var(--faint);
}

@media (prefers-reduced-motion: reduce) {
    .deck-key {
        transition: none;
    }
}
```

- [ ] **Step 3: Add per-style deck treatments**

Find the existing `[data-style="bauhaus"]`, `[data-style="neo"]`, and `[data-style="crt"]` sections in `styles.css` and add matching deck rules so the deck honors each style's shape/depth language, e.g.:

```css
[data-style="bauhaus"] .deck-key,
[data-style="bauhaus"] .deck-add { border-radius: 0; }
[data-style="bauhaus"] .deck { border-top-width: 2px; }
[data-style="neo"] .deck-key.active { box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 40%, transparent); }
[data-style="crt"] .deck-key-name,
[data-style="crt"] .deck-view-name { font-family: var(--mono, monospace); }
```

Add treatments only for styles where the default deck rules visibly clash with that style's existing panel/button treatment; match the neighboring `[data-style]` rules already in the file.

- [ ] **Step 4: Build and verify in the real app**

Run: `npx electron-vite build`
Then run-app: confirm the deck is legible; switch **theme** and **style** in Settings → Appearance and confirm the deck reskins (colors/shape follow) with no layout break. Confirm the active view key shows the accent underline and the active agent key shows the accent left-stripe.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/styles.css
git commit -m "feat(deck): deck + topbar styling; remove rail/sidebar/statusbar CSS"
```

---

### Task 11: Keyboard shortcuts (Ctrl+1…6, Ctrl+Tab session cycle)

Add view-by-number and agent-session cycling to the global handler, reusing the pure `nextSession` helper.

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/ShortcutsModal.tsx`

**Interfaces:**
- Consumes: `nextSession` (Task 1), `DECK_VIEWS` (Task 4), store `jumpToTerm`, `agentSessions`, `lastAgentTermId`, `setView`.

- [ ] **Step 1: Reconcile existing bindings**

Read the global `keydown` handler in `App.tsx` (currently handles `F1`, `Ctrl+Shift+P`, `Ctrl+K`) and confirm no existing `Ctrl+1…6` or `Ctrl+Tab` handler elsewhere (grep the renderer for `key === "Tab"`, `code === "Digit`, `ctrlKey`). If a terminal component consumes `Ctrl+Tab`, keep the App handler on `window` capture so it wins for shell-level navigation. Record findings in the commit body.

- [ ] **Step 2: Extend the handler**

Add these imports to `App.tsx`:

```tsx
import { nextSession } from "./deck"
import { DECK_VIEWS } from "./components/ViewKeys"
```

Inside the existing `keydown` handler (the `handler` function), before the closing brace, add:

```tsx
            // Ctrl+1..6 — switch main view.
            if (mod && !e.shiftKey && /^Digit[1-6]$/.test(e.code)) {
                e.preventDefault()
                const idx = Number(e.code.slice(5)) - 1
                const v = DECK_VIEWS[idx]?.view
                if (v) useStore.getState().setView(v)
                return
            }
            // Ctrl+Tab / Ctrl+Shift+Tab — cycle agent sessions (deck alt-tab).
            if (mod && e.code === "Tab") {
                const s = useStore.getState()
                const target = nextSession(s.agentSessions(), s.lastAgentTermId, e.shiftKey ? -1 : 1)
                if (target) {
                    e.preventDefault()
                    s.jumpToTerm(target)
                }
                return
            }
```

Place these checks after the existing `Ctrl+K` branch. Ensure the outer `if/else if` chain still resolves (convert to independent `if ... return` guards if needed to avoid an `else if` mismatch).

- [ ] **Step 3: Document the shortcuts**

In `src/renderer/src/components/ShortcutsModal.tsx`, add rows for the new bindings in the existing format used by that file (match the surrounding entries):
- `Ctrl+1 … Ctrl+6` — Switch view (Terminal … Network)
- `Ctrl+Tab` / `Ctrl+Shift+Tab` — Next / previous agent session

- [ ] **Step 4: Build and verify**

Run: `npx electron-vite build`
Then run-app: press `Ctrl+2` (→ Editor), `Ctrl+1` (→ Terminal); with ≥2 agent sessions, press `Ctrl+Tab` and confirm the active pane jumps to the next session. Open the ShortcutsModal (F1) and confirm the new rows appear.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/ShortcutsModal.tsx
git commit -m "feat(deck): Ctrl+1..6 view switch + Ctrl+Tab session cycle"
```

---

### Task 12: Upgrade ProjectSwitcher into a project manager

The switcher (Ctrl+K / topbar ▾) absorbs the Sidebar's low-frequency project management: add a folder, per-card context menu (env vars, saved commands, presets, move-to-group, remove), and whole-window OS folder-drop to add.

**Files:**
- Modify: `src/renderer/src/components/ProjectSwitcher.tsx`

**Interfaces:**
- Consumes: existing switcher plus store `addProject`, `addProjectByPath`, `setEnvEditorProject`, `setCommandsEditorProject`, `setProjectGroup`, `saveWorkspacePreset`, `openWorkspacePreset`, `deleteWorkspacePreset`, `removeProject`; `useSettings.workspacePresets`; `contextMenu`; `confirm`.

- [ ] **Step 1: Add an "Add folder" affordance + folder-drop**

In `ProjectSwitcher.tsx`, add an "Add project folder" button next to the search input and make the backdrop accept OS folder drops:

```tsx
    const addProject = useStore((s) => s.addProject)
    const addProjectByPath = useStore((s) => s.addProjectByPath)
    const [folderOver, setFolderOver] = useState(false)
```

Wrap the outer `switcher-backdrop` with drop handlers:

```tsx
        <div
            className={"switcher-backdrop" + (folderOver ? " folder-drop" : "")}
            onMouseDown={close}
            onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                    e.preventDefault()
                    setFolderOver(true)
                }
            }}
            onDragLeave={() => setFolderOver(false)}
            onDrop={(e) => {
                if (e.dataTransfer.files.length) {
                    e.preventDefault()
                    for (const f of Array.from(e.dataTransfer.files)) {
                        const path = (f as unknown as { path?: string }).path
                        if (path) addProjectByPath(path)
                    }
                }
                setFolderOver(false)
            }}
        >
```

Add an add-folder button in the header row beside `switcher-search`:

```tsx
                    <button className="switcher-add" data-tip="Add a project folder" onClick={addProject}>
                        + Add folder
                    </button>
```

- [ ] **Step 2: Add a per-card context menu**

Add a `cardMenu(project)` builder mirroring the Sidebar's `projectMenu` (from Task 3's ProjectStrip — same items) and wire `onContextMenu` on `switcher-card`:

```tsx
                                onContextMenu={(e) => contextMenu(e, cardMenu(p))}
```

Reuse the exact item list from `ProjectStrip.menu()` (Open, Environment variables…, Saved commands…, Move to group / Ungroup, Save layout as preset, Open/Delete presets, Remove project) so both entry points share identical behavior.

- [ ] **Step 3: Add minimal CSS**

Append to `styles.css`:

```css
.switcher-add {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: var(--radius, 7px);
    padding: 4px 10px;
    margin-left: 8px;
    cursor: pointer;
}
.switcher-add:hover { color: var(--accent); border-color: var(--accent); }
.switcher-backdrop.folder-drop { outline: 2px dashed var(--accent); outline-offset: -8px; }
```

- [ ] **Step 4: Build and verify**

Run: `npx electron-vite build`
Then run-app: open the switcher (Ctrl+K), confirm "Add folder" works, right-click a card shows the full project menu, and a **cold** project (no sessions) can be opened from here. **Manually** verify OS folder-drop onto the switcher adds a project (CDP can't drive file drops).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ProjectSwitcher.tsx src/renderer/src/styles.css
git commit -m "feat(switcher): project manager — add folder, context menu, folder-drop"
```

---

### Task 13: Delete dead components, update DESIGN.md, full verification

**Files:**
- Delete: `src/renderer/src/components/Rail.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/StatusBar.tsx`
- Modify: `DESIGN.md`

- [ ] **Step 1: Delete the superseded components**

```bash
git rm src/renderer/src/components/Rail.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/components/StatusBar.tsx
```

- [ ] **Step 2: Confirm no dangling imports**

Run: `npx electron-vite build`
Expected: build succeeds. If it fails on a missing import, grep for `Rail`, `Sidebar`, `StatusBar` in the renderer and remove the stragglers. (`TaskRunner` must NOT be deleted — it's used by ToolCluster.)

- [ ] **Step 3: Update DESIGN.md Layout section**

Replace the **## Layout** section body (currently "A fixed slim **icon rail** … Panels are resizable splits.") with a description of the new shell:

```markdown
## Layout

A slim **topbar** (ensō · active project ▾ · view breadcrumb · command pill) →
the **main panel** (one view at a time: terminal / editor / API / database /
browser / network, full width) → a bottom **Console Deck**. The deck is the live
control surface: agent sessions appear as **keys** grouped into per-project
strips (state shown as a dot, active key carries the accent stripe), with the
view switch, a tool cluster, and the git/status region on its lower row. Project
management (add, group, reorder, presets) lives in the `Ctrl+K` switcher.

Spacing is a small, consistent scale — **xs 4 · sm 8 · md 12 · lg 16** — applied
through tokens, never ad hoc. Density is compact-but-breathable; the terminal gets
extra line-height so long sessions stay scannable.
```

- [ ] **Step 4: Full verification**

Run: `npm test`
Expected: all suites pass (incl. `deck.test.ts`).

Run: `npx electron-vite build`
Expected: success.

Then run-app end-to-end: project switch (deck label + Ctrl+K), session jump (click a key), rename (double-click a key), start session (deck ＋), tool overflow (⋯), Tasks popover, view switch (keys + Ctrl+1…6), Ctrl+Tab cycle, and a theme+style switch reskinning the deck. **Manually** verify drag-to-agent (drag a file/table onto an agent key sends text to that pty) and OS folder-drop on the switcher — both are outside CDP.

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): describe the Console Deck shell; remove dead components"
```

---

## Self-review

**Spec coverage** — every spec section maps to a task:
- Topbar (brand, project ▾, breadcrumb, command pill) → Task 8, 9.
- Deck / ProjectStrip / AgentKey (dot, badge, rename, drag-to-agent, attention, live tick, compression) → Tasks 2, 3, 7, 10. *Live output tick:* the CSS scaffolding (`status-*` dot + reduced-motion guard) is in place; the pulse is a `status-working` dot animation reusing the existing status-dot styling — if the current `.tab-dot.status-working` has no pulse, add one under Task 10 Step 2 as `@keyframes` gated by `prefers-reduced-motion`.
- ViewKeys / ToolCluster / Tasks popover / overflow → Tasks 4, 5.
- DeckStatus (git branch/changes/identity, attention/remote/release/version) → Task 6.
- Live-only projects + cold-start via topbar/switcher → Task 1 (`deriveDeckStrips` active-project prepend), Task 8, Task 12.
- Project management in Ctrl+K + right-click labels + whole-window folder-drop → Tasks 3, 12.
- Keyboard model + reconcile → Task 11.
- Theming across skins + motion + reduced-motion → Task 10.
- Delete Rail/Sidebar, fold StatusBar, DESIGN.md → Tasks 6, 9, 13.
- Tests (pure helper) + run-app + manual drag → Tasks 1, 13.

**Placeholder scan** — no "TBD/TODO"; the three `> Note:` callouts are explicit *verify-and-choose* instructions (icon names, version constant, chevron), each with a concrete fallback, not deferred work.

**Type consistency** — `DeckStrip`/`deriveDeckStrips`/`nextSession`/`COMPRESS_THRESHOLD` (Task 1) are consumed with matching signatures in Tasks 3, 7, 11; `DECK_VIEWS` (Task 4) consumed in Tasks 8, 11; `AgentKey` props `{ session, active, compressed }` match ProjectStrip's usage; store action names checked against `store.ts` (`agentSessions`, `newTabIn`, `jumpToTerm`, `renameSession`, `setProjectGroup`, `saveWorkspacePreset`, etc.).

**Known risk to watch during execution:** the `else if` chain in App.tsx's keydown handler (Task 11) — verify the new guards don't fall inside an existing `else if` such that they never run.
