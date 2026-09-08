# Developer workflow — what to build next, and the ruling on skills

`product-reviewer`, **2026-09-08**. Scope: the target ruled today in
`2026-09-08-product-direction.md` — one Windows developer, real shell, an agent
CLI most days, more than one repo, whose problem is not knowing which agent
needs them. Written against the same `HEAD` (`cfe2f05`) and the same beta plan
(`2026-09-08-beta-execution.md`). Does not re-open the milestone, the sequence,
or D1. Everything here is either **queued behind 2026-10-06** or **watched for**
during it — nothing here is proposed as a sixth thing to build before the first
invitation.

---

## 1. The target developer's real working day

Derived from evidence, not imagination, in order of how strong the evidence is.

**Strongest: the empty-table test.** `%APPDATA%/devdeck/` on the one machine
that has ever run this app holds no database connections, no saved API
requests, no environments, no git accounts, no ssh profiles, no routing rules,
no triggers, two Task rows, and 76 rows of real terminal/agent usage. Read
plainly: the day is **terminals and agents**, and everything adjacent to that —
a database GUI, an API client, a work-item board — was built on a guess about
the day and refuted by the day itself.

**Corroborating: `PRODUCT.md`'s own pain paragraph and the one real user quote**
(2026-06-26): "*most of my works are on terminal using claude cli so I hope this
tool can also allow me to easily switch between projects and have multiple
terminal active at the same time*." Multi-project, multi-terminal, agent-driven
— stated once, before any feature existed to bias the answer.

**Corroborating: the beta's own archetypes** (`docs/beta/01-who-to-approach.md`).
A/B/C are all variations of the same day: several checkouts open at once (an
API repo, a web repo, a jobs repo, a shared library — or three to eight client
repos with no IT department), an agent CLI running in more than one of them at
once, and the specific, recurring loss of *"which of these is blocked on me."*
Archetype C names it exactly: *"they lose answers because an agent asked a
question in a tab they were not looking at."*

**The day, concretely, step by step:**

1. Open a project (or several) — DevDeck's project switcher replaces re-`cd`ing
   and re-opening tabs across a terminal emulator, an IDE, and whatever else was
   open.
2. Start one or more agent CLI sessions per project (`claude`/`codex`/`gemini`),
   sometimes across a worktree-per-agent so parallel sessions don't collide on
   one working tree.
3. Fire the same or related prompts at more than one session at once
   (`PromptComposer`'s broadcast, already shipped) rather than retyping per tab.
4. Wait, doing something else — reading in another window, or working in
   another project's terminal — and rely on **one place** to say which of the
   several running sessions now needs a decision (`wantsYou`, the deck's "N need
   you," Overview's sorted rows, the phone card).
5. When a session needs a decision: approve/deny a permission prompt, or read
   what it produced. Reading real code changes still happens by **alt-tabbing
   into a real IDE** — DevDeck's Editor is deliberately a reader/diff surface,
   not an IDE (no LSP, no debugger), so anything beyond a quick read-and-diff is
   done by hand, outside DevDeck, on purpose.
6. Commit, and open a PR — already automated (ticket→worktree→review→PR loop,
   shipped v0.3.2), so this is no longer a manual step for this developer.

**What is still done by hand, that DevDeck does not touch:**
- Real editing beyond a quick diff/read (VS Code or Rider, alt-tabbed to).
- Killing/restarting a genuinely stuck agent process (Ctrl+C in the pane).
- Deciding *when* to check in on an agent that isn't flagged — DevDeck answers
  "who is asking," not "who is taking too long in a way worth interrupting."
- Authoring a new skill or subagent from scratch — done directly through the
  agent CLI's own skill-writing workflow (see §3), not through DevDeck.
- Recruiting/observing other users — `field`'s job, explicitly not automatable
  (the whole reason telemetry is forbidden).

**What the day does *not* include, on the only evidence available:** opening a
database GUI, building or replaying an HTTP request, configuring a git account
or an ssh profile, defining a routing rule or a trigger, or treating Tasks as a
place work lives. Four production dependencies (`pg`, `mysql2`, `mssql`,
`node-sqlite3-wasm`) and ~2,200 lines exist for a day that has never happened on
this machine. D1 already accounts for this; I am not re-opening it.

---

## 2. Candidates — generated, then triaged

### Build now

**Nothing.** The beta plan's own second test — *is this a human act or a code
change?* — applies to every candidate below with equal force to how it applied
to the ruling's steps 10–12. Every remaining blocker to 2026-10-06 is a human
act (H1–H4), and a code change right now, however well-argued, is a way of not
performing it. This report generates candidates and ranks them; it does not
put a fifth piece of engineering in front of K6.

### Queue behind the beta, ranked

**1. Replace tailHash/`cleanTail` prompt-matching with the agent CLI's own hook
signal, where the CLI exposes one.**
- **For:** the core supervision loop — this is the single highest-leverage
  place to spend engineering once D1 and the beta clear.
- **Source of truth:** Claude Code's own hook events (`Notification`,
  `Stop`) — a fact the CLI emits about its own state, not a reconstruction of
  what it printed to a terminal. Compare against what exists today:
  `detectApproval`'s tailHash match is built on `cleanTail` gluing screen lines
  back together, and the QA plan itself flags this (`H1` Step 4, judgement
  call **J6**) as changing "every `tailHash` and so which prompts are detected"
  — a `technical-director`-level risk, not a hypothetical one.
- **What it replaces / could delete:** backstops, and over time could retire,
  the most fragile part of the text-reconstruction pipeline that decides
  whether Approve/Deny appears on a tile, in Overview, and on the phone. This is
  exactly the recurring bug class the ruling names — "a surface asserting
  something it never observed" — except here the risk runs the other way: a
  **false negative**, the tile staying silent about a real question. A
  supervision app that misses this is worse than one that has never claimed
  the feature.
- **Consistent with the product's own history, not a new idea:** the Decisions
  log already records one pivot away from output-parsing toward a more exact
  signal (2026-06-27, "Claude status from activity + bell, not output
  parsing"), and a bell character later turned out to be one of the specific
  signals that lied (`tileState.ts:5-11`). A CLI-native hook is the next honest
  step in that same trajectory, not a detour from it.
- **Cost if wrong:** feasibility is CLI-specific and unverified here — Claude
  Code has a documented hooks system; whether Codex CLI and Gemini CLI expose
  an equivalent is not established in this repo. Building it only for one CLI
  and describing the result as "agent" detection in general would be exactly
  the kind of overclaim this product exists to avoid. See **Decide first**.
- **Touches:** `src/main` pty/session layer (`missionTail`-adjacent), wherever
  `detectApproval`/`cleanTail`/tailHash live, plus per-CLI hook configuration.
  Medium size — a real engineering track, not a document edit.

**2. An ambient "N need you" signal outside the DevDeck window — a Windows
taskbar overlay icon, nothing more.**
- **For:** the moment the developer is *not* looking at DevDeck at all (in the
  IDE reading a diff, in a browser) — today the only way to learn an agent
  needs them is to alt-tab back in and read the deck.
- **Source of truth:** the same `wantsYou`/tile-state count already computed
  for the deck's "N need you" chip. This is not a new signal — it is the
  existing exact count, projected to a place the developer already looks
  (the taskbar) instead of a place they have to return to. No new inference,
  no new count — the "one count per question" rule stays satisfied because it
  is the *same* count.
- **What it replaces:** the implicit workaround today, which is "keep alt-
  tabbing back to check." It replaces a habit, not a feature — there is no
  existing DevDeck surface for this.
- **Not a panel.** It adds nothing to the deck, the view keys, or the window.
  It is `BrowserWindow.setOverlayIcon()` on Windows, driven by a count that
  already exists. Confirmed absent today: no tray icon, no overlay icon, no
  badge, no `flashFrame` anywhere in `src/main/index.ts`.
- **Cost if wrong:** low and reversible — an icon overlay with no persisted
  state and no new IPC contract. If nobody notices it or it proves noisy, it is
  a one-line removal.
- **Touches:** `src/main/index.ts` (a `setOverlayIcon` call driven by the
  existing store subscription that already produces the deck's count).
  Small.

### Watch the beta for evidence

**3. "Copy this installed skill/agent to another of my projects."**
A quick action in the existing Extend Agent hub, since DevDeck already knows
every project the developer has open. Cheap (a filesystem copy between two
known roots the app already resolves; no new IPC contract). Not proposed to
build now because the evidence for it is exactly one installation, ever (see
§3) — watch for whether a beta user in archetype B or C (3+ repos in flight)
installs a skill and asks how to get it into their other repos before building
this.

**4. MCP-server catalog/discovery, mirroring the skill catalog.**
No evidence at all — zero recorded use of the existing per-project `.mcp.json`
editor in Settings, versus the skill catalog's one real use (§3). The stakes
are also higher: an MCP server executes arbitrary code, so a "vetted" badge
here is a stronger promise than "vetted" on a skill, and DevDeck cannot fully
stand behind it. Watch for a beta user getting stuck trying to hand-edit
`.mcp.json`; if that never happens, this stays dead.

### Killed

- **Any further growth of the Database or API clients** (a fifth engine,
  OAuth flows, a mock server, GraphQL). Already forbidden in section 5 of the
  direction ruling, on airtight evidence (§1). Not re-argued; the kill is
  correct.
- **Skill/subagent authoring UI inside DevDeck.** The evidence points the
  other way: of the six skill directories in this repo's own `.claude/skills`,
  four (`devdeck-design`, `electron-best-practices`, `handoff`, `run-app`) are
  tracked, hand-authored files — written directly through the agent CLI's own
  skill-writing workflow, not through any DevDeck tooling. The developer
  already has a working way to author skills, and it is the CLI's, not an app
  window's. Building a form to write `SKILL.md` duplicates a job already done
  well one layer down.
- **Skill versioning / update-checking.** Requires new persisted state and a
  network poll for a feature used exactly once. Expensive and sticky for n=1
  evidence; revisit only alongside repeated real use.
- **A "generate a skill from this session" AI-assisted authoring feature.**
  Real-sounding, but the evidence in this very repo argues against it (see
  above — this developer authors skills directly, doesn't ask a tool to draft
  them), it needs a new LLM-calling flow, and it is speculative. Parked, not
  built, and only revisited if several beta users are independently seen
  hand-writing repeat-instruction skills and say they wish the app did it.
- **A skills marketplace / ratings / social sharing.** Team-shaped, and
  telemetry-adjacent (usage counts, ratings) — both independently forbidden in
  section 5. Also unnecessary: GitHub and the CLI's own plugin ecosystem
  already are the marketplace; DevDeck installing *from* one is enough.
- **Worktree-per-agent as an app-managed lifecycle.** Already checked against
  Orca and killed (`IDEAS.md`, `.superpowers/orca-2026-08-30/T1-build-list.md`)
  — it would silently retire "a project is the unit of context." Reaffirmed,
  not re-argued.
- **Agent hibernation / silent stale-to-idle decay.** Already killed as "a
  signal that lies" (same Orca comparison). Reaffirmed.
- **A dedicated cross-project attention dashboard or pop-out window.** Already
  killed — "four surfaces answering one question" (Orca comparison). The deck
  and Overview already are that one surface; an eighth answer to "who needs me"
  is the exact regression the whole product exists to prevent.
- **Guided tour / onboarding modal.** Explicitly refused in section 5 of the
  direction ruling ("refused, not deferred"). Not re-proposed.
- **In-app telemetry or usage analytics**, including anything framed as "just
  to see if skills get used." Explicitly forbidden, including anonymous.
  `field`'s manual observation is the instrument; see §4 for what to point it
  at.
- **Session cost/token tracking as a new feature.** The one surface that
  already does this — the usage ledger — has a confirmed data-loss bug and is
  correctly on the watch list already (trigger: any user opens the Usage view).
  Adding a second cost surface before fixing the first repeats the "one count
  per question" mistake the product spent a whole audit correcting. Not
  proposed; the existing watch-list item is the right shape.
- **Native OS toast notifications as a new build.** Not new — one already
  exists and is simply unverified (`F9` in the direction ruling's "claimed and
  not proven" list, owned by H1). Nothing to add here; it will be settled by
  the phone/notification sitting already scheduled.
- **A `yolo/manual/mixed` permission chip.** Already killed against Orca — "it
  lies on any custom arg." Reaffirmed, not re-proposed.

---

## 3. Ruling on skills as a product feature

**What the Extend Agent hub actually does today**, read from
`src/renderer/src/components/ExtendAgentModal.tsx`, `src/main/skills.ts`,
`src/main/skillsCore.ts` and `src/main/skillsCatalog.ts`: it is a modal opened
from the command palette (`Ctrl+K` → "Extend agent"), **not a deck key and not
a panel**. It browses one curated, hardcoded catalog entry (`emilkowalski/skills`)
or an arbitrary `owner/repo` URL, `git clone --depth 1`s it into a temp
directory, classifies files into skill directories (containing `SKILL.md`) and
agent files (`agents/*.md`), shows the raw content for read-before-install, and
on confirm copies the chosen item into `.claude/skills/` or `.claude/agents/`
at either **project** scope (the open project's root) or **global** scope
(the user's home directory) — both are conventions the agent CLI itself
already reads, not something DevDeck invents. It keeps no persisted store of
its own (no `settings.json` key) — "installed" is read live off disk each time
the modal opens. Removal is guarded against path traversal (a real, fixed bug:
`extend:remove` was once an unanchored regex that could delete outside the
target scope's root — see `CHANGELOG.md`, "Uninstalling a skill is confined to
a root"). It has never touched the API or Database panels' territory and it
is not part of the supervision loop — installing a skill does not change who
the deck says needs you.

**Whether it is used — checked directly, because the empty-table test does not
reach it.** There is no persisted store to read, so absence-of-evidence would
otherwise be ambiguous. But the filesystem itself settles it: this repo's own
`.gitignore` (lines 27–28) deliberately excludes `.claude/skills/apple-design/`
and `.claude/skills/animation-vocabulary/` — the exact two skill names in the
one catalog entry's description ("apple-design, review/improve-animations,
animation-vocabulary"). `ROADMAP.md`'s own step-2 verification independently
confirms `git log --all -- .claude/skills/apple-design/` is empty, i.e. the
directory was never tracked, only ever installed. **This is the opposite
finding from the Database/API/Work panels: not zero use, but one real,
deliberate, gitignored install, on 2026-09-02, that has stayed in place since.**
It is the only surface among the ones checked in this document with positive
evidence of use by the one person who has ever run this app.

**The ruling, applying the identity's own test — does it serve the developer
supervising several agents across several repos:**

It does **not**, directly — installing a skill changes nothing about who needs
you, and it is reached through the command palette precisely because it must
never compete with the deck for attention. That is also why it survives: it
does not cost the thing this product protects.

**Keep it exactly as it is. Do not grow it, and do not let DevDeck become a
skills product.** Four reasons:

1. **It is cheap and already built** — no persisted schema, no daemon, no new
   dependency (`git clone`, which the machine already has and uses constantly).
   There is nothing to "stop carrying" here because it costs almost nothing to
   carry.
2. **It is not a panel and must never become one.** Any proposal to promote it
   to a deck key, a sidebar, or a dashboard is arguing against the whole
   direction of travel this document was asked to respect, and would need to
   win that argument explicitly. Nothing below does.
3. **DevDeck is not the place skills get authored, versioned, rated, or
   discovered beyond one curated entry point.** That is the agent CLI
   ecosystem's job — GitHub repos, the CLI's own plugin/skill conventions —
   and this repo's own `.claude/skills` folder is living proof the developer
   already uses that job well (four of six skills present are hand-authored
   through the CLI, not installed through DevDeck at all). Building authoring,
   versioning, or a marketplace here would duplicate infrastructure the
   ecosystem already provides, for a workflow this developer has already
   solved without DevDeck's help.
4. **One real use is real evidence, but it is still n=1.** It is enough to
   justify "keep, as is." It is not enough to justify "invest further." The
   two candidates that would grow it (§2, cross-project copy; MCP catalog) are
   watched-for, not built, for exactly that reason.

---

## 4. What the beta should be instrumented to notice

Telemetry is forbidden; every item below is a thing for `field` to ask in the
intake, watch for during the recorded session, or add as a field to the
existing templates — the same shape as what T4 already did for the API/
Database panels. Concrete additions:

- **Add to `docs/beta/04-session-record-template.md` §5**, beside the API/DB
  y/n fields T4 adds: *did they open the command palette entry "Extend agent —
  skills & agents…" unprompted (y/n); if yes, what were they trying to do.*
  This is the only remaining way to learn whether skill distribution is a
  felt need beyond the one person who has ever used it, or an idea that only
  ever had an audience of one.
- **Watch specifically for a missed approval prompt** — a session where the
  terminal pane clearly shows the CLI waiting on a permission question but the
  tile, Overview row, or phone card does not reflect it. This is the exact
  failure mode candidate §2-1 (the hook-based detector) would fix, and a single
  observed instance during the beta is the strongest possible argument for
  prioritizing it the moment engineering resumes. Add it to
  `docs/beta/03-install-watch-protocol.md` beside the shell-mismatch watch,
  in the same "mechanism / what it looks like on screen / how to tell it from
  a correct read / what to record" shape as `06-shell-mismatch-watch.md`.
- **Watch for whether a user ever discovers they were needed by accident**
  — i.e., they say something like "oh, I didn't realize it was waiting," found
  only because they happened to alt-tab back. This is the direct evidence test
  for candidate §2-2 (the taskbar overlay): if nobody ever says this, the
  ambient signal is solving a problem that does not actually cost anyone
  anything, and it should not be built even after the beta.
- **Q6 of the existing intake** ("when you switch from one project to another,
  what do you actually do?") already tests the core premise once, honestly,
  before the user knows what the app does — reuse it verbatim; do not add a
  second version of the same question anywhere else in the flow.
- **Archetype D (WSL/Git Bash) sessions specifically** — already pre-registered
  as the shell-mismatch watch; nothing to add, but it is the single
  highest-value watch already scheduled and should not be crowded out by any
  of the additions above.

---

## Decide first

1. **Do Codex CLI and Gemini CLI expose a hook or notification mechanism
   equivalent to Claude Code's, that DevDeck could use for candidate §2-1?**
   Unverified in this repo. Recommended default: build the Claude Code path
   first, behind the same per-CLI conditionality the product already has
   elsewhere (it does not pretend a Windows-only claim covers macOS), and do
   not describe the result as "agent" detection in general until the other two
   are checked. If they lack an equivalent, tailHash matching stays their only
   mechanism and candidate §2-1 becomes "Claude Code only," which is still
   worth building for the plurality of users who run it.
2. **Does `BrowserWindow.setOverlayIcon()` interact safely with the existing
   crash-card / deny-all IPC hardening**, or does it need its own review pass
   the way every other main-process change does? Unverified here; recommended
   default is a five-minute `technical-director` sanity check before
   `frontend-dev`/`backend-dev` picks it up, given its size.
