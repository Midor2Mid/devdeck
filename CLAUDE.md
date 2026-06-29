# DevDeck — agent guide

DevDeck is an Electron + electron-vite + React + TypeScript desktop app (Windows-
first): a terminal-first cockpit where a **project** is the unit of context.
General preferences live in the parent `Products/CLAUDE.md` and the global config;
this file holds the DevDeck-specific things that aren't obvious from the code.

## Design / UI work

For any **UI or visual work, act as a senior product designer and follow
`DESIGN.md`** — read it first. It's in the DESIGN.md token+rationale format
(machine-readable tokens + canonical sections). Design tokens are the source of
truth: change the **token** (`src/renderer/src/themes.ts` for color themes,
`src/renderer/src/styles.css` for the `[data-style]` shape/depth styles), then let
the cascade apply it — don't hard-code colors/sizes in components. One accent;
state shown in *form* (dot/pill/stripe) as well as color.

## Verifying a change in the real app

There's no headless renderer (the app needs Electron's preload). Use the
**`run-app` skill** (`.claude/skills/run-app/`) — it launches the built app and
drives it over the DevTools Protocol to click/evaluate/screenshot. Notes:
- Run `npx electron-vite build` first; the harness loads `out/`.
- HTML5 drag-and-drop **can't** be simulated via CDP — verify drag UX manually.
- **Don't edit files under `src/` while `npm run dev` is running** — live HMR on a
  mid-edit state crashes the dev process. Stop it (or rebuild) before editing.

## Tests & build

`npm test` (vitest). Logic that's testable in isolation gets a unit test; modules
that import `electron`/native drivers (e.g. `main/db.ts`, `main/aikeys.ts`) are
tested by mocking `electron` (see `tests/aikeys.test.ts`, `tests/projects.test.ts`).

## Releasing a signed build

`npm run cert:make` (once) then `npm run package:signed` produce a self-signed
Authenticode build (personal-use; trusted only on this machine). **Avast's
Behavior Shield kills PowerShell**, which breaks signing — if a signed build fails
with PowerShell exiting 127, the durable fix is to add `powershell.exe` to Avast's
**Allowed apps** (not the scan-only Exceptions list). Releases are tagged `vX.Y.Z`
and published manually on GitHub with the signed installers attached.
