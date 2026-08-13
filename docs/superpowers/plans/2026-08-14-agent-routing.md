# Agent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `dispatchBoardTask`'s hardcoded `agents[0]` with a per-card agent choice, optionally pre-selected by ordered rules — so the decision is visible before the click rather than discovered after the spend.

**Architecture:** A pure `src/renderer/src/routing.ts` holds the matcher and the fallback chain, following `board.ts` and `race.ts`. The store gains an `agentId` parameter on dispatch. The board's Dispatch button becomes a split control showing who will run. Settings gains a rule editor.

**Tech Stack:** TypeScript, React 18, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-agent-routing-design.md`

## Global Constraints

- 4-space indentation, double quotes for strings.
- **No hard-coded colours or sizes in components** — design tokens only; 7 themes × 12 styles re-bind them.
- **Exactly one accent in the frame.** Dispatch stays the primary action on a card.
- **State in form, not colour alone.** Icons from `Icon.tsx`. No emoji.
- `npm run typecheck` must end at **zero errors** — the build does not typecheck.
- `npx vitest run` must pass. Baseline is **631 tests**.
- **A zustand selector returning a fresh array or object causes an infinite render loop** that neither the build nor typecheck catches. `TaskBoard.tsx:34-48` documents a real instance.
- Conventional commit messages. **Never run `npm run dev`.**
- Dispatching spends real money. A routing decision must never be silent: if the app chooses, it shows what it chose and why, before anything is spent.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/renderer/src/routing.ts` | Rule matching and the fallback chain. Pure. | **Create** |
| `tests/routing.test.ts` | Unit tests for the above. | **Create** |
| `src/renderer/src/settings.ts` | `routingRules`, `defaultAgentId`, their actions. | Modify |
| `src/renderer/src/store.ts` | `dispatchBoardTask` takes an explicit agent. | Modify |
| `src/renderer/src/components/TaskBoard.tsx` | Split Dispatch control. | Modify |
| `src/renderer/src/components/SettingsModal.tsx` | Rule editor. | Modify |
| `src/renderer/src/styles.css` | `.route-*` rules. | Modify |

---

### Task 1: `routing.ts` — the matcher

Pure module. No React, no IPC.

**Files:**
- Create: `src/renderer/src/routing.ts`
- Test: `tests/routing.test.ts`

**Interfaces produced:**

```ts
export type RuleKind = "title" | "titleRegex" | "project" | "always"
export interface RoutingRule {
    id: string
    enabled: boolean
    kind: RuleKind
    pattern: string
    agentId: string
}
export interface RouteResult { agentId: string; ruleId?: string }
export function ruleMatches(rule: RoutingRule, card: { title: string; projectId: string }): boolean
export function routeAgent(
    rules: RoutingRule[],
    card: { title: string; projectId: string },
    agents: { id: string }[],
    defaultAgentId: string
): RouteResult
```

- [ ] **Step 1: Write the failing tests**

Create `tests/routing.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { ruleMatches, routeAgent, type RoutingRule } from "../src/renderer/src/routing"

const agents = [{ id: "claude" }, { id: "claude-opus" }, { id: "codex" }]
const card = { title: "Fix the login redirect", projectId: "p1" }

function rule(over: Partial<RoutingRule>): RoutingRule {
    return { id: "r", enabled: true, kind: "title", pattern: "", agentId: "codex", ...over }
}

describe("ruleMatches", () => {
    it("matches a title substring case-insensitively", () => {
        expect(ruleMatches(rule({ kind: "title", pattern: "LOGIN" }), card)).toBe(true)
        expect(ruleMatches(rule({ kind: "title", pattern: "logout" }), card)).toBe(false)
    })

    it("matches a title regex", () => {
        expect(ruleMatches(rule({ kind: "titleRegex", pattern: "^Fix .*redirect$" }), card)).toBe(true)
    })

    it("treats an invalid regex as never matching", () => {
        // An inert rule is the safe failure. Matching everything would silently
        // reroute every dispatch, and throwing would do it on the path that
        // spends money.
        expect(ruleMatches(rule({ kind: "titleRegex", pattern: "([" }), card)).toBe(false)
    })

    it("matches a project by id, not by name", () => {
        expect(ruleMatches(rule({ kind: "project", pattern: "p1" }), card)).toBe(true)
        expect(ruleMatches(rule({ kind: "project", pattern: "P1" }), card)).toBe(false)
    })

    it("always matches for the always kind, whatever the pattern", () => {
        expect(ruleMatches(rule({ kind: "always", pattern: "" }), card)).toBe(true)
    })

    it("does not match an empty pattern for the text kinds", () => {
        // An empty substring matches everything in JS; that would turn a
        // half-typed rule into a catch-all.
        expect(ruleMatches(rule({ kind: "title", pattern: "" }), card)).toBe(false)
        expect(ruleMatches(rule({ kind: "titleRegex", pattern: "" }), card)).toBe(false)
    })
})

describe("routeAgent", () => {
    it("returns the first enabled matching rule and says which one", () => {
        const r = routeAgent(
            [
                rule({ id: "a", enabled: false, pattern: "login", agentId: "codex" }),
                rule({ id: "b", pattern: "login", agentId: "claude-opus" }),
                rule({ id: "c", pattern: "login", agentId: "codex" })
            ],
            card,
            agents,
            "claude"
        )
        expect(r).toEqual({ agentId: "claude-opus", ruleId: "b" })
    })

    it("skips a rule naming an agent that no longer exists", () => {
        // A dangling reference must not dispatch to nothing.
        const r = routeAgent(
            [
                rule({ id: "a", pattern: "login", agentId: "deleted-agent" }),
                rule({ id: "b", pattern: "login", agentId: "codex" })
            ],
            card,
            agents,
            "claude"
        )
        expect(r).toEqual({ agentId: "codex", ruleId: "b" })
    })

    it("falls back to the configured default with no ruleId", () => {
        expect(routeAgent([], card, agents, "claude-opus")).toEqual({ agentId: "claude-opus" })
    })

    it("falls back to the first agent only when no default is configured", () => {
        // Preserves today's behaviour for anyone who configures nothing.
        expect(routeAgent([], card, agents, "")).toEqual({ agentId: "claude" })
    })

    it("ignores a default naming an agent that no longer exists", () => {
        expect(routeAgent([], card, agents, "deleted-agent")).toEqual({ agentId: "claude" })
    })

    it("returns an empty agentId when there are no agents at all", () => {
        expect(routeAgent([], card, [], "")).toEqual({ agentId: "" })
    })
})
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/routing.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `src/renderer/src/routing.ts`. Points the implementation must honour:

- **An invalid regex makes its rule inert.** Compile in a `try`, and on failure return `false`. Not `true` (which silently reroutes everything) and not a throw (which happens on the path that spends money).
- **An empty pattern never matches** for `title` and `titleRegex`. `"".includes("")` is `true` in JavaScript, so without this a half-typed rule becomes a catch-all.
- **A rule naming an unknown agent is skipped**, and evaluation continues with the next rule.
- The fallback chain is: first matching rule → `defaultAgentId` if it names a real agent → `agents[0]?.id` → `""`.

- [ ] **Step 4: Tests, suite, typecheck**

Run: `npx vitest run tests/routing.test.ts && npx vitest run && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/routing.ts tests/routing.test.ts
git commit -m "feat(routing): rule matching and the agent fallback chain"
```

---

### Task 2: Settings + an explicit agent on dispatch

**Files:**
- Modify: `src/renderer/src/settings.ts`
- Modify: `src/renderer/src/store.ts`

**Interfaces:**
- Consumes: `RoutingRule`, `routeAgent` from Task 1.
- Produces: `routingRules: RoutingRule[]` and `defaultAgentId: string` in settings with their actions; `dispatchBoardTask(id, opts)` where `opts` gains `agentId?: string`.

- [ ] **Step 1: Settings**

Add `routingRules: RoutingRule[]` (default `[]`) and `defaultAgentId: string` (default `""`) to `AppSettings`, `DEFAULTS`, the persisted field list and the load merge — check all four; the file lists persisted keys explicitly in `save()` and a missing entry silently stops persisting. Add `setRoutingRules` and `setDefaultAgentId`.

- [ ] **Step 2: Dispatch takes an agent**

`dispatchBoardTask` currently does `const agent = useSettings.getState().agents[0]`. Change it to take `opts.agentId`, and resolve it as: the passed id if it names a real agent, else `routeAgent(...)`'s answer. **Keep the confirm dialog naming the agent** — it already does, and it matters more now that the agent can differ per card.

Do not change `startRace`; the race asks you to pick entrants explicitly, which is the point of it.

- [ ] **Step 3: Typecheck and suite**

Run: `npm run typecheck && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/settings.ts src/renderer/src/store.ts
git commit -m "feat(routing): routing rules in settings, explicit agent on dispatch"
```

---

### Task 3: The split Dispatch control

**Files:**
- Modify: `src/renderer/src/components/TaskBoard.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Show who will run, before the click**

On a `todo` card, Dispatch becomes a split control: the button carries the resolved agent's name, and a chevron opens the list of AI-mode presets to override it. Compute the resolution with `routeAgent` **in the render body**, never inside a `useStore`/`useSettings` selector — and memoise the AI-mode filter over the stable `agents` array, as `ChangesModal.tsx:49-51` does and explains.

When a rule chose the agent, the control's `data-tip` names the rule. An automatic choice you cannot trace is what makes routing feel unpredictable.

Dispatch keeps the accent; the chevron is part of the same control, not a second accent.

- [ ] **Step 2: Typecheck, suite, and the app**

`npm run typecheck && npx vitest run`, then `npx electron-vite build` and verify with the **`run-app` skill** using an **isolated `userDataDir`**. Check Slate and Washi. Confirm the resolved name renders, the override list opens, and there is no render loop — a loop is invisible to both the build and the typecheck.

`Page.captureScreenshot` has been timing out in this environment; `Runtime.evaluate` + `getComputedStyle` is the fallback previous agents used successfully.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/TaskBoard.tsx src/renderer/src/styles.css
git commit -m "feat(routing): show and override the chosen agent on a card"
```

---

### Task 4: The rule editor

**Files:**
- Modify: `src/renderer/src/components/SettingsModal.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: The editor**

In the Agents section: the ordered rule list with move up/down, an enable toggle, kind, pattern, and target agent per rule; plus the default-agent picker. Follow the existing editors in this file for shape — several already do ordered lists.

Two things the UI must make true rather than assume:

- **An invalid regex must be visible as you type it.** The rule is inert when the pattern does not compile, so say so on the row — otherwise a mistyped rule looks active and silently never fires.
- **A rule naming a deleted agent must read as broken**, not as a working rule pointing at nothing.

- [ ] **Step 2: Typecheck, suite, and the app**

As Task 3, including both themes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/SettingsModal.tsx src/renderer/src/styles.css
git commit -m "feat(routing): rule editor and default agent"
```

---

### Task 5: Document

**Files:** `CHANGELOG.md` (Unreleased), `NOTES.md`.

- [ ] **Step 1: Record it**

The changelog entry says what changed for the user: dispatch no longer silently uses the first preset, you can choose per card, and rules can pre-select. Say plainly that rules choose **who**, never **whether** — nothing dispatches without a click.

`NOTES.md`: record that routing deliberately has no cost or capability awareness, because that needs the run ledger; and that rules can only match a card's title and project, since at dispatch time there are no files to match on.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md NOTES.md
git commit -m "docs: record agent routing"
```

---

## Definition of done

- `npm run typecheck` at zero, `npx vitest run` green.
- `agents[0]` is no longer a hidden default anywhere in the dispatch path.
- An invalid regex leaves its rule inert and visibly flagged — never matching everything, never throwing.
- A rule naming a deleted agent is skipped, and reads as broken in the editor.
- The card shows which agent will run before you click, and names the rule when one chose it.
