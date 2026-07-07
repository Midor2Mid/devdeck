# Fire-to-many-agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the PromptComposer fire one composed prompt at a chosen subset of agent sessions at once, instead of only the single focused agent.

**Architecture:** A new pure helper (`broadcast.ts`) groups agent sessions by project and computes preset selections; a new store action `broadcast(termIds, text)` writes the prompt to each selected session via the existing `window.api.pty.input`; the `PromptComposer` gains a checkbox target selector (grouped by project, with All/Project/Idle/None presets) and multi-sends with a confirm at 3+ targets. Default selection reseeds to the focused agent on each open.

**Tech Stack:** Electron + electron-vite + React 18 + TypeScript, Zustand store (`store.ts`), Vitest (`tests/`), CSS custom properties in `styles.css`.

## Global Constraints

Copied from the spec and project guides — every task implicitly includes these:

- **Indent 4 spaces; double quotes for strings.**
- **Conventional commits** (`feat:`, `fix:`, etc.); commit after each task.
- **Targetable set = agent sessions only** (not plain shells).
- **Default selection on open = only the focused agent (`lastAgentTermId`)**; selection is **not persisted** (reseeds each open).
- **3+ targets requires a `confirm()`**; 1–2 send immediately.
- **Design tokens are the source of truth** — new CSS uses existing tokens (`var(--bg)`, `--bg-2`, `--border`, `--border-soft`, `--accent`, `--muted`, `--radius`); no hard-coded palette values.
- **Tests:** pure logic gets a Vitest unit test; components verified by `npx electron-vite build` (typecheck) + run-app. `npm test` must pass before a task is done.
- **Do NOT edit `src/` while `npm run dev` runs** — build/verify via `npx electron-vite build` + run-app.
- Branch: `fire-to-many-agents` (already created; spec committed there).

## File structure

**Create**
- `src/renderer/src/broadcast.ts` — pure `groupTargets` + `presetSelection` + types.
- `tests/broadcast.test.ts` — unit tests for the above.

**Modify**
- `src/renderer/src/store.ts` — add `broadcast(termIds, text)` action + interface entry (next to `sendToAgent`).
- `src/renderer/src/components/PromptComposer.tsx` — target-selector UI, local selection state, presets, multi-send with 3+ confirm.
- `src/renderer/src/styles.css` — CSS for the selector (append near the existing `.composer*` rules).

**Reuse as-is**
- `window.api.pty.input(termId, text)` (used by `sendToAgent` today).
- `agentSessions()` store getter (returns only `isAgent` sessions, shape `AnySession`).
- `confirm(opts)` from `src/renderer/src/confirm.ts` → `Promise<boolean>`.

---

### Task 1: Broadcast target grouping + preset selection (pure)

Pure, no React/Electron — fully unit-tested (mirrors `tests/deck.test.ts`).

**Files:**
- Create: `src/renderer/src/broadcast.ts`
- Test: `tests/broadcast.test.ts`

**Interfaces:**
- Consumes: `AnySession` from `store.ts` (`{ termId, projectId, projectName, sessionName, agentId, badge, isAgent, status, ... }`).
- Produces:
  - `interface TargetGroup { projectId: string; projectName: string; sessions: AnySession[] }`
  - `type Preset = "all" | "project" | "idle" | "none"`
  - `groupTargets(sessions: AnySession[]): TargetGroup[]`
  - `presetSelection(sessions: AnySession[], preset: Preset, activeProjectId: string | null): Set<string>`

- [ ] **Step 1: Write the failing test**

Create `tests/broadcast.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { groupTargets, presetSelection } from "../src/renderer/src/broadcast"
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

describe("groupTargets", () => {
    it("groups agent sessions by project in first-seen order", () => {
        const groups = groupTargets([
            sess({ termId: "a", projectId: "p1", projectName: "One" }),
            sess({ termId: "b", projectId: "p2", projectName: "Two" }),
            sess({ termId: "c", projectId: "p1", projectName: "One" })
        ])
        expect(groups.map((g) => g.projectId)).toEqual(["p1", "p2"])
        expect(groups[0].sessions.map((s) => s.termId)).toEqual(["a", "c"])
    })

    it("excludes non-agent sessions", () => {
        const groups = groupTargets([
            sess({ termId: "a", projectId: "p1" }),
            sess({ termId: "sh", projectId: "p1", isAgent: false })
        ])
        expect(groups[0].sessions.map((s) => s.termId)).toEqual(["a"])
    })
})

describe("presetSelection", () => {
    const list = [
        sess({ termId: "a", projectId: "p1", status: "idle" }),
        sess({ termId: "b", projectId: "p1", status: "working" }),
        sess({ termId: "c", projectId: "p2", status: "idle" }),
        sess({ termId: "sh", projectId: "p1", isAgent: false, status: "idle" })
    ]
    it("all → every agent session (never shells)", () => {
        expect(presetSelection(list, "all", "p1")).toEqual(new Set(["a", "b", "c"]))
    })
    it("project → agent sessions in the active project", () => {
        expect(presetSelection(list, "project", "p1")).toEqual(new Set(["a", "b"]))
    })
    it("idle → agent sessions with idle status", () => {
        expect(presetSelection(list, "idle", "p1")).toEqual(new Set(["a", "c"]))
    })
    it("none → empty", () => {
        expect(presetSelection(list, "none", "p1")).toEqual(new Set())
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- broadcast`
Expected: FAIL — cannot resolve `../src/renderer/src/broadcast`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/broadcast.ts`:

```ts
import type { AnySession } from "./store"

export interface TargetGroup {
    projectId: string
    projectName: string
    sessions: AnySession[]
}

export type Preset = "all" | "project" | "idle" | "none"

/**
 * Group agent sessions by project (first-seen order) for the composer's target
 * list. Non-agent sessions (plain shells) are excluded — this is a prompt
 * composer, agents only.
 */
export function groupTargets(sessions: AnySession[]): TargetGroup[] {
    const order: string[] = []
    const byId = new Map<string, TargetGroup>()
    for (const s of sessions) {
        if (!s.isAgent) continue
        let group = byId.get(s.projectId)
        if (!group) {
            group = { projectId: s.projectId, projectName: s.projectName, sessions: [] }
            byId.set(s.projectId, group)
            order.push(s.projectId)
        }
        group.sessions.push(s)
    }
    return order.map((id) => byId.get(id)!)
}

/** The set of agent termIds a quick-select preset resolves to. */
export function presetSelection(
    sessions: AnySession[],
    preset: Preset,
    activeProjectId: string | null
): Set<string> {
    const agents = sessions.filter((s) => s.isAgent)
    switch (preset) {
        case "all":
            return new Set(agents.map((s) => s.termId))
        case "project":
            return new Set(
                agents.filter((s) => s.projectId === activeProjectId).map((s) => s.termId)
            )
        case "idle":
            return new Set(agents.filter((s) => s.status === "idle").map((s) => s.termId))
        case "none":
            return new Set()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- broadcast`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/broadcast.ts tests/broadcast.test.ts
git commit -m "feat(broadcast): pure target grouping + preset selection"
```

---

### Task 2: Store `broadcast(termIds, text)` action

**Files:**
- Modify: `src/renderer/src/store.ts`

**Interfaces:**
- Consumes: `window.api.pty.input(termId: string, text: string)`.
- Produces: `broadcast: (termIds: string[], text: string) => void` on `AppState`.

- [ ] **Step 1: Add the interface entry**

In `src/renderer/src/store.ts`, find the `sendToAgent` line in the `AppState` interface:

```ts
    sendToAgent: (text: string) => boolean
```

Add directly below it:

```ts
    /** Send the same text to every given terminal (fire-to-many). */
    broadcast: (termIds: string[], text: string) => void
```

- [ ] **Step 2: Add the implementation**

In the same file, find the `sendToAgent` implementation:

```ts
        sendToAgent: (text) => {
            const id = get().lastAgentTermId
            if (!id) return false
            window.api.pty.input(id, text)
            return true
        },
```

Add directly below it:

```ts
        broadcast: (termIds, text) => {
            for (const id of termIds) window.api.pty.input(id, text)
            // Keep the focused-agent notion coherent after a fan-out.
            if (termIds.length) set({ lastAgentTermId: termIds[termIds.length - 1] })
        },
```

- [ ] **Step 3: Verify build + tests**

Run: `npx electron-vite build`
Expected: build succeeds (no TS errors — the new action satisfies the interface).

Run: `npm test`
Expected: existing suite stays green (179 tests: prior 173 + Task 1's 6).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store.ts
git commit -m "feat(store): broadcast(termIds, text) — send one prompt to many terminals"
```

---

### Task 3: PromptComposer target selector + multi-send

Replace the composer's single-target send with a checkbox selector (grouped by project, All/Project/Idle/None presets) that fires at every selected agent, with a confirm at 3+.

**Files:**
- Modify: `src/renderer/src/components/PromptComposer.tsx` (full replacement below)
- Modify: `src/renderer/src/styles.css` (append the selector CSS)

**Interfaces:**
- Consumes: `groupTargets`, `presetSelection`, `type Preset` (Task 1); store `broadcast` (Task 2), `agentSessions`, `lastAgentTermId`, `composerDrafts`/`setComposerDraft`, `activeProject`; `confirm` from `../confirm`; `useSettings().snippets`.

- [ ] **Step 1: Replace the component**

Replace the entire contents of `src/renderer/src/components/PromptComposer.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { groupTargets, presetSelection, type Preset } from "../broadcast"
import { confirm } from "../confirm"

interface Props {
    onClose: () => void
}

interface Suggestion {
    key: string
    label: string
    insert: string
}

/**
 * Compose a rich prompt and fire it at one or many agent sessions. `@`
 * autocompletes project files; `/` autocompletes user snippets. Targets are
 * picked via checkboxes (grouped by project); the selection defaults to the
 * focused agent on each open and is not persisted.
 */
export function PromptComposer({ onClose }: Props): JSX.Element {
    const activeProject = useStore((s) => s.activeProject())
    const lastAgent = useStore((s) => s.lastAgentTermId)
    const broadcast = useStore((s) => s.broadcast)
    const agentSessions = useStore((s) => s.agentSessions)
    const draft = useStore((s) => (s.activeId ? s.composerDrafts[s.activeId] ?? "" : ""))
    const setComposerDraft = useStore((s) => s.setComposerDraft)
    const snippets = useSettings((s) => s.snippets)

    const [files, setFiles] = useState<string[]>([])
    const [token, setToken] = useState<{ start: number; query: string; trigger: "@" | "/" } | null>(
        null
    )
    const [sel, setSel] = useState(0)
    // Fire targets — seeded once (on open) from the focused agent. The composer
    // is mounted fresh each open, so this reseeds and is never persisted.
    const [selected, setSelected] = useState<Set<string>>(() =>
        lastAgent ? new Set([lastAgent]) : new Set()
    )
    const ref = useRef<HTMLTextAreaElement>(null)

    const text = draft
    const setText = (value: string): void => {
        if (activeProject) setComposerDraft(activeProject.id, value)
    }

    const sessions = agentSessions()
    const groups = groupTargets(sessions)
    const selectedCount = selected.size
    const singleTarget =
        selectedCount === 1 ? sessions.find((s) => selected.has(s.termId)) : undefined

    useEffect(() => {
        if (activeProject) {
            window.api.fs.allFiles(activeProject.path).then(setFiles).catch(() => setFiles([]))
        }
        ref.current?.focus()
    }, [activeProject])

    const suggestions = useMemo<Suggestion[]>(() => {
        if (!token) return []
        const q = token.query.toLowerCase()
        if (token.trigger === "@") {
            return files
                .filter((f) => f.toLowerCase().includes(q))
                .slice(0, 8)
                .map((f) => ({ key: f, label: f, insert: "@" + f + " " }))
        }
        return snippets
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 8)
            .map((s) => ({
                key: s.id,
                label: "/" + s.name + " - " + s.body.slice(0, 48),
                insert: s.body + " "
            }))
    }, [token, files, snippets])

    const detectToken = (value: string, caret: number): void => {
        let i = caret - 1
        while (i >= 0 && !/\s/.test(value[i])) i--
        const start = i + 1
        const word = value.slice(start, caret)
        if (word[0] === "@" || word[0] === "/") {
            setToken({ start, query: word.slice(1), trigger: word[0] as "@" | "/" })
            setSel(0)
        } else {
            setToken(null)
        }
    }

    const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
        setText(e.target.value)
        detectToken(e.target.value, e.target.selectionStart)
    }

    const accept = (item: Suggestion): void => {
        if (!token) return
        const caret = ref.current?.selectionStart ?? text.length
        const next = text.slice(0, token.start) + item.insert + text.slice(caret)
        setText(next)
        setToken(null)
        requestAnimationFrame(() => {
            const pos = token.start + item.insert.length
            ref.current?.setSelectionRange(pos, pos)
            ref.current?.focus()
        })
    }

    const toggle = (termId: string): void =>
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(termId)) next.delete(termId)
            else next.add(termId)
            return next
        })

    // Presets read a fresh session list so idle/all reflect the current moment.
    const applyPreset = (preset: Preset): void =>
        setSelected(presetSelection(agentSessions(), preset, activeProject?.id ?? null))

    const send = async (): Promise<void> => {
        const body = text.trim()
        const ids = [...selected]
        if (!body || ids.length === 0) return
        if (ids.length >= 3) {
            const ok = await confirm({
                title: "Send to multiple agents",
                message: `Send this prompt to ${ids.length} agent sessions?`,
                confirmLabel: "Send to " + ids.length
            })
            if (!ok) return
        }
        broadcast(ids, body + "\r")
        setText("")
        onClose()
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (suggestions.length) {
            if (e.key === "ArrowDown") {
                e.preventDefault()
                setSel((i) => (i + 1) % suggestions.length)
                return
            }
            if (e.key === "ArrowUp") {
                e.preventDefault()
                setSel((i) => (i - 1 + suggestions.length) % suggestions.length)
                return
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                accept(suggestions[sel])
                return
            }
            if (e.key === "Escape") {
                setToken(null)
                return
            }
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void send()
            return
        }
        if (e.key === "Escape") onClose()
    }

    return (
        <div className="composer">
            <div className="composer-head">
                <span className="muted small">
                    {sessions.length === 0 ? (
                        "No agent session - start one to send a prompt"
                    ) : selectedCount === 0 ? (
                        "Select at least one agent"
                    ) : singleTarget ? (
                        <>
                            → {singleTarget.tabName}{" "}
                            <span className="agent-badge sm">{singleTarget.badge}</span>
                        </>
                    ) : (
                        <>
                            → <b>{selectedCount} agents</b>
                        </>
                    )}
                </span>
                <span className="muted small">@ file · / snippet · Ctrl+Enter send · Esc close</span>
            </div>

            {sessions.length > 0 && (
                <div className="composer-targets">
                    <div className="composer-presets">
                        <button className="composer-preset" onClick={() => applyPreset("all")}>
                            All
                        </button>
                        <button className="composer-preset" onClick={() => applyPreset("project")}>
                            This project
                        </button>
                        <button className="composer-preset" onClick={() => applyPreset("idle")}>
                            Idle
                        </button>
                        <button className="composer-preset" onClick={() => applyPreset("none")}>
                            None
                        </button>
                        <span className="muted small composer-count">{selectedCount} selected</span>
                    </div>
                    {groups.map((g) => (
                        <div key={g.projectId} className="composer-target-group">
                            <div className="composer-target-group-title">{g.projectName}</div>
                            {g.sessions.map((s) => (
                                <label key={s.termId} className="composer-target">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(s.termId)}
                                        onChange={() => toggle(s.termId)}
                                    />
                                    <span className={"tab-dot claude status-" + s.status} />
                                    <span className="composer-target-name">{s.sessionName}</span>
                                    <span className="agent-badge sm">{s.badge}</span>
                                </label>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            <div className="composer-body">
                <textarea
                    ref={ref}
                    className="composer-input"
                    placeholder="Write a prompt… @ to mention a file, / for a snippet"
                    value={text}
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                />
                {suggestions.length > 0 && (
                    <div className="mention-pop">
                        {suggestions.map((item, i) => (
                            <div
                                key={item.key}
                                className={"mention-item" + (i === sel ? " active" : "")}
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    accept(item)
                                }}
                            >
                                {item.label}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="composer-foot">
                <button onClick={onClose}>Cancel</button>
                <button
                    className="accent"
                    onClick={() => void send()}
                    disabled={!text.trim() || selectedCount === 0}
                >
                    Send ▸
                </button>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Add the selector CSS**

In `src/renderer/src/styles.css`, find the existing `.composer-head` rule (grep for `.composer-head`). Immediately after the block of `.composer*` rules, append:

```css
.composer-targets {
    max-height: 160px;
    overflow-y: auto;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-soft);
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.composer-presets {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 4px;
}
.composer-preset {
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: var(--radius, 7px);
    padding: 2px 10px;
    font-size: 12px;
    cursor: pointer;
}
.composer-preset:hover {
    color: var(--accent);
    border-color: var(--accent);
}
.composer-count {
    margin-left: auto;
}
.composer-target-group-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 6px 0 2px;
}
.composer-target {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 4px;
    border-radius: var(--radius, 7px);
    cursor: pointer;
}
.composer-target:hover {
    background: var(--bg-2);
}
.composer-target-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}
.composer-target input {
    accent-color: var(--accent);
}
```

- [ ] **Step 3: Verify build + tests**

Run: `npx electron-vite build`
Expected: build succeeds (no TS errors).

Run: `npm test`
Expected: full suite green (179).

- [ ] **Step 4: Verify in the real app (run-app skill)**

Build `out/` (done above), then with the run-app harness: focus a project that has ≥2 agent sessions, open the composer (Ctrl+I per TerminalView), confirm the target list shows agent sessions grouped by project with the focused agent pre-checked; tick a second agent; type a prompt; Send; confirm both terminals received the text (check via `window.api` / the terminals' buffers or a screenshot). Select a 3rd and confirm the "Send to 3 agents?" dialog appears. (Controller may perform this pass.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/PromptComposer.tsx src/renderer/src/styles.css
git commit -m "feat(composer): fire a prompt at many agents via target selector"
```

---

## Self-review

**Spec coverage** — every spec section maps to a task:
- Target selector (checkbox list grouped by project, presets, count) → Task 3.
- Agent-sessions-only → Task 1 (`groupTargets`/`presetSelection` filter `isAgent`), enforced again by consuming `agentSessions()`.
- Default = focused agent, not persisted → Task 3 (`useState` initializer from `lastAgent`, fresh mount each open).
- 3+ confirm; 1–2 immediate → Task 3 (`send()`).
- `broadcast` via `pty.input`, `sendToAgent` untouched → Task 2.
- `@file` literal-text behavior → unchanged (no code needed; documented in spec).
- Empty state / no-target / dead-target edges → Task 3 (head states, disabled Send) + Task 2 (`pty.input` to a dead id is a no-op).
- Tests: pure helper unit-tested (Task 1); component via build + run-app (Task 3).

**Placeholder scan** — no TBD/TODO; every code step contains full code; the run-app step names concrete actions.

**Type consistency** — `TargetGroup`/`Preset`/`groupTargets`/`presetSelection` (Task 1) are consumed with matching signatures in Task 3; `broadcast(termIds: string[], text: string)` (Task 2 interface) matches the Task 3 call `broadcast(ids, body + "\r")`; `AnySession` fields used (`termId`, `projectId`, `projectName`, `sessionName`, `badge`, `status`, `isAgent`) match `store.ts`.
