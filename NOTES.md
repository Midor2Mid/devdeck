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

## Ideas

- Project switch should restore the exact terminal layout I had (which tabs, which were Claude sessions).
- A "new Claude session" button is the single highest-value affordance — make it one keystroke.
- Eventually: pipe an API response or a file path straight into a running Claude session.

## Things learned

- User's machine has Node 22.11, npm 10.9, git, Python 3.13. VS 2019 Community is installed but the **MSVC C++ compiler binaries are not** → native `node-pty` build would fail. Using `@lydell/node-pty` (prebuilt) sidesteps this entirely.
