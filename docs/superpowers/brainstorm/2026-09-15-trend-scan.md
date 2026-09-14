# Trend scan — where the ADE / agent-orchestrator category is moving, 2026-09-15

`product-reviewer`, function seat. Written against `HEAD` = `58ff133`, tree
clean, **`v0.14.0` published 2026-09-14T09:53Z** with signed installers — the
first downloadable build. The app was not launched. This is a read on
*direction*, not an inventory; the inventory is
`2026-09-10-competitive-review.md` (verified by the coordinator) and is taken
as given. Every competitor fact below carries a URL; GitHub figures were
pulled live today with `gh api` and are dated.

**The one-line ruling: the category has stopped competing on "which agent
needs me" and started competing on two things DevDeck has forbidden itself —
agents that supervise agents, and runtimes that leave the laptop. Every clause
of DevDeck's residue sentence (cross-vendor, own Windows shell, no account, GUI
not multiplexer) is now held by at least one free, Windows-native product. What
is not held by anyone is the *honesty* layer 0.14.0 shipped — showing which
sensor produced a status, and refusing statuses it cannot source. That is not
a feature strangers select on; it is a claim the beta must test. Nothing here
is a build. K6 fires in seven days and step 13 is still not done.**

---

## 0. What changed since 2026-09-10 — dated, checkable

| When | What | Why it matters here |
|---|---|---|
| 2026-09-07 | **Herdr v0.9.0**: local + saved SSH machines in one window, combined agent list, multi-client; Windows drops the separate VC++ runtime requirement. Detection notes still read like scrape rules: *"Claude Code MCP questions and Bash approval prompts now stay blocked while waiting for an answer, including different option layouts and cursor positions"*; *"recognizes visible turn … activity when terminal titles are unavailable."* [release](https://github.com/herdrdev/herdr/releases/tag/v0.9.0) | The market leader in inference is still patching inference weekly. 38,463 stars, 303 open issues, 21 Windows-titled (`gh api`, 09-15). |
| 2026-09-08 | **Herdr raised $6M** (Bessemer; YC, e2vc; Lütke, Knecht as angels). Stated use: *"bring all the machines running Herdr together"*. [post](https://herdr.dev/blog/herdr-raised-a-seed/). The 2026-08-06 YC post fixes the model: *"The runtime, what you use right now, stays free. Apache-2.0"*; paid layers for *"laptops, VPS instances, sandboxes"* and *"additional client applications beyond the terminal UI."* [post](https://herdr.dev/blog/herdr-is-joining-y-combinator/) | The free local runtime is permanent and funded. DevDeck's no-account, local-only stance now competes with a free, venture-backed product on the same stance. Herdr's *paid* axis is multi-machine — the axis DevDeck forbids anyway. |
| 2026-09-10 | **Cursor Projects**: a coordinator agent that *"doesn't write code itself; it plans the work, delegates it to agents that implement it, and brings the finished work back to you to check."* Runs *"on its own computer in the cloud."* [changelog](https://cursor.com/changelog/projects). 2026-09-02: cloud agents on self-hosted machines. [changelog](https://cursor.com/changelog) | Vector 1 and Vector 2 in one release. |
| 2026-09-09 | **Codex CLI `rust-v0.154.0`** (`gh api`): `ExternalMessage` — external content can start or join a turn *"with tool-level authority"*; typed notification payloads. [releases](https://github.com/openai/codex/releases). Codex automations can re-use threads and *"schedule future work for itself."* [releasebot](https://releasebot.io/updates/openai/codex) | The vendor's agent is becoming its own dispatcher. |
| 2026-09-12 | **Claude Code v2.1.270** (`gh api`). Since 2.1.251: live streaming of a foreground subagent's tool calls to Remote Control clients; `PreModelSwitch`/`PostModelSwitch` hooks; and 2.1.269 *"Fixed remote and headless sessions reporting 'waiting for your input' while background agents were still running."* [CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md) | **The vendor with exact process state shipped a lying "waiting" signal.** DevDeck's problem class is not a scraping problem; it is a *derivation* problem, and hooks do not exempt anyone from it. |
| 2026-09-13 | **Orca v1.4.201** (`gh api`): native chat *"displays Claude subagent activity and Codex background tasks directly in conversations"*; worker terminals establish ownership at creation; federation guards. [releases](https://github.com/stablyai/orca/releases). 68,573 stars, 5,975 open issues, 154 Windows-titled (09-15). | Orca is drifting from pty-first to rendering the vendor's structured session — the Intelligent Terminal move, arrived at from the other side. |
| 2026-08-28 → | **Intelligent Terminal**: no release since v0.2.23 (18 days), 1,953 stars (+12 in five days), 117 open issues (+8). Code is still pushed (09-14). [releases](https://github.com/microsoft/intelligent-terminal/releases) | The ACP-transport cockpit is not accelerating. |
| 2026-08-20 | **ACP** latest release `schema-v1.21.0` (`gh api`, 4,233 stars). The *Session Notices* RFD (updated 08-20) says plainly: *"If Agent behavior depends on a user decision, the Agent needs an explicit response-bearing primitive such as elicitation or permission, not a notice."* [RFD](https://agentclientprotocol.com/rfds/session-notices) | ACP knows the difference between "informing" and "waiting". It is not adding a needs-attention broadcast; that stays bound to the permission request, i.e. to the transport. |
| 2026-08-20 | **Antigravity 2.9.1**: *"Remote Control to drive and monitor agent sessions on your local device from any browser."* [releasebot](https://releasebot.io/updates/google/antigravity) | Third first-party vendor with phone/browser supervision (Claude, Codex app, Antigravity). |
| 2026-09 | **Warp**: Oz becomes the "Automation Platform"; agents run on Warp's cloud or self-hosted (Docker, K8s); harnesses Warp Agent, Claude Code, Codex; the `oz` name sunsets 2026-10-06. [docs](https://docs.warp.dev/platform/) | Cross-vendor, off-laptop, event-triggered. |
| 2026-09-06 | **agentproto** (a separate agent-workflow protocol; ownership not established here): permission approvals gain a free-text feedback field — *"approve, but avoid deleting `.env`."* [release](https://github.com/agentproto/ts/releases/tag/release/2026-09-06) | Approve/deny is becoming approve/deny/*steer*. Noted, and killed below. |

**Not in the 09-10 pass, and all Windows-native, free, cross-vendor GUIs:**

- **Pane** (`runpane.com`, Dcouple): AGPL-3.0, *"Windows, WSL, macOS, and Linux"*, *"if it runs in a terminal, it runs in Pane"*, worktree per task, *"Local-first by default"*, and *"There is no paid plan, seat fee, usage fee, or hosted execution subscription."* Last updated 2026-08-23. [site](https://runpane.com/) · [pricing](https://runpane.com/pricing.md) · [Windows comparison](https://runpane.com/agent-managers-for-windows)
- **Maestro** (`RunMaestro/Maestro`): 3,339 stars (`gh api`), AGPL-3.0, Electron, Claude/Codex/OpenCode/Droid/Copilot, *"Built-in web server with QR code access … local network access and remote tunneling via Cloudflare."* [repo](https://github.com/RunMaestro/Maestro)
- **Nimbalyst**: 1.7k stars, MIT, Windows 10+, iOS companion to *"see which agents need you."* [repo](https://github.com/nimbalyst/nimbalyst)
- **Munder Difflin**: MIT desktop app, *"Every terminal is an agent … runs as a real process in a pseudo-terminal (node-pty), byte-for-byte authentic, rendered with xterm.js"* — DevDeck's exact stack — with a "GOD" orchestrator agent routing work between them. v0.4.5 on 2026-08-22. [article](https://mer.vin/news/munder-difflin-turns-coding-agents-into-a-self-running-office/) (canonical repo not located; star count 2.8k–5.8k by secondary sources, unverified)
- **OpenCode** desktop: 207,352 stars (`gh api`), *"tabs for desktop. Available on macOS, Windows, and Linux"*, *"Start multiple agents in parallel on the same project."* [site](https://opencode.ai/)

---

## 1. Where the category is heading — three vectors, tested

The brief listed six candidate vectors. Three are real directions; three
collapsed into them or into "already settled".

### V1. Supervision is moving from *a human watching a list* to *an agent watching agents*

Cursor's coordinator (09-10), Munder Difflin's GOD agent, Codex scheduling its
own future work, Claude Code streaming subagent tool calls to the phone
(2.1.251), Orca rendering subagent activity in chat (09-13), Maestro's
"autonomous for days" playbooks. The human's unit is shifting from *the prompt*
to *the review of returned work*. This absorbs "fleets vs single-agent": fleets
are the vendors' framing; the practitioners in the HN thread say *"I quickly
become the bottleneck when I review diffs … sweet-spot is 2-3 agents"*
([Ask HN](https://news.ycombinator.com/item?id=46993479), ~Feb 2026), and the
2026 review data agrees — reviewing 11.4 h/week vs writing 9.8; PR review time
+91% ([summary](https://www.flowverify.co/blog/ai-code-review-bottleneck-2026-data),
secondary source). **DevDeck's target user is the 2–3-agent human, not the
coordinator.** That user is being designed *around* by every funded player.

### V2. The runtime is leaving the laptop, and "approve from anywhere" is a consequence, not a vector

Cursor self-hosted machines and cloud Projects; Warp's cloud/self-hosted
platform; Herdr's SSH machines and its stated use of $6M; Orca federation;
GitHub's mission control across GitHub/VS Code/mobile/CLI
([github.blog](https://github.blog/ai-and-ml/github-copilot/how-to-orchestrate-agents-using-mission-control/)).
Once the agent is on another machine, the phone surface is mandatory, which is
why Claude, Codex, Antigravity, Orca, Maestro and Nimbalyst all have one.
DevDeck's phone card exists for a *local* session with no relay — the right
stance, held by Pane and Maestro too — and it has still never rendered on
hardware (`ROADMAP.md` row 7).

### V3. Structured over scraped is winning — through *vendor events*, not through ACP as transport

Evidence for: Claude hooks, Codex typed notifications and hooks, Herdr 0.9
falling back to MCP-side recognition, Orca rendering structured sessions.
Evidence against ACP-as-cockpit-transport: Intelligent Terminal's 18-day
release gap; ACP's own RFD keeping "waiting on a decision" inside the
permission request rather than a broadcast; JetBrains and Zed (editors) being
the adopters. **DevDeck already chose this side on 2026-09-12** — 0.14.0's
hook route (`src/main/attention.ts`, "NOTHING LEAVES THE MACHINE"; Mission
shows *"the agent said it, rather than that DevDeck guessed"*, `fb154dd`).

**Settled, not moving:** worktree-per-task is the default unit everywhere
(Codex managed worktrees, Claude Desktop, Cursor, Pane, Nimbalyst, Maestro,
Orca). DevDeck's *project*-as-unit, with worktrees opt-in since 0.13.0, is now
an explicit minority position. Keep it — but it must be stated as a choice a
candidate can disagree with, not as the obvious shape.

---

## 2. What is being commoditised, and how long the residue holds

| Clause of the 09-10 residue | Who also holds it today, free, on Windows | Survives as differentiator |
|---|---|---|
| Cross-vendor | Herdr, Orca, Pane, Maestro, Nimbalyst, Munder Difflin, Warp, Agent HQ | **No. Already zero.** |
| The user's own Windows shell, byte-for-byte pty | Herdr (native beta), Pane, Maestro, Munder Difflin (same node-pty + xterm.js stack) | No. |
| No account, no relay, no telemetry | Herdr (permanent, funded), Pane (*"no paid plan"*) | No — shared with the best-funded entrant. |
| A GUI, not a multiplexer | Pane, Nimbalyst, Maestro, Munder Difflin, Orca, OpenCode desktop | No. |
| One answer to "who needs me", off by default elsewhere | Nobody markets it; nobody selects on it | Indefinitely, and unsellably. |
| **The signal names its source** (hooked vs screen), and a status that cannot be sourced is refused | **Nobody** — Herdr badges a pattern match and a hook identically; Claude Code itself shipped a false "waiting" that 2.1.269 had to fix | Indefinitely — until it is tested on a stranger. |
| Attention / acknowledgement split; *done* is not a status; phone decision bound to `tailHash`, spent once | Herdr keeps *done* visible until reviewed (close); the rest, nobody | Indefinitely, as design detail. |

Newly table-stakes since 09-10: worktree-per-task; phone/browser supervision;
desktop notifications on completion; inline diff review; **and cross-vendor
itself.** Estimate: the *feature* clauses of the residue expired between
2026-06 (Pane, Nimbalyst) and 2026-09-07 (Herdr 0.9 on Windows without the
VC++ dependency). The *honesty* clauses do not expire, because nobody is
competing on them — which is the same reason nobody may be buying on them.
The beta is the only instrument that can tell those two readings apart.

---

## 3. What nobody is doing — and whether one maintainer on Windows can reach it

Six candidates for the blind spot, judged.

1. **The reviewer's queue.** Everyone builds the dispatch side (coordinators,
   fleets, worktrees) and the attention side (badges, phones). The measured
   bottleneck is *reading what came back*. No product orders "who needs me" by
   *how much reading it will cost* or remembers *what I already judged*.
   DevDeck's `seen` axis (`tileState.ts:275-290`) and three-state
   `changedCount` are the seeds of exactly this. **Reachable in principle;
   not now** — it is a re-ordering of the existing row, not a surface, but
   the target user "alt-tabs to a real IDE to read code"
   (`2026-09-08-developer-workflow.md`), so it is unproven that the deck is
   where review happens. → *watch the beta* (W3, the Changes modal, is the
   probe).
2. **Provenance of the signal.** Nobody labels which sensor produced a status.
   DevDeck does, as of 0.14.0. **Reached.** What remains is a sentence, and
   the roadmap's rule says the sentence must name the alternative: *"Herdr and
   Pane also show you which agent is blocked; DevDeck also shows you how it
   knows, and says 'unknown' when it does not."* → *build now*, as copy in
   `docs/beta/02-recruiting-message.md`, not as code.
3. **False-positive accounting.** Nobody publishes how often their "blocked"
   was wrong; Herdr's own 0.9 notes are a list of cases where it was. Not
   reachable as a feature; **reachable as evidence**: count, per recorded
   session, each time the deck's row disagreed with what the pane showed, and
   which source produced the claim. → *build now*, as one line in
   `docs/beta/03-install-watch-protocol.md`. It is the only measurement that
   could make row 6 of the table above *sellable* rather than merely true.
4. **Windows-native, endpoint-protected.** Herdr names it in its README; Pane,
   Emdash, Nimbalyst ship installers. **Not a blind spot any more.**
5. **Approve / deny / *steer*.** agentproto's feedback field (09-06) — nobody
   in the cockpit category has it on the phone. Reachable in code (it is a
   pty write), and **refused**: the card is safe because the route *"writes
   nothing to a pty, ever"* (`attention.ts`); the approve path writes one
   keypress bound to a `tailHash`. Free text on a decision path is prose
   into a shell from a phone, unverified on hardware. Typing exists in the
   pane.
6. **Subtraction as design** — one count, four keys, nothing on by default
   that competes for attention. Genuine, and the category's own vendors
   learned it (Orca's dashboard and Claude Desktop's notifications both
   default off, per the 09-10 pass). **Not reachable as a feature**; it is a
   stance, and a stance is tested by whether five strangers notice it.

Honest summary: **the reachable blind spot is already built** (item 2) and
**the reachable evidence is a document edit** (item 3). Everything else is
either taken or forbidden.

---

## 4. What DevDeck should do differently

- **Stop shipping code until a candidate is contacted.** Verified today: `K6`
  fires 2026-09-22; `docs/beta/01-who-to-approach.md` still has no
  which-tools question and `docs/beta/05-validation-criteria.md` still has no
  `K6` (step 13 not done); `NOTES.md` → "Beta — external users" is unchanged
  since 2026-09-04. Meanwhile, after 0.14.0 was published on 09-14, a nav
  design pass, a nav merge (`60c0ac0`) and two fixes (`e6efff7`, `58ff133`)
  landed. That is the fifth wave the roadmap named in advance. Naming it.
- **Widen step 13's list of tools to ask about.** The 09-10 list (`claude
  agents`, Claude Desktop, `/remote-control`, Codex app, Herdr, Orca, Warp)
  now misses the four that are closest to DevDeck's own shape: **Pane,
  Maestro, Nimbalyst, Munder Difflin** — all free, all Windows, all GUIs over
  the user's own CLIs. A candidate who already runs Pane is the most
  informative candidate available.
- **Rewrite the differentiator sentence around provenance, naming Herdr and
  Pane.** "Cross-vendor, own shell, no account, GUI" is now a description of
  Pane. The one true sentence left is item 2 above.
- **Add the disagreement count to the watch protocol** (item 3). It costs one
  line and it is the only thing that turns the honesty stance into a number.
- **Do not follow V1 or V2.** Both are forbidden (`ROADMAP.md` *What this
  roadmap now forbids*), and both are where $6M and Cursor's cloud are being
  spent. Losing there is certain; not entering costs nothing.

---

## 5. Verdicts

Twenty-two candidates generated from the artifacts above; judged against the
one rule (name what it replaces) and the forbidden list.

### Build now — none are code

- **B1. Step 13 with the widened tool list** (Pane, Maestro, Nimbalyst, Munder
  Difflin added). *Retires:* an unscoreable first session. Doc edit, `field`.
- **B2. The disagreement count in `03-install-watch-protocol.md`** — each time
  the row and the pane disagree, and the source (hooked / screen) that made the
  claim. *Retires:* arguing about the honesty residue without a number. Doc
  edit, `field`.
- **B3. The recruiting sentence rewritten around provenance**, naming Herdr and
  Pane as the alternatives. *Replaces:* the residue sentence of 09-10, three
  of whose four clauses are now false as differentiators. Doc edit,
  `marketing`; bound by the forbid on unproven phone-card claims until step 7.

### Queue behind the beta

- **Q1-Codex.** The Codex half of the hook route. Codex 0.154 has typed
  notification payloads and hooks behind `features.hooks`
  ([releases](https://github.com/openai/codex/releases)). Unchanged rank;
  wait for W1 to say whether anyone runs Codex.

### Watch the beta for evidence

- **W3 (carried).** The reviewer's-queue reading of the row (§3.1). Probe:
  does anyone open Changes unprompted; does anyone say "which one should I
  read first".
- **W5 (new). Worktree-per-task as a candidate's expectation.** The market
  settled on it; DevDeck opted out. If two of five ask why dispatch does not
  make a worktree, the minority position is costing sessions and the 0.13.0
  default is re-argued on evidence.
- **W6 (new). Does any candidate already run Pane, Maestro or Nimbalyst?**
  Their answer to "why install DevDeck too" is the whole residue question.

### Killed

- Coordinator-agent mode (Cursor Projects, Munder Difflin's GOD agent) — the
  agent becomes the supervisor; the `devdeck_sessions` park trigger of 09-10
  stands and has not fired.
- Multi-machine / SSH panes (Herdr 0.9) — Herdr's axis, forbidden by name.
- Cloud or self-hosted runtime; scheduled automations that wake themselves
  (Codex, Warp, Cursor) — a daemon by another name; `triggers` is `[]`.
- ACP as session transport; an ACP client mode — forbidden; and the
  ACP-transport cockpit has not shipped a release in 18 days.
- ACP *session notices* as an attention source — the RFD itself says a
  decision is not a notice; it stays bound to the transport DevDeck refused.
- Free-text steer on the phone card (agentproto) — prose into a pty from a
  phone; the card's safety is that it writes one bound keypress or nothing.
- Cloudflare-tunnel option for the phone (Maestro) — a relay; the LAN route
  stands.
- Rendering Claude subagent activity in Mission (Orca 09-13, Claude 2.1.251)
  — the hook payload does not carry it, so DevDeck would infer it; and the
  vendor's own version of this signal lied until 2.1.269.
- Worktree-per-task default back on — killed 08-30, 09-10, and again; now
  parked as W5 because the market settled, not because the argument changed.
- Effort / cost caps surfaced in the deck (Claude 2.1.267) — cost surfaces
  killed 09-10; the ledger's data-loss bug stands.
- OpenCode / Copilot CLI presets — presets are user strings (killed 08-25).
- An office floor with avatars (Munder Difflin) — the same status with more
  pixels.
- Agent-to-agent mailbox / shared memory — not supervision.
- Desktop notification "when viewing another session" (Claude Desktop) —
  shipped in 0.14.0 from main; duplicate.
- Multi-client viewing different workspaces (Herdr 0.9) — teams-shaped.
- Any second answer to "who needs me", any panel, any fifth key — forbidden;
  none generated survived naming what it replaces.
- A seventh competitor study, including "install Pane for two weeks" —
  permanently off; W6 is the cheaper form.

### Park

- **`devdeck_sessions` for agents** — trigger unchanged (a beta user runs an
  orchestrator that asks what the other panes are doing). V1 makes the
  trigger *likelier*; it does not fire it.
- **Gemini OSC 9 as an attention source** — unchanged.

---

## 6. Backlog delta — amend, do not create

**`ROADMAP.md`, row 13** — extend the parenthetical list of tools to ask about:

> (which agent CLIs a candidate runs, and whether they already use `claude
> agents`, Claude Code Desktop, `/remote-control`, the Codex app, Herdr, Orca,
> Warp, **Pane, Maestro, Nimbalyst or Munder Difflin** for the same job)

**`IDEAS.md`** — append to the section *"Checked against the September 2026
market and deliberately not built (2026-09-10)"*, dated:

> **2026-09-15 addendum** (`docs/superpowers/brainstorm/2026-09-15-trend-scan.md`).
> The category moved to agents supervising agents (Cursor Projects 09-10,
> Munder Difflin, Codex self-scheduling) and to off-laptop runtimes (Herdr's
> $6M for multi-machine, Cursor self-hosted, Warp). Both forbidden; neither
> entered. Cross-vendor, own-shell, no-account and GUI are each held by a free
> Windows product (Pane, Maestro, Nimbalyst) and are no longer differentiators.
> What is not held elsewhere: the signal names its source. Killed: coordinator
> mode, SSH panes, ACP notices as attention, free-text steer on the phone card,
> Cloudflare tunnel, subagent rendering, avatars, agent mailboxes.

**`docs/beta/03-install-watch-protocol.md`** — one watched measurement:

> Each time the deck's row and the pane disagree about whether an agent is
> waiting, record it, with which source made the claim (hooked / screen) and
> which was right.

**`docs/beta/02-recruiting-message.md`** — the differentiator sentence, per
B3, drafted by `marketing`; not reproduced here because the phone-card clause
is forbidden until step 7.

---

## 7. Decide first

1. **Does B2 (the disagreement count) go into the protocol before candidate
   one?** Default **yes** — it is one line, and a session without it cannot
   score the only clause of the residue that still stands.
2. **Is the Codex hook half built before or after the fifth session?**
   Default **after**, and only if W1 shows a Codex user. Unchanged from 09-10.
3. **Is W5 (worktree expectation) a watch or a re-opened decision?** Default
   **watch**. The 0.13.0 default was turned off on purpose; two unprompted
   asks re-open it, one does not.

---

## Sources

Herdr: [v0.9.0](https://github.com/herdrdev/herdr/releases/tag/v0.9.0) ·
[seed](https://herdr.dev/blog/herdr-raised-a-seed/) ·
[YC](https://herdr.dev/blog/herdr-is-joining-y-combinator/) ·
[repo](https://github.com/herdrdev/herdr).
Orca: [releases](https://github.com/stablyai/orca/releases).
Intelligent Terminal: [releases](https://github.com/microsoft/intelligent-terminal/releases).
Claude Code: [CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md) ·
[Remote Control](https://claudefa.st/blog/guide/development/remote-control-guide).
Codex: [releases](https://github.com/openai/codex/releases) ·
[releasebot](https://releasebot.io/updates/openai/codex).
Cursor: [Projects](https://cursor.com/changelog/projects) · [changelog](https://cursor.com/changelog).
Antigravity: [releasebot](https://releasebot.io/updates/google/antigravity).
Warp: [platform docs](https://docs.warp.dev/platform/).
ACP: [session notices RFD](https://agentclientprotocol.com/rfds/session-notices) ·
[repo](https://github.com/agentclientprotocol/agent-client-protocol) ·
[registry](https://github.com/agentclientprotocol/registry/releases).
agentproto: [2026-09-06 release](https://github.com/agentproto/ts/releases/tag/release/2026-09-06).
Pane: [site](https://runpane.com/) · [pricing](https://runpane.com/pricing.md) ·
[Windows agent managers](https://runpane.com/agent-managers-for-windows).
Maestro: [repo](https://github.com/RunMaestro/Maestro).
Nimbalyst: [repo](https://github.com/nimbalyst/nimbalyst).
Munder Difflin: [article](https://mer.vin/news/munder-difflin-turns-coding-agents-into-a-self-running-office/).
OpenCode: [site](https://opencode.ai/).
GitHub mission control: [github.blog](https://github.blog/ai-and-ml/github-copilot/how-to-orchestrate-agents-using-mission-control/).
Practitioner evidence: [Ask HN](https://news.ycombinator.com/item?id=46993479) ·
[review bottleneck data (secondary)](https://www.flowverify.co/blog/ai-code-review-bottleneck-2026-data).
