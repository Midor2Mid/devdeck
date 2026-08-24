# Decide from Mission — a state per agent, and the action that answers it

**Status:** shipped 2026-08-24
**Date:** 2026-08-21

## The problem

With eight terminals open, answering "what is everything doing, and what needs
me" means visiting eight tabs. The two surfaces that should prevent that each do
half the job, in different places:

- **Mission** (`MissionControl.tsx`, the default view) shows a tile per agent
  session across all projects — status dot, name, agent badge, project, a peek of
  the last output, expandable to more, plus the stall marker and an activity
  sparkline. But the only action a tile offers is `jumpToTerm`. You can see, and
  then you must leave.
- **Overview** (`OverviewView.tsx`, a *layout mode* inside the Terminal view)
  detects a pending prompt and offers one-click **Approve / Deny** that answers
  the agent without opening its terminal (`:83-105`). That is the decisive
  capability in the whole product, and it lives behind a layout toggle.

So seeing and deciding are split across two surfaces, one of which was
undiscoverable until it was given a command-palette entry.

Neither actually *summarises*. Both render the raw last-N-lines tail. Eight
terminals gives eight tiny terminals — not a summary, and not a decision.

## What this is not

**Not a new dashboard.** The app already has eleven surfaces answering "which
agent needs me", and that is its worst documented problem. This adds none: it
puts the decision on the tiles that are already the first thing on screen, and
removes two lines from those tiles in the process.

## The rule that governs every state

**A state may only be derived from something DevDeck already knows exactly.**

This app has repeatedly shipped signals that lied — a terminal title read as a
bell, a one-second pause read as "finished", a stall check that never fired — and
each cost more trust than the signal was worth. `approval.ts`'s own comment sets
the bar: it stays conservative "because acting on a wrong guess sends the wrong
keystroke to a live agent."

So no state on this tile is inferred from prose. Each one below names its source.

**Explicitly rejected: parsing tool output for failures.** "3 tests failed" would
need to read arbitrary output in arbitrary formats. An agent writing the word
"error" in a sentence would trip it; a real failure in an unrecognised format
would not. It is the one thing on the original sketch that cannot be delivered
honestly, and it is cut.

## The states

One chip per tile, **first match wins**. The precedence is deliberate: a dead
process outranks a silent one, and a question outranks everything, because it is
the only state where the agent is blocked on you.

| # | Chip | Source of truth | Action |
| --- | --- | --- | --- |
| 1 | `NEEDS YOU` + the question | `detectApproval(getFullTail(id, 16))` | **Approve** / **Deny** |
| 2 | `EXITED 1` (and the code in hex) | pty exit code — see below | **Reply** is meaningless here; offer **Review** if the session changed files |
| 3 | `ASKING` | `agentStatus === "attention"` with no parsable prompt | **Reply** |
| 4 | `STALLED · silent 21m` | `isStalled(getLastAt, alive, awaited, now)` | **Reply** |
| 5 | `CHANGED · 4 files` | `newPathsSince(baselineOf(id), paths)` | **Review** |
| 6 | `WAITING 12m` | `agentStatus === "waiting"` | **Reply** |
| 7 | `WORKING` | `agentStatus === "working"` | none |
| 8 | `QUIET 8m` | silence with no changes | none |

`EXITED` above `STALLED` matters concretely: `isStalled`'s `alive` argument is
`!!termAgents[id]`, which stays true for a pane whose process has died but whose
tab is still open. Without the precedence, every dead pane would also read as
stalled.

`WAITING` sits below `CHANGED` and above `WORKING` — `agentStatus`'s own name
for "finished a turn while you were away" — so that reviewable work still
outranks it and no earlier precedence pair moves: a session that both changed
files and is waiting on you reads `CHANGED`, not `WAITING`, the same way a
session that is both waiting and holds a live prompt still reads `NEEDS YOU`.

### The exit code needs to be recorded first

Today the exit code is **written into the terminal as text and then discarded** —
`TerminalPane.tsx:155-156` calls `exitNotice(exitCode, IS_WINDOWS)` and writes
the string. Nothing stores it, so no other surface can know a process died or
why.

This spec adds that: `pty.onExit` records the code per session, and `forget()`
clears it like every other per-session record. `termExit.ts`'s `FASTFAIL`
handling stays where it is — the terminal keeps its actionable antivirus hint —
but the tile can now say `EXITED` at all, and a fast-fail exit is worth marking
distinctly since on this machine it means antivirus killed the shell.

## The actions

Every one already exists. This wires them to the tile; it builds no new
mechanism and no new surface.

- **Approve / Deny** — `respondApproval(termId, prompt.approve | prompt.deny)`,
  the same store action `OverviewView.tsx:86` uses.
- **Reply** — a one-line input sending `window.api.pty.input(termId, text + "\r")`,
  the same call `InboxPanel.tsx:30` makes. This consolidates rather than adds:
  the Inbox drawer's only unique capability was this box.
- **Review** — `openChanges(cwd, label)` (`store.ts:2006`) for that session's
  directory, opening the diff surface that already exists. **No new diff view.**
  Landing and committing stay inside it.

## Density: what it replaces

A mission tile is already near the ceiling — dot, name, badge, expand, project,
peek, `needs you`, stall line, sparkline. **This is not a net reduction on most
tiles, and it was not shipped as one.** The chip renders unconditionally, so
the quiet majority — `working`, `waiting`, `changed`, `quiet`, a clean
`exited` — each **gain one line** they did not carry before. Only the two
states that already had a conditional line (`needs you`, `stalled`) break even
against the chip alone, and `needs you` grows further once its question line
and Approve/Deny row are counted.

The chip stayed unconditional anyway, on review, because the honest argument
for it beats the density one: a fixed slot turns "is this tile one line taller
than that one" — a weak visual query across eight tiles — into "which of these
eight pills is the amber one," a strong one. That trade only pays off because
every tile's chip sits in the same place whether or not it has anything to
say; scoping it to only the states that used to carry a line would put it back
to a query that needs reading, not scanning. The tone system (four tones, one
glyph per state — see DESIGN.md's "Mission tile state chip") is what the
unconditional slot buys, and it is what pays the chip's rent.

What did stay conditional:

- Actions are **conditional on the state**. `working` and `quiet` gain no
  button row at all — a tile only grows one when there is a decision to make,
  which is also what keeps it honest.
- The reply input is **not** always rendered: it appears on the states that can
  use it, and only one tile can hold focus at a time.

## Cost

The chip must not make Mission expensive. Each source is already computed there
or is free:

- `agentStatus`, `getLastAt`, `getTrace`, `isStalled` — already read per tile on
  Mission's existing 1s tick.
- `detectApproval` — pure, on a 16-line tail; already called per session in
  `OverviewView.tsx:78-81`.
- The exit code — a map lookup.
- **`newPathsSince` needs a git read**, and that is the one real cost. Mission
  already polls `git:changes` per agent session every 8s, gated on the view being
  visible and the window not hidden (`MissionControl.tsx:118-137`), and nothing
  is cached. This spec **reuses that existing poll** and adds no new git calls.
  If the changed-files count needs to be fresher than 8s, that is a caching
  problem to solve first, not a reason to poll harder.

## Testing

- The state resolver is a **pure function** over `(status, prompt, exitCode,
  lastAt, changedCount, awaited, now)` returning a chip and an action set, in its
  own module, unit-tested. Precedence is the thing to pin: a dead process that is
  also silent reads `EXITED`, not `STALLED`; a prompt outranks everything.
- Each state maps to exactly the actions the table gives it — no action offered
  for a state that cannot use it.
- The exit code survives from `onExit` to the tile, and is cleared by `forget()`.
- A reply sends the text plus a carriage return, once, and clears its draft.
- Verified in the running app (there is no headless renderer) in a dark and a
  light theme, with `prefers-reduced-motion` emulated, since the chip is new
  chrome on the app's densest element.

## Out of scope

- **No AI-generated summaries.** Considered and rejected: a model call per agent
  per refresh, for a status view, in an app that has a cost ledger precisely
  because agent spend matters.
- **No parsing of tool output** for failures, test counts or diagnostics.
- **No stop/kill button.** Not asked for, and a destructive action on a dense
  tile with a one-click reach is the wrong place for it.
- **No new diff surface.** Review opens the existing one.
- **No change to `agentStatus`, the idle timer, or `waitForIdle`.** The same
  constraint the last branch held: those values are read as control flow by the
  pipeline runner and cross the process boundary into the mobile client.
- **The Inbox drawer is not deleted here**, even though this subsumes its reply
  box. Removing a surface is its own decision with its own keybinding fallout
  (`Ctrl+Shift+J`), and bundling it would hide that behind a feature.
