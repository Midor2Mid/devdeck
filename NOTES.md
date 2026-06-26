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
- (A reference video was also shared; couldn't extract frames — ask me what it showed if it matters for design.)

## Ideas

- Project switch should restore the exact terminal layout I had (which tabs, which were Claude sessions).
- A "new Claude session" button is the single highest-value affordance — make it one keystroke.
- Eventually: pipe an API response or a file path straight into a running Claude session.

## Things learned

- User's machine has Node 22.11, npm 10.9, git, Python 3.13. VS 2019 Community is installed but the **MSVC C++ compiler binaries are not** → native `node-pty` build would fail. Using `@lydell/node-pty` (prebuilt) sidesteps this entirely.
