# Changelog

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
