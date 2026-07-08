# Changelog

## Unreleased

- **File-ownership / conflict map** - Mission Control gains an "In-flight changes"
  section showing which agent is changing which files (across their worktrees), and
  flags a file two agents in the same project both touched as a **conflict** (a
  coming merge collision). Click an owner to jump to that session.
- **Task board** - a per-project kanban (**Todo · Doing · Review · Done**) as a new
  **Tasks** view (Ctrl+2). Create task cards (or paste a checklist), **dispatch** one
  to an agent in its own git worktree (toggle), and the card auto-moves to **Review**
  when that agent finishes a turn; jump to the session, open its diff, or move it on.
- **Token & cost dashboard** - the AI usage panel now shows real token counts and
  **estimated USD cost** (total, by model, by project, by day), parsed from Claude
  Code's local transcripts (`~/.claude/projects/**.jsonl`) - no provider API needed.
- **Mission Control refinements** - tiles sort **attention-first**, show
  **time-since-last-output**, **expand** to read an agent's recent output inline,
  and flag **stalled** agents (working but silent past a threshold).
- **Notifications hub** - a Settings section to get a **desktop notification** and/or
  **sound** when an agent needs attention (click the notification to jump to it).
- **Editor snippets** - insert a saved snippet at the editor cursor (previously
  snippets were composer-only).

## 0.6.0 - 2026-07-08

- **Mission Control - a supervision-first home.** The new **default view**
  reflects how work has changed: you spend your day *following* AI agents, not
  hand-editing code. It shows every live agent across *all* your projects as a
  tile (status + a live peek of its latest output), a cross-project **review
  queue** of repos with uncommitted AI changes (open the diff or fire the
  role-panel lenses), and a **SYSTEM** strip (Docker containers + listening dev
  ports). The **Editor is demoted** from a co-equal view to a tool you drop into,
  and deck agent-keys gained the same live output peek.
- **Console Deck shell** - the biggest layout change since launch. The left icon
  rail and resizable sidebar are gone; navigation moves to a slim **topbar**
  (brand · active-project switcher · view breadcrumb · command pill) and a bottom
  **Console Deck** - a live control surface where your agent sessions are "keys"
  grouped by project (status dot, rename, drag-to-agent, attention), alongside a
  view switcher, a tool cluster, and the git/branch/identity status folded in. The
  main panel is now full-width. Project management (add, group, reorder, presets,
  new-group) moved into the upgraded **Ctrl+K** switcher. Reskins across all
  themes & styles; keyboard: **Ctrl+1…6** switch view, **Ctrl+Tab** cycle sessions.
- **Fire one prompt at many agents** - the prompt composer gains a target selector
  (agent sessions grouped by project, with All / This-project / Idle presets) so a
  single prompt fans out to every chosen session at once; a confirm guards larger
  broadcasts.
- **Cross-project search** (**Ctrl+Shift+F**) - search file contents across *all*
  your projects at once (`git grep`, fixed-string, case-insensitive); results are
  grouped by project and clicking one opens the file at its line in the editor.
- **.NET build / test with clickable errors** (**Ctrl+Shift+B**) - run
  `dotnet build`/`test` for the active project and get MSBuild diagnostics as a
  clickable list that jumps to `file:line`; handles no-project and missing-SDK.
- **Role-panel review** (**Ctrl+Shift+R**) - fan the current changes out to a panel
  of agent reviewers, one per lens (correctness / security / .NET / performance /
  tests), laid out in the grid so each review is read side by side.

## 0.5.11 - 2026-07-07

- **Refined visual craft (every theme & style)** - a global design-token pass that
  makes the whole app feel more premium while staying calm and legible: a bundled
  **Inter + Geist Mono** type pair (shipped offline, no download), a refined type
  scale, a layered **elevation** system (soft shadows on cards, menus and modals,
  tuned per light/dark), unified motion timing with a subtle button-press response,
  and **tabular numerals** so counts, durations and status digits line up. It
  re-binds every theme and style with no layout changes; your terminal font is
  untouched.
- **UI polish** - the primary **+ Claude** action is now a filled accent button; a
  keyboard **focus ring** works in every style and the Settings theme/style pickers
  are keyboard-reachable; a single terminal now fills the cockpit instead of a small
  card; the command-palette hint shows the correct **Ctrl+Shift+P**; Settings shows
  all seven themes (Aurora/Neo were cut off); and inline `...`/edit glyphs are now
  crisp icons.
- **Performance** - the status bar throttles its git polling and pauses while the
  window is hidden; mobile session sync only runs when the remote server is enabled.

## 0.5.10 - 2026-07-01

- **Fix** - eliminated a cursor hand/arrow flicker caused by hover-lift transforms
  in the newer styles.

## 0.5.9 - 2026-07-01

- **Modern look & motion** - an animated icon rail and a **global motion layer**
  (floating surfaces ease/scale in, interactions give press feedback; all disabled
  under `prefers-reduced-motion`), plus three new opt-in skins: **Aurora Glass**,
  **Neo Holographic**, and **Kinetic Minimal**. DESIGN.md synced.

## 0.5.8 - 2026-07-01

- **Image-preview editor tabs** - open images in the editor as preview tabs.
- **Expandable icon rail** - the rail expands to show icon + label.
- **Per-project saved commands** - a saved command runner scoped to each project.

## 0.5.7 - 2026-06-30

- **Agent pipeline live UI** - a per-step run timeline (status, gate notes,
  jump-to-session) plus a launcher in the new-terminal menu.

## 0.5.6 - 2026-06-30

- **Export to file** - export Database grids and API responses to **CSV / JSON**.

## 0.5.5 - 2026-06-30

- **API request chaining** - extract response values into session variables
  (`{{name}}`) for use in later requests.

## 0.5.4 - 2026-06-30

- **Per-project environment variables** - injected into terminals and agent
  sessions, encrypted at rest.

## 0.5.3 - 2026-06-30

- **Per-terminal shell override** - choose the shell per terminal.
- **Auto-update** - via electron-updater + GitHub releases (dormant until releases
  are public).

## 0.5.2 - 2026-06-30

- **Encrypted Git PATs** - stored encrypted, for HTTPS push.
- **API response tests/assertions** - assert on captured responses.
- **Opt-in remote TLS** - self-signed HTTPS/WSS for the remote server.

## 0.5.1 - 2026-06-29

- **Remote security hardening** - constant-time token auth, mobile-client
  quote-escaping, and a task-runner allowlist.
- **Workflow** - push-on-attention notifications, pipe a result into an agent,
  Database query history, and renameable sessions.

## 0.5.0 - 2026-06-29

- **Task runner** - run saved project commands/tasks.
- **Agent triage inbox** - every session, attention-first, with quick reply.
- **Workspace presets** - saved workspace layouts.
- **AI usage dashboard** - session activity by agent & project.

## 0.4.8 - 2026-06-29

- **Network → API** - the Network inspector has a **→ API** button that loads the
  selected captured request (method, URL, headers, body) into the API client to
  replay or edit. Disabled for tunneled HTTPS captures.
- **DESIGN.md** rewritten in Google's DESIGN.md token+rationale format (front-matter
  design tokens + canonical sections), and a repo **CLAUDE.md** added that points
  agents at it for UI work. (Docs only.)

## 0.4.7 - 2026-06-29

- **Right-click context menus** - on projects (Open / Move to group / Remove),
  terminal tabs (Rename / Split right / Split down / Close), and API requests &
  collections (Open / Duplicate / Move to / Delete). Cursor-positioned, dismissed
  by clicking away.
- **Undo toasts** - deleting an API request or collection now removes it instantly
  and shows a "Deleted X · Undo" toast (restoring it at its original spot) instead
  of a blocking confirm dialog.

## 0.4.6 - 2026-06-29

- **Cross-panel drag** - drag an editor file, or a database table, onto a running
  agent session in the sidebar to feed it to that agent: a file inserts its
  `@path`, a table inserts `SELECT * FROM <table>`, and the view jumps to that
  terminal. Generalizes the old "send @path to the last agent" button into a
  gesture that can target any specific session.

## 0.4.5 - 2026-06-29

- **Modern look (opt-in)** - a new **Graphite** theme (cool near-black neutrals
  with a vivid indigo accent) and **Modern+** style (crisp radii, hairline borders
  with soft elevation, vivid filled accent buttons, focus rings, snappy
  micro-interactions). Settings → Appearance; the warm wabi-sabi default is
  unchanged.
- **Drag & drop** - reorder projects (drag onto another project, or onto a group
  header to move it); drop an OS folder onto the project list to add it as a
  project; reorder API requests and collections; and **drag terminal tabs to
  reorder, or drop one onto a pane to split** (VS Code-style 4-way drop zones).
  Terminal sessions persist across a tab move - no restarts.

## 0.4.4 - 2026-06-29

- **SQL Server support** - a fourth database engine (Database panel → New
  connection → **SQL Server**) via the pure-JS `mssql`/`tedious` driver (no
  native build, like `pg`/`mysql2`). Connect / test / list tables / run SQL
  like the others; the **SSL** toggle maps to `encrypt` with
  trust-server-certificate so local/dev instances work. Default port 1433.
  Also usable from the mobile/remote DB client.

## 0.4.3 - 2026-06-29

- **AI settings** - new Settings → AI section: per-agent **default model** (injected
  at launch via the agent's model env var, e.g. `ANTHROPIC_MODEL`) and **API key**.
  Keys are encrypted at rest (DPAPI/`safeStorage`) and injected into the agent's
  terminal env at spawn - never written to `settings.json` or sent back to the UI.
  A stored key flips that agent to pay-as-you-go API billing. (Usage/quota display
  is deferred - it needs per-provider APIs.)

## 0.4.2 - 2026-06-29

- **Lacquer style** - a new opt-in design style (Settings → Appearance → Style):
  frosted-glass surfaces, gilded gradient accent buttons, a soft accent glow on
  active tabs / rail / the ensō, and deep layered shadows. Animated - a periodic
  light-sheen sweep across accent buttons and a slow breathing glow on the ensō
  (both honor `prefers-reduced-motion`). Purely additive; existing styles and the
  default are unchanged.
- **Local signed builds** - `npm run cert:make` then `npm run package:signed`
  produce an Authenticode-signed build using a self-signed cert trusted on your
  machine, to avoid unsigned-binary antivirus / SmartScreen false positives.
  (Personal-use only; distribution needs a purchased OV/EV cert.)

## 0.4.1 - 2026-06-29

- **Wabi-sabi design pass** - a real ensō brand mark (rail logo + sidebar)
  replacing the placeholder; a faint ensō watermark behind empty states so they
  read as intentional space; lifted muted/faint text contrast across all themes
  (the faint tier was failing WCAG AA); the Settings modal now dims + blurs its
  backdrop for focus.
- **Terminal toolbar declutter** - regrouped into create / layout / pane clusters,
  with the secondary tools (record, recordings, worktrees, review changes) moved
  into a `⋯` overflow menu and the redundant composer button dropped. 13 → 10.

## 0.4.0 - 2026-06-28

- **Network debugging panel (Milestone 4)** - a local loopback HTTP forward proxy
  (off by default) that captures traffic for inspection: full HTTP with
  gzip/deflate/br body decoding; HTTPS tunneled via CONNECT (metadata only - no
  MITM). New **Network** view with a live request list, a headers/body inspector
  (JSON pretty-printed), and host / method / status / project filters. Point a
  client's `HTTP_PROXY` / `HTTPS_PROXY` at the proxy address to capture it.

## 0.3.4 - 2026-06-28

- **Tooltips everywhere** - swept the rest of the icon/affordance buttons across
  all modals and panels onto the custom `data-tip` tooltip (status-bar items show
  theirs upward so they don't clip).
- **Plain hyphens** - replaced em-dashes ("—") with regular hyphens ("-") in all
  UI text and labels, per preference.

## 0.3.3 — 2026-06-28

- **Tooltips** — hover any icon button (the rail, terminal toolbar, sidebar,
  status bar) and a styled tooltip explains what it does after a brief pause.
  Hidden by default; rendered as a fixed-position chip so it never clips against
  the rail or panes. Opt-in via `data-tip` — richer and more legible than the
  old native title tooltips.

## 0.3.2 — 2026-06-28

- **AI on the diff** — Review changes now has AI actions: **Review / Explain /
  Commit msg / PR description** feed the working diff to an agent (in the right
  repo or worktree) and ask for exactly that. Turns the review surface active.
- **Open PR** — from Review changes, push the branch and open a pull request.
  On **Azure DevOps** it creates the PR via the API (using your Work PAT) and
  opens it; on GitHub/other it pushes and opens the host's create-PR page.
  Detects the remote automatically, with a target-branch + title + description
  composer (draft the description with the AI button).
- Completes the loop: **Jira/Azure ticket → worktree → agent → review → PR →
  release board**, all in one window.

## 0.3.1 — 2026-06-28

- **Slim icon-rail layout** — primary navigation moved to a 58px icon rail on the
  far left: the five views (terminal / editor / API / database / browser) switch
  from the rail with an active accent indicator, and the cross-cutting tools
  (work, activity, standup, release, shortcuts, settings) sit at its foot. The
  sidebar slimmed to projects + sessions, and the top bar is now a breadcrumb +
  a **⌘K command pill**. Completes the modernization.

## 0.3.0 — 2026-06-28

Modernization pass — DevDeck looks like a contemporary product now.

- **Line-icon system** — a new inline-SVG icon set (Lucide-derived) replaces the
  Unicode glyphs across the sidebar, terminal toolbar, and status bar. One weight,
  one grid, currentColor; no icon font / dependency (proxy-safe). This is the
  single biggest "modern" upgrade.
- **Slate theme** — a cool slate-blue color theme that keeps the warm amber accent
  (warm-on-cool reads modern). Joins Sumi / Washi / Zen.
- **Modern Pro style** — a clean contemporary design style: 8px radii, subtle
  elevation, snappy transitions, a focus ring, tight type. Pairs with Slate.
- **New default look** — fresh installs open in **Slate + Modern Pro**. Existing
  setups can switch in Settings → Appearance (your six other styles + three other
  themes remain). 7 styles × 4 themes now available.
- Next: a slim icon-rail layout + top command bar (structural; coming separately).

## 0.2.6 — 2026-06-28

- **Phosphor CRT style** — the sixth and final design style: monospace chrome,
  a scanline wash with gentle flicker, and phosphor glow on accents. Set a green
  accent on a dark theme for the classic green-screen look. The design-style set
  is now complete: **Wabi-sabi, Modern Minimal, Neon, Flat Vector, Bauhaus,
  Phosphor CRT** — 6 styles × 3 color themes = 18 combinations.

## 0.2.5 — 2026-06-28

- **Bauhaus style** — a fifth design style: hard square corners (0 radius), heavy
  2px frames, filled uppercase accent blocks, square dots/pills, and a signature
  **hard offset shadow** (solid accent block, no blur) behind floating surfaces.
  Bold, structural, poster-like. Five styles now ship: Wabi-sabi, Modern Minimal,
  Neon, Flat Vector, Bauhaus — each combinable with any color theme.

## 0.2.4 — 2026-06-28

- **Flat Vector style** — a fourth design style: big rounded corners, **filled
  accent buttons**, fully-rounded pill badges, and soft card elevation that lifts
  surfaces off the background. Friendly and product-y; reads brightest on the
  Washi (light) theme. Four styles now ship: Wabi-sabi, Modern Minimal, Neon,
  Flat Vector — each combinable with any of the three color themes.

## 0.2.3 — 2026-06-28

- **Neon style** — a third design style: glassy blurred panels, glowing accents
  (active tab, accent buttons, focused inputs/pane), glowing status dots, and a
  subtle scanline wash. The glow is driven by your **accent color**, so it works
  with any theme — set a cyan accent on a dark theme for the classic neon look.
- **Modern Minimal, sharpened** — pushed further so it reads as a distinct style:
  tighter radii (modal 12→6px, controls →4px), denser padding, near-flat depth
  (crisp 1px edge instead of a soft glow), and tighter UI type.

## 0.2.2 — 2026-06-28

- **Design styles** — a new **Style** picker in Settings → Appearance, independent
  of the color theme. Ships **Wabi-sabi** (default — warm, soft, generous) and
  **Modern Minimal** (crisp small radii, flat surfaces, tighter spacing & snappier
  interactions — Linear/Vercel-style). Style × color theme combine freely (e.g.
  "Modern Minimal + Zen dark"); the choice persists. See `DESIGN.md`.

## 0.2.1 — 2026-06-28

- **Standup / worklog generator** — the ▤ sidebar button (or command palette)
  collects the commits you authored across every project in a time window
  (Today / 24h / 3 days / 7 days), plus uncommitted work and the session's agent
  activity, and renders an editable markdown standup: **Done / In progress /
  Next**. Tweak it and **Copy markdown** to paste into Jira or your standup.
  Commits are filtered to your git email per repo.

## 0.2.0 — 2026-06-28

- **Release / promotion board** — model a project's deploy stages (Dev → UAT →
  PROD), each mapped to a git ref, and see at a glance what commit sits in each
  and **how many commits are waiting to be promoted** to the next. Click a gap
  to see the exact commits, tick a **pre-flight checklist**, then either **send
  the promote commands to a terminal**, copy them, or **tag the release**.
  DevDeck never pushes for you — promotion stays explicit. Open via the
  ⬆ release button in the status bar or the command palette; stages + checklist
  are editable and stored per project in `.devdeck/release.json`.
- **Proxy support** — work-item calls now route through a corporate proxy
  (HTTPS via CONNECT tunnel, HTTP via absolute-form), configured in the Work
  drawer or auto-detected from `HTTPS_PROXY`/`HTTP_PROXY` env vars. Pairs with
  the existing "ignore TLS errors" toggle for locked-down corporate networks.

## 0.1.9 — 2026-06-28

- **Work panel (Jira + Azure DevOps)** — the ◷ sidebar button (or command
  palette) opens a drawer listing your assigned work items. **Start work** on a
  ticket launches an agent session (optionally in a fresh worktree) pre-seeded
  with the ticket brief — title, type, status, link, description — and asks it to
  investigate and propose a plan before changing code. Your day starts from the
  ticket, not a blank terminal. **Open ↗** jumps to the item in your browser.
  - Connect via the drawer's ⚙: Jira (base URL + email + API token + JQL) and/or
    Azure DevOps (org URL + project + PAT + WIQL). Tokens are encrypted on-device
    (safeStorage) and never read back into the UI. All calls happen in main (no
    CORS), with an **"ignore TLS errors"** option for corporate MITM proxies.

## 0.1.8 — 2026-06-28

- **Worktree-per-agent** — spin up an agent (or shell) in its own git worktree
  so parallel sessions on one repo don't collide. Settings via the ⑂ toolbar
  button / command palette: name a branch, pick an agent, and it creates a
  worktree in a sibling `<project>.worktrees/` folder and launches the session
  pinned to it. List and remove worktrees from the same place.
- **Unified change review** — the ✓ toolbar button (or "Review changes" in the
  palette, or a worktree's "review") opens a diff viewer for any project or
  worktree: per-file colorized diffs, **stage / unstage / discard**, and a
  **commit-all** with a message. Review what the agents wrote before it lands.
- Per-terminal working directory is now persisted (so worktree sessions survive
  restarts).

## 0.1.7 — 2026-06-28

- **Pipeline file-triggers** — auto-run a pipeline when files matching a glob
  change in a project. Configure in Settings → Pipelines → File triggers
  (project, glob like `src/**/*.cs`, target pipeline, debounce). Triggers are
  **off by default**; a fired trigger switches to the project and runs the
  pipeline, and won't start while another run is in progress. Watching ignores
  `node_modules`, `.git`, build output, etc. Fires are logged to the activity feed.
- Also lands in-progress API **request collections** (Postman-style saved
  requests sidebar) alongside the existing environments work.

## 0.1.6 — 2026-06-28

- **Per-step success gates** — a pipeline step can now require its agent's output
  to pass a check before advancing: "output contains", "does NOT contain", or
  "matches /regex/". On failure it retries up to N times, then either stops the
  run or continues. The runner bar shows gate status live (✓ passed / retrying /
  ✗ failed). The starter pipeline's Verify step ships with a gate that re-runs
  until the test output shows no failures.
- **API environments** — define named environments (dev / UAT / PROD) of
  `{{variable}}` values and switch the active one from the API client. URL,
  headers, and body interpolate `{{tokens}}`; unresolved tokens are flagged.

## 0.1.5 — 2026-06-28

- **Agent pipelines** — define an ordered sequence of prompts (each routed to an
  agent) that runs hands-free: each step is sent, waits for the agent to settle,
  then the next fires. Same-agent steps reuse one session so context carries
  across them; tick "fresh" to force a new session. Edit pipelines in
  Settings → Pipelines (title, agent, prompt, reorder); run from there or the
  command palette. A floating runner bar shows step/progress with a Stop control;
  closing a pane mid-run is handled, and runs are logged to the activity feed.
  Ships with a starter "Investigate → Fix → Verify" pipeline.

## 0.1.4 — 2026-06-28

- **Terminal record & replay** — hit ⏺ in the terminal toolbar to record a
  session's output (with timing); ▷ opens the Recordings player to replay it
  with play/pause, restart, and 1×–8× speed. Recordings are saved per project
  under `.devdeck/recordings/` and survive restarts. A recording is auto-saved
  if you close the pane mid-record. (Also reachable from the command palette;
  recorded events show in the activity feed.)

## 0.1.3 — 2026-06-28

- **Browser network capture** — Comment Mode's "Send to AI" now includes captured
  network requests (summary + failed/4xx/5xx) alongside comments, console, and screenshot.
- **API smart-paste** — paste a cURL command into the URL bar and it auto-parses.
- **Activity feed** (⧗) — agent events (started / needs-attention / closed) across all
  projects; click to jump.
- **Canvas connectors** — link terminal cards with ⚯; lines follow pan/zoom; persisted.

## 0.1.2 — 2026-06-28

- **Command palette** (`Ctrl+Shift+P`): fuzzy-run any action — views, layouts, themes,
  new agent/SSH sessions, jump-to-session, settings. (Composer moved to `Ctrl+Shift+I`.)
- **Canvas zoom** (`Ctrl+scroll`, 40–200%; double-click to reset).
- **MCP settings** — manage the active project's `.mcp.json` (command/args/env).
- **Hardening (audit batch 2):** filesystem access confined to open project roots,
  editor refuses binary files, terminal fit() zero-dimension guard.
- Tests up to 34 (added fs-confinement + MCP round-trip).

## 0.1.1 — 2026-06-27 (hardened)

Security & robustness pass from a multi-agent audit (17 confirmed findings):

- **Security:** sanitize markdown preview (renderer XSS); SSRF guard on remote HTTP
  relay; remote DB access is read-only; WebSocket payload cap; remote server binds
  to the Tailscale interface when present instead of all-interfaces.
- **Robustness:** flush pending writes on quit (no more lost drafts/settings);
  atomic config writes (no corruption on crash); PTY replay no longer breaks
  mid-escape; canvas positions cleaned up; sqlite probe handle closed.
- **Tests:** first Vitest suite (26 tests) — layout engine, cURL parser, theme
  math, SSH builder, security guards.

## 0.1.0 — 2026-06-27 (first installable build)

First packaged release. Terminal-first dev cockpit:

- Multi-agent terminals (Claude/Codex/Gemini/custom) with Tabs / Grid / Canvas
  layouts, splits, persistence, session registry, resume, send-to-agent.
- Monaco editor (+ markdown Edit/Split/Preview), API client (+ cURL import),
  database (PostgreSQL/MySQL/SQLite), embedded browser with comment-to-AI.
- Prompt composer (@file + /snippet), project groups + Ctrl+K switcher, three
  wabi-sabi themes, status bar with git identity, Git accounts, SSH hosts.
- Mobile remote (terminals + DB + HTTP + file attach) over a token-guarded server.
- Installable via electron-builder (NSIS + portable).
