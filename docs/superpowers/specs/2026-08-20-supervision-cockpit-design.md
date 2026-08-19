# The supervision cockpit — measurement first

**Status:** revised after two reviews; awaiting approval
**Date:** 2026-08-20
**Supersedes:** the first draft of this file, which proposed a deck restructure
and a four-signal attention queue. Both reviews rejected substantial parts of it.
What they found is recorded below, because the reasons are the design.

## The problem

DevDeck's deck has eight peer views: `mission · tasks · terminal · editor · api ·
database · browser · network`. Three orchestrate agents; five are classic
developer tools, all of them undifferentiated peers. The layout reads as *IDE
with an agent feature bolted on*, which is not how the app is used: you ask an AI
CLI to make the change, and the developer's job has moved from authoring to
supervising and reviewing.

The instinct is to reorganise around that. The first draft did, and it was wrong
in three ways worth keeping on the record.

## What the reviews found

**The organizing principle was over-applied.** "DevDeck's value is exactly what a
terminal cannot do" is a good tiebreaker for *new* features and a bad mandate for
*reorganising shipped* ones. It also licenses removal but never addition, so it
is always satisfied by cutting — a premise that feels rigorous while only moving
one way. And it argues against itself here: **if you supervise rather than
author, verification matters more, not less.** Hitting the endpoint is a stronger
check on code you did not write than reading its diff. The API, DB and Browser
panes are the "did the agent's change actually work" instruments, and `→ Agent`
on a response or a result grid exists *only* because the app duplicated tools a
terminal already has. Demoting them had it backwards.

**The replacement signals were weaker than claimed.** Three of four:

- **BEL is not reliable.** `store.ts:594` tests `data.includes("\x07")` on the
  raw pty chunk, but `missionTail.ts:7` proves in this same codebase that `\x07`
  is how an OSC sequence *terminates*. Any agent that sets the terminal title
  trips it. Claude Code sets terminal titles. This is masked today only by the
  `!visible` guard the draft wanted to remove — so un-suppressing BEL and ranking
  it first would have put the noisiest signal in the app at the top of the queue.
- **"quiet + uncommitted changes" has no baseline.** `listChanges`
  (`main/changes.ts:69`) is plain `git status --porcelain`. In a project that was
  already dirty, *every* agent reads as ready on its first pause and stays there
  forever. `MissionControl.tsx:236` already admits the app "can't tell AI-written
  changes from hand-written ones."
- **"Costly" has nothing to compare against.** Live cost comes from
  `usage.ts:135-165`, which reads Claude Code's transcripts only — the Codex and
  Gemini presets produce no cost data, so the signal can never fire for them.
  `RunKind` is only `card | race | pipeline | session`, so a 30-second question
  would be compared against the distribution of every past session including
  three-hour refactors. And `NOTES.md` already declined cost-aware *routing* for
  exactly this reason; building a cost-aware *alarm* on the same data is
  inconsistent, and the alarm is the more intrusive of the two.

**Two changes would have broken the app.** `waitForIdle`
(`store.ts:1996-2009`) is an unbounded `for(;;)` that exits only on user-stop,
term death, or `st === "idle"` — redefining `idle` would make **every pipeline
run its first step forever**, with no timeout and no error. And `MainView` is
persisted with no validation (`store.ts:1063`), so deleting four of its members
lands anyone whose last session ended on Editor or the DB pane on a blank main
area at next launch.

**The queue would have been the fifth attention-ordered list of the same
sessions** — `sortForFollow`, `OverviewView`'s `rank()`, `InboxPanel`'s `ORDER`,
the ToolCluster badge, the deck-key glyph — and would have taken Mission from
four sections to six. The draft's claim that it "removes surface, never adds it"
was true of the deck and false of Mission, which is where the density ceiling
actually applies.

## What survives, and it is the important half

The diagnosis. Both reviews confirmed it independently.

`agentStatus` treats **one second of silence as "finished a turn"**
(`agentIdleMs` defaults to `1000`, `settings.ts:382`; the transition is
`store.ts:611-618`). It does not only set a status — it moves the dispatched card
from `doing` to `review` (`store.ts:619-623`). An agent pausing to think, or
sitting in a slow tool call, is filed as done, and every downstream signal
inherits that.

The 5s cap in Settings is **not enforced**: `SettingsModal.tsx:1101` is an HTML
`max` attribute, and neither `setAgentIdleMs` nor the settings loader clamps it.
An emptied field yields `Number("") === 0`.

And `isStalled` has never fired, for **two** independent reasons: `working`
cannot survive `agentIdleMs`, and `missionTail.ts:259` requires `!!lastAt`, which
is only stamped by `recordTail` on actual output. An agent that launches and
emits nothing — crashed CLI, missing binary — sits at `working` with `lastAt`
undefined and returns `false`. That is precisely the case a stall signal exists
to catch. `tests/missionTail.test.ts:103` asserts the current behaviour, so
changing it must be deliberate.

## This spec: measurement, then emphasis

Two halves. **Only the first is in scope here.** The second is deferred with
explicit conditions, because designing a ranked queue on statuses that have never
once been measured correctly is guessing.

### Half one, part A — fix the measurement without touching the state machine

The riskiest possible change is editing `store.ts:605-627` in place: the card
auto-move, the pipeline runner, the deck badge, inbox ordering, `jumpToPending`,
the approval detector's gate and the mobile web client (`server.ts:35,787`) all
read through it. So do not start there.

Add `quiet` and `ready` as **derived facts computed outside the store**, from
`getLastAt()`, `agentIdleMs` and a cached git map. `missionTail.ts` already owns
exactly this kind of module-level per-session state and is unit-tested. The enum
and the timer stay exactly as they are.

Deleting `waiting` becomes a deliberate follow-up, at which point `waitForIdle`,
the badge and the mobile client are handled on purpose instead of as collateral.

**`quiet`** means no output for `agentIdleMs`. It is not a claim that anything
finished. The 5s cap is removed and the value is clamped properly, in the setter
and on load.

**`ready`** requires a **baseline**: the set of changed paths captured when the
agent's session started, compared against now. Changes that were already there
are not evidence the agent did anything. Without this the signal is noise in any
dirty repo, which is most repos most of the time.

**`blocked`** ranks on `approval.ts`'s `detectApproval`, not BEL.
It classifies an actual pending permission prompt out of the tail — numbered
menus and y/n, Claude Code and Codex shapes — is deliberately conservative, and
is already wired into `OverviewView.tsx:78-81`. Being content-based, it also
works for agents that never ring the bell. BEL becomes a supplement, and only
after the OSC fix below.

**Stall becomes reachable** by fixing both blockers: `quiet` persists (part A),
and `lastAt` gains a launch stamp so a session that has emitted nothing can
stall. `tests/missionTail.test.ts:103` is updated deliberately, with the reason
in the test name.

### Half one, part B — the OSC/BEL bug fix

Strip OSC sequences before testing for BEL (`store.ts:594`). This is a standalone
bug fix worth landing regardless of everything else: today, an agent setting its
terminal title marks itself as needing attention.

### Half one, part C — the deck says what the app is for, by emphasis

**Group, don't nest.** Keep all eight keys and all eight top-level views. Order
them supervision-first — Mission, Tasks, Terminal, then the verification tools —
and separate the two groups with a hairline gap.

This conveys the same thing the restructure was for, and it avoids every problem
the restructure caused: no `MainView` narrowing, so no persisted-view break; no
`<webview>` re-parenting, so the Browser does not reload; no keystroke tax on
four mature panes; and it is reversible. It is also the DevDeck method — change
the emphasis and let the cascade apply, rather than restructuring a region.

`DECK_VIEWS` (`ViewKeys.tsx:4-13`) drives both the `Ctrl+N` handler and the tab
strip, so this is one ordered list plus a separator. Note Editor is `Ctrl+8`
today, not part of the `Ctrl+4..7` block.

### Half two — deferred

The attention queue. It ships when, and only when:

1. `blocked`, `ready` and `stalled` have run correctly for long enough to know
   what a normal day looks like — how often agents go quiet, and for how long.
2. A **cwd-keyed cached git map with a TTL** exists. `git:changes` is affordable
   today only because it is gated on `view === "mission" && !document.hidden`
   (`MissionControl.tsx:118-137`), and nothing is cached — every call spawns
   `git`. A queue that pulls you must poll off-Mission, which deletes that gate;
   six agents across four projects at 2s is roughly three git spawns per second
   on Windows, in a repo whose `CLAUDE.md` documents Avast killing child
   processes.
3. It states **what it deletes**. On current evidence: Mission's REVIEW QUEUE
   section (which `ready` subsumes, per agent rather than per project), the
   InboxPanel drawer or its overlap with it, and the tile's duplicate "needs you"
   and stalled markers. Without deletions it is a sixth section on the app's
   densest surface and fails the rubric it is bound by.
4. It carries **two rows, not four** — `blocked` and `ready`. `stalled` stays a
   tile marker, which is what it already is and which the part-A fix makes work
   for the first time. `costly` is cut until there is a cohort to compare
   against; the usage panel is where cost belongs, and it already has the
   attribution marker to qualify a figure honestly.

## Naming corrections

The draft's slot names collided with shipped features:

- **"Work" is taken.** `WorkPanel.tsx` is the Jira/Azure DevOps drawer, labelled
  "Work" in `ToolCluster.tsx:25`, with `startWork` in the store. The task board
  keeps its current name, **Tasks**.
- **A "Review" slot would duplicate `ChangesModal`**, which already does file
  list, per-file diff, stage, unstage, discard, commit, Open PR, and an AI review
  handoff. There is no new diff reader in this spec.
- Its `DiffView` is `patch.split("\n")` with a class per line — no syntax
  highlighting, no side-by-side, no context expansion. **Before any promotion,
  the fix is to put Monaco's diff editor inside the existing modal.** Monaco is
  already in three panes. Promoting today's view would advertise it as the place
  you review, at a standard it does not meet.
- **`PromptComposer` is not renamed and does not move.** It seeds its targets
  from the focused agent on every open, and has `@file` and `/snippet`
  autocomplete: it is a prompt writer with fan-out as an option, not a broadcast
  tool. Calling it Broadcast would tell the user the safe frequent action is the
  dangerous rare one. There is also no focused agent on Mission, so moving it
  there changes three behaviours the draft claimed were unchanged.

## Ordering hazards

1. The **OSC/BEL fix lands before** anything ranks on `blocked`.
2. The **baseline capture lands before** anything reads `ready`; reversed, a dirty
   tree marks every agent ready.
3. `lastAt`'s launch stamp and the `isStalled` test change go **together**.
4. Nothing in half one narrows `MainView` or edits the status enum, which is what
   keeps pipelines and the mobile client out of the blast radius.

## Testing

- `isStalled` against a `quiet` state that persists, **and** against a session
  that has emitted nothing since launch — the crashed-CLI case that has never
  been reachable.
- The OSC/BEL fix: a chunk containing an OSC title sequence must not mark
  attention; a real bell must.
- The `ready` derivation as a pure function: baseline empty vs dirty, changes
  added after start, changes present before start, two agents in one tree, an
  agent in a worktree, and a non-repo directory.
- `agentIdleMs` clamping in the setter and on load, including `""` → `0`.
- The deck ordering is verified in the running app (there is no headless
  renderer) in a dark and a light theme, confirming every view still opens and
  terminals keep running.

## Out of scope

- **The attention queue.** Deferred, with the four conditions above.
- **Any change to the status enum, `waiting`, or `waitForIdle`.** Explicitly held
  back, because they reach pipelines and the mobile client.
- **Any deck slot removal, nesting, or `MainView` change.**
- **A new diff reader.** The next step there is Monaco inside `ChangesModal`.
- **Renaming `PromptComposer`, or moving it.**
- **Reversing `ROADMAP.md`'s "all-in-one" premise.** The draft did this in a
  preamble. Nothing in this spec needs it — the measurement fixes and the deck
  ordering are all compatible with all-in-one. If the premise should change, it
  belongs in a dated ROADMAP decision entry, argued and reviewed on its own.
