# The developer's creative act — 24 candidates, 21 killed

**Date:** 2026-09-07 · **Seat:** `product-reviewer` · **Question put:** agents do
most of the typing now. What is left of the developer's creative act, and is any
of it something DevDeck should build?

**Read first, and it constrains everything below:** `ROADMAP.md` → *Next*
(the milestone is no longer blocked on engineering; two human acts remain),
`docs/beta/05-validation-criteria.md` (kill criteria written before any user
existed), `docs/superpowers/specs/2026-09-04-ui-ux-overhaul-design.md` §5 fixed
points and §6 deferred-with-triggers, `IDEAS.md`'s two competitor kill-lists,
`CHANGELOG.md` 0.9.0 (the bake-off and the Inbox drawer, both built and deleted).

---

## 0. The answer to the question, before the list

Reading the codebase rather than the brief: **what is left is not typing, it is
three acts** — *framing* (deciding what should exist), *judging* (deciding
whether what arrived is right), and *noticing* (seeing across sessions what one
session cannot show).

DevDeck already serves framing better than it serves judging. `PromptComposer`
has `@file`, `/snippet`, image paste, multi-target broadcast, per-project drafts.
Judging is served by `ChangesModal` (git status/stage/discard/commit),
`ReviewPanel`, and four verification instruments (API, Database, Browser,
Editor). Noticing is served by `UsagePanel` and `runs.jsonl`.

So the honest gap is not "the developer has nothing creative left to do." The
gap is that **the judging surface reads a guess where a fact is on disk.**
`runRecorder.ts` attributes cost and work to a run by *directory plus time
window*, with a three-valued exclusion reason (`shared` / `unpriced` /
`unknown`) that exists precisely because the attribution is not knowable. Two
directories away, `usage.ts` already parses Claude Code's transcript `.jsonl`
files by hand and dedupes them to the message. The receipt is on the disk; the
app is inferring around it. That is the single richest vein here and it is the
only survivor on this list with real value.

Everything else in the brief's six categories is either already shipped, was
shipped and deleted for cause, or needs evidence that does not exist.

---

## 1. The candidates — all 24, with verdicts

### A. Capture a thought

**C1 — Per-project scratchpad / notes pane.**
**KILLED.** A capture tool people abandon, and an eighth view key in a product
that just cut eight to seven. The project already has a durable per-project text
file the agent *reads*: `CLAUDE.md`, opened in one click by `ContextIndex.tsx`.
A note DevDeck alone can read is worth less than one the agent acts on.

**C2 — Global idea inbox across projects.**
**KILLED.** Violates fixed point 8 (a project is the unit of context) by
construction; it is a surface whose whole premise is being project-less. Also the
ninth answer to "what should I do next", after `TaskBoard`.

**C3 — Prompt drafts survive a restart.**
**SURVIVES (S2).** `composerDrafts` is already a per-project record in the store;
it is documented as runtime-only and never persisted. Making it durable is
`workspace.json` plumbing, not a surface.

**C4 — Voice capture / dictation for prompts.**
**KILLED.** Windows dictation exists, and every hosted STT engine transmits
audio. Fixed point 6.

### B. Reduce the cost of an interruption

**C5 — `Ctrl+Shift+J` → jump to the oldest waiting agent.**
**SURVIVES (S1).** The chord was freed when the Inbox drawer was deleted in
0.9.0, and the changelog says explicitly that repurposing it is *"its own
decision, not a side effect of this one."* This is that decision. It adds no
pixel, no state and no count — it reads `wantsYou` in `tileState.ts`, the one
computation fixed point 5 permits, and calls the `jumpToTerm` action that
`ActivityPanel` already uses.

**C6 — Mission trace (output-rate sparkline on tiles).**
**PARKED.** Approved spec, not implemented
(`specs/2026-08-11-mission-trace-design.md`). It is the best-argued unbuilt thing
in the repo and its source of truth is exact (committed printable characters, not
raw bytes, so a spinner cannot fake it). But `ROADMAP.md` rules *any further UI
or motion work* off the path to step 9, and this is UI and motion work.
**Condition to unpark:** one recorded session where a user asks whether a
working agent is stuck.

**C7 — "Where was I" resume card at launch.**
**KILLED.** DevDeck restores tabs, splits and pty buffers per project already
(Milestone 1.5), and 0.9.0 made a dead pane keep its evidence. A card describing
a restoration that already happened is a caption on a picture.

**C8 — Do-not-disturb / batched attention.**
**KILLED.** A mode that deliberately withholds "agent needs you" is a signal that
lies by omission — the exact defect class two releases were spent removing. And
it is a preference, not a feature.

**C9 — Return-to-context: show the N lines above the prompt when you jump.**
**KILLED as separate work.** The Mission tile already carries a 16-line tail
(`WINDOW` in `decisions.ts`, and `missionTail.ts`). This is a second rendering of
the same bytes.

### C. Make a decision reversible

**C10 — Snapshot the worktree before dispatch; one-click revert.**
**KILLED.** Git is the undo, `ChangesModal` already stages/discards/commits, and
a DevDeck-owned snapshot store is a second version-control system inside a tool
whose users are, by the three-fact gate, daily git users. It also invents a
persisted schema whose failure mode is losing work.

**C11 — "Restore to before this session started" chip.**
**KILLED, and note the trap.** It cannot be derived honestly: the session start
is DevDeck's clock, the repo state is git's, and anything committed or stashed
outside DevDeck in between makes the chip claim a boundary that does not exist.
A restore control that restores the wrong point is worse than none.

**C12 — Recoverable discard (24h trash for discarded hunks).**
**KILLED.** Real problem, wrong owner: `git stash` and the editor's undo already
cover it, and the confirm dialog already exists.

### D. Compare two agent attempts

**C13 — Revive the bake-off / race.**
**KILLED, with the strongest precedent on this page.** Built, carried through
four rounds of concurrency fixes, and deleted in 0.9.0 at ~2,100 lines net for
one reason: *"it never completed a race. Three live attempts died before any
agent committed."* Re-proposing it without new evidence is re-proposing a
measured failure.

**C14 — Diff-of-diffs across two worktrees.**
**KILLED.** The cheap half of C13 with the same missing precondition — two
completed attempts. Nobody has produced one, including the author.

**C15 — "Run this prompt in a second worktree" button.**
**KILLED.** `broadcast()` already fires one prompt at many agents, and the
worktree default was deliberately turned **off** in the 0.13.0 round. This
proposes turning a just-lowered default back up via a button.

### E. Show what changed while you were away

**C16 — Session receipt: bind the pane to a Claude session id and read the
transcript.**
**SURVIVES (S3).** The guess-that-could-be-a-fact. Detailed in §2.

**C17 — "Changed since you last looked" marker in Changes.**
**KILLED.** Can lie, and cheaply: it needs a stored snapshot of the working tree,
and any commit, stash, rebase or checkout done in a terminal — which is the
normal way this user works — makes the marker describe a baseline that no longer
exists. The honest version of this is C16, where the baseline is the transcript
itself.

**C18 — Per-project "away digest" on return.**
**KILLED.** A digest is a new surface answering "what happened", which the
`ActivityPanel` drawer, the Mission tiles and `ChangesModal` already answer
three ways. Adding a fourth is the eleven-surfaces pattern with a friendlier
name.

### F. Make a half-formed instruction cheap to give

**C19 — Promote the prompt you just sent into a snippet.**
**KILLED — narrowly, and it is the one I would reopen first.** It retires a real
manual step (open Settings, find Snippets, retype text you already typed). But
snippets are already reachable from two places (composer `/`, editor insert), and
nobody has ever been observed reusing a prompt in this product. It needs one
observation, not an argument.

**C20 — Prompt history per project (up-arrow across sessions).**
**KILLED.** The shell already does this, better, for the pty — and inside an
agent CLI, the agent's own history does it. Duplicating a terminal affordance
inside a terminal-first cockpit is the definition of the wrong owner.

**C21 — A structured intent form (goal / constraints / done-when).**
**KILLED.** Prescribes how to think, ages badly, and every agent CLI already
accepts prose. It is a template, and templates are a preference.

### G. Notice a pattern across sessions

**C22 — Rework counter (how often you re-prompted for the same thing).**
**KILLED — unfalsifiable.** "The same thing" is not computable from pty text
without a semantic judgement, and a counter that guesses at sameness produces a
number that means nothing and cannot be checked. Fixed point 4.

**C23 — Cross-session search over agent transcripts.**
**KILLED for now.** `search.ts` is `git grep` over project files — real content,
exact, already shipped as a modal. Extending it to `~/.claude/projects/*.jsonl`
is technically cheap (`usage.ts` already reads that tree) but it is a second
corpus in one search surface, and no user has ever wanted the first one badly
enough to say so. **Depends on C16 landing first** — without a session binding a
hit cannot be attributed to a pane.

**C24 — A "creative flow" dashboard (time framing vs. time judging).**
**KILLED on sight.** A twelfth surface, measuring something the app cannot
observe, whose only honest data source would be telemetry that does not and will
not exist.

---

## 2. Survivors — three, ranked by what it costs to be wrong

### S1 — `Ctrl+Shift+J` jumps to the oldest waiting agent

**Cost when wrong:** one keybinding, deleted in one line.
**Source of truth:** `wantsYou` in `tileState.ts` — the single permitted
computation of "who needs me". Not a new signal, a new *route* to the existing
one.
**Retires:** the manual step of switching to Mission and scanning tiles to find
which agent has been waiting longest.
**Replaces:** nothing on screen. It restores half of a deleted feature's value
without restoring the drawer that carried a divergent second count — which is why
the drawer died.
**Code paths:** `App.tsx` (global chord), `store.ts` `jumpToTerm`,
`tileState.ts`, `ShortcutsModal.tsx`, `CommandPalette.tsx`.
**Size:** hours.
**Smallest version that proves or disproves it:** ship the chord and its palette
entry. Nothing else.
**What kills it:** the chord is not used in 14 days of the author's own work — it
is deleted, and the deletion costs nothing.
**Strike, stated:** five *first* sessions will not falsify this. Strangers do not
discover chords in five minutes; the palette entry is what makes it findable at
all. Its evidence is the author's own 14 days plus any R1/R2 reopener, not S1–S4.

### S2 — Prompt drafts survive a restart

**Cost when wrong:** one key in `workspace.json`, ignored by an older build.
**Source of truth:** the exact bytes the user typed. Nothing is inferred.
**Retires:** retyping a half-written prompt after a restart, a crash, or the
folder-moved recovery path.
**Replaces:** nothing. **This is a genuine addition and I am saying so.** It
earns its rent on one argument only: this product just spent a release proving it
loses a user's state (the workspace-destroying half-write, the persisted doomed
tab), and an unsent prompt is the one piece of the user's *own creative output*
in the app that is deliberately not durable.
**Code paths:** `store.ts` (`composerDrafts`), `main/workspace.ts`,
`PromptComposer.tsx`.
**Size:** hours. It is persistence of an existing record, not a schema.
**Smallest version:** persist the drafts map; restore on load; cap length; drop
drafts for projects that no longer exist.
**What kills it:** if drafts turn out to survive a restart because nobody ever
restarts mid-draft, delete the persistence and keep the runtime map.
**Strike, stated:** also weakly falsifiable in five first sessions — a first
session does not have a "before". Watch W7.

### S3 — The session receipt: a Claude session id per pane, read back from the transcript

**Cost when wrong:** the highest on this page, which is why it is ranked last. It
touches the spawn path for a paid CLI.
**Source of truth:** `~/.claude/projects/<mangled>/<session-id>.jsonl`, written by
Claude Code, already parsed by `main/usage.ts` (which dedupes by
message+request id and was measured against a real 7-day window). With a known
session id, the mapping pane → transcript is **exact** instead of
directory-and-time-window.
**Removes code:** `runRecorder.ts`'s exclusivity reasoning — the `shared` /
`unpriced` / `unknown` triple and the overlap scan — exists solely because the
attribution is a guess. A bound session id makes cost a receipt and makes that
machinery deletable. **This is the only candidate on the list that deletes
code**, and `ROADMAP.md` already names it under *Behind those, in order*.
**Retires:** reading the pty scrollback to find out which files an agent touched.
**Code paths:** `settings.ts` (`AgentPreset.command` is free text — the flag
cannot be blanket-appended), `main/pty.ts` spawn, `main/usage.ts`,
`runRecorder.ts`, `main/ledger.ts`.
**Size:** days, plus a migration decision for existing `runs.jsonl` rows.
**Smallest version that proves or disproves it:** for one pane, one preset whose
command's first token is exactly `claude` and which carries no `--session-id`
already: mint a uuid, spawn with it, and assert the transcript with that name
appears and parses. **Render nothing.** The whole hypothesis is "the binding
holds"; the UI payoff is a separate, later decision.
**What kills it:**
- The flag is absent, renamed, or ignored on a resumed session (`--continue`
  re-enters an existing id) → the binding is not a fact and the receipt is
  another guess. Stop.
- It only works for Claude. Codex and Gemini have no equivalent, so `AgentPreset`
  would carry a Claude-shaped field. If the design cannot express that as
  *"unknown"* for other agents rather than *"zero"*, it violates fixed point 4
  and stops.
- A user's edited preset breaks on spawn. One instance is L2 territory in a beta.

**Strike, stated:** S3 is not falsifiable by five first sessions either. It is
falsifiable in an afternoon by the author, against his own machine, and that is
the right test — it is a factual question about a CLI, not a question about
users.

---

## 3. The verdict on sequencing: build none of them yet

All three survivors are cheap-to-wrong and none of them moves step 9. The
milestone is blocked on one authorisation and one person holding a phone.
Writing any of this before the first five sessions is, in `ROADMAP.md`'s own
words, *"a way of not asking for the authorisation."*

**Ruling:** S1, S2 and S3 are **pre-registered, not scheduled.** Each is unlocked
by a named observation from the beta, listed below. If a survivor's observation
never fires across the first five sessions, it is deleted from the backlog rather
than re-argued — that is the whole point of writing the trigger down before the
data arrives, and it is the method `05-validation-criteria.md` already uses.

The one exception worth naming honestly: **S3's kill test is not about users at
all.** It is a factual check on a CLI flag that costs an afternoon and can be run
whenever the author has an afternoon that is not on the critical path. Doing it
does not delay step 9; *building the UI on top of it* would.

---

## 4. The beta watch-list — what the first five sessions must be watched for

Added so this question is answered by evidence and not argued a second time. Each
is an **observation**, not an opinion, and belongs in the session record
(`docs/beta/04-session-record-template.md`) alongside the existing fields.

| id | Watch for | Unlocks / kills |
|---|---|---|
| **W1** | While an agent is working, what does the user physically do — watch the pane, switch views, switch projects, or leave the keyboard? Record which, with a timestamp. | The whole "cost of an interruption" category. If they leave the keyboard, C6/mission-trace matters. If they watch, it does not. |
| **W2** | Does the user ask, out loud or in the record, whether a working agent is stuck? | Unparks **C6 (mission trace)**. No instance in five sessions → C6 is deleted from the roadmap, not deferred again. |
| **W3** | When an agent finishes, what is the **first** thing they look at: the pty scrollback, Changes, or a file in the editor? | If it is the scrollback, **S3's** payoff is real. If it is Changes, git already answers it and S3 stays a cost-attribution fix only. |
| **W4** | Does anyone ask "what did it just do?" or scroll back more than one screen to find out? | Direct evidence for **S3**. |
| **W5** | Does anyone type a prompt and not send it? Does anyone lose one to a restart or a project switch? | **S2**. Zero instances → S2 is deleted. |
| **W6** | Does anyone retype a prompt they have typed before, or ask how to save one? | Reopens **C19 (snippet promotion)**. This is the only route back for it. |
| **W7** | Does anyone run two agents at the same task, or say they wish they could compare two attempts? | The **only** admissible evidence for reopening **C13/C14 (bake-off)**, which was deleted for never completing a run. One wish is not enough; an attempted comparison is. |
| **W8** | Does anyone question a cost figure, or notice that two sessions in one project share an attribution? | Direct evidence for **S3**, and the only user-visible symptom of the guess it replaces. |
| **W9** | Does anyone reach for undo after an agent wrote files — and what do they reach for (git, the editor, DevDeck)? | If they reach for DevDeck, **C10/C12** reopen. If they reach for git, they stay dead permanently. |
| **W10** | **Verbatim:** what do they call the thing they are doing while the agent types? | The question this document exists to answer. It cannot be answered by argument and it has never been asked of anyone but the author. |

W10 is the important row. Every candidate above was generated from the author's
model of his own workday, which `PRODUCT.md` already flags as the largest risk in
the product. One sentence from a stranger describing what they do while an agent
works is worth more than this entire list.

---

## 5. Backlog delta — the exact amendment

**No new document.** This file is the working record; the backlog changes are two.

### `IDEAS.md` — append a new section after *"Checked against 1DevTool and
deliberately not built (2026-08-31)"*

```markdown
## Checked against the creativity question and deliberately not built (2026-09-07)

Full reasoning in `docs/superpowers/brainstorm/2026-09-07-creativity/candidates.md`.
24 generated, 21 killed. Do not re-propose without engaging the reasoning there.

- Per-project scratchpad / notes pane; a global cross-project idea inbox — a
  capture tool people abandon, and `CLAUDE.md` (one click from `ContextIndex`) is
  already the durable per-project text the *agent* reads.
- Voice / dictation prompt capture — every hosted STT engine transmits.
- "Where was I" resume card; a per-project away digest; a "changed since you last
  looked" marker — three more answers to "what happened", which the Activity
  drawer, the Mission tiles and Changes already answer. The marker additionally
  lies the moment anything is committed from a terminal.
- Do-not-disturb / batched attention — a mode that withholds "an agent needs you".
- Pre-dispatch worktree snapshots, a "restore to before this session" chip,
  recoverable discard — a second version-control system for daily git users.
- **Reviving the bake-off / race, in any form** (a diff-of-diffs, a
  "run this in a second worktree" button) — deleted in 0.9.0 at ~2,100 lines
  because *it never completed a race*. Reopens only on watch item W7.
- Prompt history per project — the shell and the agent CLI both already do it.
- A structured intent form; a rework counter; a "creative flow" dashboard — a
  template, an uncomputable number, and a twelfth surface needing telemetry that
  will never exist.

Held, not killed, pending one named observation each: snippet promotion (W6),
mission trace (W2), cross-session transcript search (needs the session binding
first).
```

### `ROADMAP.md` — add three rows to *"Ruled **not yet**, with triggers, so
nobody re-opens them"* in the **Added on 2026-09-04** section

```markdown
- **`Ctrl+Shift+J` → jump to the oldest waiting agent.** The chord was freed when
  the Inbox drawer was deleted in 0.9.0 and the changelog left the repurposing as
  its own decision. It reads `wantsYou` — no second count, no new surface, hours
  of work, one line to delete. **Trigger: after step 9 begins**; evidence is the
  author's own 14 days, not the first five sessions (a stranger will not find a
  chord). Delete it if unused.
- **Prompt drafts survive a restart.** `composerDrafts` is per-project store state
  documented as never persisted. A genuine addition, argued in the creativity
  candidates file. **Trigger: watch item W5** — one user loses a typed prompt.
- **`claude --session-id <uuid>` per pane.** Already named under *Behind those, in
  order*; the creativity review ranks it the highest-value item available because
  it is the only one that **deletes** code — `runRecorder.ts`'s
  shared/unpriced/unknown exclusivity machinery exists solely because attribution
  is a directory-and-time-window guess. **Its smallest test needs no user**: mint a
  uuid for one `claude` preset, spawn, assert the transcript appears and parses,
  render nothing. Run it on an afternoon that is not on the critical path. Kill it
  if `--continue` reuses an existing id, or if the design cannot report "unknown"
  for Codex and Gemini rather than "zero" (fixed point 4).
```

### `docs/beta/04-session-record-template.md` — add W1–W10 as an optional
*"Creative act"* observation block

Optional, not `[required]`: the milestone bar is S1–S4 and E1–E5, and this
question must not be allowed to raise the bar for a completed session record.

---

## 6. Decide first

1. **Does S3's smallest test count as "engineering that delays step 9"?** My
   recommended default: **no**, because it renders nothing and can be run in an
   afternoon — but the moment it grows a UI it is on the wrong side of the line
   and stops.
2. **Do W1–W10 go in the session template or in the observer's own notes?** My
   default: **the template, marked optional**, because an observation nobody
   wrote down did not happen, and the author will be busy watching S1–S4.
3. **Is S2 permitted before step 9, given it is hours of work?** My default:
   **no.** It is hours plus a build, a re-verify across six skins, and a
   conversation — and the trigger (W5) will answer it for free.
