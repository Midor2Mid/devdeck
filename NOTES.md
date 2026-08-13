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

### Mission trace: two defects found while stripping the novelty heuristic (2026-08-11)

Three successive designs tried to make the Mission Control trace distinguish real
agent work from a TUI repainting a spinner — the last one saturated on
multi-row repaints while scoring genuinely new but near-identical lines (two
vitest result lines differing by a filename) as zero. That question needs the
rendered terminal buffer, not the pty byte stream, so the trace was cut back to
an honest terminal-activity measure with no claim about usefulness. Two
pre-existing defects surfaced while doing that cut:

**`isStalled` can never fire.** It requires `status === "working"` **and** no
output for 120s, but `onPtyData` arms an idle timer that flips `working` off
after `agentIdleMs` — default **1000ms** (`settings.ts:340`, UI range
300–5000ms). The two conditions are mutually exclusive, so the
`.mission-tile.stalled` stripe and its tooltip have never rendered in
production. Detecting a wedged agent needs a different signal, most likely
diffing the rendered xterm buffer rather than the pty byte stream.

**`.claude/skills/run-app/cdp.js` spawns Electron with `env: process.env`**, so
an agent driving DevDeck over CDP leaks `CLAUDE_CODE_CHILD_SESSION` /
`CLAUDECODE` into every pty DevDeck opens, and every agent session started
under the harness is a nested one with transcript saving off. This silently
invalidated one investigation run before it was spotted.

### Task 5: the first real bake-off, and it didn't finish (2026-08-12)

Ran the agent bake-off for real for the first time: a scratch git repo outside
DevDeck (`scratchpad/race-repo`, a bare `package.json` with `"test": "node
--test"`), a `todo` card, two entrants (Claude YOLO and Gemini, both edited in
the isolated test profile to add their auto-approve flags — `--dangerously-
skip-permissions` and `--yolo` — since neither built-in preset skips approval
prompts on its own, and an unattended pty can never answer one), gate = `npm
test`. This is a report of a race that did not complete, not a success story.

**First attempt failed before either entrant's worktree existed, and it failed
identically for both — which looks exactly like the worktree-cwd bug the whole
design warns about, but isn't.** Both entrants went straight to `nocommit` in
under a second, gate output truncated to `Preparing worktree (new branch
'add-a-function-that-returns-the-…`. That line is normal git progress output,
not an error — the real failure was one line further down: `fatal: '$GIT_DIR'
too big`. `entrantBranch()` builds the branch name from the card's title
verbatim, and `safeBranch()`'s 80-character cap only bounds the branch name
itself, not the full path git has to build under `.git/worktrees/<branch>/` —
combined with this machine's deeply-nested scratch/temp path, a title-length
branch name that would be completely fine in a normal project pushed git-for-
windows past whatever internal buffer (or MAX_PATH) produces that error, and
`git worktree add` failed for both entrants the same way, leaving a dangling
branch behind with no worktree directory to match. Shortening the card's title
(and so the derived branch) made it disappear. Worth carrying forward: a
long, descriptive card title is exactly the kind of title a real user would
write, and this fails silently into `nocommit` with a git error fragment
nobody would recognise as "your title was too long" — there's no cheap general
fix (the actual limit depends on the project's own path depth), but the error
could at least be surfaced whole instead of truncated to the first 64
characters, so a user hitting it stands a chance of understanding why.

**Second attempt got the two worktrees, distinct branches, both entrants
`working` — then the whole harness vanished.** `git worktree list --porcelain`
(checked directly, not through the UI) showed two linked worktrees at two
distinct paths on two distinct branches
(`add-a-sum-function-with-a-test-claude-yolo` /
`add-a-sum-function-with-a-test-gemini`), each entrant's row showing
`working` with its own pty. About 3.5 minutes in — both entrants still
`working`, no commits, cost still reading `$0` for both — the Electron process
and the Node/CDP script driving it both disappeared with no further log line
written. No `"fatal"` was ever logged (the driver's own top-level catch writes
one on any JS-level rejection, so this wasn't a caught error), no crash entry
appeared in the Windows Application event log, memory wasn't exhausted
(~14 GB free of 32), and no orphaned pty/`claude`/`gemini` child process was
left running. Something killed the process tree from outside the JS layer,
and it left no trace anywhere I could find to say what. Per the plan's "one
race only" rule this was not retried; the two dangling worktrees/branches
left behind by the dead process were removed by hand afterward, and no
orphaned processes needed killing.

**What that leaves confirmed, and what it doesn't.** Distinct worktrees on
distinct branches — the thing that was a Critical bug twice before — is
real and was checked against git directly, not the UI's word for it. Nothing
past that: no commit ever landed, so whether a commit (rather than the
session going idle) is what triggers `gating`, whether the gate runs inside
the entrant's own worktree rather than the project root, real non-zero
per-entrant cost, landing a winner unstaged, and the dirty-tree Land refusal
were none of them exercised. This is the report the plan asked for when a
race doesn't finish: told plainly rather than salvaged with a second race.

**A second, unrelated way an entrant can lose on something other than the
merits, found before the race even started:** the `gemini` preset's default
model (`gemini-2.5-pro`) came back `404` — retired for this API key
("no longer available to new users") — in a plain non-interactive smoke test
run before wiring it into the race at all. Had that not been caught early,
Gemini would have failed every single run through no fault of its own
implementation, for a reason that has nothing to do with the card. Swapped in
`-m gemini-flash-latest` to get a working entrant. Between this and the
auto-approve flags neither built-in preset carries by default, the "known
weakness" the plan asked about — an entrant losing on obedience or
availability rather than merit — showed up twice over before a single agent
wrote a line of code: once as a model a preset assumes still exists, and once
as a permission prompt an unattended pty can never answer.

**Third and final attempt (authorised, not to be retried): same silent
death, even earlier.** Dropped Gemini per instruction (its configured model
is retired) and raced the two Claude presets instead — `claude` vs
`claude-opus`, differing only by `ANTHROPIC_MODEL`, both with
`--dangerously-skip-permissions` added in the isolated test profile.
Shortened the card title to `sum function + test`. Dispatch worked cleanly:
two worktrees, two branches (`sum-function--test-claude`,
`sum-function--test-claude-opus`), both entrants `working`, cost `$0` on
two consecutive ticks ~4s and ~20s after dispatch. Then, sometime between
20 and 130 seconds after dispatch, the entire Electron process and its
Node/CDP driver vanished again — same shape as the second attempt (no
`"fatal"` logged, no orphaned process), but roughly ten times faster this
time. Checked the Windows Application and System event logs for the exact
death window this time (something not done on the second attempt): both
empty, and no "faulting application" crash IDs (1000/1001/1002) anywhere
in the preceding hour either. No orphaned processes — the `claude.exe` /
`powershell.exe` triples present on the machine were pre-existing sessions
with unchanged PIDs, not leftovers from this race. Per the "one race only"
rule this was not retried; the two dangling worktrees/branches were removed
by hand afterward and the scratch repo confirmed clean.

Two data points on the silent death now exist at very different elapsed
times (~3.5 minutes, then ~20–130 seconds), which argues against a fixed
timeout or watchdog and toward something external and unpredictable —
Defender or another endpoint agent, a power/sleep event, or a transport
drop the harness has no error path for. Distinct worktrees on distinct
branches held up a third time. Everything downstream of a commit — gate-
in-the-right-tree, cost accrual, landing, the dirty-tree refusal — remains
unverified against a real running race; the one authorised attempt is now
used up, and the honest state of Task 5 is that the design's riskiest claim
(the gate scoring the right tree) has never been watched happen live, only
read correct from the source.

**Most likely cause, identified after the third attempt: Avast.** A process
tree that disappears with no crash record, no event-log entry and no faulting-
application ID is a behaviour-shield *termination*, not a crash — nothing gets
logged because nothing faults. Avast is installed here and has done exactly this
to this project three times already: terminals dying instantly with 0xC0000409
because it killed `powershell.exe`; `npm run package:signed` failing with
PowerShell exiting 127; the NSIS reinstall failing with exit 2. The target this
time is about as suspicious as software gets to a heuristic scanner — a freshly
built, unsigned `node_modules\electron\dist\electron.exe` launched with remote
debugging on and spawning child processes.

Before spending another race, add that path to Avast's **Allowed apps** (the same
list that fixed `powershell.exe` — not the scan-only Exceptions list). The cheap
confirmation first: a minimal Electron + CDP script with no DevDeck logic left
running for a few minutes. If that dies too, the blocker was never this feature.

### Remote hardening: what changed, and what deliberately didn't (2026-08-14)

Five tasks, eleven fix rounds, shipped on `feat/remote-hardening`. Per-device
tokens, an idle expiry, an encrypted store, and a bind the app refuses to widen
silently, replacing one shared plaintext token that never expired and a bind
choice the app made by guessing. The full ledger of what each round found is
`.superpowers/sdd/2026-08-13-remote-hardening/progress.md` — several of the
defects it caught were in the plan itself, not just the implementation, and
that file says so plainly rather than reading like a success story.

**What this did not change: remote is still full RCE for a paired device.**
Once a phone is in, it can attach to any terminal and type into it, write files
anywhere inside an open project, and run read-only SQL against saved database
connections — exactly as much as before. This work changes *who gets in*, not
*what they can do once in*. Per-device capability scoping — a phone that can
only watch a terminal, not type into one — is the obvious next step and is
deliberately not here: it needs a permission check threaded through every
message handler in `server.ts`, which is a materially larger change than
authentication.

**The pairing token is still the soft spot, on purpose.** It never expires and
enrols up to a generous cap (20 devices — see the next entry) rather than
truly unlimited, and `regeneratePairingToken` deliberately spares devices
already paired — rotating it locks out no one who already got in. That means
the paired-device list and per-device revoke in Settings are not a convenience
feature; they are the *only* mitigation once a pairing token has leaked (a
screenshot, a shared link, a note). Revoking devices by hand is the way back to
a known state if that ever happens — see the correction directly below about
what "revoking" actually does now.

**`remoteBindView.ts` leans on an invariant it does not itself enforce.** It
derives the panel's "reachable on Tailscale only" vs "every interface" copy
from whatever `chooseBind` returns, and only makes sense if that return value
is always either a tailnet address or `0.0.0.0` — never some other specific
LAN IP. That invariant is now pinned directly by a test in
`tests/guards.test.ts`. If anyone changes `chooseBind` to return a specific
LAN address for some mode, that test is what should fail and stop them; nothing
else in the codebase would notice.

### Whole-branch review, round twelve: revoke didn't actually disconnect (2026-08-14)

The paragraph above used to claim "revoking devices by hand is the only way
back to a known state" as settled fact. It wasn't: `revokeDevice` deleted the
device's record and token, but nothing closed that device's **existing**
WebSocket. Auth for a socket is checked exactly once, at upgrade time — there
was no re-check, no heartbeat, no reap. So a revoked phone's already-open
connection kept receiving terminal output and kept accepting keystrokes for as
long as it stayed open, while its row had already vanished from the Settings
panel and the person revoking it believed it gone. This is precisely the
stolen-phone and ex-collaborator scenario revoke exists for, and it was
exactly the scenario that failed.

Fixed: `verifyClient` (server.ts) now tags the upgrade request with which
device authenticated it, the `connection` handler stamps that onto the socket,
and `devices:revoke`'s IPC handler (index.ts) calls a new
`closeDeviceSockets(id)` immediately after the store write succeeds, closing
every live socket for that device via `terminate()` (not a graceful `close()`
— a device just revoked has no claim on completing a handshake it could also
simply choose never to acknowledge). Covered directly in
`tests/server-remote.test.ts`. The claim above is now actually true instead of
aspirational.

Also found and fixed in the same review pass, all in the areas this file
already documents:
- **Regenerating the pairing token could report success on a failed write.**
  `pairingToken`/`regeneratePairingToken` used the swallowing `save` where
  `revokeDevice`/`setPairingToken` already used the throwing `writeStore` for
  exactly this reason — a user responding to a leaked pairing link deserves a
  thrown error, not a panel that shows a "new" token while the leaked one
  stays live. Both now use `writeStore`; the Settings panel surfaces a failure
  through the same `deviceActionError` channel rename/revoke already use.
- **A failed legacy-token migration could still lose the token one save
  later.** `writeNow` (settings.ts) serializes `remote` from in-memory state,
  and that shape has no `token` field once constructed — so the very next
  unrelated settings change rewrote settings.json without it, and the file's
  own comment claiming migration "just retries on the next load either way"
  was wrong: there was nothing left on disk to retry with. A module-local now
  holds the un-migrated token and `writeNow` re-attaches it until a later
  load's migration actually confirms.
- **Every unauthenticated request cost a synchronous disk read plus one DPAPI
  decrypt per paired device**, unrate-limited, on the same thread that drives
  the UI and relays every PTY. `devices.ts` now caches the parsed store and
  each decrypted token in memory, invalidated on its own writes (it is the
  sole writer of `remote-devices.json`), and caps enrolment at 20 devices so
  a leaked pairing token can't grow that per-request cost without bound.

**Accepted risk: the device cookie ignores port, and nothing can fully fix
that.** `devdeck_device` is a cookie, and cookies are scoped by host, not
host+port — a phone that pairs with `http://192.168.1.5:7777` sends that same
cookie to *every* other HTTP service on that host it happens to visit:
`:3000`, `:8080`, `:5173`, i.e. any dev server running on the same machine,
which on a developer's machine is close to a certainty. Any of those can also
overwrite it. `HttpOnly` does nothing here — it only keeps page script from
reading the cookie, not other origins on the same host from receiving or
setting it. This is a real cost the cookie design buys in exchange for
surviving a reload and keeping the token out of the URL/history, and it is
still worth keeping the cookie for that. The one mitigation that's actually
possible: under TLS, the cookie is now set with the `__Host-` prefix
(`guards.ts`'s `deviceCookieName`), which guarantees no other origin on this
host quietly relaxed `Secure`/`Path` on a cookie of this exact name — it does
**not** make the cookie port-aware, since the prefix isn't port-scoped either,
and it can't apply at all over plain HTTP (`__Host-` requires `Secure`, which
requires TLS). The residual — plain-HTTP cross-port sharing/overwrite — is
accepted, not fixed, and is recorded here so nobody rediscovers it as a new
finding.

### Scoped re-review after round twelve (2026-08-14)

A follow-up pass over the round-twelve fixes found one new defect the fixes
themselves introduced, plus two regressions in tests that stopped actually
exercising what they claimed to:

- **Toggling HTTPS silently unpaired every device.** The `__Host-` cookie
  prefix (I5, above) meant the cookie is named `devdeck_device` over plain
  HTTP and `__Host-devdeck_device` over HTTPS, but `cookieToken` looked for
  exactly one name, picked from the *current* TLS setting. Pair over HTTP,
  then tick the HTTPS checkbox in Settings, and the browser keeps sending
  `devdeck_device` while the server now looks only for the `__Host-`
  version — every paired device locked out, in either toggle direction.
  Fixed: `cookieToken` (`guards.ts`) now checks both names on read, preferring
  the `__Host-` one when both are present; writing (`deviceCookie` /
  `clearDeviceCookie`) is unchanged and still uses whichever name the current
  TLS setting dictates. Covered in `tests/guards.test.ts`, including a test
  that a cookie set before a TLS toggle still authenticates after it.
- **The "corrupted store" test in `devices.test.ts` had gone vacuous.** It
  corrupts `tokens[id]` with a direct `writeFileSync`, but I4's in-memory
  cache (round twelve, above) meant `authenticate` never actually read those
  bytes again — both assertions kept passing for a reason unrelated to what
  they were meant to prove. Fixed by calling `__resetCacheForTest()` right
  after the corruption write.
- **The unmigrated legacy token was being retained too broadly.**
  `settings.ts`'s migration handling had collapsed two different outcomes
  into one: a thrown error (a transient write failure, worth retrying) and a
  resolved `false` (a *different* pairing token already exists — permanently
  declined, by the code's own neighbouring comment) were both treated as
  "keep the token for next time". That meant a dead plaintext legacy token
  got rewritten into settings.json on every save, forever, with no path to
  removal — and if `remote-devices.json` were ever lost or corrupted, the
  next launch would find an empty pairing token and adopt that stale,
  possibly-leaked value as the live one again. Fixed: the token is now
  retained only on the throw path; a resolved `false` drops it for good.

**Accepted risk: the pairing-token TLS-toggle fix only ever needed to cover
one of the two toggle directions.** Reading both cookie names fixes HTTP →
HTTPS cleanly, because a plain (non-`Secure`) cookie is sent on both HTTP and
HTTPS requests to the same host. The reverse direction — pair over HTTPS,
then untick HTTPS — cannot be fixed the same way: the `__Host-`-prefixed
cookie carries `Secure`, so the browser simply never sends it once the page
is loaded over plain HTTP again, regardless of what the server now looks
for. That case still fails closed (the device has to re-pair), same as
before this fix; it just isn't reachable by improving `cookieToken`, since
nothing arrives in the `Cookie` header for it to find.

**Accepted risk: the 20-device enrolment cap is opaque.** The 21st enrolment
attempt returns a plain `401` — indistinguishable from a wrong/expired token,
with no signal anywhere in the desktop Settings panel that the cap, not a bad
token, is why. Expired devices still count toward the cap until something
reads `listDevices` (which prunes them on read), and under the "Never"
(`deviceTtlDays: 0`) expiry policy nothing ever prunes at all, so a
long-lived install can genuinely hit a hard wall of 20 with the only visible
symptom being a generic 401. Revoking old devices, or lowering the expiry
policy, is the way past it today; no UI surfaces "you're at the cap"
specifically. Recorded here rather than built, since it needs Settings-panel
work (surfacing cap/count) that's out of scope for this fix pass.

## Ideas

- Project switch should restore the exact terminal layout I had (which tabs, which were Claude sessions).
- A "new Claude session" button is the single highest-value affordance — make it one keystroke.
- Eventually: pipe an API response or a file path straight into a running Claude session.

## Things learned

- User's machine has Node 22.11, npm 10.9, git, Python 3.13. VS 2019 Community is installed but the **MSVC C++ compiler binaries are not** → native `node-pty` build would fail. Using `@lydell/node-pty` (prebuilt) sidesteps this entirely.
