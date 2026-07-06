# UI Craft Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate DevDeck's craft globally — bundled premium font pair, refined type ramp, elevation scale, unified state/motion tokens, tabular numerals — entirely at the token level so all 7 themes and 12 styles level up together, without changing the calm-over-clever design philosophy.

**Architecture:** Theme-agnostic tokens (type ramp, spacing, motion, and theme-adaptive `color-mix` tokens) live in `styles.css :root`. Mode-dependent shadow tokens (`--elev-*`) live per-theme in `themes.ts` `*_VARS` objects and are applied by the existing `applyTheme()` (which spreads `theme.vars` onto `document.documentElement`). Fonts are bundled offline via Fontsource packages imported in the renderer entry. Existing hard-coded values are then repointed at the new tokens — no new one-off values in components.

**Tech Stack:** Electron + electron-vite + React + TypeScript; CSS custom properties; Fontsource (`@fontsource-variable/*`); Monaco (`@monaco-editor/react`); xterm; vitest.

## Global Constraints

- **North star is unchanged:** "calm over clever — quiet, legible, fast to scan, never busy." This pass is finish, not decoration.
- **No CDN / network fonts.** Fonts ship bundled (Fontsource → Vite inlines woff2 as same-origin assets). No CSP change.
- **Token-driven only.** Do not introduce a hard-coded color/size/shadow in a component when a token exists; add the token, repoint the value.
- **All motion stays gated behind `prefers-reduced-motion: reduce`.** The existing global reduce-motion blocks are preserved.
- **Must cascade to all 7 themes (Slate, Sumi, Washi, Zen, Graphite, Aurora, Neo) and 12 styles (Modern Pro/`wabi`, `minimal`, `neon`, `flat`, `bauhaus`, `crt`, `modern`, `lacquer`, `modernplus`, `aurora`, `neo`, `kinetic`).** Don't break any skin.
- **Terminal (xterm) font is OUT OF SCOPE.** It stays `settings.terminal.fontFamily`.
- **Font family names (Fontsource):** UI = `"Inter Variable"`, mono = `"Geist Mono Variable"`.
- **After any `run-app` drive, restore the user's skin:** Slate theme + Kinetic Minimal style, rail collapsed. Per `run-app-cdp-gotchas` memory: theme/rail state persists across launches; an expanded rail suppresses `data-tip` (match rail buttons by label text, not `data-tip`); theme card labels carry parentheticals (e.g. `"Neo (holographic)"`, `"Slate (modern)"`) and the style list has both `"Neon"` and `"Neo Holographic"`.
- **Build/test:** `npx electron-vite build` then `npm test` (currently 159 tests green). The PowerShell tool may fail with exit 9 in this environment — run builds/tests via the Bash tool.

---

## File Structure

- `package.json` — add Fontsource deps.
- `src/renderer/src/main.tsx` — import the two font packages (injects `@font-face`).
- `src/renderer/src/styles.css` — `:root` gets `--font-ui`, `--font-mono`, `--mono`, the type ramp, spacing scale, motion tokens, and the theme-adaptive `--bg-hover` / `--border-strong` / `--edge-hi`; `body` and key selectors repointed; base drop-shadows repointed to `--elev-*`; numerals + hover/press adoption.
- `src/renderer/src/themes.ts` — add `--elev-1/2/3` to each of the 7 `*_VARS` objects (dark set ×6, light set for `WASHI_VARS`).
- `tests/themes.test.ts` — NEW: asserts every theme defines the elevation tokens.
- `src/renderer/src/components/ApiPanel.tsx`, `EditorPanel.tsx`, `DbPanel.tsx` — Monaco `fontFamily` prepend the bundled mono.
- `DESIGN.md` — update the typography/elevation/motion documentation.
- `scratchpad/verify-craft.js` — NEW (scratchpad, not committed): reusable run-app screenshot scenario.

---

## Task 1: Bundle & wire the premium font pair

Highest-risk step (global text-metric change), done first and in isolation so later tasks build on a verified font baseline.

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `src/renderer/src/main.tsx:1-6`
- Modify: `src/renderer/src/styles.css:7-25` (`:root`), `src/renderer/src/styles.css:38-44` (`body`)
- Modify: `src/renderer/src/components/ApiPanel.tsx:892`, `src/renderer/src/components/EditorPanel.tsx:338`, `src/renderer/src/components/DbPanel.tsx:554-555`
- Create: `C:/Users/Admin/AppData/Local/Temp/claude/D--Personal-Personal-Projects-Products-devdeck/a2e5123d-9911-4e85-873f-95b96dea4c4b/scratchpad/verify-craft.js`

**Interfaces:**
- Produces CSS vars consumed by every later task: `--font-ui`, `--font-mono`, `--mono`.

- [ ] **Step 1: Install the font packages**

Run (Bash tool):
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npm i @fontsource-variable/inter @fontsource-variable/geist-mono
```
Expected: both added under `dependencies` in `package.json`; `node_modules/@fontsource-variable/{inter,geist-mono}` exist.

If the registry is unreachable behind the proxy, STOP and report — do not hand-vendor fonts without confirming.

- [ ] **Step 2: Import the fonts in the renderer entry**

In `src/renderer/src/main.tsx`, add the two imports after the existing CSS imports (before `import "./styles.css"` so our vars/overrides win the cascade):
```tsx
import ReactDOM from "react-dom/client"
import "allotment/dist/style.css"
import "@xterm/xterm/css/xterm.css"
import "@fontsource-variable/inter"
import "@fontsource-variable/geist-mono"
import "./styles.css"
import { App } from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"
```

- [ ] **Step 3: Add the font tokens to `:root`**

In `src/renderer/src/styles.css`, inside the `:root { … }` block (after the `--enso-mask` line, before the closing `}` at line 25), add:
```css
    /* Bundled premium type (Fontsource, offline). Terminal font stays user-set. */
    --font-ui: "Inter Variable", "Segoe UI", system-ui, sans-serif;
    --font-mono: "Geist Mono Variable", "Cascadia Mono", Consolas, monospace;
    --mono: var(--font-mono);
```

- [ ] **Step 4: Repoint `body` to the UI font**

In `src/renderer/src/styles.css`, change the `body` rule (line ~41):
```css
    font-family: var(--font-ui);
```
(Replace the `font-family: "Segoe UI", system-ui, sans-serif;` line only; leave `font-size`/`line-height` for Task 2.)

- [ ] **Step 5: Repoint Monaco editors to the bundled mono**

In each of the three Monaco `options` blocks, prepend the bundled family:
- `src/renderer/src/components/ApiPanel.tsx:892` and `src/renderer/src/components/EditorPanel.tsx:338`, replace:
```tsx
                                        fontFamily: '"Cascadia Mono", Consolas, monospace',
```
with:
```tsx
                                        fontFamily: '"Geist Mono Variable", "Cascadia Mono", Consolas, monospace',
```
- `src/renderer/src/components/DbPanel.tsx:554-555`, replace the two-line `fontFamily:` value with the same string:
```tsx
                                                fontFamily:
                                                    '"Geist Mono Variable", "Cascadia Mono", Consolas, monospace',
```

- [ ] **Step 6: Build**

Run (Bash tool):
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx electron-vite build 2>&1 | tail -5
```
Expected: `✓ built in …` with no errors.

- [ ] **Step 7: Create the reusable verification scenario**

Create `scratchpad/verify-craft.js` (path above). It launches the built app, screenshots the cockpit + Settings + API + DB across the default and three representative skins, then restores Slate + Kinetic + collapsed rail:
```js
const { withApp, sleep } = require("D:/Personal/Personal Projects/Products/devdeck/.claude/skills/run-app/cdp")
const DIR = "C:/Users/Admin/AppData/Local/Temp/claude/D--Personal-Personal-Projects-Products-devdeck/a2e5123d-9911-4e85-873f-95b96dea4c4b/scratchpad/"
const TAG = process.argv[2] || "t1"  // screenshot prefix per task

const openSettings = `(() => { const b=[...document.querySelectorAll('.rail-btn')].find(x=>x.textContent.includes('Settings')); if(b){b.click();return true} return false })()`
const closeSettings = `document.querySelector('.settings-close')?.click()`
const pickTheme = (m) => `(() => { const c=[...document.querySelectorAll('.theme-card')].find(b=>b.querySelector('.theme-name')?.textContent.includes(${JSON.stringify(m)})); if(c){c.click();return c.querySelector('.theme-name').textContent.trim()} return 'not-found' })()`
const pickStyle = (m) => `(() => { const c=[...document.querySelectorAll('.style-card')].find(b=>b.querySelector('.style-name')?.textContent.trim()===${JSON.stringify(m)}); if(c){c.click();return c.querySelector('.style-name').textContent.trim()} return 'not-found' })()`

async function setSkin(cdp, theme, style) {
    await cdp.evalu(openSettings); await sleep(500)
    await cdp.evalu(pickTheme(theme)); await sleep(250)
    await cdp.evalu(pickStyle(style)); await sleep(300)
    await cdp.evalu(closeSettings); await sleep(500)
}

withApp(async (cdp) => {
    // Representative matrix: default identity + a light theme + two showcase styles.
    for (const [theme, style, name] of [
        ["Slate", "Modern Pro", "slate-modernpro"],
        ["Washi", "Modern Minimal", "washi-minimal"],
        ["Aurora", "Aurora Glass", "aurora-glass"],
    ]) {
        await setSkin(cdp, theme, style)
        await cdp.screenshot(DIR + `${TAG}-${name}-cockpit.png`)
        await cdp.evalu(openSettings); await sleep(500)
        await cdp.screenshot(DIR + `${TAG}-${name}-settings.png`)
        await cdp.evalu(closeSettings); await sleep(300)
    }
    // Panels on default identity.
    await setSkin(cdp, "Slate", "Modern Pro")
    await cdp.evalu(`[...document.querySelectorAll('.rail-btn')].find(x=>x.textContent.includes('API'))?.click()`); await sleep(600)
    await cdp.screenshot(DIR + `${TAG}-api.png`)
    await cdp.evalu(`[...document.querySelectorAll('.rail-btn')].find(x=>x.textContent.includes('Database'))?.click()`); await sleep(600)
    await cdp.screenshot(DIR + `${TAG}-db.png`)
    // Restore user's skin + collapse rail.
    await setSkin(cdp, "Slate", "Kinetic Minimal")
    await cdp.evalu(`[...document.querySelectorAll('.rail-btn')].find(x=>x.textContent.includes('Terminals'))?.click()`); await sleep(300)
    if (await cdp.evalu(`!!document.querySelector('.rail.expanded')`)) { await cdp.click(".rail-toggle"); await sleep(300) }
    console.log("verify-craft done:", TAG)
}).then(() => process.exit(0), (e) => { console.error("FAIL", e); process.exit(1) })
```

- [ ] **Step 8: Run the verification scenario and inspect**

Run (Bash tool):
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && node "C:/Users/Admin/AppData/Local/Temp/claude/D--Personal-Personal-Projects-Products-devdeck/a2e5123d-9911-4e85-873f-95b96dea4c4b/scratchpad/verify-craft.js" t1
```
Then **Read every `t1-*.png`**. Verify: text renders in Inter (not Segoe UI), editors/kbd/paths in Geist Mono, and — critically — **no clipped/wrapped/overflowing text** introduced by the metric change. Note any truncation to fix before proceeding.

- [ ] **Step 9: Run unit tests**

Run (Bash tool):
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npm test 2>&1 | tail -6
```
Expected: `Test Files 23 passed`, `Tests 159 passed`.

- [ ] **Step 10: Commit**

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && git add package.json package-lock.json src/renderer/src/main.tsx src/renderer/src/styles.css src/renderer/src/components/ApiPanel.tsx src/renderer/src/components/EditorPanel.tsx src/renderer/src/components/DbPanel.tsx && git commit -m "feat(ui): bundle Inter + Geist Mono premium font pair

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Refined type ramp

**Files:**
- Modify: `src/renderer/src/styles.css:7-25` (`:root` tokens), `:38-44` (`body`), and the base `button`/`.small`/section-label/modal-title selectors.

**Interfaces:**
- Consumes: `--font-ui` (Task 1).
- Produces: `--fs-title`, `--fs-body`, `--fs-sm`, `--fs-label`, `--fs-mono`, `--lh-tight`, `--lh-body`, `--ls-title`, `--ls-label`.

- [ ] **Step 1: Add ramp tokens to `:root`**

In `src/renderer/src/styles.css` `:root`, after the font tokens from Task 1, add:
```css
    /* Type ramp — tuned to Inter's metrics. */
    --fs-title: 15px;
    --fs-body: 13px;
    --fs-sm: 12px;
    --fs-label: 11px;
    --fs-mono: 13px;
    --lh-tight: 1.2;
    --lh-body: 1.45;
    --ls-title: -0.01em;
    --ls-label: 0.06em;
```

- [ ] **Step 2: Repoint `body` size + line-height**

In the `body` rule, replace `font-size: 13px;` with `font-size: var(--fs-body);` and `line-height: 1.55;` with `line-height: var(--lh-body);`.

- [ ] **Step 3: Repoint the base `button` size**

In `src/renderer/src/styles.css:48-58` (`button`), replace `font-size: 12px;` with `font-size: var(--fs-sm);`.

- [ ] **Step 4: Repoint section labels + small text**

Replace the size on `.small` (`src/renderer/src/styles.css:101-103`) `font-size: 11px;` → `font-size: var(--fs-label);`. For the two uppercase section-title rules (`.sidebar-section-title` at ~709 and `.settings-nav-title` at ~2810), leave their existing `font-size: 10px` as-is (they are intentionally tiny) — do NOT change. This step only touches `.small`.

- [ ] **Step 5: Build + verify + commit**

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx electron-vite build 2>&1 | tail -5 && node "…/scratchpad/verify-craft.js" t2
```
Read `t2-slate-modernpro-cockpit.png` + `t2-slate-modernpro-settings.png`: confirm hierarchy reads cleanly (titles/body/labels distinct), nothing shrank or grew unexpectedly. Then:
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npm test 2>&1 | tail -3 && git add src/renderer/src/styles.css && git commit -m "feat(ui): tokenized type ramp (title/body/sm/label + line-heights)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Elevation scale (per-theme tokens + completeness test)

**Files:**
- Create: `tests/themes.test.ts`
- Modify: `src/renderer/src/themes.ts` (all 7 `*_VARS` objects: `SUMI_VARS`, `WASHI_VARS`, `ZEN_VARS`, `SLATE_VARS`, `GRAPHITE_VARS`, `AURORA_VARS`, `NEO_VARS`)
- Modify: `src/renderer/src/styles.css` (`:root` fallbacks + repoint base drop-shadows)

**Interfaces:**
- Consumes: existing `theme.vars` mechanism (`applyTheme()` spreads onto `documentElement`).
- Produces: `--elev-1`, `--elev-2`, `--elev-3` on every theme; base drop-shadows now reference them.

- [ ] **Step 1: Write the failing token-completeness test**

Create `tests/themes.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { THEMES } from "../src/renderer/src/themes"

const REQUIRED_ELEV = ["--elev-1", "--elev-2", "--elev-3"]

describe("theme elevation tokens", () => {
    for (const theme of Object.values(THEMES)) {
        it(`${theme.id} defines every elevation token`, () => {
            for (const key of REQUIRED_ELEV) {
                expect(theme.vars[key], `${theme.id} missing ${key}`).toBeTruthy()
            }
        })
    }
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run (Bash tool):
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx vitest run tests/themes.test.ts 2>&1 | tail -12
```
Expected: FAIL — each theme "missing --elev-1".

- [ ] **Step 3: Add the DARK elevation set to the six dark themes**

In `src/renderer/src/themes.ts`, add these three lines inside each of `SUMI_VARS`, `ZEN_VARS`, `SLATE_VARS`, `GRAPHITE_VARS`, `AURORA_VARS`, `NEO_VARS` (before each object's closing `}`):
```ts
    "--elev-1": "0 1px 2px rgba(0,0,0,.24), 0 1px 1px rgba(0,0,0,.16)",
    "--elev-2": "0 4px 12px -2px rgba(0,0,0,.30), 0 2px 4px rgba(0,0,0,.20)",
    "--elev-3": "0 18px 48px -12px rgba(0,0,0,.55), 0 6px 16px rgba(0,0,0,.30)",
```

- [ ] **Step 4: Add the LIGHT elevation set to Washi**

In `WASHI_VARS`, add (warm-tinted, softer — pure black is too harsh on the light ground):
```ts
    "--elev-1": "0 1px 2px rgba(60,50,35,.10), 0 1px 1px rgba(60,50,35,.06)",
    "--elev-2": "0 4px 12px -2px rgba(60,50,35,.14), 0 2px 4px rgba(60,50,35,.10)",
    "--elev-3": "0 18px 48px -12px rgba(60,50,35,.20), 0 6px 16px rgba(60,50,35,.12)",
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx vitest run tests/themes.test.ts 2>&1 | tail -6
```
Expected: PASS (7 tests).

- [ ] **Step 6: Add `:root` fallbacks + the theme-adaptive detail tokens**

In `src/renderer/src/styles.css` `:root`, add (fallbacks so shadows render before `applyTheme` runs, plus the color-mix detail tokens that adapt per theme):
```css
    /* Elevation fallbacks (applyTheme overrides per theme). */
    --elev-1: 0 1px 2px rgba(0,0,0,.24), 0 1px 1px rgba(0,0,0,.16);
    --elev-2: 0 4px 12px -2px rgba(0,0,0,.30), 0 2px 4px rgba(0,0,0,.20);
    --elev-3: 0 18px 48px -12px rgba(0,0,0,.55), 0 6px 16px rgba(0,0,0,.30);
    /* Theme-adaptive detail (derive from --text/--border, so they self-tune light/dark). */
    --edge-hi: inset 0 1px 0 color-mix(in srgb, var(--text) 5%, transparent);
    --border-strong: color-mix(in srgb, var(--border) 65%, var(--text));
```

- [ ] **Step 7: Repoint base drop-shadows to elevation tokens**

In `src/renderer/src/styles.css`, replace these exact shadow VALUES wherever they appear as a standalone `box-shadow` (they are all pure drop-shadows — do NOT touch any `box-shadow` containing `inset` or `var(--accent)`/`var(--moss)`, those are state/focus form):

| Find (exact value) | Replace with |
|--------------------|--------------|
| `0 24px 64px rgba(0, 0, 0, 0.5)` | `var(--elev-3)` |
| `0 18px 50px rgba(0, 0, 0, 0.5)` | `var(--elev-3)` |
| `0 12px 32px rgba(0, 0, 0, 0.45)` | `var(--elev-3)` |
| `0 10px 28px rgba(0, 0, 0, 0.4)` | `var(--elev-2)` |
| `0 8px 24px rgba(0, 0, 0, 0.35)` | `var(--elev-2)` |
| `0 8px 24px rgba(0, 0, 0, 0.3)` | `var(--elev-2)` |
| `0 6px 24px rgba(0, 0, 0, 0.4)` | `var(--elev-1)` |
| `0 6px 20px rgba(0, 0, 0, 0.35)` | `var(--elev-1)` |
| `0 6px 18px rgba(0, 0, 0, 0.3)` | `var(--elev-1)` |
| `0 6px 20px -6px rgba(0, 0, 0, 0.55)` | `var(--elev-1)` |

Leave directional shadows as-is (`0 -8px 24px …` at ~335, `-12px 0 40px …` at ~3162) — they are intentional edge shadows, not elevation.

- [ ] **Step 8: Add the tactile top-edge highlight to raised cards**

In `src/renderer/src/styles.css`, the `.grid-card` rule (~1276) currently has `border` + `background` but no shadow. Add elevation + edge highlight:
```css
    box-shadow: var(--elev-1), var(--edge-hi);
```
(Add as a new declaration inside `.grid-card`.)

- [ ] **Step 9: Build + verify + commit**

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx electron-vite build 2>&1 | tail -5 && node "…/scratchpad/verify-craft.js" t3 && npm test 2>&1 | tail -4
```
Read `t3-*-cockpit.png`, `t3-*-settings.png` for **all three skins** (incl. Washi light — confirm shadows are soft, not harsh black). Confirm modals/menus/cards have layered depth and the light theme still reads clean. Then:
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && git add tests/themes.test.ts src/renderer/src/themes.ts src/renderer/src/styles.css && git commit -m "feat(ui): layered elevation scale + tactile edge highlight

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Spacing scale tokens

**Files:**
- Modify: `src/renderer/src/styles.css` (`:root`)

**Interfaces:**
- Produces: `--sp-xs/sm/md/lg/xl/2xl`.

- [ ] **Step 1: Add the spacing scale to `:root`**

In `src/renderer/src/styles.css` `:root`, add:
```css
    /* Spacing scale (4px base). xs–lg formalize existing usage; xl/2xl are new breathing room. */
    --sp-xs: 4px;
    --sp-sm: 8px;
    --sp-md: 12px;
    --sp-lg: 16px;
    --sp-xl: 24px;
    --sp-2xl: 32px;
```

- [ ] **Step 2: Adopt `--sp-2xl` for modal breathing room**

In `src/renderer/src/styles.css`, the `.settings-content` rule (~2831) has `padding: 22px 26px;`. Replace with `padding: var(--sp-2xl) var(--sp-2xl);` (32px — a touch more generous, consistent).

- [ ] **Step 3: Build + verify + commit**

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx electron-vite build 2>&1 | tail -5 && node "…/scratchpad/verify-craft.js" t4 && npm test 2>&1 | tail -3
```
Read `t4-slate-modernpro-settings.png`: confirm the Settings body has slightly more even breathing room, nothing misaligned. Then:
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && git add src/renderer/src/styles.css && git commit -m "feat(ui): spacing scale tokens (--sp-*)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Unified state & motion tokens

**Files:**
- Modify: `src/renderer/src/styles.css` (`:root` + base `button` + interactive transitions)

**Interfaces:**
- Consumes: `--bg-hover` (defined here), motion tokens.
- Produces: `--ease`, `--ease-spring`, `--dur-fast`, `--dur`, `--dur-slow`, `--bg-hover`.

- [ ] **Step 1: Add motion + hover tokens to `:root`**

In `src/renderer/src/styles.css` `:root`, add:
```css
    /* Motion — standard easing + durations (all gated by prefers-reduced-motion). */
    --ease: cubic-bezier(.2,.6,.35,1);
    --ease-spring: cubic-bezier(.34,1.4,.5,1);
    --dur-fast: 120ms;
    --dur: 180ms;
    --dur-slow: 260ms;
    /* Adaptive hover wash (derives from --text: subtle light lift on dark, dark on light). */
    --bg-hover: color-mix(in srgb, var(--text) 4%, transparent);
```

- [ ] **Step 2: Standardize the base button transition + press feedback**

In `src/renderer/src/styles.css:48-58` (`button`), replace the existing `transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;` with:
```css
    transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
```
Then add a press rule immediately after the `button:hover` rule (after line ~62):
```css
button:active:not(:disabled) {
    transform: translateY(0.3px) scale(0.997);
}
```

- [ ] **Step 3: Gate the press feedback under reduced motion**

Find the existing `@media (prefers-reduced-motion: reduce)` block(s) in `src/renderer/src/styles.css` (there are several; use the first global one). Add inside it:
```css
    button:active:not(:disabled) { transform: none; }
```

- [ ] **Step 4: Build + verify + commit**

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx electron-vite build 2>&1 | tail -5 && node "…/scratchpad/verify-craft.js" t5 && npm test 2>&1 | tail -3
```
Read `t5-slate-modernpro-cockpit.png`: confirm nothing regressed (press feedback is only visible live, so this is a no-regression check). Then:
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && git add src/renderer/src/styles.css && git commit -m "feat(ui): unified motion + hover tokens with press feedback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Tabular numerals

**Files:**
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Apply tabular numerals to numeric/mono surfaces**

In `src/renderer/src/styles.css`, add a new rule (near the `.mono` / status-bar rules). Target mono text, the status bar, and the usage panel — NOT body copy:
```css
/* Tabular figures so digits align and don't jitter. */
.mono,
.statusbar,
.sb-item,
.cmd-kbd,
.usage-panel,
.grid-card-head {
    font-variant-numeric: tabular-nums;
}
```
(If any selector above does not exist in the file, drop that one line — verify each class exists via a quick grep before saving; keep only the ones that match.)

- [ ] **Step 2: Build + verify + commit**

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx electron-vite build 2>&1 | tail -5 && node "…/scratchpad/verify-craft.js" t6 && npm test 2>&1 | tail -3
```
Read `t6-slate-modernpro-cockpit.png` (status bar) + `t6-db.png`: confirm digits look aligned and nothing else shifted. Then:
```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && git add src/renderer/src/styles.css && git commit -m "feat(ui): tabular numerals on mono + status/usage surfaces

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Update DESIGN.md

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Update the typography front-matter**

In `DESIGN.md`, update the `typography` block so `heading`/`body`/`label` `fontFamily` reads `"Inter Variable", "Segoe UI", system-ui, sans-serif` and `mono` `fontFamily` reads `"Geist Mono Variable", "Cascadia Mono", Consolas, monospace`. Keep all sizes.

- [ ] **Step 2: Document the new foundation in prose**

In `DESIGN.md`, in the "Elevation & Depth" section, add a sentence that elevation is now a token scale (`--elev-1` cards · `--elev-2` menus · `--elev-3` modals` + `--edge-hi` top highlight), tuned per light/dark, and that styles still dial intensity. In the "Typography" section, note the bundled Inter + Geist Mono pair (offline, no CDN) and tabular numerals for numeric/status contexts. In a "Motion" note, record the `--ease`/`--dur-*` tokens and that all motion is `prefers-reduced-motion`-gated.

- [ ] **Step 3: Commit**

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && git add DESIGN.md && git commit -m "docs(design): document bundled fonts, elevation scale, motion tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full build: `npx electron-vite build` — clean.
- [ ] `npm test` — 23 files / 160 tests green (159 existing + the new themes test file adds 7, so expect **166**; confirm the count rose only by the new theme tests).
- [ ] Run `verify-craft.js final` and Read every screenshot across all three skins + panels; confirm the app reads more premium and calm, with no clipped/misaligned text.
- [ ] Confirm the user's skin is restored (Slate + Kinetic, rail collapsed).
- [ ] Optional: launch once manually to feel the live hover/press motion and font rendering.

## Notes on adjustable decisions (from spec review)

- **Fonts:** to switch to Geist Sans (UI) swap the Task 1 package to `@fontsource-variable/geist-sans` and `--font-ui` to `"Geist Sans Variable", …`; for JetBrains Mono swap to `@fontsource/jetbrains-mono` and `--font-mono` to `"JetBrains Mono", …`.
- **Elevation intensity:** to dial lighter, reduce the opacity figures in the Task 3 dark set (e.g. `.24→.18`, `.30→.24`, `.55→.45`).

## Deferred / incremental (in spec, intentionally not standalone tasks)

- **Per-theme `--border-soft` refinement** (spec §B "refine the hairline to ~9% contrast"): each theme's border is already hand-tuned; re-picking 7 values is subjective polish-on-polish with low return. `--border-strong` (Task 3) delivers the useful new capability. Revisit only if a specific ground reads muddy during verification.
- **Broad hover migration to `--bg-hover`**: the canonical token is introduced in Task 5 and available; existing row/menu hovers migrate to it opportunistically as those files are touched, rather than in one sweeping edit (keeps each task's diff reviewable). The concrete Task 5 win is the motion tokens + press feedback.
