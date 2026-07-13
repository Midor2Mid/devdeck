# Per-Project Visual Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every project an auto colored monogram (with optional emoji/color override) and show it in the Ctrl+K switcher and the topbar project button.

**Architecture:** A pure `projectIdentity.ts` module derives a monogram + palette color from the project name (deterministic hash into a curated muted palette); overrides (`emoji`, `color`) persist on the project record through the existing projects IPC flow. A shared `<ProjectChip>` renders the tile and is dropped into the switcher card and topbar. Overrides are edited in a small `ProjectIdentityModal`, opened from the right-click project menu — mirroring the existing `envEditorProject` menu→modal pattern.

**Tech Stack:** Electron + React + TypeScript, Zustand store, vitest. Motion/CSS in `styles.css`. No new dependencies.

## Global Constraints

- Indentation 4 spaces; strings double-quoted (match surrounding code).
- No new dependencies.
- Verify with `npx tsc --noEmit` (ignore the one pre-existing unrelated `EditorPanel.tsx` monaco error) and `npm test`. Do NOT run a renderer build directly (it OOMs); use `npx electron-vite build` only via the run-app harness for feel-checks.
- Do NOT touch the unrelated in-progress files: `src/main/index.ts` changes are limited to the one IPC line in Task 2; do NOT touch `src/preload/index.ts` beyond the lines specified; never touch `src/renderer/src/components/TerminalPane.tsx`, `src/renderer/src/termClipboard.ts`, or `tests/termClipboard.test.ts`.
- Conventional commits (`feat:`); commit at the end of each task.
- Chip color is IDENTITY; `--accent` remains the sole state/selection signal — never merge the two roles.
- Palette is intentionally theme-independent (self-contained tiles) — do NOT wire it to theme tokens.

## File Structure

- **Create** `src/renderer/src/projectIdentity.ts` — pure derivation (palette, hash, monogram, identity). No React/electron imports.
- **Create** `tests/projectIdentity.test.ts` — unit tests for the module.
- **Create** `src/renderer/src/components/ProjectChip.tsx` — the shared chip.
- **Create** `src/renderer/src/components/ProjectIdentityModal.tsx` — override editor.
- **Modify** `src/main/projects.ts` — add `emoji?`/`color?` to `Project`; add `setMeta`.
- **Modify** `tests/projects.test.ts` — add a `setMeta` test.
- **Modify** `src/main/index.ts` — one IPC handler line.
- **Modify** `src/preload/index.ts` — add `emoji?`/`color?` to `Project`; add `projects.setMeta`.
- **Modify** `src/renderer/src/store.ts` — `setProjectMeta` action + `identityEditorProject` state/setter.
- **Modify** `src/renderer/src/projectMenu.ts` — "Appearance…" menu item.
- **Modify** `src/renderer/src/components/ProjectSwitcher.tsx` — chip in the card.
- **Modify** `src/renderer/src/components/Topbar.tsx` — chip in the project button.
- **Modify** `src/renderer/src/App.tsx` — render the modal.
- **Modify** `src/renderer/src/styles.css` — chip + modal styles.

---

### Task 1: Pure identity module + tests

**Files:**
- Create: `src/renderer/src/projectIdentity.ts`
- Test: `tests/projectIdentity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type PaletteKey`, `interface PaletteEntry { bg: string; fg: string }`, `const PALETTE: Record<PaletteKey, PaletteEntry>`, `const PALETTE_KEYS: PaletteKey[]`, `interface Identity { label: string; isEmoji: boolean; bg: string; fg: string }`, `function monogram(name: string): string`, `function autoColorKey(name: string): PaletteKey`, `function identity(p: { name: string; emoji?: string; color?: string }): Identity`.

- [ ] **Step 1: Write the failing test**

Create `tests/projectIdentity.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { monogram, autoColorKey, identity, PALETTE_KEYS, PALETTE } from "../src/renderer/src/projectIdentity"

describe("monogram", () => {
    it("first letters of the first two tokens", () => {
        expect(monogram("my-api-gateway")).toBe("MA")
    })
    it("splits camelCase", () => {
        expect(monogram("LauChoySeng")).toBe("LC")
    })
    it("two letters for a single token", () => {
        expect(monogram("devdeck")).toBe("DE")
    })
    it("strips surrounding brackets", () => {
        expect(monogram("[ACME] - BE")).toBe("AB")
    })
    it("? when there are no alphanumerics", () => {
        expect(monogram("")).toBe("?")
        expect(monogram("---")).toBe("?")
    })
})

describe("autoColorKey", () => {
    it("is deterministic", () => {
        expect(autoColorKey("devdeck")).toBe(autoColorKey("devdeck"))
    })
    it("returns a valid palette key", () => {
        expect(PALETTE_KEYS).toContain(autoColorKey("anything"))
    })
})

describe("identity", () => {
    it("monogram + auto color when nothing overridden", () => {
        const id = identity({ name: "devdeck" })
        expect(id.isEmoji).toBe(false)
        expect(id.label).toBe("DE")
        expect(id.bg).toMatch(/^#/)
    })
    it("emoji override wins", () => {
        const id = identity({ name: "devdeck", emoji: "🚀" })
        expect(id.isEmoji).toBe(true)
        expect(id.label).toBe("🚀")
    })
    it("color override sets the tile bg", () => {
        expect(identity({ name: "devdeck", color: "teal" }).bg).toBe(PALETTE.teal.bg)
    })
    it("invalid color falls back to auto", () => {
        expect(identity({ name: "devdeck", color: "notacolor" }).bg).toBe(identity({ name: "devdeck" }).bg)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/projectIdentity.test.ts`
Expected: FAIL — cannot resolve `../src/renderer/src/projectIdentity` (module doesn't exist yet).

- [ ] **Step 3: Write the module**

Create `src/renderer/src/projectIdentity.ts`:

```ts
// Per-project visual identity. Pure: no React, no electron — unit-tested in isolation.
// The palette is intentionally theme-independent — the chip is a self-contained
// filled tile carrying its own contrast, so a project keeps the same identity color
// across every theme (recognition consistency), which is why colors are NOT theme tokens.

export type PaletteKey =
    | "clay" | "ochre" | "sage" | "teal" | "steel"
    | "indigo" | "plum" | "rose" | "moss" | "stone"

export interface PaletteEntry {
    bg: string
    fg: string
}

export const PALETTE: Record<PaletteKey, PaletteEntry> = {
    clay: { bg: "#b0614a", fg: "#ffffff" },
    ochre: { bg: "#a8853e", fg: "#ffffff" },
    sage: { bg: "#6d8a68", fg: "#ffffff" },
    teal: { bg: "#478a8a", fg: "#ffffff" },
    steel: { bg: "#5a7196", fg: "#ffffff" },
    indigo: { bg: "#6a6aa0", fg: "#ffffff" },
    plum: { bg: "#8a5a82", fg: "#ffffff" },
    rose: { bg: "#a85a6e", fg: "#ffffff" },
    moss: { bg: "#79894a", fg: "#ffffff" },
    stone: { bg: "#7a756e", fg: "#ffffff" }
}

export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[]

// Neutral tile for emoji chips with no explicit color override.
const NEUTRAL_TILE: PaletteEntry = { bg: "#3a3a3a", fg: "#ffffff" }

export interface Identity {
    label: string
    isEmoji: boolean
    bg: string
    fg: string
}

// Stable djb2 hash → non-negative int. Same string → same value forever.
function hash(s: string): number {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
    return h
}

function firstAlnum(t: string): string {
    const m = t.match(/[A-Za-z0-9]/)
    return m ? m[0] : ""
}

export function monogram(name: string): string {
    const cleaned = name.trim().replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "")
    if (!cleaned) return "?"
    // Insert a boundary between camelCase humps, then split on separators.
    const spaced = cleaned.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    const tokens = spaced.split(/[\s\-_/.]+/).filter(Boolean)
    if (tokens.length >= 2) {
        return (firstAlnum(tokens[0]) + firstAlnum(tokens[1])).toUpperCase() || "?"
    }
    const two = (tokens[0].match(/[A-Za-z0-9]/g) || []).slice(0, 2).join("")
    return two.toUpperCase() || "?"
}

export function autoColorKey(name: string): PaletteKey {
    return PALETTE_KEYS[hash(name) % PALETTE_KEYS.length]
}

export function identity(p: { name: string; emoji?: string; color?: string }): Identity {
    const overridden = p.color && p.color in PALETTE ? (p.color as PaletteKey) : null
    if (p.emoji) {
        const tile = overridden ? PALETTE[overridden] : NEUTRAL_TILE
        return { label: p.emoji, isEmoji: true, bg: tile.bg, fg: tile.fg }
    }
    const entry = PALETTE[overridden ?? autoColorKey(p.name)]
    return { label: monogram(p.name), isEmoji: false, bg: entry.bg, fg: entry.fg }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/projectIdentity.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/projectIdentity.ts tests/projectIdentity.test.ts
git commit -m "feat(projects): pure project-identity module (monogram + palette)"
```

---

### Task 2: Data model + persistence

**Files:**
- Modify: `src/main/projects.ts` (Project interface `:7-13`; add `setMeta`)
- Test: `tests/projects.test.ts` (add a case + import)
- Modify: `src/main/index.ts:181` area (add one handler line)
- Modify: `src/preload/index.ts` (Project interface `:7-13`; projects API `:346-356`)
- Modify: `src/renderer/src/store.ts` (action + interface type)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `Project.emoji?: string`, `Project.color?: string` (both main and preload); `setMeta(id: string, meta: { emoji?: string; color?: string }): ProjectStore` (main); `window.api.projects.setMeta(id, meta): Promise<ProjectStore>` (preload); `store.setProjectMeta(id: string, meta: { emoji?: string; color?: string }): Promise<void>` (renderer).

- [ ] **Step 1: Write the failing test**

In `tests/projects.test.ts`, change the import line (`:22`) to add `setMeta`:

```ts
import { addProjectByPath, listProjects, setMeta } from "../src/main/projects"
```

Add this test inside the `describe("projects ops", …)` block:

```ts
it("sets and clears identity meta", () => {
    const id = addProjectByPath(dirA).projects[0].id
    const set = setMeta(id, { emoji: "🚀", color: "teal" })
    const p = set.projects.find((x) => x.id === id)!
    expect(p.emoji).toBe("🚀")
    expect(p.color).toBe("teal")
    const cleared = setMeta(id, { emoji: "", color: undefined })
    const p2 = cleared.projects.find((x) => x.id === id)!
    expect(p2.emoji).toBeUndefined()
    expect(p2.color).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/projects.test.ts`
Expected: FAIL — `setMeta` is not exported from `../src/main/projects`.

- [ ] **Step 3: Extend the main Project model + add setMeta**

In `src/main/projects.ts`, add two fields to the `Project` interface (`:7-13`):

```ts
export interface Project {
    id: string
    name: string
    path: string
    addedAt: number
    group?: string
    emoji?: string
    color?: string
}
```

Add this function right after `setGroup` (`:113`):

```ts
export function setMeta(id: string, meta: { emoji?: string; color?: string }): ProjectStore {
    const store = load()
    const project = store.projects.find((p) => p.id === id)
    if (project) {
        if ("emoji" in meta) project.emoji = meta.emoji?.trim() || undefined
        if ("color" in meta) project.color = meta.color || undefined
        save(store)
    }
    return store
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/projects.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the IPC handler**

In `src/main/index.ts`, add a line immediately after the `projects:setGroup` handler (`:181`):

```ts
    ipcMain.handle("projects:setMeta", (_e, { id, meta }) => projects.setMeta(id, meta))
```

- [ ] **Step 6: Extend the preload Project model + API**

In `src/preload/index.ts`, add the same two fields to the `Project` interface (`:7-13`):

```ts
export interface Project {
    id: string
    name: string
    path: string
    addedAt: number
    group?: string
    emoji?: string
    color?: string
}
```

In the `projects` API object, add `setMeta` after `setGroup` (`:353`):

```ts
        setMeta: (id: string, meta: { emoji?: string; color?: string }): Promise<ProjectStore> =>
            ipcRenderer.invoke("projects:setMeta", { id, meta }),
```

- [ ] **Step 7: Add the store action**

In `src/renderer/src/store.ts`, add the action type next to `setProjectGroup` in the store interface (near `:105`):

```ts
    setProjectMeta: (id: string, meta: { emoji?: string; color?: string }) => Promise<void>
```

And the implementation right after `setProjectGroup` (`:624`):

```ts
        setProjectMeta: async (id, meta) => {
            const store = await window.api.projects.setMeta(id, meta)
            set({ projects: store.projects })
        },
```

- [ ] **Step 8: Typecheck + full tests**

Run: `npx tsc --noEmit`
Expected: no new errors (only the known pre-existing `EditorPanel.tsx` monaco error may appear).
Run: `npm test`
Expected: all pass (existing suite + the new case).

- [ ] **Step 9: Commit**

```bash
git add src/main/projects.ts tests/projects.test.ts src/main/index.ts src/preload/index.ts src/renderer/src/store.ts
git commit -m "feat(projects): persist optional emoji/color identity overrides"
```

---

### Task 3: ProjectChip component + styles

**Files:**
- Create: `src/renderer/src/components/ProjectChip.tsx`
- Modify: `src/renderer/src/styles.css` (append chip styles)

**Interfaces:**
- Consumes: `identity` from `../projectIdentity` (Task 1); `Project` type from `../../preload/index` (Task 2 fields).
- Produces: `<ProjectChip project={Project} size?: "sm" | "md" />`.

Note: renderer components are not unit-tested in this repo (convention — see the absence of component tests); this task is verified by typecheck + the feel-check in Task 4. No test file.

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/ProjectChip.tsx`:

```tsx
import { identity } from "../projectIdentity"
import type { Project } from "../../preload/index"

/** The per-project identity tile: a colored monogram, or the project's custom emoji. */
export function ProjectChip({
    project,
    size = "md"
}: {
    project: Project
    size?: "sm" | "md"
}): JSX.Element {
    const id = identity(project)
    return (
        <span
            className={"project-chip project-chip-" + size + (id.isEmoji ? " is-emoji" : "")}
            style={{ background: id.bg, color: id.fg }}
            role="img"
            aria-label={project.name}
        >
            {id.label}
        </span>
    )
}
```

- [ ] **Step 2: Add styles**

Append to `src/renderer/src/styles.css`:

```css
/* ---------- Project identity chip ---------- */
.project-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 6px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    user-select: none;
}
.project-chip-sm {
    width: 18px;
    height: 18px;
    font-size: 9px;
    border-radius: 5px;
}
.project-chip-md {
    width: 26px;
    height: 26px;
    font-size: 11px;
}
.project-chip.is-emoji {
    font-weight: 400;
}
.project-chip-sm.is-emoji {
    font-size: 12px;
}
.project-chip-md.is-emoji {
    font-size: 15px;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ProjectChip.tsx src/renderer/src/styles.css
git commit -m "feat(projects): ProjectChip identity tile component"
```

---

### Task 4: Show the chip in the switcher + topbar

**Files:**
- Modify: `src/renderer/src/components/ProjectSwitcher.tsx` (card at `:136`)
- Modify: `src/renderer/src/components/Topbar.tsx` (project button `:19-27`)
- Modify: `src/renderer/src/styles.css` (one small card-head rule)

**Interfaces:**
- Consumes: `<ProjectChip>` (Task 3).
- Produces: nothing new.

- [ ] **Step 1: Switcher card — import + chip**

In `src/renderer/src/components/ProjectSwitcher.tsx`, add the import after the existing imports (top of file):

```tsx
import { ProjectChip } from "./ProjectChip"
```

Replace the `.switcher-card-name` block (`:136-139`):

```tsx
                                <div className="switcher-card-name">
                                    {p.name}
                                    {c?.attention ? <span className="card-attn">●</span> : null}
                                </div>
```

with a header row that puts the chip beside the name:

```tsx
                                <div className="switcher-card-head">
                                    <ProjectChip project={p} size="md" />
                                    <div className="switcher-card-name">
                                        {p.name}
                                        {c?.attention ? <span className="card-attn">●</span> : null}
                                    </div>
                                </div>
```

- [ ] **Step 2: Topbar — import + chip in the project button**

In `src/renderer/src/components/Topbar.tsx`, add the import after the existing imports (`:4`):

```tsx
import { ProjectChip } from "./ProjectChip"
```

In the `.topbar-proj-btn` button, add the chip before the name (`:25`). Change:

```tsx
                    {project ? project.name : "No project"}
```

to:

```tsx
                    {project && <ProjectChip project={project} size="sm" />}
                    {project ? project.name : "No project"}
```

- [ ] **Step 3: Styles for the card head**

Append to `src/renderer/src/styles.css`:

```css
.switcher-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Feel-check (run-app)**

Build and drive the app:

```bash
npx electron-vite build
```

Then via the run-app harness (`.claude/skills/run-app/`): open `Ctrl+K` and confirm each project card shows a distinct colored monogram tile beside its name; confirm the topbar shows the active project's chip to the left of its name, and that the two match for the active project. If the renderer build segfaults (known memory-pressure OOM), retry once; it is not a code fault.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ProjectSwitcher.tsx src/renderer/src/components/Topbar.tsx src/renderer/src/styles.css
git commit -m "feat(projects): show identity chip in switcher and topbar"
```

---

### Task 5: Override editor (menu → modal)

**Files:**
- Modify: `src/renderer/src/store.ts` (`identityEditorProject` state `:139` area, init `:525` area, setter `:737` area)
- Modify: `src/renderer/src/projectMenu.ts` (add menu item)
- Create: `src/renderer/src/components/ProjectIdentityModal.tsx`
- Modify: `src/renderer/src/App.tsx` (read state `:60` area, render `:248` area)
- Modify: `src/renderer/src/styles.css` (modal + swatch styles)

**Interfaces:**
- Consumes: `PALETTE`, `PALETTE_KEYS` (Task 1); `<ProjectChip>` (Task 3); `store.setProjectMeta` (Task 2).
- Produces: `store.identityEditorProject: string | null`, `store.setIdentityEditorProject(id: string | null): void`; `<ProjectIdentityModal />`.

- [ ] **Step 1: Store state + setter**

In `src/renderer/src/store.ts`, add to the store interface next to `envEditorProject` (`:139-140`):

```ts
    identityEditorProject: string | null
    setIdentityEditorProject: (projectId: string | null) => void
```

Add the initial value next to `envEditorProject: null` (`:525`):

```ts
        identityEditorProject: null,
```

Add the setter next to `setEnvEditorProject` (`:737`):

```ts
        setIdentityEditorProject: (identityEditorProject) => set({ identityEditorProject }),
```

- [ ] **Step 2: Menu item**

In `src/renderer/src/projectMenu.ts`, add an item right after "Saved commands…" (`:21`):

```ts
        { label: "Appearance…", onClick: () => s.setIdentityEditorProject(project.id) },
```

- [ ] **Step 3: Write the modal component**

Create `src/renderer/src/components/ProjectIdentityModal.tsx`:

```tsx
import { useState } from "react"
import { useStore } from "../store"
import { PALETTE, PALETTE_KEYS } from "../projectIdentity"
import { ProjectChip } from "./ProjectChip"

/** Edit a project's optional emoji/color identity overrides. Opened from the
 *  project context menu via store.identityEditorProject (mirrors ProjectEnvModal). */
export function ProjectIdentityModal(): JSX.Element | null {
    const projectId = useStore((s) => s.identityEditorProject)
    const project = useStore((s) => s.projects.find((p) => p.id === projectId))
    const setMeta = useStore((s) => s.setProjectMeta)
    const close = useStore((s) => s.setIdentityEditorProject)
    const [emoji, setEmoji] = useState(project?.emoji ?? "")

    if (!project) return null

    return (
        <div className="switcher-backdrop" onMouseDown={() => close(null)}>
            <div className="modal identity-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <ProjectChip project={project} size="md" />
                    <h3>{project.name}</h3>
                    <button onClick={() => close(null)}>Close</button>
                </div>
                <label className="identity-row">
                    <span>Emoji</span>
                    <input
                        className="identity-emoji-input"
                        value={emoji}
                        maxLength={4}
                        placeholder="e.g. 🚀 (blank = auto)"
                        onChange={(e) => setEmoji(e.target.value)}
                        onBlur={() => setMeta(project.id, { emoji })}
                    />
                </label>
                <div className="identity-row">
                    <span>Color</span>
                    <div className="identity-swatches">
                        {PALETTE_KEYS.map((k) => (
                            <button
                                key={k}
                                className={"identity-swatch" + (project.color === k ? " sel" : "")}
                                style={{ background: PALETTE[k].bg }}
                                data-tip={k}
                                onClick={() => setMeta(project.id, { color: k })}
                            />
                        ))}
                    </div>
                </div>
                <button
                    className="identity-reset"
                    onClick={() => {
                        setEmoji("")
                        setMeta(project.id, { emoji: "", color: undefined })
                    }}
                >
                    Reset to auto
                </button>
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Render the modal in App**

In `src/renderer/src/App.tsx`, add the state read next to `envEditorProject` (`:60`):

```tsx
    const identityEditorProject = useStore((s) => s.identityEditorProject)
```

Add the import with the other component imports (top of file, near the other modal imports):

```tsx
import { ProjectIdentityModal } from "./components/ProjectIdentityModal"
```

Add the render next to the env/commands modals (`:248-249`):

```tsx
            {identityEditorProject && <ProjectIdentityModal />}
```

- [ ] **Step 5: Modal + swatch styles**

Append to `src/renderer/src/styles.css`:

```css
/* ---------- Project appearance modal ---------- */
.identity-modal {
    width: 340px;
    padding: 18px;
}
.identity-modal .modal-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
}
.identity-modal .modal-head h3 {
    flex: 1;
    margin: 0;
    font-size: 14px;
}
.identity-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 12px 0;
}
.identity-row > span {
    width: 48px;
    color: var(--faint);
    font-size: 12px;
}
.identity-emoji-input {
    flex: 1;
}
.identity-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.identity-swatch {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
}
.identity-swatch.sel {
    border-color: var(--text);
}
.identity-reset {
    margin-top: 8px;
}
```

- [ ] **Step 6: Typecheck + tests**

Run: `npx tsc --noEmit`
Expected: no new errors.
Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Feel-check (run-app)**

Build (`npx electron-vite build`; retry once if it OOM-segfaults) and drive via run-app:
- Right-click a project (switcher card or deck strip) → "Appearance…" opens the modal.
- Type an emoji → the topbar/switcher chip becomes that emoji. Pick a color swatch → the monogram tile recolors and the swatch shows a selected ring.
- "Reset to auto" → returns to the hashed monogram.
- Close the app and relaunch (the installed app or a fresh run-app launch): the emoji/color persist (they are saved to `projects.json`).
- Switch theme Sumi → Washi: chips stay legible and keep their identity color.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/store.ts src/renderer/src/projectMenu.ts src/renderer/src/components/ProjectIdentityModal.tsx src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat(projects): appearance editor for emoji/color overrides"
```

---

## Notes

- **Deviation from spec (noted):** the spec listed separate "Set emoji…" / "Set color…" menu entries; this plan consolidates both into one "Appearance…" modal, following the existing `envEditorProject`→`ProjectEnvModal` menu→modal pattern. Same capability, cleaner and more consistent.
- **Deferred (per spec non-goals):** no chip yet in Mission tiles / cross-project search / compact deck (they reuse `<ProjectChip>` later); no group-hue model; no free color wheel; no image uploads.
