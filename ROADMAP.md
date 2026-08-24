# Roadmap — DevDeck

The vision is all-in-one. The build is sequenced into milestones so there's a usable daily-driver early, with every later panel plugging into the same workspace shell. Keep each milestone ruthlessly shippable.

**Design north star:** ease of use + Japanese **wabi-sabi** — simplicity, calm, restraint, natural/imperfect beauty, quiet space. One earthy accent, minimal chrome, an ensō brand mark. Every feature must earn its visual weight; default to removing. (See `NOTES.md` → "Design north star".)

> Direction confirmed 2026-06-27: pursue **all four** next-step tracks over time (terminal polish, Monaco editor, API depth, deeper Claude). Default shell stays PowerShell.

## Milestone 1 — Terminal + project core (the beating heart) ✅ MVP

- [x] App shell: Electron + electron-vite + React + TS, runs on Windows
- [x] Resizable layout (sidebar | main | terminal area) via `allotment`
- [x] Project sidebar: add a project (folder picker), list projects, select active project; persisted to disk
- [x] Multi-terminal: tabbed terminals via xterm.js + `@lydell/node-pty`, each spawned with `cwd` = active project
- [x] "New terminal" and "New Claude session" buttons (Claude session = pty launching `claude` in the project)
- [x] Terminals survive project switches (per-project terminal groups)

### Milestone 1.5 — terminal core polish ✅ (2026-06-27)

- [x] Split panes within a tab (binary layout tree; split right/down, close + collapse)
- [x] Pty buffer-replay: panes detach/re-attach without killing sessions (kill is explicit)
- [x] Persist + restore tabs/splits per project across restarts (`workspace.json`)
- [x] Rename tabs (double-click)
- [x] Keyboard shortcuts (new/close/split/cycle/find — all `Ctrl+Shift+…`, captured before xterm)
- [x] In-terminal search (`@xterm/addon-search`)

**Definition of done for the MVP:** I can add my real projects, switch between them with one click (no manual `cd`), and run several terminals — including parallel Claude CLI sessions — side by side, labeled. It's good enough to replace Windows Terminal for a day.

## Milestone 2 — Editor panel ✅ (2026-06-27)

- [x] File tree for the active project
- [x] Monaco editor: open, edit, save files (syntax highlighting, per-file undo)
- [x] Tabs for open files; dirty indicators
- [x] Monaco workers bundled locally (offline; no CDN) + wabi-sabi editor theme

## Milestone 3 — API client panel (Postman-lite) ✅ (2026-06-28)

- [x] Request builder: method, URL, headers, query params, body (JSON/form)
- [x] Send via main process (native `fetch`, bypasses CORS); status, timing, headers, pretty body (Monaco viewer)
- [x] Per-project request history + saved requests (collections), persisted to `settings.json`
- [x] **Beyond scope:** auth config, environments/variables, collections search + move/duplicate, **Import** (Postman / OpenAPI-Swagger / cURL → collections), cURL smart-paste into the URL bar
- [x] **Response tests/assertions** (2026-06-30, M24) — per-request checks (status/time/body/header/JSON-path) with a pass/fail Tests tab
- [x] **Request chaining** (2026-06-30) — a "Chain" subtab extracts a response value (JSON path / header / status / body regex) into a session variable later requests use as `{{name}}`; chain vars merge over the active environment, shown as removable chips. `apiChain.ts` + `chain.ts`, `tests/apiChain.test.ts`
- [x] **Export results to file** (2026-06-30) — DB grid → CSV/JSON, API response body → file, via a save-as dialog (`dialog:saveFile`). Pure serializers `exporters.ts`, `tests/exporters.test.ts`

## Agent pipelines — live UI (2026-06-30)

- [x] **Run timeline + launcher** — the run model tracks per-step status (pending/running/done/failed/skipped) + the session each step ran in; the floating PipelineBar expands into a step timeline (status dots, gate notes, jump-to-session). Pipelines launch from the new-terminal menu's PIPELINES section, not just Settings / command palette. (Editor + gates already shipped in M8/Settings.)

## Milestone 3.5 — Database panel ✅ (2026-06-27, partial)

- [x] Per-project saved connections (PostgreSQL, MySQL) with encrypted passwords (`safeStorage`)
- [x] Connect / test, list tables, run SQL (Monaco editor, Ctrl+Enter), results grid
- [x] **SQLite via WASM** (`node-sqlite3-wasm`, 2026-06-27) — no native build; reads/writes real `.db` files, file picker in the connection form
- [x] **SQL Server** (`mssql`/`tedious`, 2026-06-29) — pure-JS, no native build; the SSL toggle maps to `encrypt` with trust-server-certificate so local/dev instances work
- [x] **Query history per connection** (2026-06-29) — each successful query recorded per connection (deduped, capped 25), reloadable from a **History ▾** dropdown; persisted in `settings.json`
- [x] Packaging: `node-sqlite3-wasm` unpacked from asar in `electron-builder` config (`package.json` → `asarUnpack`) — done in M11

## Milestone 7 — Remote / mobile access ✅ (2026-06-27, terminals-first)

- [x] Multi-client pty (event bus + per-client buffer replay) so a phone can attach to live sessions
- [x] Token-guarded HTTP + WebSocket server in the main process (off by default)
- [x] Self-contained mobile web client (xterm served from node_modules): session list, attach, live output, input + quick keys, start a Claude session remotely
- [x] Settings → Remote: enable, port, token (regen), Tailscale/LAN URL + QR
- [x] Verified end-to-end headlessly (auth 401/reject, session broadcast, shell output over WS)
- Reach from anywhere: **Tailscale** (private, recommended) — bind is 0.0.0.0 but token-gated
- [x] **Push-on-attention** (2026-06-29) — mobile client title-badge + beep + best-effort OS notification when an agent flips to *attention* and you're not looking; the no-Tailscale case now warns that a plain-LAN link is unencrypted
- [x] **Constant-time token auth** (2026-06-29) — `tokenOk` (sha256 + `timingSafeEqual`) closes the `!==` timing side-channel; mobile-client `esc()` now escapes quotes (latent attribute XSS). Covered by `tests/server-guards.test.ts`
- [x] **TLS / HTTPS option** (2026-06-30) — opt-in self-signed cert (`tlscert.ts` via `selfsigned`, SANs for localhost + LAN/Tailscale IPs, cached + reused); serves https/wss so the link + token are encrypted even on plain LAN and the mobile client gets a secure context. Verified live (200 with token, 401 without, over TLS)
- [x] **Mobile coding + AI** (2026-07-16) — the web client gained a Files view
      (browse project tree, open/edit/save, confined to project roots via
      `isWithinRoots`) and an AI view (compose a prompt with tap-to-insert
      `@file` mentions, fire at any running agent). ws: projects/fs:tree/read/
      write/files. Verified live.
- [ ] Later: full **native** mobile app (the web client is now a real cockpit,
      not just terminals)

## Milestone 4 — Network debugging ✅ (2026-06-28)

- [x] Local HTTP proxy to capture requests/responses (`src/main/proxy.ts`) — loopback-only forward proxy, off by default; full HTTP capture with gzip/deflate/br body decode; HTTPS via CONNECT tunneled end-to-end (encrypted, metadata only — no MITM)
- [x] Request list + inspector (`NetworkPanel.tsx`) — live list (method/status/host/path/time/size); inspector tabs for request/response headers + bodies (JSON pretty-printed)
- [x] Filter by project / host — free-text host/path/method/status filter + "this project" toggle (captures tagged with the active project at capture time)
- [x] Start/stop toggle, persisted port (`settings.network.port`, default 8899), copy proxy address, clear; covered by `tests/proxy.test.ts`
- [ ] Later: HTTPS MITM (generated CA) to decrypt tunneled payloads; replay/edit-and-resend a captured request into the API client

> Distinct from M19's **browser** network capture (`src/main/browserNet.ts`, CDP on the embedded webview, feeds the "→ Agent" payload). M4 is the general-purpose proxy for arbitrary client traffic: set `HTTP_PROXY`/`HTTPS_PROXY` to the proxy address and watch it in the Network panel.

## Milestone 5 — Deeper Claude CLI integration ✅ (2026-06-27, core)

- [x] Session registry: all Claude sessions across projects in the sidebar, status + click-to-jump
- [x] Status without parsing output — activity (working/idle) + terminal bell (attention); visibility-aware
- [x] Tab-level status dots; attention badge
- [x] Quick-resume (`claude --continue`)
- [x] Cross-pane action: send a file's `@path` from the editor into the last-focused Claude session
- [x] **Send API response / DB result into a session** (2026-06-29) — "→ Agent" button on the API response view and DB results grid pipes the captured response / query+result into the focused agent (capped 12k chars / 100 rows)
- [x] **Rename sessions independently of tabs** (2026-06-29) — double-click a session in the sidebar for a per-session label (`termNames` override, persisted); inbox + usage dashboard use it too

## Milestone 6 — Settings hub ✅ (2026-06-27)

- [x] Left-nav modal (reference-style): Appearance, Terminal, Editor, Claude, Shortcuts, About
- [x] Persisted to `settings.json`; wired to real behavior:
  - Appearance: accent color (single wabi-sabi accent, applied to CSS vars)
  - Terminal: default shell (PowerShell / cmd / Git Bash / WSL / custom) + font family/size (live)
  - Editor: font size, tab size, word wrap, minimap
  - Claude: command, resume args, idle→attention timing
- [x] Later sections all shipped: **AI settings** → M22, Git multi-account → M15, SSH → M16, Remote → M7, MCP → M18, light theme → M10, **Proxy** → 2026-07-16

## Milestone 8 — 1DevTool-inspired depth ✅ (2026-06-27)

From studying the 1DevTool reference (video + 1devtool.com):
- [x] **Multi-agent sessions** — agent presets (Claude/Codex/Gemini/custom) with type badges; generalized from Claude-only
- [x] **Prompt composer** — rich prompt box with `@file` mentions → focused agent (Ctrl+Shift+P)
- [x] **Project groups** — collapsible named groups in the sidebar
- [x] **Project switcher** — Ctrl+K launchpad grid (search, live counts, keyboard nav)
- [x] **Markdown preview** — Edit/Split/Preview + word count
- [x] **Status bar** — git branch + change count, attention, remote, project
- [x] From reference: image-preview tabs → 2026-07-01; agent pipelines → `pipeline.ts`, embedded browser → M9, AI diff → ticket→PR loop, activity feed → M20. (Deliberately skipping **more DB engines** — PG/MySQL/SQLite/MSSQL is enough.)

## Milestone 9 — more 1DevTool-inspired features ✅ (2026-06-27)

- [x] **SQLite** via `node-sqlite3-wasm` (no native build)
- [x] **Paste cURL → parse** into an API request
- [x] **Composer drafts** persisted per project + a discoverable launcher bar
- [x] **In-app notifications** (toasts) when a background agent needs attention
- [x] **Mobile DB + HTTP** — run SQL / send HTTP requests from the phone client
- [x] **Embedded browser** panel + **Comment Mode** → click page elements, annotate, send grouped feedback to the focused agent
- [ ] Later: **AI quota display** (the rest shipped: browser screenshot/console/network capture → M14/M19, terminal Canvas → M13, Dashboard → M12)

## Milestone 10 — themes, polish & perf ✅ (2026-06-27)

- [x] **Theme system** — Sumi (dark, default), Washi (light), Zen (airy dark); picker in Settings → Appearance; applied across UI (CSS vars), terminal (xterm) and editor (Monaco). User chose mockups from generated PNGs first.
- [x] Accent customization derives `--accent-soft` as a proper tint (lighter on dark, darker on light)
- [x] **Perf:** debounced disk persistence (was writing on every composer keystroke / accent drag)
- [x] Theme-aware scrollbars
- [x] Spacing/typography theming (Zen's airiness), per-theme density — `themes.ts` COMPACT/AIRY density vars + per-theme line height

## Milestone 11 — installable app + robustness ✅ (2026-06-27)

- [x] **Packaging** via electron-builder (NSIS + portable); asar-unpack for node-pty / sqlite-wasm / xterm; ensō app icon; verified the packaged `DevDeck.exe` launches standalone
- [x] **Error boundary** (no more white-screen on a render error)
- [x] Window bounds + last-view restored across restarts
- [x] Code signing → M21 (self-signed Authenticode); auto-update → M25 (`electron-updater`, dormant until releases are public)

## Milestone 12 — snippets + dashboard layout ✅ (2026-06-27)

- [x] **Prompt snippets** — `/name` autocomplete in the composer (user-defined in Settings → Snippets)
- [x] **Dashboard grid layout** — toggle the terminal area between Tabs and a grid of all the project's terminals at once (persisted)

## Milestone 13 — Canvas layout ✅ (2026-06-27)

- [x] **Canvas** terminal layout — free-form board: drag terminal cards anywhere, pan the surface; positions persisted. Third layout alongside Tabs + Grid.

## Milestone 14 — mobile attach + browser capture ✅ (2026-06-27)

- [x] **Mobile attach** — pick a screenshot/file on the phone → saved into the project (`.devdeck/uploads/`) → path typed into the agent session
- [x] **Browser capture** — "Send to AI" now includes recent console errors/warnings + a page screenshot (saved + path referenced) alongside the element comments

## Milestone 15 — Git multi-account ✅ (2026-06-27)

- [x] **Git accounts** in Settings → Git (label, user.name, user.email, custom SSH command)
- [x] Apply an account to the active project from the **status bar** (writes the repo's local `git config` incl. `core.sshCommand`); status bar shows the current identity
- [x] **PATs (encrypted) for HTTPS push + token verification** (2026-06-30, M24) — `gitpat.ts`; cache into Git's credential manager, GitHub verify

## Milestone 16 — SSH hosts ✅ (2026-06-27)

- [x] **SSH profiles** in Settings → SSH (label, user, host, port, extra args); launch a connected terminal from the ▾ menu

## Milestone 17 — command palette + canvas zoom ✅ (2026-06-27)

- [x] **Command palette** (Ctrl+Shift+P): fuzzy access to views, layouts, themes, new agent/SSH sessions, jump-to-session, settings, project switch. Composer hotkey moved to Ctrl+Shift+I.
- [x] **Canvas zoom** (Ctrl+scroll, 40–200%) + double-click to reset view

## Milestone 18 — MCP settings + audit batch 2 ✅ (2026-06-27)

- [x] **MCP** settings section — edit the active project's `.mcp.json` (servers: command/args/env) read by Claude Code & other agents
- [x] Audit batch 2: fs path confinement to project roots, binary-file guard, terminal fit() zero-dim guard

This completes every section from the original 1DevTool reference (Appearance, Terminal, Editor, Agents, Snippets, Git, SSH, MCP, Remote, Shortcuts, About).

## Milestone 19 — network capture + API smart-paste ✅ (2026-06-28)

- [x] **Browser network capture** (CDP on the webview): comment-to-AI now includes a request summary + failed/4xx/5xx requests
- [x] **API smart-paste** — paste a cURL command into the URL bar and it auto-parses (Postman-style); replaces the separate cURL button

## Milestone 20 — activity feed + canvas connectors ✅ (2026-06-28)

- [x] **Activity feed** — ⧗ in the sidebar opens a drawer of agent events (started / needs-attention / closed) across all projects; click to jump
- [x] **Canvas connectors** — ⚯ handle to link cards; SVG lines follow pan/zoom; click a line to remove; persisted

The reference feature set is fully covered. Remaining ideas are open-ended (terminal record/replay, embedded-browser polish).

## Milestone 21 — design pass + Lacquer style ✅ (2026-06-29)

From a live-app design review against the wabi-sabi north star:
- [x] **Ensō brand mark** — a real single-stroke ensō (`Enso.tsx`) for the rail logo + sidebar wordmark, replacing the placeholder "D" and the spinner-like ring
- [x] **Empty-state ensō watermark** — a faint accent ensō behind empty panels so they read as intentional space; muted/faint text contrast lifted to WCAG AA across themes; Settings modal backdrop now dims + blurs
- [x] **Terminal toolbar declutter** — grouped into create / layout / pane clusters; secondary tools (record, recordings, worktrees, review changes) moved into a `⋯` overflow; 13 → 10 controls
- [x] **Lacquer style** — a new opt-in design style (Settings → Appearance → Style): frosted-glass surfaces, gilded gradient accent buttons, soft accent glow on active tabs / rail / ensō, deep layered shadows, plus an animated sheen sweep + breathing ensō glow (honors `prefers-reduced-motion`). Additive — existing styles and the default are unchanged.
- [x] **Local signed builds** — `npm run cert:make` + `npm run package:signed` produce a self-signed Authenticode build (personal-use) to avoid unsigned-binary AV false positives; shipped as the signed **v0.4.2** release.

## Milestone 22 — AI settings ✅ (2026-06-29)

- [x] **Settings → AI** section — per-agent **default model** (injected at spawn via the agent's model env var, e.g. `ANTHROPIC_MODEL`) and **API key**
- [x] **Encrypted key storage** (`main/aikeys.ts`) — keys encrypted at rest via `safeStorage`/DPAPI (base64 fallback), keyed by agent id; never written to `settings.json`, never sent to the renderer; decrypted in main and injected into that agent's terminal env at launch (`pty.create` env merge). Covered by `tests/aikeys.test.ts`
- [x] Billing note — a stored key flips that agent to pay-as-you-go API usage (the Agents tab already warns when one leaks in from the environment)
- [x] **Usage/activity dashboard** (2026-06-29, M23) — session activity by agent & project; live token/cost still needs per-provider APIs

## Milestone 23 — daily-driver feature batch + hardening ✅ (2026-06-29)

Shipped as **v0.5.0** (signed), plus follow-on hardening:
- [x] **Per-project task runner** — runs `package.json` scripts as sidebar chips. Script names are allowlisted (`/^[A-Za-z0-9:._-]+$/`) so a hostile repo can't inject a shell command.
- [x] **Agent triage inbox** — every session across projects, attention-first, with quick reply + jump
- [x] **Workspace presets** — save/restore a project's tab/split layout (regenerates fresh pty ids); project context menu
- [x] **AI usage/activity dashboard** — sessions launched, agent time, running-now by agent & project over today/7d/all; honest that it tracks activity, not API tokens/cost
- [x] **Pipe result → agent** — "→ Agent" on the API response & DB result views (capped)
- [x] **Remote hardening** — constant-time token auth, mobile-client quote-escaping, push-on-attention, cleartext-LAN warning
- [x] **DB query history** per connection; **rename sessions** independently of tabs

## Later / maybe (parking lot)

> Pruned 2026-06-28: command palette (M17), split terminals + layout restore (M1.5), Git multi-account (M15), SSH profiles (M16), remote/mobile (M7), MCP (M18), embedded browser (M9), light theme (M10), snippets (M12), and file-`@path`-into-session (M5) all shipped.
> Pruned 2026-06-29: the v0.5.0 four-feature batch (task runner, agent triage inbox, workspace presets, AI **usage/activity** dashboard) + pipe-result-into-session + push-on-attention + DB query history + rename-sessions all shipped (see M5/M3.5/M7 above and M23 below). What's left is genuinely unbuilt:

- **Live AI quota/cost display** — the activity dashboard (M23) tracks sessions/time, not tokens or dollars; real quota needs per-provider APIs (DevDeck only spawns the CLI, so it can't see the API)
- Cross-platform (macOS/Linux) polish
- [x] **Saved command runner per project** (2026-07-01) — arbitrary shell commands per project (Sidebar → project menu → "Saved commands…"), launched as chips beside the package.json task runner; stored in `projectCommands`
- Remote project folders over SSH (SSH terminals shipped; mounting remote folders did not)
- (cleared) — image-preview tabs shipped 2026-07-01 (editor renders png/jpg/gif/webp/svg/… as a preview via `fs:readDataUrl`)
- **Auto-update is wired but dormant** (M25) — `electron-updater` + the in-app flow ship now; it only fetches once the **repo/releases are public** (private repo has no embedded token, by design). Make releases public to activate, and upload `latest.yml` with each release.
- ~~**Coordinated Electron/deps bump**~~ **DONE 2026-08-24** — Electron 43, Vite 7, electron-vite 5, vitest 4; `npm audit` 25 → 0. The Node block had already lifted (22.23.2 on this machine) and four doc claims still said otherwise. See Maintenance/security.

## Milestone 24 — Git PATs · API tests · remote TLS ✅ (2026-06-30)

- [x] **Encrypted Git PATs** (M15 close-out) — per-account tokens encrypted at rest (`gitpat.ts`, DPAPI), "Cache for HTTPS push" via `git credential approve`, GitHub "Verify". `tests/gitpat.test.ts`
- [x] **API response tests/assertions** — status/time/body/header/JSON-path checks per request; pass/fail Tests tab + summary. Pure engine `apiTests.ts`, `tests/apiTests.test.ts`
- [x] **Remote TLS** (M7 close-out) — opt-in self-signed HTTPS/WSS (`tlscert.ts`)

## Milestone 25 — per-terminal shells · auto-update ✅ (2026-06-30)

- [x] **Per-terminal shell override** — the new-terminal menu's SHELLS section opens a terminal with a chosen shell (PowerShell/cmd/Git Bash/WSL/custom) regardless of the global default; stored per terminal (`termShells`, persisted), `resolveShell(kind?)`. Verified live (cmd.exe banner in an override terminal). Closes the parking-lot per-terminal-shell item.
- [x] **Auto-update** — `electron-updater` + GitHub publish provider; Settings → About shows the real version + Check-for-updates; available/ready raises an actionable toast (Download → Restart & install). `update.ts` + `app:version`/`update:*` IPC. **Dormant until releases are public** (private repo, no embedded token).
- [x] **Per-project env vars → terminals** (2026-06-30) — Sidebar → project menu → "Environment variables…"; merged into every terminal/agent session's env for that project, encrypted at rest (`projectenv.ts`), injected in the main `pty:create` handler. `tests/projectenv.test.ts`

## Milestone 26 — modern look & motion ✅ (2026-07-01)

A "more modern / creative / future" pass, all opt-in (calm default unchanged):
- [x] **Animated rail** — the icon rail glides between collapsed/expanded; labels fade+slide, the toggle chevron sweeps › ↔ ‹.
- [x] **Global motion layer** — modals pop, backdrops fade, the drawer slides, menus pop; buttons/chips get press feedback. Pure-additive; `prefers-reduced-motion` disables it.
- [x] **Aurora Glass** — theme (cool-indigo) + style (frosted glass, gradient accent, soft glow).
- [x] **Neo Holographic** — theme (cyan/violet near-black) + style (dot grid, luminous edges, neon active, pulse).
- [x] **Kinetic Minimal** — theme-agnostic style: spring-lift hovers + an active indicator that springs in.

## Maintenance / security

- **Electron security hardening** (2026-07-01) — audited `src/main`/`src/preload` against the vendored **electron-best-practices** skill. Fixed: `sandbox: true` (third pillar restored), strict **CSP** on file:// content (no unsafe-eval; blob: only for Monaco workers; scoped so the `<webview>` browser is untouched), **deny-all** permission/check handlers, and `web-contents-created` popup/navigation guards. Verified live. Already-good: contextIsolation, nodeIntegration off, no raw `ipcRenderer`, path-guarded IPC, protocol-gated `shell.openExternal`, ASAR integrity + signing. Remaining: the Electron CVE bump (below, Node-blocked).

- **Coordinated dependency bump** — **SHIPPED 2026-08-24.** `npm audit` is now **0** (was 25: 2 critical, 19 high). Electron 33 -> 43.4.1, Vite 5 -> 7.3.6, electron-vite 3 -> 5, vitest 2 -> 4, @vitejs/plugin-react 4 -> 5.2, electron-builder 25 -> 26.15.3, then `npm audit fix` (no `--force`) for the in-range remainder. Verified: typecheck clean, 985 tests, `npm run build` clean, and `npm run verify:terminal` **15/15** driving the built app, including a positive check that a shell is printing. **Correction:** the first pass claimed 14/14 as proof that the pty module loads. It was not - every check read the DOM or app state, and the only one touching terminal contents was negative ("no escape sequence reached the shell"), which a blank screen passes. Both terminals were blank, because the default shell is powershell and this environment cannot spawn it. With `cmd` seeded a shell prints, the harness gained a positive assertion, and the packaged artifact was checked the same way (opens on Electron 43.4.1, spawns a real pty from its asar-unpacked module). The conclusion held; the evidence for it had to be earned twice. **Packaging: two blockers, both PowerShell, both identified.** Builder 26 routes its npm invocation through `powershell.exe` by design (`nodeModulesCollector.js:324`, avoiding `.cmd` shims after CVE-2024-27980), so its "node module collector" crash was never a builder-26 bug: `"packageManager": "traversal"` selects a collector that walks node_modules directly and passes it. The second is the code-signing cert lookup, avoidable only with `signAndEditExecutable: false`, which also drops the icon and version resources. With both, `package:dir` completes and the artifact runs. Neither workaround is committed - traversal misreports optional dependencies as missing, and shipping an exe without its resources to satisfy a headless check is the wrong trade. In a shell where PowerShell works, no workaround is needed; if the collector still crashes there, pin `electron-builder@^25.1.8` (its 12 advisories are build-time only, since it never ships). **Root cause of the PowerShell wall, found 2026-08-24 and NOT a property of this machine's Windows:** `powershell.exe` dies at startup with `0xC0000409` / exception data `0xa` = `__fastfail(FAST_FAIL_GUARD_ICALL_CHECK_FAILURE)`, i.e. Control Flow Guard rejecting an indirect call. The crash report (`%ProgramData%\Microsoft\Windows\WER\ReportArchive\AppCrash_powershell.exe_*\Report.wer`) shows one non-Windows module loaded, `C:\Program Files\Avast Software\Avast\ArPotEx64.dll` (Avast 26.7), and death at 21 modules - before the CLR. So this is an Avast incompatibility, not a property of this machine. **RESOLVED the same day: Avast was updated, PowerShell runs, and `npm run package:dir` then succeeded on the FIRST try with committed config and no workarounds** - npm collection, asar integrity, and signtool signing with `CN=DevDeck Dev` (including the pty's bundled `OpenConsole.exe`), exit 0, followed by `verify:packaged` 4/4 against that artifact. So neither `packageManager: "traversal"` nor `signAndEditExecutable: false` was ever needed for anything except working around the Avast bug, and neither is committed. Packaging on Electron 43 + electron-builder 26 is verified end to end. Original triage, kept for the record:
  - **Shipped to users:** only **Electron** (≤39.8.4, ~11 high — UAF / ASAR-integrity / protocol-handler issues, many macOS-specific). Fix is Electron 41, **gated on Node 22.11 → ≥22.12** (the reason Electron 33 is pinned — see Decisions log).
  - **Dev/build-only (never shipped):** esbuild/vite/vitest (moderate) and the electron-builder → `tar`/`node-gyp` chain (high + the 1 critical) run only at dev/package time.
  - **Plan:** one coordinated bump — Node LTS → Electron latest → Vite / electron-builder — clears the shipped Electron CVEs and most of the rest. **Do not** `npm audit fix --force` (it forces breaking Electron 41 on Node 22.11, plus Vite 6 + electron-builder 26). **Followed as written**, and the no-force rule held: plain `npm audit fix` cleared the last four in-range advisories after the majors were chosen by hand.
  - For the record: `mssql`/`tedious` (M3.5 SQL Server) added **zero** advisories.

### Artifact size: measured, and `npm dedupe` is not the lever (2026-08-24)

The packaging log's `duplicate dependency references` list (react/react-dom, the
`@azure/*` and `@peculiar/asn1-*` trees) looks like waste and is not: those are
version-IDENTICAL packages referenced from several places in the tree, which is
hoisting bookkeeping, not duplicated bytes. `npm dedupe` was run to test that:

| | before | after |
|---|---|---|
| `node_modules` | 725 MB | 725 MB |
| packages | 470 | 470 |
| `release/win-unpacked` | 544 MB | 544 MB |
| `app.asar` | 178 MB | 178 MB |

Zero change on every measure, and the warning still prints. All it did was collapse
`@types/node` 22.20.0/22.20.1 to one copy and drop a nested dev-only `ci-info`.
Kept, since it is a real if tiny tidy, but do not reach for it to shrink the app.

Where the 178 MB actually is, measured against `dependencies`:
**`monaco-editor` 98 MB**, `@xterm/xterm` 7 MB, `react-dom` 5 MB, everything else
under 2 MB, plus 26 MB of built app code in `out/`. Monaco is 55 percent of the
payload on its own, and it ships every language grammar - the build log lists
`abap`, `elixir`, `postiats`, `freemarker2` and dozens more as separate chunks.
**DONE the same day, and the bigger half was not the subset.** Two changes:

- **Language subset.** `monaco-setup` imports `editor.api` plus exactly the 4 rich
  services and 16 basic languages this app can request, instead of the package entry
  that pulls all 83. Main renderer chunk 8,089 kB -> 6,141 kB, `out/` 26 -> 23 MB.
- **Monaco was packed TWICE.** Vite bundles it into `out/renderer`, and
  electron-builder also packed the whole `node_modules` copy as a production
  dependency: 1,927 files, every grammar, never resolved at runtime. Moving
  `monaco-editor` and `@monaco-editor/react` to devDependencies took **app.asar from
  178 MB to 82 MB** and win-unpacked 544 -> 447 MB, with monaco package files in the
  asar going 1,927 -> 0. The bundled code still ships as app chunks, all four workers
  included.

So the subset was worth ~2 MB of bundle and the double-packing was worth ~96 MB.

**That audit is now done for all 20 production dependencies.** Eleven more were
renderer-only and packed for nothing (react, react-dom, allotment, marked, dompurify,
qrcode, zustand, both @xterm addons, both @fontsource-variable families): app.asar
82 -> 70 MB, win-unpacked 447 -> 435 MB. Cumulative 178 -> 70 MB, a 61 percent cut.
Nine dependencies remain and each is imported by `src/main`, which electron-vite
externalizes rather than bundles: the native pty, four database drivers, `ws`,
`selfsigned`, `electron-updater`.

**`@xterm/xterm` stayed, and that is the lesson worth keeping.**
`src/main/server.ts:89#xtermAsset` calls `require.resolve("@xterm/xterm")` at RUNTIME
to serve `xterm.js` and `xterm.css` to the mobile web client. There is no import
statement, so a grep for imports classifies it as renderer-only and moving it would
have shipped a broken remote terminal, silently, with every test green. A looser grep
for the bare package name is what caught it - and that same pass flagged `marked` as
used in main, which turned out to be the word "bookmarked". Read the hits; do not
trust the count.

The risk this creates is guarded: `tests/monacoLanguages.test.ts` fails if an
extension is added to `LANG` without bundling its language, which would otherwise
degrade that file type to plaintext with no error anywhere.

## Decisions log

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-26 | Electron + electron-vite + React + TS | Best-in-class terminal libs (xterm.js, pty), easy to add Monaco + HTTP client; ship fast on Windows. |
| 2026-06-26 | `@lydell/node-pty` instead of `node-pty` | Ships prebuilt binaries → no MSVC C++ toolchain needed (user's machine lacks the compiler). Removes the #1 Windows setup risk. |
| 2026-06-26 | Sequence "all-in-one" into milestones; terminal/project core first | User chose the all-in-one vision; honored in architecture, but the terminal core must be excellent before layering editor/API/network or it's all lipstick. |
| 2026-06-26 | `allotment` for layout | Lightweight resizable split panes; defer a full docking lib (dockview/rc-dock) until layout needs grow. |
| 2026-06-27 | Pinned Electron 33 + Vite 5 (not latest 42 / 7) | Electron 42's installer (`@electron/get@5`) is ESM-only and needs Node >=22.12; machine runs 22.11. Electron 33 + Vite 5 support Node 22.11 cleanly. Revisit after a Node LTS bump. **SUPERSEDED 2026-08-24: node is 22.23.2, pin removed, now Electron 43 + Vite 7.** |
| 2026-08-24 | Vite 7, not the 8 that `npm audit` suggests | `electron-vite@5` peers on `vite ^5 \|\| ^6 \|\| ^7`. Vite 8 would need electron-vite to move first, and 7 is already out of the advisory's range (`<=6.4.2`), so it clears the CVE without an unsupported combination. `@vitejs/plugin-react@5.2.0` is the one version spanning both, which is why plugin-react stops at 5. |
| 2026-08-24 | Kept `electron-builder@26`; its collector crash was Avast, and packaging now passes | Builder 25 carries 12 advisories (1 critical) in its own tree; 26 clears them, and none of them ever ship, since builder is a devDependency. Packaging fails **here** on a `powershell.exe` cert lookup that cannot run in the agent environment at all - not on anything version-specific. One `npm run package:dir` in a working shell settles it; pin 25 if builder 26's node-module collector still crashes there. |
| 2026-06-27 | Verified `@lydell/node-pty` loads under Electron's ABI | Headless Electron smoke test spawned a shell with no rebuild/compiler — confirms the prebuilt-binary bet before building UI on it. |
| 2026-06-27 | Pty sessions own a replay buffer; panes don't kill on unmount | Lets a pane detach/re-attach (splits, tab/project switches) without losing the session — main keeps the pty + ~256 KB tail, replayed to the new xterm. Kill is explicit only. |
| 2026-06-27 | Split layout = binary tree, terminal-mgmt keys are `Ctrl+Shift+…` | Tree keeps split/close/collapse simple and serializable for persistence. `Ctrl+Shift` combos (captured before xterm) avoid clobbering shell keys like Ctrl+C/Ctrl+W. |
| 2026-06-27 | DB panel ships Postgres + MySQL first; SQLite deferred | `pg`/`mysql2` are pure-JS (no compiler); `better-sqlite3` is native and won't build without MSVC. SQLite will use a WASM driver later to stay compiler-free. |
| 2026-06-27 | DB passwords encrypted at rest via Electron `safeStorage` (DPAPI) | Avoid plaintext credentials on disk; passwords are never sent back to the renderer (only referenced by connection id). |
| 2026-06-27 | Claude status from activity + bell, not output parsing | Coupling to Claude CLI's text output is fragile (NOTES risk). Output-activity (working/idle) and the bell char `\x07` (attention) are format-independent and intentional signals. Visibility-aware so viewing a session clears attention and buffer-replay doesn't false-trigger. |
| 2026-06-27 | Mobile access = terminals-first + Tailscale; pty made multi-client | A remote terminal is RCE surface, so: off by default, token required, prefer Tailscale (no public exposure). Pty refactored to an event bus + per-client buffer replay so phone + desktop attach to the same sessions. Session metadata stays in the renderer and is synced to the server. |
