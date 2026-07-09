# Agent Context Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Context" popover to the tool cluster that surfaces the active project's agent memory files (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`), opens present ones in the Monaco editor, and creates missing ones from a seeded starter template.

**Architecture:** A pure, unit-tested `contextCatalog.ts` module (known-file catalog + starter template + a `mergeContext` presence function) drives a `ContextIndex` React popover mounted in `ToolCluster.tsx`. Discovery reuses the existing `window.api.fs.readDir`; opening reuses `store.openInEditor`; creation reuses `window.api.fs.write`. No new IPC and no main-process changes — all three fs paths are already project-root confined by the existing `guardPath`/`isWithinRoots` guard.

**Tech Stack:** Electron + React + TypeScript (renderer), Zustand store, Vitest.

## Global Constraints

- Code style: 4-space indent, double quotes (project + global convention).
- Conventional commits (`feat:`, `docs:`, etc.). End commit messages with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch: `context-files` (already checked out).
- No new IPC; no changes under `src/main/` or `src/preload/`.
- Root-only discovery — exactly `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`. No nested-tree scan, no DevDeck-owned memory store, no per-agent routing.
- Design tokens are the source of truth — new CSS uses existing CSS vars (`--border-soft`, `--bg-2`, `--accent`, `--muted`, `--text`, `--radius`, `--mono`), no hard-coded colors. Match the existing `.mcp-cat-*` row styling.
- Version is NOT bumped (releases are cut separately as signed builds); the feature is logged under CHANGELOG `## Unreleased`.
- Verify UI changes with the `run-app` skill after `npx electron-vite build`.

---

### Task 1: Pure `contextCatalog` module

**Files:**
- Create: `src/renderer/src/contextCatalog.ts`
- Test: `tests/contextCatalog.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces:
  - `interface ContextFile { name: string; agent: string; description: string }`
  - `interface ContextEntry extends ContextFile { exists: boolean }`
  - `const CONTEXT_FILES: ContextFile[]`
  - `function template(name: string, projectName: string): string`
  - `function mergeContext(rootEntryNames: string[]): ContextEntry[]`

- [ ] **Step 1: Write the failing test**

Create `tests/contextCatalog.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { CONTEXT_FILES, template, mergeContext } from "../src/renderer/src/contextCatalog"

describe("CONTEXT_FILES", () => {
    it("lists the known root memory files with unique names and metadata", () => {
        const names = CONTEXT_FILES.map((f) => f.name)
        expect(names).toEqual(["CLAUDE.md", "AGENTS.md", "GEMINI.md"])
        expect(new Set(names).size).toBe(names.length)
        for (const f of CONTEXT_FILES) {
            expect(f.agent).toBeTruthy()
            expect(f.description).toBeTruthy()
        }
    })
})

describe("template", () => {
    it("injects the project name and includes the standard sections", () => {
        const out = template("CLAUDE.md", "devdeck")
        expect(out).toContain("# devdeck")
        expect(out).toContain("## Conventions")
        expect(out).toContain("## Architecture")
        expect(out).toContain("## Gotchas")
    })
    it("falls back to a generic heading when project name is empty", () => {
        expect(template("AGENTS.md", "")).toContain("# this project")
    })
})

describe("mergeContext", () => {
    it("marks a file present only when its exact name is in the listing", () => {
        const entries = mergeContext(["CLAUDE.md", "src", "package.json"])
        const byName = Object.fromEntries(entries.map((e) => [e.name, e.exists]))
        expect(byName["CLAUDE.md"]).toBe(true)
        expect(byName["AGENTS.md"]).toBe(false)
        expect(byName["GEMINI.md"]).toBe(false)
    })
    it("returns one entry per catalog file and ignores unknown files", () => {
        const entries = mergeContext(["README.md", "claude.md"]) // wrong case, unknown
        expect(entries).toHaveLength(CONTEXT_FILES.length)
        expect(entries.every((e) => e.exists === false)).toBe(true)
    })
    it("handles an empty listing", () => {
        expect(mergeContext([]).every((e) => !e.exists)).toBe(true)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/contextCatalog.test.ts`
Expected: FAIL — cannot resolve `../src/renderer/src/contextCatalog`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/contextCatalog.ts`:

```ts
// Curated "root memory" files that CLI coding agents load automatically from a
// project root. DevDeck surfaces which exist and creates missing ones from a
// seeded starter. Root-only by design (no nested-tree scan); this array is the
// single place to add more (e.g. ".cursorrules") later.

export interface ContextFile {
    name: string
    agent: string
    description: string
}

export interface ContextEntry extends ContextFile {
    exists: boolean
}

export const CONTEXT_FILES: ContextFile[] = [
    { name: "CLAUDE.md", agent: "Claude Code", description: "Project guidance for Claude Code" },
    { name: "AGENTS.md", agent: "Codex / general", description: "Guidance for Codex & general agents" },
    { name: "GEMINI.md", agent: "Gemini CLI", description: "Project guidance for the Gemini CLI" }
]

/**
 * The seeded starter written when creating a missing context file. `name` is
 * accepted so per-file templates can diverge later; today all files share this
 * markdown scaffold.
 */
export function template(name: string, projectName: string): string {
    const proj = projectName || "this project"
    return `# ${proj}

<!-- Guidance for AI agents working in this repo. Read before making changes. -->

## Conventions

## Architecture

## Gotchas
`
}

/**
 * Map the catalog to entries, marking each present when its exact (case-
 * sensitive) name appears in the project root's directory listing. Unknown
 * root files are ignored; always returns one entry per catalog file.
 */
export function mergeContext(rootEntryNames: string[]): ContextEntry[] {
    const present = new Set(rootEntryNames)
    return CONTEXT_FILES.map((f) => ({ ...f, exists: present.has(f.name) }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/contextCatalog.test.ts`
Expected: PASS (3 describe blocks, 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/contextCatalog.ts tests/contextCatalog.test.ts
git commit -m "$(cat <<'EOF'
feat(context): pure agent-context-file catalog + merge/template

Roadmap #6. Known root memory files (CLAUDE.md/AGENTS.md/GEMINI.md),
a seeded starter template, and mergeContext() presence mapping. Pure +
unit-tested; no IPC.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Context popover + tool-cluster wiring

**Files:**
- Modify: `src/renderer/src/components/Icon.tsx` (add a `bookOpen` icon)
- Create: `src/renderer/src/components/ContextIndex.tsx`
- Modify: `src/renderer/src/components/ToolCluster.tsx` (add the Context button + popover, mirroring the Tasks popover)
- Modify: `src/renderer/src/styles.css` (append a `.context-*` block)
- Modify: `CHANGELOG.md` (Unreleased entry)

**Interfaces:**
- Consumes from Task 1: `CONTEXT_FILES` (unused directly), `mergeContext(rootEntryNames: string[]): ContextEntry[]`, `template(name: string, projectName: string): string`, type `ContextEntry`.
- Consumes from existing code:
  - `useStore` selector `s.projects.find((p) => p.id === s.activeId)` → `Project { id, name, path }`.
  - `useStore((s) => s.openInEditor)` → `openInEditor(projectId: string, path: string, line?: number): void`.
  - `window.api.fs.readDir(dir: string): Promise<DirEntry[]>` where `DirEntry { name, path, isDir }`.
  - `window.api.fs.write(path: string, content: string): Promise<void>`.
  - `toast(text: string): void` from `../toast`.
  - `Icon` component with an `IconName` prop.
- Produces: `function ContextIndex(props: { onClose: () => void }): JSX.Element` (default export not used; named export).

- [ ] **Step 1: Add the `bookOpen` icon to `Icon.tsx`**

In `src/renderer/src/components/Icon.tsx`, add `"bookOpen"` to the `IconName` union (after `"chart"`):

```ts
    | "chart"
    | "bookOpen"
```

And add its glyph to the `P` record (after the `chart:` entry, before the closing `}` of `P`). Note the comma after the existing `chart` entry:

```ts
    chart: (
        <>
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
        </>
    ),
    bookOpen: (
        <>
            <path d="M12 7v14" />
            <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </>
    )
```

- [ ] **Step 2: Create the `ContextIndex` popover component**

Create `src/renderer/src/components/ContextIndex.tsx`:

```tsx
import { useEffect, useState } from "react"
import { useStore } from "../store"
import { mergeContext, template, type ContextEntry } from "../contextCatalog"
import { toast } from "../toast"

/**
 * Popover listing the active project's agent memory files (CLAUDE.md /
 * AGENTS.md / GEMINI.md). Present files open in the Monaco editor; missing
 * files are created from a seeded starter, then opened. Root-only; derived
 * fresh from a directory listing each time it opens.
 */
export function ContextIndex({ onClose }: { onClose: () => void }): JSX.Element {
    const project = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const openInEditor = useStore((s) => s.openInEditor)
    const [entries, setEntries] = useState<ContextEntry[]>([])
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!project) return
        let live = true
        window.api.fs
            .readDir(project.path)
            .then((list) => {
                if (!live) return
                setError(false)
                setEntries(mergeContext(list.map((e) => e.name)))
            })
            .catch(() => {
                if (live) setError(true)
            })
    }, [project])

    if (!project) return <div className="context-empty muted small">No active project.</div>

    const path = (name: string): string => `${project.path}/${name}`

    const open = (name: string): void => {
        openInEditor(project.id, path(name))
        onClose()
    }

    const create = async (name: string): Promise<void> => {
        try {
            await window.api.fs.write(path(name), template(name, project.name))
            openInEditor(project.id, path(name))
            onClose()
        } catch {
            toast(`Couldn't create ${name}`)
        }
    }

    return (
        <div className="context-index">
            <div className="section-label context-title">Context · {project.name}</div>
            {error ? (
                <div className="context-empty muted small">Couldn&apos;t read project folder.</div>
            ) : (
                entries.map((e) => (
                    <div key={e.name} className="context-row">
                        <span className={"context-dot" + (e.exists ? " on" : "")} />
                        <span className="context-name">{e.name}</span>
                        <span className="context-agent muted small">{e.agent}</span>
                        {e.exists ? (
                            <button className="context-action" onClick={() => open(e.name)}>
                                Open
                            </button>
                        ) : (
                            <button className="context-action" onClick={() => void create(e.name)}>
                                + Create
                            </button>
                        )}
                    </div>
                ))
            )}
        </div>
    )
}
```

- [ ] **Step 3: Wire the Context button + popover into `ToolCluster.tsx`**

In `src/renderer/src/components/ToolCluster.tsx`:

Add the import (after the `TaskRunner` import):

```tsx
import { TaskRunner } from "./TaskRunner"
import { ContextIndex } from "./ContextIndex"
```

Add popover state alongside `tasksOpen` (inside the component, after the `const [tasksOpen, setTasksOpen] = useState(false)` line):

```tsx
    const [tasksOpen, setTasksOpen] = useState(false)
    const [contextOpen, setContextOpen] = useState(false)
```

Add the Context button + popover markup immediately after the closing `</div>` of the `deck-tasks-wrap` block (i.e. right before the `rail-inbox` button):

```tsx
            <div className="deck-tasks-wrap">
                <button
                    className="deck-tool"
                    data-tip="Agent context files"
                    data-tip-pos="top"
                    onClick={() => setContextOpen((v) => !v)}
                >
                    <Icon name="bookOpen" size={16} />
                </button>
                {contextOpen && (
                    <>
                        <div className="menu-backdrop" onClick={() => setContextOpen(false)} />
                        <div className="deck-popover" onClick={(e) => e.stopPropagation()}>
                            <ContextIndex onClose={() => setContextOpen(false)} />
                        </div>
                    </>
                )}
            </div>
```

- [ ] **Step 4: Append the CSS block to `styles.css`**

At the end of `src/renderer/src/styles.css`, append:

```css

/* ---------- Agent context files ---------- */
.context-index {
    min-width: 260px;
}
.context-title {
    margin-bottom: 6px;
}
.context-empty {
    padding: 6px 2px;
}
.context-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 2px;
}
.context-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    align-self: center;
    border: 1px solid var(--border);
    background: transparent;
}
.context-dot.on {
    background: var(--accent);
    border-color: var(--accent);
}
.context-name {
    font-family: var(--mono, monospace);
    font-size: 12px;
    color: var(--text);
}
.context-agent {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.context-action {
    flex: none;
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: var(--radius, 6px);
    padding: 1px 12px;
    font-size: 12px;
    cursor: pointer;
}
.context-action:hover {
    color: var(--accent);
    border-color: var(--accent);
}
```

- [ ] **Step 5: Add the CHANGELOG entry**

In `CHANGELOG.md`, add this as the first bullet under `## Unreleased` (above the `MCP server catalog` bullet):

```markdown
- **Agent context files** - the tool cluster gains a **Context** popover listing the
  active project's agent memory files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`): open a
  present one in the editor, or create a missing one from a seeded starter template.
  Root-only; a lens over the real files the CLI agents already load.
```

- [ ] **Step 6: Typecheck, test, and build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i contextindex; npx vitest run tests/contextCatalog.test.ts; npx electron-vite build`
Expected: no type errors mentioning `ContextIndex`/`contextCatalog`; vitest PASS; build ends `✓ built`.
(Note: a pre-existing `EditorPanel.tsx` type error from a bare `tsc` is unrelated — the `grep` filters to this feature's files.)

- [ ] **Step 7: Verify in the real app (run-app skill)**

Use the `run-app` skill. Scenario: click the tool-cluster Context button (`.deck-tool` with `data-tip="Agent context files"`), assert the popover `.context-index` lists 3 `.context-row`s and that `CLAUDE.md` shows a `.context-dot.on` (DevDeck has a root `CLAUDE.md`). Click a **+ Create** row for a file that doesn't exist in a throwaway/test project, then confirm the editor view opens (`store.view === "editor"`). Screenshot `.context-index` and read the PNG to confirm layout matches the MCP-catalog rows.

Expected: 3 rows; `CLAUDE.md` present (filled dot, "Open"); missing files show "+ Create"; screenshot looks on-spec.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/Icon.tsx src/renderer/src/components/ContextIndex.tsx src/renderer/src/components/ToolCluster.tsx src/renderer/src/styles.css CHANGELOG.md
git commit -m "$(cat <<'EOF'
feat(context): Context popover for agent memory files

Roadmap #6. A tool-cluster "Context" popover lists the active project's
CLAUDE.md/AGENTS.md/GEMINI.md: open present ones in the Monaco editor,
create missing ones from a seeded starter. Adds a bookOpen icon; reuses
openInEditor + fs.readDir/write (no new IPC). CSS matches mcp-catalog rows.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification (whole feature)

- `npx vitest run` — full suite green (adds the `contextCatalog` tests).
- `npx electron-vite build` — clean.
- run-app: Context popover lists the three files with correct present/missing state; Open opens in the editor; Create writes the starter and opens it.
- CHANGELOG has the Unreleased entry; no version bump; no `src/main` or `src/preload` changes.

Then use `superpowers:finishing-a-development-branch` (or `/ship`) to open the PR into `main`.
