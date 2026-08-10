# Changelog

## 0.7.12 - 2026-08-11

Two things that were a trip to the terminal, and one design rule the app wasn't
keeping.

- **Pull latest without leaving the deck.** The status bar told you the branch and
  what was uncommitted, but getting the branch current still meant a terminal. A
  pull button now sits beside the branch, and carries the behind-count itself
  rather than adding a chip: neutral when there's nothing to fetch, accented with
  a number once you're behind. It only appears when the branch has an upstream. It
  is `--ff-only` on purpose — a one-click action should never invent a merge commit
  or leave a conflicted tree, so a diverged branch fails with git's own message and
  the resolution stays a conscious call in the terminal. The behind-count comes off
  the porcelain status the deck was already polling, so watching for it costs no
  extra process.
- **Closing another session takes one click.** Tidying up used to mean pulling a
  row into focus and then closing the focused pane — two steps, and it moved the
  thing you were watching. Rail rows now take a × on hover, a middle-click, or
  Delete when focused. No confirmation, matching every other single-pane close; the
  row vanishing is the feedback. At rest no row shows a ×, so the list weighs the
  same as before.
- **Fix: emoji out of the chrome.** DESIGN.md forbids them and three had slipped
  in — the welcome card's 👋 becomes the ensō (the brand mark belongs on the one
  card that introduces the app, and it draws in currentColor so it re-themes), the
  browser panel's 💬 becomes the pencil its tooltip already promised, and the empty
  work panel loses its party popper. Left alone deliberately: the 🚀 in the
  project-icon placeholder, which is user content teaching you an emoji is allowed
  there, and typographic marks like ✓ ✗ ❯ ⚑, which are text carrying meaning rather
  than pictographs.
- **Fix: rail rows stopped wrapping.** Reserving width for that hidden × is what
  keeps a row from shifting under the cursor, but it narrowed the row enough that a
  long project name pushed the session name onto a second line. The session name is
  what you scan for, so it never wraps now and the project name ellipsizes instead.

## 0.7.11 - 2026-08-07

Three things from the backlog, and one bug that only turned up by opening the
window rather than running the tests.

- **The starter commands are offered where you'd ask for them.** "How do I see the
  template start commands?" had an answer — Settings → Startup commands → *Add
  recommended* — but nothing at the launch screen said so. The empty-terminal
  launcher now offers the ones you're missing directly. It only appears when some
  are actually missing, so a complete config never sees it.
- **The worktree option tells you who is already in the tree.** It used to say only
  that a worktree "can't collide with an agent already working in this project" —
  advice, where it could give you the facts. It now names the sessions running
  there and what the tree has uncommitted, so ticking the box is a decision instead
  of a precaution. Still not a dialog: the plain click stays one keystroke.
- **Task cards and pipeline runs show what they cost.** DevDeck already read real
  token spend from Claude Code's transcripts, but only ever sliced it by model,
  project and day — never "what did *this* cost". A dispatched card now carries its
  estimated spend, and a running pipeline shows the total so far. Read it as an
  attribution rather than a receipt: everything that project's agents did while the
  card was open counts, because transcripts are keyed by project, not by terminal.
  Sub-cent work shows as `<$0.01`, never `$0.00`.
- **Fix: that same warning was naming agents that hadn't touched anything.** It
  claimed "claude 1, claude 2, claude 3, claude 5, claude 6 are already editing
  this project (one-file.md)" while the status bar said *1 change* — because git can
  say what changed in a directory but never which session changed it, so every
  session sharing a tree was credited with all of it. It now names who is working
  there, says what the tree has uncommitted, and claims nothing about who did it.
- **Enter adds a task again.** The board's box is multi-line so a pasted checklist
  keeps its rows, but it only committed on Ctrl+Enter, and almost every card is one
  line. Enter adds, Shift+Enter makes a newline, Ctrl+Enter still works, and pasting
  a checklist is unchanged.

## 0.7.10 - 2026-08-07

The MCP surface gets the two tools it was missing, plus a design pass that started
as a competitor teardown and ended up auditing DevDeck's own UI against its own
written rules — where the rules lost, twice.

- **An agent can replay your saved API requests.** `devdeck_http_requests` lists
  what you've saved in the API panel and `devdeck_http_send` replays one, returning
  the real status, timing and body — so an agent checks what an endpoint actually
  returns instead of guessing from the code. It can only send a request **you
  already saved**: it picks one by id and cannot supply a URL of its own, so there
  is no way to aim it at a host you didn't choose. Params, headers and auth
  (bearer/basic/api-key) are applied as the panel would; bodies are capped at
  20,000 characters. It's the one MCP tool that isn't read-only, because an HTTP
  request is whatever the endpoint makes of it — the tool description tells the
  agent not to replay anything that mutates state unasked.
- **An agent can read the browser panel's console and network log.**
  `devdeck_console_logs` returns console messages, uncaught exceptions, CSP and
  deprecation warnings, and recent requests with their status codes — so "the page
  is broken, here's the console" no longer needs you to copy anything out of
  DevTools. With one page open you don't even pass an id. Console capture is new:
  the panel only ever recorded network activity before this.
- Console messages are rendered the way DevTools renders them, so `%c`-styled logs
  (Electron's own security warnings, most logging libraries) no longer arrive with
  their CSS spliced into the message text, and `%s`/`%d` placeholders are filled in.
  One caveat worth knowing: capture starts when the Browser panel attaches, so
  anything a page logged before that isn't in the buffer.

- **Active tabs are marked, not just tinted.** A terminal or editor tab showed it
  was active by shifting its background, which reads as *hover*, not *selected* —
  and DESIGN.md had been claiming for months that tabs carried an accent stripe
  they didn't have. They now carry a 2px accent underline. Three of the twelve
  design styles were already doing this; the default just never got it.
- **Segmented controls mark the active segment with weight, not only colour.**
  Edit/Split/Preview, the AI toggle, and the .NET panel modes tint the active
  segment *and* set it bold. The tint alone can't do the job: on Washi, 18% of the
  accent over its own ground measures 1.2:1, and even a solid accent fill only
  reaches 2.9:1 — under the 3:1 floor for a UI element. On a light theme a tint can
  never be the marker, so the weight is what actually carries it.
- **Quotes in the markdown preview no longer italicise the whole block.** Italic
  made `*emphasis*` inside a quote render exactly like the quote around it, so the
  emphasis vanished. The quote is now marked by its bar and muted text only.
- **Washi's dividers hold up where they're load-bearing.** The "strong border"
  value is derived by mixing the border toward the text colour, which gains far
  less contrast on a light ground than a dark one — 2.51:1 on Washi against ~3.7:1
  everywhere else. Washi now states its own value, at 3.05:1.
- **Two accent-filled buttons had labels you couldn't read on Washi** — the
  overview segments and the usage window picker used the page background as their
  text colour instead of the on-accent token, giving cream-on-amber at 3.2:1. Now
  5.13:1.
- **Fix: the Kinetic style's tab animation works again.** Kinetic springs its own
  underline in, and the new base underline painted instantly at full width behind
  it — so the animation was invisible and at rest you saw a doubled line. Kinetic
  drops the base rule.

Also, for anyone (or anything) doing UI work here: `DESIGN.md` now documents the
active-state grammar and badge tiers, **including a list of the places the code
doesn't follow them** rather than asserting a compliance it doesn't have. There's a
new `devdeck-design` skill carrying the token-first workflow and a review checklist
— including the two `themes.ts` traps that make theme changes look like no-ops.

## 0.7.9 - 2026-07-28

Everything here came out of real use, not the roadmap.

- **Agent output has colour again.** Claude Code, Codex and Gemini were rendering
  flat monochrome, which makes a long agent session genuinely hard to follow. The
  cause was `NO_COLOR`: chalk checks it *before* `TERM`, `COLORTERM` or the TTY
  test, so a single inherited `NO_COLOR=1` silences colour in every ink/chalk CLI.
  DevDeck passed its whole parent environment to the terminal, so whatever launched
  the app decided whether your agents got colour. It's now stripped for terminal
  children — it's a convention for pipes and CI, not for a terminal you're reading.
  `TERM` is pinned too: conpty ignores node-pty's terminal name, so on Windows the
  child previously inherited `xterm-256color` from Git Bash or *nothing* from the
  Start Menu. Colour no longer depends on how you started DevDeck.
- **Launch options on the agent button.** `+ <agent>` gains a caret; the button
  itself still launches instantly (one keystroke to a new session, unchanged). The
  caret opens options for that one launch — currently **a git worktree with a
  branch name**, so you can act on the "another agent is already editing this
  project" warning at the moment it matters instead of going to a separate modal.
- **The deck's per-project `+` asks which agent** instead of firing your first
  configured one. It names no agent, so launching a paid CLI off it was a guess.
- **The prompt composer no longer says "for Claude".** It always fanned out to
  whichever agent sessions you picked; the label just named your first preset,
  implying a lock that was never there. It now names the live session, or the count
  ("Write a prompt · 3 agent sessions…").
- **Remote panel tells you whether the phone will work off your Wi-Fi.** It now
  reports the interface actually bound — "Tailscale only (reachable anywhere on
  your tailnet)" vs "this Wi-Fi only (same network required)" — rather than what
  addresses merely exist. That difference was previously left for you to infer, and
  bringing Tailscale up *after* starting the server would show a private `100.x`
  address while the server was still listening on every interface, including the
  LAN. That case is now flagged with a **Restart remote** button.
- **Auto-update would have rejected every installer.** `package:signed` signed the
  exes *after* electron-builder had hashed them, so `latest.yml` described the
  unsigned bytes — ~7 KB and a different sha512 from what shipped. electron-builder
  now signs during the build, artifact names lost their spaces (GitHub rewrites
  those, 404ing the updater), stale artifacts are cleared first, and the script
  fails loudly if the manifest and the installer disagree. **If you published
  0.7.7 or 0.7.8, re-publish from this build.**

## 0.7.8 - 2026-07-27

- **Fix: the MCP bearer token is no longer written into `.mcp.json`** (security).
  0.7.7 inlined it as `"Authorization": "Bearer <token>"` — but `.mcp.json` is the
  file Claude Code expects you to commit ("designed to be checked into version
  control"), so the first commit after registering would have put a live token in
  git history. The entry now references `${DEVDECK_MCP_TOKEN}`, which Claude Code
  expands from the environment, and DevDeck sets that var in the agent sessions it
  starts. `.mcp.json` is safe to commit and share — a teammate supplies their own
  token. Re-running **Add to this project** rewrites an inlined token from 0.7.7.
  **If you registered on 0.7.7 and committed, treat that token as leaked:** rotate
  it in Settings → MCP.

## 0.7.7 - 2026-07-27

- **DevDeck is an MCP server** - agent CLIs can now *pull* context instead of you
  pasting it in. Turn it on in **Settings → MCP** and "Add to this project", and
  Claude Code gets `devdeck_projects`, `devdeck_db_connections`,
  `devdeck_db_tables` and `devdeck_db_query` - so an agent reads your project's
  live database itself, mid-task, rather than reasoning over a table you copied
  ten minutes ago. Registered in `.mcp.json` over HTTP (hosted by DevDeck, so the
  tools run in the process that already holds the connection pools).
  **Read-only and local:** writes are refused, credentials are never sent to the
  agent, results are row-capped, it binds to `127.0.0.1` only behind a bearer
  token, and it's off by default.
- **Pipeline gates can check ground truth** - two new gate modes, **Command
  succeeds (exit 0)** and **Command fails (non-zero exit)**, decide from the
  machine instead of from the agent's prose. "All tests pass now" satisfies a
  text gate whether or not it's true; `npm test` cannot be talked into passing.
  The second mode is how you assert a negative - `git diff --quiet` exits
  non-zero exactly when the tree is dirty, i.e. when the agent really did change
  something. Commands run in the project directory, are killed at their timeout,
  and a check that never launched fails rather than passing.
- **Hand a diff to a different agent** - the AI actions in Review changes gain a
  **with \<agent\>** picker, so "have Codex review what Claude just wrote" is one
  click. When the reviewer isn't the agent that last worked in the project, the
  prompt says so and tells it not to assume the changes are correct - an agent
  re-reading its own diff tends to defend it.
- **Conflict warning at dispatch, not after** - dispatching a task without a
  worktree now names any agent already editing that project ("claude 1 is
  already editing this project (store.ts, gate.ts)") and points at the worktree
  toggle. The in-flight conflict map only tells you once both agents have
  written; this is the same question asked while it's still avoidable.
- **`npm run typecheck`** - added, and now at zero errors. `electron-vite` builds
  without typechecking, so nothing had been running `tsc`; a stale error in the
  editor panel had been sitting there long enough that any new error was just
  more noise. Fixed by typing the editor ref from Monaco's own signature.

## 0.7.6 - 2026-07-27

- **One-click Resume** - the primary agent's launch button gains a quieter paired
  **↻ Resume**, so continuing your last session (`claude --continue`) is a peer of
  starting a fresh one instead of being buried in the agent dropdown. Only shown
  for agents that define resume args.
- **Terminal pane no longer sticks to the previous project** - after switching
  projects the pane kept rendering, and typing into, the *previous* project's
  shell, so anything typed after a switch went to the wrong session. Its
  xterm/pty attach effect is mount-once and the pane wasn't keyed on its terminal
  id, so React reused the instance without re-binding.
- **Commit honours staging** - the review modal offers per-file stage/unstage, but
  committing ran `git add -A` first, so a file you deliberately *unstaged* was
  re-staged and committed anyway. Staging anything now scopes the commit
  ("Commit staged (N)"); with nothing staged, commit-everything is unchanged.
- **Multi-statement SQL no longer silently truncated** - a pasted SQLite script
  (`CREATE …; INSERT …;`) ran only its first statement and dropped the rest with
  no error.
- **Pre-flight on the two clicks that spend money** - dispatching a board task
  fired instantly without naming which agent it used, created a worktree, and
  pasted the card title into the CLI; running a pipeline starts an agent session
  per step in whatever project is active. Both now confirm first. File triggers
  are already opted into, so they bypass it.
- **Permission-bypassing agents are marked** - `--dangerously-skip-permissions`
  (and `--yolo` / `--full-auto` / `--auto-approve`) were one-click cards styled as
  peers of a normal launch; they now carry a danger stripe and say what they skip.
  Matched on the command line, so custom agents are flagged too.
- **Ctrl+K no longer leaks into the shell** - app-reserved chords (Ctrl+K,
  Ctrl+1..9, Ctrl+Tab, Ctrl+Shift+P/F/B/R/J/K) were still encoded by xterm, so
  opening the switcher left a stray `^K` on the command line.
- **Ctrl+Shift+I works everywhere** - the prompt-composer chord was dead outside
  Terminal view while the launcher, shortcuts overlay and palette all advertised
  it; it now switches view first.
- **Palette finds the buried panels** - AI usage, the agents inbox and the
  pipeline builder had no palette entries (they existed only as unlabelled deck
  icons); rows now also show their shortcut.
- **Smaller legibility fixes** - the deck's "N changes" chip opens the diff;
  Mission's SYSTEM row folds ephemeral ports into "+N more" instead of ~24 chips;
  the usage dashboard's unexplained "other" bucket is now "outside DevDeck
  projects"; Run explains itself when `package.json` won't parse instead of
  claiming no runnable project type; HTTP errors surface the real
  `ECONNREFUSED`/`ENOTFOUND` instead of a bare "fetch failed"; agent-menu rows are
  keyboard-reachable buttons; a saved request no longer repeats its method chip;
  a newly added DB connection is selected.

## 0.7.5 - 2026-07-26

- **Inline Approve / Deny for agent permission prompts** - answer an agent that's
  waiting on a permission question straight from its Overview tile, without
  jumping into the session.
- **Curated recommended startup commands** - an "Add recommended" action that
  merges any of the bundled agent/command presets your config is missing.

## 0.7.3 - 2026-07-26

Consolidated entry: this release accumulated ~60 commits over two weeks and was
tagged without a changelog pass, so it is grouped by theme rather than split into
the untagged 0.7.1/0.7.2 that never shipped.

- **Extend Agent hub** - browse, preview, install and remove agent **skills and
  subagents** from a catalog (or a URL), scoped per project or per user, with
  full read-before-install and path-traversal guards.
- **Per-project visual identity** - a colored monogram tile per project (with
  optional emoji/color overrides), shown in the switcher and topbar.
- **Console deck declutter + cross-project Overview** - icon-first views and a
  leaner status bar; a new Overview terminal layout (focus+rail / grouped grid)
  spanning projects, with session rename and collapsible, persisted groups.
- **Agent supervision** - an explicit **"waiting for you"** state when an agent
  finishes a turn, a jump-to-waiting hotkey (Ctrl+Shift+J), per-tier notification
  sounds, and **one-click resume of agent sessions after a restart**.
- **Pipelines: branching, delays and manual checkpoints** - conditional routing
  between steps, delay nodes, and checkpoints that pause for you.
- **One-click Run** - a topbar Run for Node/.NET/Go projects, plus **Watch** in
  the .NET panel (build/test/watch now complete).
- **Startup commands** - per-agent and per-terminal startup commands.
- **Corporate proxy support** - proxy configuration applied to terminals and
  child processes.
- **Mobile client gains coding + AI** - not just terminals.
- **Session recordings export** - save a session as an asciinema `.cast`.
- **Composer image input** - drop or paste an image into the prompt.
- **Switcher** - MRU ordering, preselect-previous, Ctrl+Shift+K to flip to the
  previous project, and responsive columns with arrow-key navigation.
- **Accessibility pass** - a shared `<Modal>` (Escape, focus trap, roles) adopted
  across every modal, `IconButton` with aria-labels, deck keys / terminal tabs /
  accent swatches as real buttons, keyboard-and-focus tooltips, and full
  arrow/Enter/Escape navigation in context menus.
- **Design polish** - bundled mono font, scrim/radius token sweep, `--faint`
  retuned to clear AA contrast, unified section-label typography, and unified
  overlay entrance easing.
- **Hardening** - IPC upload directory confined to a project, write payloads
  capped, and traversal guards on skill install/remove.
- **Terminal** - explains *why* a shell died, including an Avast/fast-fail hint.

## 0.7.0 - 2026-07-10

- **Agent context files** - the tool cluster gains a **Context** popover listing the
  active project's agent memory files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`): open a
  present one in the editor, or create a missing one from a seeded starter template.
  Root-only; a lens over the real files the CLI agents already load.
- **MCP server catalog** - the MCP settings section gains an **Add from catalog**
  list of common servers (filesystem, github, memory, sequential-thinking,
  puppeteer, brave-search, postgres, sqlite, fetch, slack). One click drops an
  editable `npx`-based server template (command/args/env) into the project's
  `.mcp.json`; already-added servers show **Added** and disable.
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
