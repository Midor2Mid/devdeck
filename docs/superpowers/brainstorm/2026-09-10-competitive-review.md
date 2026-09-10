# Competitive review — the market as it stands, 2026-09-10

`product-reviewer`, function seat. Written against `HEAD` = `223f27d`, tree clean,
`v0.13.0` tagged. The app was not launched. Every market fact below was checked
live today (`gh api`, `WebSearch`, `WebFetch`) unless marked otherwise; every
feasibility claim names the file it was read from.

Binding inputs, not re-derived: `2026-09-08-product-direction.md` §5 (the
forbidden list), `2026-09-08-developer-workflow.md` (two survivors: a CLI-native
hook signal, a taskbar overlay), the five 2026-09-10 seats, and
`.superpowers/market/` (2026-08-25, Orca). This document **starts from the
2026-08-25 pass and says what changed**. It does not re-open the milestone, the
sequence, D1, or K6.

**The one-line ruling: "which agent needs me" stopped being a differentiator
between 2026-08-25 and today — it is now a first-party feature in Claude Code
itself, in Microsoft's own terminal, and in a 37,000-star Rust multiplexer with a
Windows beta. What is left to DevDeck is narrower and real: cross-vendor, in the
user's own Windows shell, with no account, no relay and no daemon. Nothing here
is a build-now; the beta is the right experiment, and it needs one more question.**

---

## 1. What changed since 2026-08-25

The August pass compared DevDeck to one competitor (Orca) and argued about a
category name (ADE). Six things have happened since, three of them by the
vendors whose CLIs DevDeck sits on top of.

### 1a. The first-party CLIs absorbed supervision — for their own sessions

| Vendor | What shipped | When | Windows |
|---|---|---|---|
| **Claude Code CLI** | `claude agents` — *Agent View*: a full-screen list of every **background** session (`claude --bg`, `/bg`) grouped by state, **needs-input at the top**, reply inline, attach with Enter. Research preview, CLI ≥ 2.1.139. | 2026-05-11 | CLI is cross-platform |
| **Claude Code Desktop** | Redesign: session sidebar, parallel sessions each in its own worktree, **desktop notification when a session finishes while you are viewing another**, status filters, `/desktop` to move a CLI session in. | 2026-04-14 | x64 + ARM64 installers; `/desktop` on x64 |
| **Claude Code Remote Control** | Approve permission prompts and steer from the phone / claude.ai; "Approve tool calls from your phone" nudge after repeated prompts. **All plans** now (was Max-only in Feb). Relay through Anthropic; transcript stored on Anthropic servers while connected. | 2026-02-25 → all plans by Sep | Doc states no platform restriction today; Feb coverage said macOS/Linux/WSL — **native-Windows status not verified here** |
| **Claude Code hooks** | `Notification` matchers `permission_prompt`, `idle_prompt`, `agent_needs_input`, `agent_completed`; `PermissionRequest`, `Stop`, `SessionStart/End`; hook types `command`, **`http`**, `mcp_tool`; payload carries `session_id`, `cwd`, **`transcript_path`**. Configured in settings files or `--settings`. No external registration API. | ongoing | yes |
| **Codex app** | Desktop command center, threads, automatic worktrees, PowerShell-native sandbox. | Windows 2026-03-04 | yes |
| **Codex CLI hooks** | `PermissionRequest`, `Stop`, `SessionStart/End`, `hooks.json`, per-platform `commandWindows`; `notify` JSON callback. Behind `features.hooks = true`. | 2026 | yes, explicitly |
| **Gemini CLI** | Hooks incl. `Notification`, `AfterAgent`, `BeforeTool`; experimental notifications via **OSC 9** ("action required" / "session complete"), BEL fallback; native ACP (`--acp`). | 2026 | not stated |
| **Google Antigravity 2.0** | "Manager" surface: mission control over agents across workspaces. | 2026-05-19 | yes |

Read plainly: for a **Claude-only** user, the question DevDeck exists to answer is
answered by `claude agents` in the terminal they already have, by the Desktop
app's sidebar and notifications, and by Remote Control on the phone — with no
third-party install and no SmartScreen wall. For a **Codex-only** user, the Codex
app does the same. What no vendor does, and structurally will not: show a
`claude`, a `codex` and a `gemini` in one list, in a pane the user opened
themselves, without an account.

### 1b. Microsoft entered the exact niche, on the exact platform

**`microsoft/intelligent-terminal`** — a fork of Windows Terminal "with native
agent integration". Created 2026-05-18, `v0.2.23` on 2026-08-28, 1,941 stars,
109 open issues, Store + winget. An **agent management panel showing all active
agents and their status**, an agent pane, error detection. Copilot CLI is the
default; it auto-detects Claude, Codex, Gemini and OpenCode **through ACP
adapters** — agents run as JSON-RPC subprocesses, not as TUIs in a pty.
Ordinary `claude` typed into a pane is *not* integrated. Terminal Chat is being
deprecated in its favour.

Two readings, both true. It is the first time the "Windows terminal that knows
about agents" position has a vendor with unlimited budget in it. And its
mechanism is the honest one: **a structured protocol, not a screen scrape** — it
never has to guess whether a bell was a bell. That is the lesson, not the panel.

### 1c. Herdr — the closest thing to DevDeck's identity, and it was not in the August pass

**`herdrdev/herdr`**, "the runtime your coding agents live on". Created
2026-03-27 — nine days after Orca — **37,160 stars**, Apache-2.0, `v0.9.0` on
2026-09-07 with daily previews, 330 open issues (27 Windows-titled). A single
Rust binary, no Electron, no GUI, no account, no telemetry. Every agent gets a
real pane; each pane is badged **working / blocked / idle / done**; workspaces
per repo; sessions survive disconnects and restarts; a socket API agents can
drive. **Windows is a native beta** (`irm https://herdr.dev/install.ps1 | iex`).
A large ecosystem already: mobile web UIs, an nvim status float, a "portal"
kanban, an ESP32 desk panel that rings when an agent stops to ask.

How it knows: for Claude Code, Devin and Copilot it uses a **"screen manifest"**
— TOML rules matched against the live bottom of the buffer, with *blocked*
deliberately strict ("only when the snapshot matches known approval, question or
permission UI"). That is `detectApproval` (`src/shared/approval.ts`) with a rule
file instead of regexes. For a handful of agents it takes **lifecycle hooks**
instead. Nobody in `.superpowers/` has read it; `grep -ri herdr .superpowers docs`
returns nothing.

### 1d. Orca kept its pace

65,209 stars (52,911 on 08-25), 4,303 forks, 5,711 open issues (143 with
"Windows" in the title), `v1.4.199` on 2026-09-09. Android companion at
`v0.0.48`. Nothing identity-changing since E3's correction; the earlier finding
stands — it already has a hook listener (`agent-hook-listener/`) and a dashboard
that is **off by default**.

### 1e. The category thinned, and the survivors are not on Windows

- **Vibe Kanban** — Bloop announced shutdown 2026-04-10; community-maintained.
- **Crystal** — deprecated Feb 2026; continues as Nimbalyst (Windows, iOS).
- **Conductor** — Mac only, Windows "on the waitlist", $22M Series A (Mar 2026).
- **cmux** — 26,959 stars, macOS only (Ghostty-based).
- **Superset** — 14,012 stars, ELv2, "macOS is the only tested platform".
- **Emdash** — YC W26, 5,699 stars, Windows supported.
- **Architect** — 50 stars, macOS only, hooks-based glow.
- **Claude Squad**, **Sculptor**, **OpenHands** — unchanged in kind.

### 1f. The terminals and IDEs

**Warp** open-sourced its client (2026-04-28), ships *Oz* (cloud background
agents) and a standalone Warp Agent CLI; on Windows. **Zed** made parallel agents
a native primitive (2026-04-22) with external agents over ACP. **Cursor 3** has
an Agents Window (2026-04-02). **JetBrains Junie** GA (2026-06-17), ACP native.
**Wave** has AI blocks. **WezTerm**: nothing agent-shaped. Every one of these
addresses "the agent is where you read code" — the user `product-direction.md`
§2 already says is *not us*.

### 1g. ACP became the interchange format

Gemini natively, Claude and Codex through `claude-agent-acp` / `codex-acp`,
Zed and JetBrains native, Microsoft's terminal built on it, a registry since
January. **Permission prompts are a typed message in ACP.** This is the
industry's answer to the problem `tileState.ts:5-11` refuses to solve by prose.

---

## 2. Competitor by competitor — better, worse, and what kind of threat

| | Does better than DevDeck | Cannot do what DevDeck does | Threat to |
|---|---|---|---|
| **Claude Code (CLI + Desktop + RC)** | Exact session state from inside the process; phone approve with zero setup; worktree per session; free with the plan; on Windows. | Cross-vendor. Supervise a session *you* started in *your* shell (Agent View lists sessions it backgrounded). Work without an Anthropic account/relay. | **Identity**, for every Claude-only user. A feature, for cross-vendor users. |
| **Codex app** | Same, for Codex; PowerShell-native sandbox. | Cross-vendor; your own pane. | Identity for Codex-only users. |
| **Intelligent Terminal** | Microsoft; Windows-native; structured state via ACP; ships in the Store. | Run the real TUI CLIs the user already knows; anything without an ACP adapter; the attention/ack split. | **Identity** — same platform, same question, bigger budget. Currently v0.2, ACP-only, Copilot-first. |
| **Herdr** | Speed (Rust, no Electron); sessions survive restart; 25+ agents; huge ecosystem; no account/telemetry (same stance as DevDeck). | A GUI deck; the project as the unit (it is workspace-per-repo, close); one classifier in main feeding the phone (`decisions.ts`). Windows is beta. | **Identity** — same user, same refusals, 100× the velocity. The nearest competitor DevDeck has. |
| **Orca** | Everything at scale; hooks *and* screen; mobile native; Jira. | No daemon by construction; refuse-to-lie standard. | Feature parity pressure only — E3 settled this. |
| **Conductor / cmux / Superset / Architect** | Mac polish. | Run on Windows. | None today. |
| **Emdash / Nimbalyst** | Worktree orchestration on Windows, plus editors. | Your own shell; supervision-first deck. | Feature. |
| **Warp / Zed / Cursor / JetBrains** | Agent where the code is. | Not the target user. | None — different user by ruling. |

---

## 3. Is the differentiator defensible? Plainly: no, as a feature. Yes, as a stance — and it is thin.

The 2026-09-08 direction said of the attention/acknowledgement split: *"I know
of no competitor with this."* That is still true of the **split**, and it is a
design detail, not a moat. The **feature** — one place that says which agent is
waiting — is now in `claude agents`, Claude Desktop, the Codex app, Antigravity's
Manager, Intelligent Terminal's agent panel, Herdr's badges, Orca's dashboard,
cmux's rings and Architect's glow. On 2026-08-25 it was Orca and DevDeck.

What the first-party CLIs **will** keep absorbing: supervision of their own
sessions, phone approval of their own prompts, transcripts, cost. Assume every
Claude-only pain DevDeck relieves today is relieved by Anthropic within two
releases; the trajectory since February says so.

What they **structurally will not** absorb: a cross-vendor view. Anthropic will
not list Codex sessions. That ground is contested by Herdr and Orca, both of
which have it today, both cross-platform, both ~100× DevDeck's throughput.

So the honest residue is: **one Windows developer who runs more than one
vendor's CLI, in their own shell, and will not hand a transcript to a relay.**
Against Herdr, DevDeck's remaining claims are a GUI deck instead of a TUI, the
project (not the worktree or workspace) as the unit, the phone card bound to a
`tailHash` and spent once, and a policy against signals that lie. Those are
preferences a person may hold. They are not a moat, and this week is the right
week to say so, before five people are recruited on a claim that no longer
distinguishes the product.

**Two consequences for the beta, not for the code:**

1. The three-fact gate (`docs/beta/01-who-to-approach.md`) does not ask which
   vendor(s). A Claude-only candidate will, correctly, say "why not `claude
   agents`?" — and that answer is *evidence*, but only if it was asked for. Add
   a fourth **asked, not gating** fact: which agent CLIs, and whether they use
   `claude agents`, Claude Desktop, the Codex app, Herdr, Orca or Warp today.
2. **S4** ("can say what DevDeck is for") should accept "sees my Claude *and*
   Codex sessions in one place" as a pass and record "a terminal with tabs that
   shows Claude waiting" as a **weak** pass — because the vendor already sells
   that sentence.

---

## 4. Candidates — generated, then judged

Thirty-four generated. Two survive as queue-behind-the-beta (both already named
on 2026-09-08 and both strengthened by today's evidence), four are watched, the
rest killed. Nothing is build-now: every remaining blocker to 2026-10-06 is a
human act, and this seat will not put a fifth piece of engineering in front of
K6.

### Build now

**Nothing.** Unchanged from 2026-09-08 and for the same reason.

### Queue behind the beta — ranked

**Q1. CLI-declared attention signals, delivered over transport DevDeck already
owns.** *(Builds on the 2026-09-08 survivor #1; the market pass changes its
shape and raises its rank.)*

- **What it is.** Configure the agent CLIs to *tell* DevDeck when they need
  input or finished, instead of DevDeck reconstructing it from screen bytes.
  Claude Code: `Notification` (`permission_prompt`, `idle_prompt`,
  `agent_needs_input`, `agent_completed`) and `Stop`, as **`http` hooks** posting
  to the local HTTP server DevDeck already runs for MCP
  (`src/main/mcpserver.ts`, `127.0.0.1:8787`, bearer-token, opt-in) — one new
  route, no new port, no shell script, no new process. Codex: the same events
  via `hooks.json` (`PermissionRequest`, `Stop`; behind `features.hooks`; has
  `commandWindows`). Gemini: `Notification` / `AfterAgent` hooks, or its OSC 9
  notifications, which the OSC scanner in `missionTail.ts` already walks.
- **Source of truth.** The CLI's own event about its own state — the payload
  carries `session_id`, `cwd`, `transcript_path`. This is the only mechanism in
  the market that beats Herdr's screen manifest for Claude Code (Herdr uses
  patterns for Claude; hooks only for minor agents), and it is the *same*
  structural move Intelligent Terminal made with ACP without giving up the pty.
- **What it replaces / retires / deletes.**
  - Retires `agentIdleMs`-silence as the source of `waiting` for a hooked
    session (`store.ts:537` calls it "PROVISIONAL", by its own admission).
  - Demotes `detectApproval` from primary classifier to fallback for
    un-hooked sessions; `decisions.ts` gains a second `PendingDecision` source
    with the **same** `tailHash` binding, so the phone's answer path is untouched.
  - **Deletes the roadmap's post-beta item** "`claude --session-id <uuid>`
    per-pane transcripts" (`ROADMAP.md:288`): the hook payload hands DevDeck
    `transcript_path` exactly, so `usage.ts`'s directory scan
    (`readdirSync(dir).filter(f => f.endsWith(".jsonl"))`, `usage.ts:270,312`)
    stops guessing which transcript is which pane.
- **Configuration — the real cost.** Hooks live in the user's settings, and
  there is no registration API. Two routes: (a) merge into the project's
  `.claude/settings.local.json` (gitignored), exactly the preserve-other-keys
  write `src/main/mcp.ts` already does for `.mcp.json`; (b) `--settings '{…}'`
  on the preset command — but presets are user-editable strings
  (`settings.ts:242-255`) typed into PowerShell, and JSON-in-quotes through
  ConPTY is the fragile route. Take (a), per project, opt-in beside MCP
  registration. Codex and Gemini are the same shape in `.codex/` and
  `.gemini/settings.json`.
- **Code paths.** `src/main/mcpserver.ts` (route), `src/main/mcp.ts` (sibling
  writer), `src/main/decisions.ts`, `src/renderer/src/store.ts` status
  transitions (bell branch at `:1113-1130`, idle timer at `:1225`),
  `src/main/usage.ts`. Medium; a real track, with a `run-app` pass per vendor.
- **What breaks if wrong.** A hook that never fires (feature flag off, user's
  own hooks array, a `matcher` typo) produces a *silent* false negative — the
  worst class for this product. So the tile must show *which* source it is
  reading from (hooked vs screen), and a hooked session that goes quiet with no
  event must fall back to the screen classifier, not to silence. **Do not** use
  `PermissionRequest`'s ability to return a decision to answer from the phone:
  that turns an `http` hook into a request held open until a human taps, which
  is a daemon in disguise and dies at the hook timeout.

**Q2. The Windows taskbar overlay — and it rides on the F9 fix.** *(2026-09-08
survivor #2, unchanged in scope.)* `BrowserWindow.setOverlayIcon` driven by the
count `DeckStatus` already computes. The security seat proved on 2026-09-10
that DevDeck's desktop notifications have **never fired** (`Notification.permission`
is `denied` under the permission handler; `store.ts:944` trusts a `try/catch`
that cannot catch it). The fix — notify from **main** over IPC — lives in the
same `src/main/index.ts` and is driven by the same count. One change, two
ambient signals; no new surface. Claude Desktop already does the notification
half for its own sessions, which is precisely why DevDeck's must not be a
toggle that does nothing. Small. Ordering of the F9 half is the security seat's
call, not mine.

### Watch the beta for evidence

- **W1. Which vendors, and which first-party tools, each candidate already
  uses.** The fourth asked fact (§3). If four of five are Claude-only and name
  `claude agents` or Claude Desktop, the residue in §3 is the product, and Q1's
  Codex/Gemini halves are the only halves worth building.
- **W2. Does anyone use `/remote-control` or the Codex app's phone path?** If
  yes, the phone card's value is *cross-vendor + no relay*, and its copy should
  say so; if nobody does, the card stays as shipped and is not grown (PWA/push
  remain *not yet*).
- **W3. Inline "comment this diff line → send to agent."** Convergent (Orca,
  Architect, `herdr-annotate`, Conductor). Passes the agent-edge test, adds no
  surface (`ChangesModal.tsx` is read-only today). Not queued: the target user
  alt-tabs to a real IDE to read code, by the 2026-09-08 workflow's own account.
  Watch whether anyone opens the Changes modal unprompted.
- **W4. Automations, routines, triggers.** Claude Desktop routines, Codex
  automations, Emdash scheduling, Warp Oz — the category is moving to
  *unattended* runs. DevDeck already built its version and the empty-table test
  says nobody used it: `triggers` `[]`, `routingRules` `[]`, `pipelines` in the
  store. Not proposing deletion (D1's scope is authorised and closed); proposing
  the watch: if no candidate touches PromptComposer's broadcast or a pipeline,
  these join the on-notice list at the verdict.

### Killed

Each with one line. Items already forbidden by `product-direction.md` §5 are
not re-argued; the ones below are the new kills from today's evidence.

- **Run agents over ACP instead of in a pty (Intelligent Terminal's mechanism).**
  Exact permission prompts, at the price of replacing the real Windows shell the
  identity is built on with a JSON-RPC subprocess whose UI DevDeck must draw —
  that is a chat client, Zed/JetBrains/Microsoft own it. Copy the *stance*
  (structured over scraped) via Q1; not the transport.
- **Ship an ACP client mode as an addition.** Same as above, plus a second
  session model beside the pty one. Two truths about one agent.
- **Embed or shell out to `claude agents` as a DevDeck view.** The user already
  has a way — it is `claude agents` in any pane, today. A twelfth answer to
  "who needs me". The honest response is §3, not a wrapper.
- **Attach to an external `claude` process the user started elsewhere (like
  `/desktop`).** The pty is owned by whoever spawned it; there is no attach.
  Mechanism kill.
- **Worktree per session by default (Claude Desktop, Codex, Conductor, Cursor,
  Zed all do it).** Killed 2026-08-30 for retiring "a project is the unit of
  context"; the whole market doing it does not change what it retires. The
  default was turned off in 0.13.0 on purpose.
- **Keep Tasks as a deck key because "kanban is the category".** Bloop shut
  down 2026-04-10; Orca's kanban is off by default. The market voted with D1-5.
- **A daemon / headless / "sessions survive closing the window" (Herdr's
  headline, Orca #4280).** Forbidden by name in §5. Herdr's 37k stars are
  evidence the *category* wants it; they are not evidence that this product's
  supervisor does, and E3's named trigger — a real overnight run wanted badly,
  twice — has not fired.
- **A `devdeck_sessions` MCP tool so an agent can see which other agents are
  blocked (Herdr socket API, Superset MCP).** Makes the agent the supervisor,
  which contradicts the claim; and an agent acting on a status this app has
  shipped lying three times is the failure mode squared. Parked below with a
  trigger, not built.
- **Agent breadth — 25+ presets like Herdr/Orca.** Killed 2026-08-25; presets
  are user-editable strings, so breadth costs the user one line and DevDeck
  nothing. Nothing to build.
- **Native GitHub PR create/status (A1 #2).** `gh` and the browser exist;
  `pr.ts` hands back a URL on purpose; PR lifecycle is team-shaped.
- **WebGL terminal renderer (A1 #3).** The performance seat drove 300,000 lines
  through the real pipeline with sub-9 ms ping. No measured problem to solve.
- **Session cost/token surfaces, or a Claude-Desktop-style CI status bar.**
  The one cost surface has a confirmed data-loss bug already on the watch list;
  CI status is PR-shaped.
- **Side chat with session context (Claude Desktop Ctrl+;), cross-session
  messaging, dispatch badges.** Vendor features about the vendor's own
  session; DevDeck has no edge into a running conversation and should not.
- **Terminal-theme import, a Herdr-style TUI mode, a Windows Terminal fork.**
  Different products.
- **A sixth competitor study — including "install Herdr for two weeks".**
  Permanently off per §5. The two-week test D2/E3 asked for is now cheaper than
  a study: it is the fourth asked fact in W1, answered by five strangers instead
  of the author.
- **PWA / Web Push for the phone card, to match Remote Control.** *Not yet*
  stands; and the honest comparison is that Remote Control stores the
  transcript on Anthropic's servers while connected — DevDeck's card is the
  no-relay alternative or it is nothing.
- **Any panel, view, or deck key.** None generated survived naming what it
  replaces.

### Park

- **`devdeck_sessions` for agents.** Trigger: a beta user is observed running an
  orchestrator agent that asks, in its own words, what the other panes are
  doing.
- **OSC 9 / OSC 99 as an attention source (Gemini emits it; Claude has
  `preferredNotifChannel`).** Cheaper than hooks — zero files written into the
  user's config — but how Claude Code picks its channel under a non-iTerm
  `TERM_PROGRAM` is unverified, and setting `TERM_PROGRAM` to lie to the CLI is
  exactly the kind of trick this product refuses. Fold into Q1's design; decide
  there.
- **Reading Codex/Gemini transcripts for the ledger.** Only after Q1 delivers
  `transcript_path` for Claude and the ledger's data-loss bug is fixed.

---

## 5. What a competitor's mistakes say DevDeck should not do

- **Herdr marks *done* and keeps it visible until reviewed** — that is DevDeck's
  `seen` axis, arrived at independently. Keep the tripwire at
  `styles.css:1165-1172`; do not let a "done" state become a status.
- **Herdr's blocked detection is "deliberately strict; unrecognised prompts
  show as idle."** Same conservatism as `detectApproval`, same false-negative
  exposure. The market leader in this mechanism has the same hole; Q1 is how
  DevDeck gets out of it first for Claude.
- **Intelligent Terminal integrates only ACP-launched agents** — a `claude`
  typed into a pane is invisible to it. DevDeck's pty-first design is right for
  the user who types the command themselves; do not trade it.
- **Remote Control stores the transcript server-side while connected.** That is
  the cost of zero-config phone access, and it is the line `PRODUCT.md:20`
  draws. Say it in the phone card's copy; do not cross it.
- **Orca's dashboard is off by default and Claude Desktop notifies only when
  you are viewing another session.** Both vendors learned that an always-on
  attention surface competes for the attention it protects — the eleven-surfaces
  lesson, learned elsewhere. The deck's "N need you" chip plus a taskbar overlay
  is the ceiling, not the floor.

---

## 6. Backlog delta

Amend, do not create.

**`IDEAS.md`** — new section after *"Checked against 1DevTool and deliberately
not built (2026-08-31)"*:

> ## Checked against the September 2026 market and deliberately not built (2026-09-10)
>
> Full reasoning in `docs/superpowers/brainstorm/2026-09-10-competitive-review.md`.
> Since 2026-08-25: `claude agents` (Agent View, 2026-05-11), Claude Code Desktop's
> session sidebar (2026-04-14), Remote Control on all plans, the Codex app on Windows
> (2026-03-04), `microsoft/intelligent-terminal` (ACP agents in a Windows Terminal fork),
> and Herdr (37k★ Rust agent multiplexer, Windows beta) all answer "which agent needs
> me" for their own scope. DevDeck's residue is cross-vendor, own-shell, no-account.
>
> - Running agents over ACP instead of a pty; an ACP client mode — a chat client, not a shell.
> - Wrapping `claude agents` as a view — the user already has it, in any pane.
> - Attaching to an externally started CLI process — no attach exists for a pty.
> - A `devdeck_sessions` MCP tool for agent-driven orchestration — parked; makes the agent the supervisor.
> - Daemon / headless / survive-close (Herdr's headline) — §5 of the direction ruling stands.
> - Native GitHub PR, WebGL renderer, cost surfaces, CI bar, side-chat, Tasks-as-key, agent-preset breadth.
>
> Survives, queued behind 2026-10-06: CLI-declared attention signals via `http` hooks into
> the existing MCP server (supersedes the `--session-id` transcript plan), and the taskbar
> overlay riding on the main-process notification fix.

**`ROADMAP.md:288`** — replace *"then `claude --session-id <uuid>` per-pane
transcripts"* with:

> then CLI-declared attention signals (Claude/Codex/Gemini hooks posting to the
> existing local MCP server), whose payload carries `transcript_path` and so
> supersedes the `--session-id` per-pane transcript plan.

**`docs/beta/01-who-to-approach.md`** (field's file; proposed text) — a fourth
**asked, not gating** fact:

> Which agent CLIs they run, and whether they already use `claude agents`, the
> Claude Code Desktop app, `/remote-control`, the Codex app, Herdr, Orca or Warp
> for the same job. Recorded verbatim; not a disqualifier.

**`docs/beta/05-validation-criteria.md`**, S4 — amendment under the original
line, dated: a pass sentence that names *more than one vendor* or *my own
terminals* is a full pass; one that could be said of `claude agents` alone is
recorded as a weak pass.

---

## 7. Decide first

Only where a wrong default wastes real work. A default is given for each.

1. **Does `src/main/db.ts` (and the `devdeck_db_*` MCP tools and the phone's
   `db:*` routes) survive D1?** Technical-director says it is a product
   decision; security says delete. Function seat: **delete.** The tools'
   precondition is a saved connection, and `connections.json` has never
   existed on the only machine that has run this app — so the MCP db tools have
   never returned a row anywhere. There is nothing to keep.
2. **Hook configuration transport for Q1.** Default: merge into
   `.claude/settings.local.json` / `.codex/hooks.json` / `.gemini/settings.json`
   per project, opt-in beside MCP registration, preserving every other key —
   not `--settings` on the preset command line.
3. **Is Q1 "Claude first" or "all three or nothing"?** Default: Claude first,
   labelled per session as *hooked* or *screen*, never described as "agent"
   detection in general until the other two are verified on Windows.
4. **Do the fourth asked fact and the S4 amendment go in before candidate
   one?** Default: **yes** — two sentences in two beta docs, in the same
   sitting as T1, because the answer is unrecoverable once the first session is
   spent. This is a document edit, not engineering, and it is the only thing in
   this review that must happen before 2026-09-22.

---

## Independently verified, 2026-09-10 (coordinator)

This review's central claim is strategy-level, so the load-bearing facts were
checked directly rather than taken on one agent's research. Both hold.

**Herdr — `github.com/herdrdev/herdr`, fetched 2026-09-10.** 37.2k stars,
Apache-2.0. The review's figure of 37,160 was accurate. Quoting its own README:
every pane is marked **"working, blocked, or idle"**; *"when an agent stops and
needs an answer, herdr says so"*; it runs *"claude code, codex, cursor, opencode,
grok and the rest"*; *"several machines, one window"* with *"a combined agent
list"*. Installation is native Windows PowerShell
(`irm https://herdr.dev/install.ps1 | iex`) and the README explicitly names
**"endpoint-protected Windows"** — the environment in which this project's own
signing and pty work has repeatedly been broken by antivirus. Its positioning
line is **"one rust binary, no electron."**

**microsoft/intelligent-terminal** — confirmed real: an opt-in fork of Windows
Terminal with native agent integration over ACP, shipped at Build 2026,
auto-detecting Copilot/Claude/Codex/Gemini/OpenCode, with an agent status bar
that surfaces a failed command. It installs alongside Windows Terminal.

### What this makes false, in this repository, today

`PRODUCT.md`'s status-quo paragraph says of Windows Terminal, VS Code, Postman
and a database GUI: *"none of them can tell me which agent needs me."* That was
true when written. **It is now false**, and it is the premise the product rests
on. Correcting it is owed regardless of what is decided about strategy, on the
same principle `marketing` applied on 2026-09-10: fixing a sentence that has
become untrue is not a strategy decision, it is a correction.

### What survives the comparison, stated narrowly

Herdr is a **TUI multiplexer**; DevDeck is a **GUI cockpit**. For a terminal-first
user that difference cuts *against* DevDeck, which is the uncomfortable part —
"no electron" is an argument aimed precisely at this product's form factor. What
remains genuinely DevDeck's, on this evidence, is a phone approve/deny surface
bound to the screen that produced the question, a project as the unit of context
across non-terminal panels, and per-project identity. Note that D1 deletes most
of those panels, and the phone card has still never rendered on hardware.

This does not make the product worthless and it is not a reason to stop. It does
mean the beta must not be run on the premise that nothing else does this — a
candidate may well already use one of these, and `field`'s proposed fourth
asked-not-gating fact (which vendors and first-party tools they already use)
becomes the most informative question in the session template.
