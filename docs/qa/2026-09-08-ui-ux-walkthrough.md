# DevDeck — UI/UX walkthrough, 2026-09-08

An account of **using** DevDeck end to end, written for the five strangers who are
about to be handed it. Everything below was observed in the running app unless it
is explicitly labelled **inferred** or **read from source**. Screenshots are in
`docs/qa/2026-09-08-shots/` and every claim names the one that shows it.

---

## 0. Method, and what that method changes about the answers

| | |
|---|---|
| Repo | `D:\Personal\Personal Projects\Products\devdeck`, branch `d1-delete-verify-panels`, HEAD `7ad8012`, tree clean |
| Build | `npx electron-vite build` — succeeded, `out/` current for every run |
| Harness | `.claude/skills/run-app/cdp.js`, 13 scenario runs on ports 9411–9422 |
| Profile | **A scratch `userDataDir`** (`…/scratchpad/ud1`), created empty. Run 1 (`01-first-run.png`) is therefore a genuine first launch: no `settings.json`, no `workspace.json`, `projects.json` absent. |
| Real user state | Backed up before starting; verified **byte-identical** afterwards (`workspace.json`, `projects.json`, `settings.json` all UNCHANGED). The user's five `DevDeck.exe` processes were never touched. |

**Projects used** (scratch folders, one deliberately with a space in the name):
`…/scratchpad/projs/alpha app` (git repo, `package.json`, one uncommitted change),
`beta-service` (git repo, nothing committed), `gamma-tool` (not a git repo),
`gone-soon` (deleted mid-walkthrough).

### The one substitution I made, and why it is honest

The product's core claim is *"you can tell which of several agents is waiting on
you."* Driving that with real `claude` sessions would have made the states
non-deterministic. So I read how DevDeck decides:

- any pty output → `"working"` (`src/renderer/src/store.ts:926`)
- silence past `agentIdleMs` (default 6000ms, `settings.ts:466`) → `"waiting"` (`store.ts:940`)
- a real BEL, OSC-terminators excluded → `"attention"` (`store.ts:917`, `missionTail.ts:61`)

Classification depends on **bytes on the pty and nothing else**, and any preset
with `runMode: "agent"` is treated as an agent (`store.ts:456`). So I registered
stand-in agent presets whose commands are `node` scripts that print, or go quiet,
or emit `\x07`, or ask a question and echo what they are sent. Every state below
travelled the real pty → real store → real components. Only the *program* was a
stand-in. I also ran a real plain PowerShell terminal, and `claude`, `codex`,
`gemini` were all genuinely on PATH (confirmed in the diagnostics record).

### What this method cannot see — stated up front

1. **HTML5 drag-and-drop is unobservable over CDP.** DevDeck advertises drag in
   at least four places I found (`data-tip="Drop to insert into this session"` on
   every deck key, `"Drag onto an agent session to insert @path"` on every editor
   tree row, drag-to-split between tabs, folder-drop onto the window). **None of
   it was tested. Do not read anything below as evidence that drag works or
   doesn't.** A human has to try it.
2. **The native "Open folder…" dialog was never opened.** It is a modal OS dialog;
   CDP cannot dismiss it and it would have wedged the run. I added projects with
   `window.api.projects.addPath(...)`, which is the same IPC the folder-drop path
   uses. So: *the first click a stranger makes on the first-run screen is the one
   thing I did not click.* Someone must confirm the dialog opens, starts somewhere
   sensible, and that Cancel is harmless.
3. **The crash card was not reached.** I injected a fault
   (`Date.prototype.toLocaleString` throwing) and opened the panel that formats
   dates; no boundary fired (`48-crash-attempt.png`, `54-crash-card.png` — both
   show a normal app). The copy in `ErrorBoundary.tsx:32-63` and
   `RegionBoundary.tsx:101-123` is **read from source, not observed.**
4. **The `!` attention glyph on a *compressed* key is inferred**, from
   `AgentKey.tsx:71` rendering it outside the `!compressed` guard. I never got
   attention and >4 keys in the same strip at the same moment.
5. **The "More" deck tool is unobserved** — my backdrop-dismiss failed and the
   previous modal was still open when I clicked it (`63-tool-more.png` shows the
   AI-usage modal, not a More menu).
6. **The close-with-agents-running veto** (memory says it needs `WM_CLOSE`) was
   not exercised.
7. **Screenshots that are method artifacts, not evidence** — ignore these:
   `41-editor-file.png`, `44-overview-layout.png`, `45-jump-longest-waiting.png`
   (failed selectors), `43-narrow-*.png` (the command palette was still open and
   covers the frame — use `47*` instead), `03-after-addpath-no-reload.png` (adding
   a project over IPC doesn't push to the renderer; a real `projects:add` returns
   to the caller, so this is my harness, not a bug).

---

## 1. The path a stranger walks

### 1.1 First launch — `01-first-run.png`

Genuine cold start: no `settings.json` existed. `data-theme="slate"`,
`data-style="modern"` — so **Slate + Modern Pro is the real default**, not a
leftover.

One object on a void: the title `DevDeck`, a lede, one accent button, two lines of
prose, one hint.

> DevDeck
> A cockpit for the projects you already have: terminals, agent sessions, an editor and git status, one folder at a time.
> **[ Open folder… ]**
> DevDeck runs agent CLIs you install yourself — `claude`, `codex`, `gemini`.
> Found on your PATH: `claude`, `codex`, `gemini`.
> Ctrl+K reopens this list later.

This is good, and the PATH line is the best thing on it — it is a live probe, not
boilerplate. Branch copy read from `probeView.ts:170`: it says
"None were found in PowerShell's PATH, which is the one DevDeck reads", or
"DevDeck couldn't read your shell's PATH, so it hasn't checked them", or
"You have no agent commands configured yet." **The all-found branch is the only
one I observed** — my machine has all three.

Three things a stranger meets here:

- **There are two `Open folder…` buttons on screen** — the accent one in the
  middle, and a second in the deck at bottom-left (`button.deck-empty`). They do
  the same thing. The bottom one is unlabelled as to why it exists.
- **A run button in the top bar that is live with no project.** `button.topbar-run-btn`
  is not disabled and its tooltip reads *"No start command found — DevDeck looks
  for a package.json, a .sln/.csproj, or a go.mod in this folder."* There is no
  "this folder". A sentence about a folder, on a screen whose entire message is
  that you have no folder.
- **The ensō watermark sits behind the text.** At 1386×837 the large faint ring
  passes through the `Open folder…` button and the paragraph beneath it. Legible,
  but it is decoration overlapping the only two things on the screen.
- **~55% of the window is empty** below the fold.

### 1.2 The deck as it is now: 7 view keys, 6 skins — both confirmed

The bottom deck is `.deck-strips` (per-project agent keys) over `.deck-bar`
(view keys · tool cluster · git/attention status). No icon rail, no sidebar.

Seven keys, in this order, with these shortcuts (from `aria-label`, observed):

| Ctrl+ | Label | Group |
|---|---|---|
| 1 | Mission | — |
| 2 | Tasks | — |
| 3 | Terminal | — |
| 4 | API | `verify` (`group-start`) |
| 5 | Database | `verify` |
| 6 | Browser | `verify` |
| 7 | Editor | `verify` |

F1's sheet agrees: *"Switch view (Mission … Editor) Ctrl + 1 … 7"*
(`64-shortcuts.png`). The eighth key (Network) is gone from the UI. Comments in
the source still say "eight views" — `NoProjects.tsx:9`, `App.tsx:507`,
`TerminalView.tsx:218` — comments only, not user-visible.

Skins: Settings → Appearance offers **3 themes × 2 styles**, and says so in prose:
*"Three themes - Slate and Sumi (dark) and Washi (light) - each applied across the
UI, terminal, and editor. A style sets shape and depth on top of any theme."*
(`30-settings-washi-wabi.png`). 3 × 2 = the 6 skins. Both the count and the
relabel check out.

### 1.3 Where a stranger gets stuck — the seven dead keys

**Finding 1 (confirmed, and the first thing a stranger will hit).** With no
project open, all seven view keys look and behave like enabled buttons, and
clicking any of them does **absolutely nothing** — no view change, no toast, no
change in the panel, no cursor change.

I clicked all seven in order (`02-noproj-*.png`). Every time: breadcrumb stayed
`No project / Mission`, panel text byte-identical, `.toasts` empty. They carry
`aria-disabled="true"` but not `disabled` (`ViewKeys.tsx:81`), so they take the
click and the handler returns early. The explanation exists —
`data-tip="Terminal - open a project to use the views"` — but only on hover, and
a person who has just clicked has already stopped hovering.

Seven clickable, silent buttons across the bottom of the very first screen. This
is the single cheapest thing on this list to fix and the most likely to be the
first bad moment.

### 1.4 Opening a folder, getting a terminal — this part works

With `alpha app` active (`04-view-*.png`), the top bar becomes
`AA alpha app ⌄ / Mission`, the run button's tooltip becomes *"Run project · npm
run dev"*, the deck grows an `ALPHA APP` strip with a `+` (*"Start an agent session
here…"*), and the status bar shows `master` · `● 1 change` · a git-identity icon
whose tooltip is *"Git identity: not set — click to switch account"*.

**A plain shell starts and works.** Terminal view → the launcher's `New terminal`
→ a live PowerShell prompt in the project directory, path with a space handled
correctly (`05-plain-shell.png`). No Avast fast-fail in any of my 13 runs.

**The Terminal empty state is the best onboarding surface in the app**
(`04-view-terminal.png`): *"Launch a command — No terminals yet in alpha app. Pick
a startup command, or open a plain shell"*, then `New terminal` / `Settings`, then
cards grouped `AI AGENTS` / `DEV SERVERS` / `BUILD & TEST`. Each card shows the
name **and the literal command**. `Claude (no permission prompts)` is drawn with a
red border, its command in red, and the words `SKIPS PROMPTS` under it — the risk
is named on the face of the button, not in a tooltip. That is the right call.

Starting an agent from the deck's `+` opens a portalled popover: an `Agent` select,
an `in a new git worktree` checkbox with a `Branch` field, and
`[ Launch Sim Working ]` with an `Enter` hint (`LaunchOptions.tsx`). Clean.

**What a stranger has to already know:** almost every action beyond "open a
terminal" lives only in the command palette. The palette has ~45 items across
Go to / New / Layout / Theme / Style / Sessions / Actions / Pipelines / Help
(`51-palette.png`) and includes things with no other entry point at all —
`Jump to the agent waiting longest (Ctrl+Shift+J)`,
`Overview - all projects, approve or deny without opening a terminal`,
`Search across projects`, `Reopen the last closed session`, `Work - Jira / Azure
items`, `Worktrees`, `Open activity feed`. The main UI advertises none of them.
The `cmd-pill` in the top right ("Search or run… Ctrl+Shift+P") is the only door,
and it reads like a search box, not like *"everything is in here"*.

---

## 2. The claim the product rests on: knowing who is waiting on you

I drove this hard: one agent, three agents, eight agents, one project, two
projects, three projects, watched and unwatched, before and after a restart.

### 2.1 The verdict, in one line

**In Mission view, yes — it reads instantly and it is honest. On the deck, only
when the agent asked a literal question, and only if you were not looking at its
pane when it did.**

### 2.2 What works, and works well

**Mission view is genuinely good** (`60-needs-you-tile.png`, `11-attention-unwatched.png`).
With three agents in three states the header read `3 running · 2 need attention`
and the tiles sorted attention-first:

- `sim attention late 3 · LATE · alpha app` — `Should I delete src/legacy? [y/n]`,
  a left accent stripe, `● NEEDS YOU`, and `✓ Approve` / `✕ Deny`
- `sim waiting 2 · WAIT · beta-service` — `Refactored 4 files. Ready for review.`,
  `◇ WAITING 16s`, and an inline `Reply…` box
- `sim working 1 · WORK · alpha app` — `building... 1788809772623`, `▶ WORKING`

Three different chips, three different marks (`●` / `◇` / `▶`), the project name
on every tile, and **the agent's actual last line of output** — so you know not
just *that* it wants you but *what* it wants. Cross-project reads fine: the tiles
name the project, and one screenshot shows five tiles across three projects
(`31-skin-washi-wabi-mission.png`).

**Approve actually works, and I verified the effect rather than the reply.**
I ran a stand-in that asks a question, rings the bell, and echoes whatever it is
sent. BEL landed while I was on Mission → deck key went `status-attention` with
the `!` glyph → Mission showed `NEEDS YOU` + the question → I clicked `✓ Approve`
→ the pane showed:

```
Do you want to proceed? [y/n] y
RECEIVED "y\r\n"
```

(`62-agent-received.png`.) So the button sends `y\r\n` to the real pty. The
payoff of the whole product is real.

**Four redundant signals fire together** for a genuine attention event: the deck
key's `!`, the Mission tile, a toast (`⚑ sim ask 1 · alpha app needs attention`),
and a `⚑ 1` count in the status bar. Good layering.

**Ctrl+Shift+J works.** With two waiting agents it switched to the Terminal view
and made the longest-waiting key `active`. It is the correct primitive and it is
buried in the palette.

### 2.3 Finding 2 (confirmed, twice) — the deck cannot tell *working* from *waiting*

This is the important one, because the deck is the surface that is always on
screen and Mission is not.

Computed styles at the moment of capture (`slate-modern`, from the running app):

| state | dot colour | opacity | ring | animation | glyph |
|---|---|---|---|---|---|
| working | `rgb(201,144,106)` | animating | none | `dot-pulse` | — |
| waiting | `rgb(201,144,106)` | 1 | `3.79px @ 7% alpha` | `dot-breathe` | — |
| attention | `rgb(201,144,106)` | 1 | `3px @ 25% alpha` | none | `!` |

**Working and waiting are the same colour, the same size, and the same shape.**
The only differences are a ring at 7% alpha — effectively invisible — and *which
slow opacity animation is running*. A pulsing amber dot and a breathing amber dot
are the same thing to a person glancing at a 20px strip while typing in another
window. And a still frame cannot distinguish them at all, which is why the
`13b-two-projects-deck.png` crop at 3× still requires reading the key's faint
outline to work it out.

Only `attention` — an agent that emitted a literal BEL — gets a form difference
you can actually see: the `!`. That is the good state. The problem is that the
most common "your move" state is **waiting** (the agent finished its turn and went
quiet), and waiting is where the design leans entirely on motion.

### 2.4 Finding 3 (confirmed, twice) — glancing at a pane destroys its attention state

`store.ts:910-916` carries a long comment insisting visibility must never gate
classification. That check is correct. But visibility still changes the outcome,
by a different route:

```
if (get().agentStatus[id] !== "attention" || visible) setStatus(id, "working")
```
`store.ts:926`

If the pane is **visible** when the BEL arrives, `attention` is immediately
overwritten with `working`, the `!` glyph never renders, and 6s later the key
settles to `waiting` — indistinguishable from five other keys. It never comes
back. Observed twice (runs s4 and s7): the same stand-in agent, the same BEL,
produced `key-attn` + `!` when I was on Mission and `key-waiting` with no glyph
when the pane happened to be focused. Mission still said `NEEDS YOU` both times,
because it reads the persisted decision from main — so **the deck and Mission
disagree about the same session**, and the deck is the one that is wrong.

### 2.5 Finding 4 (confirmed) — changing views resets the count

Deliberate test, two silent agents, both settled to `waiting` while I sat on
Mission:

```
A. on Mission, 10s after launch:
   sim waiting 1 <status-waiting>, sim waiting 2 <status-waiting>
B. clicked the Terminal view key, +1.2s:
   sim waiting 1 <status-waiting>, sim waiting 2 <status-working>
   (+2.5s) still <status-working>
C. back on Mission, +1.2s: still <status-working>
   header now reads "2 running · 1 need attention"
   the tile reads "▶ WORKING" over the text "Refactored 4 files. Ready for review."
   (+7s) back to <status-waiting>, and the count is 2 again
```

Opening the Terminal view flipped the pane it landed on from *waiting* to
*working* for ~7 seconds, and the "needs attention" count dropped from 2 to 1.
Nothing about the agent changed; I changed views. For that window the Mission tile
says `WORKING` above a line of text that plainly says the agent is done — the tile
contradicts itself.

Only the pane you land on is affected; the sibling stayed `waiting`. **The cause
is inferred**: making a hidden `display:none` pane visible makes xterm re-fit,
which resizes the pty, which makes the shell redraw its prompt — and a redraw is
output, and output means "working". I observed the effect, not the mechanism.

### 2.6 Finding 5 (confirmed) — past 4 sessions the deck stops telling you *which*

`COMPRESS_THRESHOLD = 4` (`deck.ts:13`). Above it, keys drop the session name and
become dot + badge (`14b-compressed-deck.png`). With six sessions in `alpha app`
the strip read:

```
ALPHA APP  [• WORK] [• LATE] [• WAIT] [• WAIT] [• WAIT] [• WAIT] [+]
```

Four identical `WAIT` pills. **The badge is per-agent-type, not per-session** —
`RECOMMENDED_COMMANDS` gives every Claude preset the badge `CLAUDE`
(`settings.ts:249`). So in DevDeck's own intended scenario — five Claude sessions
in one project — the compressed strip is five identical `CLAUDE` pills. The deck
can tell you *how many* need you; it cannot tell you *which*. You have to hover
each one (the `data-tip` is good: `sessionName · projectName - status` plus a peek
of the output) or go to Mission.

Meanwhile Mission with 8 tiles was not sorted by urgency: the waiting tiles came
out `17s, 14s, 12s, 10s, 34s` — grouped by project, not by who has waited longest.
The one who has waited longest was fifth.

### 2.7 Finding 6 (confirmed) — the attention chip is a bare number

The whole-deck count renders as a small flag plus a digit in the far bottom-right
corner (`⚑ 2`), diagonally opposite the agent keys it refers to
(`13b-two-projects-deck.png`). Its tooltip is excellent — *"Agent sessions that
want you - asking a question, or finished a turn"* — but the visible artefact is
one character, next to the git branch, in the coldest corner of the window. Nothing
about it says "two of your agents are blocked on you". It also disappears entirely
at zero, so a person never learns what it is.

### 2.8 Finding 7 (confirmed) — after Approve, nothing tells you it landed

I clicked `✓ Approve`, and `y\r\n` reached the agent (§2.2). But in the UI:
the tile still said `● NEEDS YOU`, still showed the same question, and still
offered `✓ Approve` / `✕ Deny`; the deck key still carried the `!`; no toast fired
(`61-after-approve.png`). The only evidence the click worked was opening the
terminal and reading `RECEIVED "y\r\n"`.

My stand-in kept the question as its last output line, so a real agent that moves
on would clear this. But the observed behaviour is: press the button that decides
something on your behalf, and get zero confirmation. A stranger's honest next
move is to press it again.

### 2.9 Finding 8 (confirmed) — after a restart, dead sessions look like quiet ones

Restart with four sessions open. DevDeck restores the tabs and the deck keys; the
ptys are gone. What each surface says:

- **Deck keys**: three keys, `status-idle`, dot at 35% opacity, no marking of any
  kind (`09b-after-restart-deck.png`).
- **Mission tiles**: `0 running`, and each tile reads `… – QUIET`.
- **The pane** — and only the pane — is honest: *"Start this agent? / Restored
  from your last run. This agent has no resume command, so it starts a new
  conversation. / [ Start ]"* plus the command it would run
  (`21-restore-gate.png`, `52-overview.png`).

`tileState.ts:141` names the problem in its own comment: QUIET *"reads as nothing
happened here"*. The tile system already knows how to say a process is gone — it
has `EXITED`, `EXITED {code}`, and a genuinely excellent `EXITED · KILLED` with
*"Killed before it could start (…) — on Windows this is usually antivirus
terminating the shell. The terminal has the fix."* (`tileState.ts:100-130`). A
restored session never gets an exit code, so it lands in QUIET instead. Result: a
stranger reopens DevDeck, sees three agent keys and three tiles, and reasonably
believes their agents are still there. I saw live and dead sessions side by side
in one frame (`31-skin-sumi-wabi-mission.png`: two live alpha tiles, two dead beta
tiles reading QUIET) and the dead ones were not distinguishable from an idle live
one.

Related, smaller: the badge on a restored key changed from the preset's badge
(`WORK`) to the agent id uppercased (`SIM-WORK`), while the Mission tile for the
same session kept `WORK`. Two surfaces, two badges, one session.

### 2.10 Finding 9 (confirmed, high likelihood) — "N conflicts" in red, and it is false

Mission's `IN-FLIGHT CHANGES` section reported, in red, `3 conflicts`, listing
`package.json` and `README.md` with two-to-six session chips against each
(`11-attention-unwatched.png`, `13-two-projects-four-agents.png`,
`31-skin-washi-wabi-mission.png`).

**Not one of those was real.** Every session in that run was a `node` process
whose entire body is `process.stdout.write(...)` plus a `setInterval`. They
physically cannot write to disk. `README.md` in `alpha app` was dirty because *I*
edited it before any session existed; `package.json` and `README.md` in
`beta-service` were untracked from the moment the folder was created.

Mechanism, confirmed in source: `MissionControl.tsx:196-220` gives each session
`files: await window.api.git.changes(sessionCwd(s.termId))` — the **whole dirty
list of that session's directory**, with no per-session baseline.
`buildOwnership` (`ownership.ts:96-119`) then counts a file as a conflict whenever
`owners.length > 1`. Two sessions in one working tree therefore conflict on every
dirty file in it, always.

Trigger condition: **any project with uncommitted or untracked files, and two or
more agent sessions in it.** That is not an edge case — it is the product's
headline use case. With one session per project the label softens to the neutral
`who's touching what` (`60-needs-you-tile.png`), which is why it only appears once
you start doing the thing DevDeck is for.

The codebase already knows this is wrong. `ownership.ts:44-55` documents the
identical mistake being fixed on the *other* surface: *"An earlier wording said
'claude 1, claude 2, claude 3, claude 5, claude 6 are already editing this project
(one-file.md)', which read as five agents fighting over a file none of them may
have touched… Seen with five sessions open it was actively misleading."* The fix
landed in `holdersSummary`; the conflict map next to it still does it, and does it
in red.

There is even a module built for exactly this — `agentSignals.ts` snapshots a
session's dirty set at launch and `newPathsSince` returns `[]` when the baseline
is unknown, *"never the whole list… Failing closed matters here: the alternative
marks every agent in a dirty repo as having done work"*. The conflict map does not
use it.

### 2.11 Finding 10 (confirmed) — a failed agent launch reads as an agent waiting for you

I registered `Ghost Agent` with command `zzz-not-a-real-agent --chat`.

The launcher marks it properly before you click: the card gets
`launch-card-offpath`, a `NOT ON PATH` tag, and a good tooltip — *"Not found in
PowerShell's PATH, which is the one DevDeck reads. It still runs from a shell that
has it - Git Bash or WSL - or through an alias."* (`22b-launcher-offpath.png`).
That is thoughtful, and by design it still lets you launch (`probeView.ts:84`).

But **after** you click: PowerShell prints `CommandNotFoundException`, and the deck
key goes `status-working`, then 6s later `status-waiting` (`23-ghost-launched.png`,
`24-ghost-6s.png`). No toast, no error state, no exit chip. A dead-on-arrival agent
becomes a key that says "I need you", visually identical to an agent that finished
its turn. A stranger who mistypes an agent command in Settings gets a session that
looks like it is working.

### 2.12 Finding 11 (confirmed) — the deck clips at ordinary laptop widths

`.deck-strips` is `overflow-x: auto`. Measured with three projects on screen:

| window | `scrollWidth` / `clientWidth` |
|---|---|
| 1200×760 | 1200 / 1200 — fits |
| 1000×700 | **1154 / 1000** — clipped |
| 860×640 | **1154 / 860** — clipped |

At 1000px the third project's key is cut off mid-word (`ghos`) with **no scroll
affordance** — no fade, no arrow, no chevron (`47b-narrow-1000-deck.png`). So on a
1000px-wide window the answer to "which agent needs me" is off-screen for one of
your projects, and nothing indicates there is more to see. 1000px is an entirely
normal size for a window docked beside an editor. No page-level horizontal
overflow at any width, and the four `verify` view labels correctly collapse to
icons below ~860px — that part is handled well.

### 2.13 Finding 12 (copy) — "1 need attention"

`MissionControl.tsx:338` renders `` `${attention} need attention` `` unconditionally,
so with one agent the header reads **`1 running · 1 need attention`**
(`60-needs-you-tile.png`, `31-skin-sumi-wabi-mission.png`). Every neighbouring
count is pluralised properly (`1 conflict` vs `3 conflicts`, `1 changed file`).

### 2.14 Overview mode — the right answer, hidden

The palette's `Overview - all projects, approve or deny without opening a terminal`
switches the Terminal view to a mode with one focused pane and an
`OTHER SESSIONS · 4` rail listing every session with its badge and project
(`52-overview.png`). This is the closest thing in the app to a real cockpit.

Two notes. It is reachable **only** from the palette, filed under `Layout` between
"Layout: Tabs" and "Layout: Grid" — nobody will find it. And in `Focus` mode I saw
no Approve/Deny controls at all, so the palette's own description over-promises
against what I observed (I did not test `Grid` mode).

---

## 3. Every empty state and failure surface I reached

| Surface | What it says | Could a stranger act on it? |
|---|---|---|
| **No projects** (`01`) | Title, lede, `Open folder…`, the live PATH probe line, `Ctrl+K reopens this list later.` | **Yes.** Best empty state in the app. |
| **View keys, no project** (`02-*`) | Nothing. Silent click; tooltip only. | **No.** Finding 1. |
| **No terminals** (`04-view-terminal`) | *"Launch a command — No terminals yet in alpha app. Pick a startup command, or open a plain shell."* + `New terminal` / `Settings` + grouped cards with literal commands | **Yes.** Very good. |
| **No agent sessions** (`04-view-mission`) | *"No agent sessions yet. Start one and it appears here as a tile you can watch and reply to, from whichever project it is running in."* + `Start a Claude session` (tooltip: *"Starts Claude in alpha app and switches to the terminal."*) | **Yes.** One click, and it says what the click will do. |
| **Missing preset commands** | `Add starter commands (2)` appears in the launcher actions when recommended presets are absent | **Yes.** |
| **Off-PATH agent** (`22b`) | `NOT ON PATH` tag + the PowerShell-PATH tooltip. No notice bar — deliberate: `launcherNotice` stays silent unless *every* answer is `missing`, *"the cards carry those"* (`probeView.ts:130-151`) | **Yes**, before the click. **No**, after it — Finding 10. |
| **Blank agent command** (`22b`) | Card gets `launch-card-nocmd`, text `no command set`, tooltip *"Blank Command has no command set. Opens Settings → Agents."* | Clicking it left the pane unchanged; **I did not verify whether Settings opened.** Unconfirmed. |
| **Deleted project folder** (`16`, `17b`) | Switcher card gains `FOLDER MISSING`. Notice bar: *"DevDeck can't find this folder. `<path>` It may have moved, been renamed, or be on a drive that isn't connected."* + `Locate…` + `Remove from DevDeck` | **Yes.** Excellent — names the cause, gives both real exits. |
| **Missing folder, Editor view** (`17-missing-folder-editor`) | Header `GONE-SOON`, **empty tree**, and *"Select a file from the tree to edit it."* | **Weak.** It instructs you to select from a tree that has nothing in it. The notice bar above carries the real story. |
| **Missing folder, Terminal view** | The full launcher, offering to run `npm run dev` in a folder that does not exist | **Weak.** Not blocked, not warned at the card. |
| **Missing folder, Mission** | `gone-soon — couldn't check for changes` | **Yes.** Honest. |
| **Non-git project** (`60`) | Tile chip `? COULDN'T CHECK` + tooltip *"Couldn't check for file changes since this session started."* + a `Review` button kept reachable | **Yes.** Correctly refuses to claim "nothing changed". |
| **Restored dead session** (`21`) | Pane: *"Start this agent? / Restored from your last run…"* + `[ Start ]`. Deck and Mission: silent — Finding 8. | Pane **yes**; deck and Mission **no**. |
| **Diagnostics** (`20-diagnostics`) | Settings → About → Diagnostics. `Copy diagnostics` + `Show what's copied`, and the promise: *"Copies your DevDeck and OS version, your shell, your agent commands and whether each was found on your PATH, and the recent app log — file paths and command lines included, with API keys and tokens removed. Nothing is sent anywhere; it goes to your clipboard."* | **Yes, and this is a highlight.** |
| **Crash card** | **Not reached.** See §0.3. | Unknown. |

**The diagnostics record is real and is exactly what a beta needs.** I read it via
`window.api.diagnostics.record()`: app version `0.13.0` + `packaged:false`,
electron/chrome/node/v8/modules versions, OS platform/arch/release/version, shell
`{configured: "powershell", resolved: "powershell.exe", resolvedArgs: ["-NoLogo"]}`,
and every agent with `state` and the **resolved absolute path** — including
correctly resolving `node.exe` for my `node -e "…"` presets. If a stranger's install
misbehaves, one paste answers most questions.

---

## 4. The six skins

I cycled all six through the real Settings UI, with two live agent sessions on the
deck, and captured Mission, Terminal, the Settings modal, and a 3× deck crop for
each (`30-`/`31-`/`31b-`/`32-` × `{sumi,washi,slate}-{wabi,modern}`).

Measured tokens (from the running app):

| skin | body bg | body fg | `--accent` | `--clay` (agent dot) |
|---|---|---|---|---|
| sumi-wabi / sumi-modern | `rgb(27,26,24)` | `rgb(228,221,207)` | `#b8895c` | `#c4855d` |
| washi-wabi / washi-modern | `rgb(244,239,228)` | `rgb(58,52,43)` | `#b07a4a` | `#b06a44` |
| slate-wabi / slate-modern | `rgb(12,14,19)` | `rgb(231,234,241)` | `#eba65c` | `#c9906a` |

**Nothing broke.** All six rendered completely: no unstyled flash, no clipped text,
no invisible control, no missing background, no layout shift. Light (Washi) held up
as well as the two darks — the Mission tiles, the `NEEDS YOU` pill, the red
conflict rows, the terminal, and the Settings modal were all legible
(`31-skin-washi-wabi-mission.png`, `30-settings-washi-wabi.png`).

**No state indicator was lost in one skin and kept in another.** The dot classes,
the `!` glyph, the badge pills, the `NEEDS YOU`/`WAITING`/`WORKING`/`QUIET` chips
and the key outline were present in every skin. The `key-waiting` outline is a
box-shadow, not a border (`borderWidth: 0px` in all six), so it survives the
style swap intact.

The two styles differ less than their names suggest at deck scale: `border-radius`
on a deck key measured `7px` in **both** Wabi-sabi and Modern Pro, and the dot
geometry was identical. The difference is real elsewhere (type, elevation, the
launcher cards) but the agent keys — the thing the product is about — look the
same in both.

One honest correction to my own data: in five of the six skin captures the
`sim waiting` key read `status-working`. That is **Finding 4**, not a skin bug —
my capture loop switched to the Terminal view for each skin, which reset the pane's
status. Only the first capture (`sumi-wabi`) was read before that happened, and it
shows the correct `status-waiting` with `dot-breathe` and the ring.

---

## 5. The three panels the owner has already authorised deleting

Walked, not stress-tested, as instructed. A before-account:

- **API** (`04-view-api.png`) — `COLLECTIONS` rail with import (Postman/OpenAPI/curl)
  and `+`; method dropdown; `Save`/`Send` (both disabled with no URL); `Env: No
  environment` + `Manage…`; tabs `Params / Auth / Headers / Body / Tests / Chain`;
  empty state *"Response will appear here. (Requests run in the main process - no
  CORS limits.)"* Complete and coherent.
- **Database** (`04-view-database.png`) — `CONNECTIONS` + `+`; *"No connections.
  Click + to add one."*; *"Select or add a connection to run SQL."*;
  *"PostgreSQL, MySQL, SQL Server & SQLite (WASM - no native build) supported."*
- **Work** — not a view key; it lives in the palette as
  `Work - Jira / Azure items`. Not opened.

Their rough edges are deliberately not reported.

---

## 6. Other things worth knowing

- **All seven view panels stay mounted at once**, toggled with inline
  `display: none` (`App.tsx:525-587`). Confirmed empirically: my `.panels button`
  dump was byte-identical for every active view, and always included the API
  client's `Send`, the DB `+`, and the browser's `→ Agent (0)`. So Monaco, the
  browser view and the DB panel are instantiated on startup regardless. I did not
  measure the cost.
- **The editor works.** Clicking `README.md` in the tree opens Monaco with a tab,
  `4 words · 1 min`, `Edit / Split / Preview`, `Snippet…` (`review`, `explain`,
  `commit`), `→ Agent`, line numbers and content (`50-editor-open-file.png`).
  Tree rows carry `data-tip="Drag onto an agent session to insert @path"` —
  untested (§0.1).
- **Project switcher** (`12-project-switcher.png`) — cards with initials avatars,
  index numbers for `1-9`, and `3 terms · 3 agents` vs `idle`.
  `↑↓←→ to move · Enter to open · Esc to close`. **But the path is truncated from
  the right**, so my three projects all read
  `C:/Users/Admin/AppData/Local/Te…` — identical, and the folder name (the only
  part that disambiguates) is the part cut off. Anyone whose projects share a
  parent directory gets three identical subtitles.
- **Tool cluster** — five `button.deck-tool`, distinguished **only** by tooltip:
  `Scripts & saved commands`, `Agent context files`, `AI usage`, `Settings`,
  `More`. Contents observed: Scripts = `SCRIPTS ▸dev ▸test / COMMANDS +`; Context =
  `CLAUDE.md (Claude Code) / AGENTS.md (Codex / general) / GEMINI.md (Gemini CLI)`
  each with `+ Create`.
- **AI usage** (`63-tool-aiusage.png`) reads the user's **real** Claude Code
  transcripts even under a scratch profile: `$884.16 / 1163.8M tokens · estimated
  from Claude Code local logs`, with `outside DevDeck projects` broken out, plus
  `BY AGENT`, `BY PROJECT`, `RUNS · ALL TIME`, `RUNNING NOW`. It is labelled
  honestly and the footnote is careful. Flagging it only so nobody is surprised
  that a fresh DevDeck profile shows a large historic dollar figure on first open.
- **F1 shortcut sheet** (`64-shortcuts.png`) is thorough — GLOBAL / TERMINAL /
  EDITOR / DATABASE. `Ctrl+Shift+F` is listed twice with different meanings and
  the sheet says so (*"Search across projects (outside the Terminal view)"*),
  which is the right way to handle it.
- **Two different taglines.** First run: *"A cockpit for the projects you already
  have: terminals, agent sessions, an editor and git status, one folder at a time."*
  Settings → About: *"A command deck for terminal-first, Claude-driven development
  - multiple terminals, fast project switching, editor, API client, database, and
  remote access in one window."* The About line still sells API + database +
  remote, which is the pre-D1 shape of the product.
- **Settings has 15 sections** (Appearance, Terminal, Editor, Agents, AI, Snippets,
  Pipelines, Git, SSH, MCP, Remote (Mobile), Proxy, Notifications, Shortcuts,
  About). A `Proxy` section is still listed after the capture proxy was deleted
  with the Network view — **I did not open it**, so whether it is the same proxy
  is unverified.

---

## 7. Ranked, by damage × likelihood for one developer running several agents

### Confirmed

1. **False "N conflicts" in red on Mission** (§2.10) — fires for any dirty repo
   with ≥2 sessions, i.e. the normal case. Teaches the user to ignore the one
   warning colour in the app. `MissionControl.tsx:196-220`, `ownership.ts:96-119`.
2. **Working and waiting are indistinguishable on the deck** (§2.3) — same colour,
   same shape, differ only by which slow animation runs. Directly undercuts the
   core claim on the always-visible surface.
3. **Dead sessions look like quiet ones after a restart** (§2.8) — three tiles say
   `QUIET`; the processes do not exist. `tileState.ts` already has `EXITED`.
4. **Glancing at a pane permanently erases its `!`** (§2.4) — `store.ts:926`.
5. **Changing views resets a waiting agent to working for ~7s and drops the
   attention count** (§2.5).
6. **Seven clickable, silent view keys on the first screen** (§1.3) —
   `ViewKeys.tsx:81`. Cheapest fix here, earliest bad moment.
7. **Past 4 sessions the deck stops naming which agent** (§2.6) — badge is
   per-agent-type, so five Claude sessions are five identical `CLAUDE` pills.
8. **A failed agent launch reads as an agent waiting for you** (§2.11).
9. **`Approve` gives no confirmation** (§2.7) — invites a double press on a
   decision that reaches a live agent.
10. **The deck clips silently at 1000px** (§2.12) — one project's keys off-screen,
    no scroll affordance.
11. **`1 need attention`** (§2.13) — `MissionControl.tsx:338`.
12. **Switcher paths truncate from the right** (§6) — identical subtitles for
    projects under a shared parent.
13. **Overview mode is unreachable except from the palette**, filed under
    `Layout` (§2.14), and its palette description promises Approve/Deny that
    `Focus` mode does not show.
14. **The About tagline still describes the pre-D1 product** (§6).

### Suspected / unconfirmed

- The `Blank Command` card's promise to open Settings → Agents (§3) — clicked, no
  observed effect, not verified either way.
- Whether the `Proxy` settings section still has a subject after the capture proxy
  was deleted (§6) — not opened.
- `Ctrl+Shift+J` left the jumped-to key reading `status-idle` rather than
  waiting-and-seen. Observed once; cause not established.
- Mission's 8-tile ordering by project rather than by wait time (§2.6) — observed
  once, may be intended.

---

## 8. Is it ready for five strangers?

The core is real and I verified it end to end: an agent asks a question, DevDeck
notices, four surfaces say so, you press one button, and `y\r\n` reaches the
process. The failure surfaces around it — missing folder, off-PATH agent, non-git
project, unreadable PATH, diagnostics — are better written than most shipping
software. The onboarding text is honest and the six skins all hold.

What is not ready is the resting state. The always-visible deck cannot distinguish
*busy* from *your move*, loses the `!` if you happened to be looking, resets when
you change views, stops naming sessions past four, and clips at 1000px. And Mission
— the surface that does read well — shows a false red conflict warning the moment a
stranger does the exact thing the product is for.

Five strangers would each hit findings 1, 2 and 6 within five minutes and finding 1
in the first ten seconds. None of them are deep.
