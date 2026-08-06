# Notes — DevDeck

Running log of user feedback, ideas, and observations. Capture user quotes **verbatim** — their exact words are gold.

## User feedback

> "I would like to develop a tool for myself, it could be a combination of IDE, Postman, network debugging, because for now most of my works are on terminal using claude cli so I hope this tool can also allow me to easily switch between projects and have multiple terminal active at the same time" — me, 2026-06-26 (kickoff)

Kickoff decisions (via questions):
- **MVP core:** chose *all-in-one shell* (terminals + editor + API client + network inspect). → Honored in architecture; delivery sequenced via ROADMAP milestones, terminal/project core first.
- **Claude CLI:** chose *deeper integration*. → Start with UI affordances over a plain pty (Milestone 1); real output-parsing/session-awareness in Milestone 5 to avoid coupling to CLI format early.
- **Stack:** chose *Electron*.

> "hope these can also give you some ideas about feature that we can add in, but our ultimate goals are still easily to use and follow japanese style (wabi-sabi, simplicity,...)" — me, 2026-06-27

After Milestone 1 shipped: chose to pursue *all four* next-step directions over time (terminal polish, Monaco editor, API depth, deeper Claude). Keep PowerShell as the default shell.

> "If possible I would like to connect the app with my mobile device so that I can use it from mobile anywhere, anytime" — me, 2026-06-27

Mobile scoping (via questions): chose **terminals-first** mobile client + **Tailscale** for remote reach (over LAN-only or public tunnel). → Shipped Milestone 7: token-guarded server, mobile web terminal, off by default. Security stance: remote terminal = RCE surface, so token required + prefer Tailscale (no public exposure).

### Design north star — wabi-sabi
The ultimate goal is **ease of use + Japanese wabi-sabi aesthetics**: simplicity, calm, restraint, natural/imperfect beauty, generous quiet space. Concretely for the UI:
- Palette: warm sumi-ink darks + kinari (unbleached) off-white text; **one** restrained earthy accent (clay/amber), moss + clay only for session dots. No vibrant blues/purples, no neon.
- Minimal chrome: quiet dividers over hard borders, generous padding, few colors, no decoration for its own sake.
- Brand mark: an **ensō** (open, slightly imperfect ring) instead of a loud logo.
- Every feature must justify its visual weight; default to removing, not adding.
- (Applied 2026-06-27: re-skinned the whole app from Catppuccin → "Sumi & Kinari" wabi-sabi theme.)

### Feature inspiration from reference screenshot (a polished Git/dev client's Settings)
The shared screenshot shows the cockpit shape I'm picturing — a clean Settings hub with these sections (parking-lot features, see ROADMAP "Later"):
- **Git** — multi-account, per-account PAT (GitHub/GitLab), custom SSH command, token verification ("this token belongs to …"), linked/pinned projects per account.
- **SSH**, **Remote**, **MCP** (Model Context Protocol servers), **AI**, **Browser**, **IDE**, **File Tree**, **Shortcuts**, **Notifications**, **Appearance/Layout**, **License**, **Dependencies**, **About**.
- Takeaway: a real **Settings hub** + **per-project Git identity** are high-value later additions; the all-in-one vision clearly includes Git account management, SSH, and MCP.
> **⚠️ The three 1DevTool sections below are stale (v1.26, 2026-06-27).** Re-researched
> 2026-07-27 against v0.7.6: DevDeck now matches or exceeds 16 of ~20 advertised
> features — *Agent Pipelines* and *QR pairing* are listed below as aspirational but
> shipped weeks ago. Read `docs/research/2026-07-27-1devtool-gap-analysis.md` first;
> it has the current scorecard, the 3 real gaps, and 5 go-past-them ideas.

### Reference VIDEO (extracted frames 2026-06-27) — "1DevTool v1.26"
The shared screen recording is a real, polished app (**"1DevTool"**) that is almost exactly DevDeck's vision. Confirmed/new features observed:
- **Project groups** — projects nested under named groups (Mobile Apps, 1DevTool, StoicSoft, 1MarketingTool, 1AI Vault), each project a colored dot. Searchable.
- **Split sidebar** — PROJECTS (top) + FILES tree (bottom) for the active project, each with its own search.
- **Markdown editor** with Edit / Split / **Preview** modes + live word-count, reading-time, heading-count. Renders headings nicely.
- **File tabs incl. image previews** (png tabs alongside .md/.ts).
- **Multi-agent CLI sessions** — not just Claude: runs **OpenAI Codex** too. Terminal sub-sidebar lists sessions with a **type badge** (CLAUDE / CUSTOM / BASH). So "session = any agent CLI with a label".
- **Agent Input composer** — a rich prompt box (not raw terminal typing): formatting toolbar, **@mention** (files/projects), **/command**, a mode selector ("Lowkey"), token count, Clear all, Send. Inserts e.g. `+ai-memory-saver` references. This is the standout — a far richer version of our "send to Claude".
- **Rich status bar** — git branch + "Review N changes", Remote count, Runtime, Docker, Ports, Env, CPU/mem %, theme, zoom, Settings, version.
- **Top workspace tabs** — Templates, Tasks, Notes, Draw (extra modes).
- **Editor-area AI bar** — AI, Session, Prompts, Memory, Skills, AI Diff.
- **Layout presets**, **Commands** palette, right **activity bar**, **Deploy** button.

→ Wabi-sabi lens: adopt the *depth* (AI-CLI-first: multi-agent sessions + prompt composer + project groups) but resist the *surface sprawl* (Notes/Tasks/Draw/activity-bar) unless each earns its place. Frames saved during session in scratchpad.

### Reference: 1DevTool dev's feature notes (2026-06-27)
The maker shared shipped features + reasoning (Vietnamese). Highlights for DevDeck:
- **Prompt composer lesson (important):** users didn't discover the Agent Input feature → made it prominent/centered. Also it **saves drafts per project** (compose, switch project, come back → draft still there). *Lesson: "if the UX doesn't make users realize a feature exists, it's wasted."* → We should make our composer (Ctrl+Shift+P) more discoverable AND persist its draft per project. Quick, high-value.
- **In-app notifications** when an agent finishes (we already track attention status → just surface a toast).
- **AI quota shown in the terminal** when a session is active (no app-switching to check). Hard for Claude (no easy quota API) — defer.
- **Remote upgrades:** query DB + call HTTP request from the phone; better mobile prompt typing. (We have mobile terminals; DB/HTTP are next.)
- **Resume detects external sessions** (Ghostty/iTerm2) and imports them. Platform-specific — defer.
- **Terminal "Note"** scratchpad to gather/compose before sending one prompt (overlaps with composer drafts).
- **Embedded browser + "Comment Mode"**: click any element on a page to leave a comment, persists across pages, then **send all feedback to AI** grouped by page with console logs + network + screenshot. Big, novel; the browser is a real panel in 1DevTool.
- **Image annotation editor** before sending to AI; paste image / drag file into prompt.
- **Terminal layout modes:** Dashboard / List / **Canvas** (spatial board of all terminals across projects).
- Pricing: $29 one-time (confirms category value).

### More 1DevTool notes (2026-06-27, batch 2)
> "Bạn có thể thêm hình screenshot hoặc đính kèm file trên điện thoại ở Remote Control. Ngoài ra cũng có thể dùng splash và skill /"
- **Mobile attach:** add screenshots / attach files from the phone in Remote Control. (Complex in our model — terminals can't ingest images directly; would need to upload to desktop, save into the project, and reference the path / or rely on agent image support. Parked with plan.)
- **Slash `/` commands / skills** in the prompt composer (symmetric to our `@file` mentions). Ambiguous whether it means agent-passthrough slash-commands or user-defined snippets — lean toward **user-defined prompt snippets** inserted by `/name` (generic, reusable). Next batch.

## Dogfooding — v0.1.0 (started 2026-06-27)

First installable build shipped (`release/DevDeck Setup 0.1.0.exe` + portable `DevDeck 0.1.0.exe`). **Now stop adding features and use it for real work** — let friction drive the backlog (success metric #1: becomes the daily driver for ≥1 week).

**Watch for (jot friction below as it happens):**
- Does it replace Windows Terminal for a full day? What makes you reach for the old tool instead?
- Multi-agent legibility: can you track ≥3 Claude/Codex sessions without losing which is which?
- Project switch < 5s, zero manual `cd`?
- Any crashes / white screens (error boundary should catch UI ones), pty hangs, or layout glitches?
- Light theme (Washi) contrast issues in real use?
- Packaged-only bugs (asar/native paths) that don't show in `npm run dev`?

**Friction log:**
- 2026-06-27 — Automated engine dogfood (headless under real Electron) all green: atomic persistence, pty spawn+I/O, sqlite CRUD via db.ts, git identity round-trip, remote WS attach+stream, **SSRF guard blocks**, **remote DB read-only enforced**, bad-token rejected. + 26 unit tests pass. Engine is solid; UI "feel" still needs human use.
- 2026-07-28 — **First real human-use friction.** Four things, verbatim:
  > "the terminal created also too monochrome … Claude display with just black and
  > white text, which make it not good to follow up"

  Root cause was **`NO_COLOR`**, not the theme and not xterm. It's the no-color.org
  convention and chalk checks it *before* TERM/COLORTERM/isTTY, so one inherited
  `NO_COLOR=1` flattens every ink/chalk TUI (Claude Code, Codex, Gemini). DevDeck
  forwarded its whole parent env to the pty, so **whatever launched the app decided
  whether agents got colour**. Also found: node-pty's `name` is ignored by conpty,
  so on Windows `TERM` was whatever the launcher exported — `xterm-256color` from Git
  Bash, nothing from the Start Menu. Both now pinned in `terminalEnv()`. Confirmed
  fixed by the user. *Lesson: a colour probe must check `NO_COLOR` first — my first
  probe checked TERM/COLORTERM/FORCE_COLOR/isTTY and missed the one variable that
  overrides all four, so the first fix I shipped was aimed at the wrong thing.*

  > "I think the Write a prompt for Claude is not worth it, since if going like that
  > we force the user to use Claude … in future I would like to add other AIs"

  The composer was never Claude-locked — it fans out to any selected agent sessions.
  The *label* named `agents[0]`, which read as a lock. Now names live sessions or
  their count. *Lesson: a label that misdescribes a feature is as costly as not
  having it — the user was ready to delete a capability they already had.*

  > "how to see the template of Claude start template commands?"

  They exist (Settings → Agents → "Add recommended") but nothing at the launch
  point hints at them. Also revealed there's **no per-agent startup-command field**
  at all — the preset's `command` *is* the startup command, so "templates" means the
  recommended presets. Discoverability still unfixed.

  > "what do you think about options for user to select when user click +Claude?"

  Became the split-button caret (worktree + branch) and made the deck `+` ask which
  agent instead of firing `agents[0]`. Kept the plain click instant — one keystroke
  to a new session is a stated priority.

  Also surfaced, unprompted: remote was **enabled and bound to `0.0.0.0` over plain
  HTTP** on this machine (no Tailscale), and the panel reported *available* addresses
  rather than the bound one — so installing Tailscale later would show a private
  `100.x` address while still listening on every interface. Fixed to report the truth.
- 2026-08-07 — **Used the app instead of testing it, and the difference mattered.**
  Everything below came from opening the real window and looking, after a batch of
  changes had already passed typecheck, 461 unit tests and a build.

  **The overlap warning was confidently wrong.** Having just wired the "who's
  already in this working tree" warning into the launch caret, opening it showed:
  *"claude 1, claude 2, claude 3, claude 5, claude 6 are already editing this
  project (docs/managements/SPCSG_Jira_Reconciliation_2026-07-29.md)"* — while the
  status bar two inches below said **1 change**. Five agents named as editors of a
  file none of them may have touched; it could equally have been my own edit.

  Cause: `git changes(cwd)` answers "what is dirty in this directory", never
  "which pty changed it". Every session sharing a cwd therefore reports the tree's
  *whole* dirty list, so `holdersOf` marks all of them as holding all of it. The
  wording then claimed an attribution the data cannot support. It had shipped that
  way for `dispatchBoardTask`; surfacing it in the caret — a far more frequent
  surface — is what made it visible. *Lesson: the tests encoded the bug. One even
  asserted "are already editing" for two agents sharing a file, which is exactly
  the false claim. A test written from the implementation will happily bless it —
  it took a number on screen contradicting another number on screen to notice.*
  Now: names the sessions running there (true), attributes changes to the tree
  (true), claims nothing about who made them, and switches to a count past two
  sessions.

  **Then it was still too heavy.** Truthful but five lines of red, because one repo
  path wrapped. With a habitually dirty tree that block appears on every launch and
  becomes wallpaper — the wabi-sabi rule failing in the small. Now shows file names
  rather than paths; the count and the name are what inform the decision.

  **Enter didn't add a task.** The board's input is a `textarea` so a pasted
  checklist keeps its line breaks, and it committed on Ctrl+Enter — labelled, but
  the common case is a one-line card and Enter is what a one-line field is expected
  to do. Enter now adds, Shift+Enter types a newline, Ctrl+Enter still works, and
  checklist paste is untouched because pasting never uses the key.

  **The starter-commands button is invisible to me.** It only renders when
  `missingRecommended()` is non-empty, and this config has all of them — so the fix
  for "how do I see the template start commands?" cannot be seen by anyone whose
  config is already complete. Correct behaviour, but worth knowing it only helps
  someone who deleted presets or upgraded across a defaults change.
- _(add human-use friction here as you hit it)_

### Hardening audit (2026-06-27) — multi-agent workflow, 17 confirmed findings
Ran a parallel audit (6 subsystem reviewers + adversarial verify). Fixed in batch 1:
- **Markdown XSS** in privileged renderer → DOMPurify-sanitize marked output.
- **Remote server**: SSRF guard (block local/private/link-local/metadata), remote DB **read-only** (reject non-SELECT), WS **maxPayload** cap, and **bind to Tailscale IP** when present (not 0.0.0.0/LAN).
- **Data loss on quit** → flush debounced store+settings on `beforeunload`.
- **Non-atomic JSON writes** → `atomicWrite` (temp + rename) for all state stores.
- PTY buffer trims to a line break (no mid-escape replay); canvasPos cleaned on close; sqlite test handle closed in finally.
- Added Vitest + 26 tests (layout, curl, themes, ssh, SSRF/read-only guards).

Remaining (batch 2, lower severity): token-in-URL (WS limitation), fs binary read/write + path confinement, DPAPI/b64 password fallback when safeStorage unavailable, FitAddon zero-dim guard, splitActive termInit for shell. See task output wr8a4sogg for full detail.

## Ideas

- Project switch should restore the exact terminal layout I had (which tabs, which were Claude sessions).
- A "new Claude session" button is the single highest-value affordance — make it one keystroke.
- Eventually: pipe an API response or a file path straight into a running Claude session.

## Things learned

- User's machine has Node 22.11, npm 10.9, git, Python 3.13. VS 2019 Community is installed but the **MSVC C++ compiler binaries are not** → native `node-pty` build would fail. Using `@lydell/node-pty` (prebuilt) sidesteps this entirely.
