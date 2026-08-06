# 1DevTool gap analysis — 2026-07-27

Re-research of **1DevTool** (the app whose video seeded Milestones 8/9) against
DevDeck **v0.7.6**. The NOTES.md entries are from 2026-06-27 and describe v1.26;
this is the current public feature set plus an honest scorecard.

Sources: [1devtool.com](https://1devtool.com/),
[AIChief review](https://aichief.com/ai-coding-tools/1devtool/),
[Product Hunt](https://www.producthunt.com/products/1devtool).

## Headline finding

**Most of the June wishlist is already shipped.** Of ~20 features 1DevTool now
advertises, DevDeck matches or exceeds **16**. Two of the items still sitting in
NOTES.md as aspirational — *Agent Pipelines* and *QR pairing* — were built weeks
ago. Don't rebuild from those notes; they're stale.

Their pitch is worth quoting because it's also DevDeck's thesis:

> "When everything lives in the same place, tools know each other — the browser
> knows what page you're on, the DB client knows what query you ran, the API
> client knows which request failed — so AI already has the context and you don't
> need to explain or copy logs."

Both apps implement that as **push** (a "send to AI" button). Neither lets the
agent **pull**. That's the opening — see "Something better" below.

## Scorecard

| 1DevTool (July 2026) | DevDeck v0.7.6 | Evidence |
|---|---|---|
| Parallel multi-CLI agents | ✅ | agent presets + sessions |
| Project groups, one-click switching | ✅ | `ProjectSwitcher`, Ctrl+K |
| **Agent Pipelines** — conditional branching, delay/checkpoint nodes | ✅ **equal/better** | `pipeline.ts`: `BranchTarget = "next" \| "stop" \| {goto}`, `gate`, `delayMs`, `checkpoint`, `onFail`, triggers |
| Terminal record & replay | ✅ | `main/recorder.ts`, `RecordingsModal` |
| Embedded browser, screenshot annotation, send-to-AI w/ console logs | ✅ | `BrowserPanel`, `browserNet.ts` |
| HTTP client, saved requests | ✅ | `ApiPanel`, `main/http.ts` |
| Git worktrees | ✅ | `main/worktrees.ts`, `WorktreesModal` |
| AI Diff review + approval workflow | ✅ | `ChangesModal`, `ReviewPanel`, inline Approve/Deny (`e963525`) |
| Activity feed across all projects | ✅ | `ActivityPanel` |
| Smart notification when agent finishes | ✅ | Notifications hub (0.7.0) |
| Per-agent status badges (running/waiting/done) | ✅ | deck agent keys |
| Remote mobile access + **QR pairing** | ✅ | `main/server.ts`, `SettingsModal.tsx:1228` |
| Skills & MCP support | ✅ | `skills.ts`, `ExtendAgentModal`, MCP catalog (0.7.0) |
| Prompt history / drafts per project | ✅ | `composerDrafts`, snippets |
| AI session continuity (resume) | ✅ | `resumeArgs` + Resume button (0.7.6) |
| Custom commands for bash/zsh/PowerShell | ✅ | startup commands (`2b454c8`) |
| Token/cost visibility | ✅ **better** | 0.7.0 parses `~/.claude/**.jsonl` for real tokens + USD; theirs is quota-only |
| File-ownership / conflict map | ✅ **unique to DevDeck** | 0.7.0 — they have no equivalent |
| **26-engine DB support** | ⚠️ 4 engines | `DbKind = postgres \| mysql \| sqlite \| sqlserver` |
| **Persistent terminals** (tmux-backed, survive restart) | ❌ | no reattach in `main/pty.ts` |
| Agent breadth (Antigravity, Amp, OpenCode, Cline, Aider, Qwen) | ~ | 5 presets; custom agents are user-addable |
| `@mention` another agent to chain reviews | ~ partial | `ReviewPanel` fans out to lenses; no ad-hoc agent→agent handoff |

## The three real gaps — and verdicts

### 1. Persistent terminals across app restart — *don't chase this*
They get it free from **tmux**. Windows has no tmux, and a PTY is a child process
that dies with its parent — genuine reattach would mean a detached broker service
outliving the app. That's a large, crash-prone subsystem for one convenience.

The **Resume button just shipped in 0.7.6 is the pragmatic 80%**: the process
doesn't survive, but the *conversation* does (`claude --continue`). Sessions,
layout, and drafts already persist. Leave it.

### 2. DB engine breadth — *cherry-pick two*
26 engines is a marketing number. The four DevDeck has cover relational work,
and `sqlserver` matters for your .NET projects — 1DevTool's list leads with
Postgres/MySQL/Mongo/Redis/Elasticsearch. Only **MongoDB** and **Redis** are
plausibly useful to you; both are one driver + one `DbKind` branch each. Low
priority, cheap when wanted.

### 3. Agent-to-agent handoff — *worth building, small*
Pipelines already cover the *scripted* case. What's missing is the ad-hoc one:
"have Codex review what Claude just wrote." DevDeck has every primitive
(`broadcast`, `agentSessions()`, changes diff) — this is a composer target option,
not a subsystem.

## Something better

Five ideas that go past 1DevTool rather than catching up to it. Ranked.

### 1. DevDeck *as* an MCP server — let the agent pull ★★★
**Shipped 2026-07-27** (`main/mcpserver.ts`, `main/mcptools.ts`) — as an **HTTP**
server hosted by the main process rather than the stdio server sketched below.
Stdio would have spawned a separate process that couldn't see DevDeck's in-memory
connection pools, needing a second bridge back in, and would have had to ship
unpacked outside `app.asar`. Claude Code accepts `{"type":"http","url":…,"headers":…}`
in `.mcp.json`, so hosting it here removes both problems. The DB tools landed
(`devdeck_projects` / `db_connections` / `db_tables` / `db_query`, read-only,
loopback, bearer-token, off by default); HTTP-replay and console-log tools are
still open — see the note at the end of this section.

Both apps push context at the agent via buttons. Invert it: expose DevDeck's
in-process tools as MCP tools so Claude fetches what it needs, unprompted.

- `devdeck_db_query` — read-only SELECT against the project's connected DB
  (`main/db.ts` already enforces read-only for remote)
- `devdeck_http_send` — replay a saved request, return status/timing/body
  (`main/http.ts`)
- `devdeck_console_logs` — captured console + network for the current browser page
  (`browserNet.ts`)
- `devdeck_build` — run `dotnet build`, return structured diagnostics (`dotnet.ts`)

Why this is strictly better than their model:
- **No copy-paste, no button, no stale paste.** The agent queries the live DB
  mid-task instead of reasoning over a table you pasted ten minutes ago.
- **DevDeck already writes `.mcp.json`** (`main/mcp.ts`) — registration is a
  catalog entry pointing at DevDeck's own stdio server. The plumbing is there.
- It closes the `sendToAgent` question properly: keep push for
  human-initiated sharing, add pull for agent-initiated lookup. They're
  complementary, not redundant.
- Read-only + path-confined by default, reusing `guards.ts`.

Nothing on 1DevTool's page suggests they serve their *own* panels as MCP tools —
they list "MCP server integration" as consuming external servers, the same thing
DevDeck's catalog does.

~~**Still open after the first cut.**~~ **Closed 2026-08-07 (0.7.10).** Both
landed as predicted — a case in `callTool`, an entry in `TOOLS`, and a dep in
`mcpDeps`. Notes on what the sketch above got wrong:

- `devdeck_http_send` is split in two: `devdeck_http_requests` lists, `_send`
  replays by id. The agent never supplies a URL, which is what keeps the tool from
  being an SSRF primitive — the reachable target set is exactly what the user
  saved. It is also the **only non-read-only tool** in the surface, so the module
  header's blanket "every tool is read-only" claim had to be corrected.
- `devdeck_console_logs` needed more than a registry: **console output wasn't being
  captured at all.** `browserNet` only had `Network.*`; it now also enables
  `Runtime` and `Log` and buffers `consoleAPICalled` / `exceptionThrown` /
  `entryAdded`. The registry itself is `attachedPages()`, which also prunes dead
  ids. Console text needs printf-style rendering (`%c` consumes its CSS argument
  and emits nothing) or Electron's own security warnings arrive with styling
  spliced into the message.
- Known limit: capture begins at attach, so anything logged before the Browser
  panel mounted is not in the buffer.

### 2. Gate pipelines on ground truth, not agent prose ★★★
`StepGate` currently inspects the agent's **output text**. DevDeck owns real
signals the agent can't fake: did `dotnet build` pass, did tests go green, did the
HTTP request return 200, is the diff non-empty. Add gate kinds that assert on
those. "Don't advance until the build is actually green" is a categorically
stronger guarantee than pattern-matching "I've fixed it!" — and it's the natural
payoff of having the build panel and the pipeline in one app.

### 3. Cost per task, not cost per day ★★
0.7.0 already computes real USD from transcripts. Currently sliced by
model/project/day. Attach it to the **unit of work** instead: stamp a task card
and a pipeline run with what it cost. You'd learn which kinds of work are
expensive — nobody in this category does this, and DevDeck already has the data.

### 4. Prevent conflicts at dispatch, don't just report them ★★
The 0.7.0 conflict map is detection *after* two agents have both touched a file.
Since dispatch goes through DevDeck, check overlap **before** spawning: "Agent A
is holding `store.ts`; this task's files overlap — dispatch anyway?" Cheaper than
the merge it avoids, and it builds on the ownership data already collected.

### 5. Resume with a briefing ★
`claude --continue` restores the agent's context but not *yours*. On resume, show
what changed while you were gone — commits landed, files touched by other agents,
build status now vs then. Small, and it fits the supervision-first framing of
Mission Control.

## Explicitly don't build

1DevTool's surface sprawls: **Notes, Draw, Templates**, top workspace tabs, a
right activity bar. The June note already flagged this and it still holds — the
wabi-sabi rule is that every feature justifies its visual weight. The Task board
(0.7.0) was the one that earned it. **Draw** and **Templates** don't.

Also skip **"AI quota in terminal"** — still no quota API for Claude; the
token/cost dashboard is the better answer and DevDeck already has it.

## Recommended order

1. ~~**MCP server** (#1)~~ — **done.** First cut 0.7.7, `http_send` +
   `console_logs` in 0.7.10. The tool surface is complete as sketched.
2. ~~**Ground-truth gates** (#2)~~ — **done in 0.7.7**: the `Command succeeds` /
   `Command fails` gate modes.
3. **Agent-to-agent handoff** (gap 3) — *mostly done*: `ChangesModal` has a
   handoff-agent picker that sends a diff to a chosen agent for Review / Explain /
   Commit-msg. What's still missing is handoff from a live **session** rather than
   from a diff.
4. Cost-per-task (#3), dispatch conflict guard (#4) — both still open. The data
   exists for each (`usage.ts`, `buildOwnership()`); neither is wired to the unit
   of work or to dispatch yet.
5. Mongo/Redis (gap 2) only if a real project needs them

**Read this scorecard sceptically.** Two of its "open" items were already shipped
when it was re-read on 2026-08-07 — the same staleness it warns about in NOTES.md.
Check the code before believing any line here.
