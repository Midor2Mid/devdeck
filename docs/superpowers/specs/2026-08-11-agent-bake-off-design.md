# Agent bake-off — race two or three agents on one card

**Status:** approved design, not yet implemented
**Date:** 2026-08-11

## The idea

Dispatch one board card to two or three agents at once, each in its own worktree.
When each commits, its work is verified by the same gate command. Anything that
fails the gate is eliminated on the exit code. You read the survivors' diffs, pick
one, and its changes land on your working tree for review.

Best-of-N for a single hard card. Nothing accumulates between races: there is no
benchmark history, no scoreboard, no ranking.

## Why this is possible

`costInWindow` (`src/main/usage.ts:135`) keys transcripts off
`encodePath(projectPath)` under `~/.claude/projects/`. A worktree is a **different
directory**, so it gets its own transcript folder.

That matters more than it sounds. The function's own doc comment is careful to
call its result "an attribution, not a receipt" — on a shared working tree, every
agent's spend during the window is counted together. In a race, each entrant is
alone in its own directory, so its cost **is** a receipt. Fair per-agent scoring
falls out of the existing architecture with nothing new built.

## Division of labour

**The gate rules on facts. You rule on judgment.**

A gate command's exit code is a fact, so the app is allowed to eliminate on it. Everything
else — which of two passing diffs is better code — is inferred, so the app must
not rank it. There is deliberately **no scoring rule**: no "cheapest wins", no
"smallest diff wins". A ranking would assert that terse and cheap beats correct,
which is frequently false, and would be the kind of confident-but-wrong claim this
codebase has been bitten by before.

Cost and diffstat are shown because they are facts worth knowing. They are not
ordered, weighted, or summed into a score.

## Data model

New pure module `src/renderer/src/race.ts` — no React, no IPC, unit-testable.

```ts
export type EntrantStatus =
    | "starting"   // worktree made, session spawning
    | "working"    // dispatched, no commit yet
    | "gating"     // committed; gate command running
    | "passed"     // gate exit 0 — a survivor
    | "failed"     // gate non-zero — eliminated
    | "nocommit"   // never committed inside the timeout

export interface Entrant {
    agentId: string
    agentName: string
    termId?: string
    worktree: string
    branch: string
    /** Worktree HEAD at dispatch. A change is the finish line. */
    baseHead: string
    head?: string
    status: EntrantStatus
    gateExit?: number
    gateMs?: number
    gateOutput?: string
    cost?: number
    costTokens?: number
    added?: number
    removed?: number
}

export interface Race {
    cardId: string
    projectId: string
    projectPath: string
    title: string
    gateCommand: string
    startedAt: number
    entrants: Entrant[]
}
```

Held in a `races: Record<cardId, Race>` slice, **runtime only**. If the app
restarts mid-race the worktrees survive and appear in the existing worktrees UI,
which is a sufficient recovery story for v1. `BoardTask` is not extended — its
single `termId`/`worktree` pair describes a normal dispatch and should keep
meaning exactly that.

## Running a race

1. You choose 2–3 agent presets from `settings.agents` (AI-mode only) and a gate
   command, prefilled from the project's saved commands.
2. One worktree per entrant via the existing `git.worktreeAdd(repoPath, branch, base)`.
   Pass `"<card title> <agent name>"` as the branch argument and let
   `worktrees.safeBranch` slug it, rather than inventing a second naming scheme.
   Record each worktree's HEAD as `baseHead`.
3. Entrants spawn **sequentially**: `newTab` requires the active project to be set
   and carries a hardcoded ~2800 ms CLI-boot wait before `pty.input`, so a
   three-way race takes ~9 s to start. After that they run in parallel.
4. Each receives the card title plus an explicit contract appended:

   > When you are finished, commit all your work in this worktree with a short
   > message. Do not push.

5. A 5 s poll calls `git.worktrees(projectPath)` **once per tick** — that one call
   already returns every worktree with its head (`parseWorktreeList`), so polling
   cost does not scale with the number of entrants. A head differing from
   `baseHead` means that entrant committed.
6. On commit: status → `gating`, then `checks.run(entrant.worktree, gateCommand)`.
   **The gate runs inside the entrant's worktree, not the project root.** Running it
   at the root would verify your tree instead of theirs and score every entrant
   identically — the single most damaging thing to get wrong here.
7. Gate exit 0 → `passed`; non-zero → `failed` with the first lines of output kept
   for display. Then read `usage.window(entrant.worktree, race.startedAt, now)` for
   cost, and a new `git:shortstat({ cwd, fromRef })` handler — `git diff --shortstat
   <baseHead>..HEAD` in the worktree — for the diffstat. Parsing lives in `race.ts`
   so it is testable without git.
8. `RACE_TIMEOUT_MS` (one constant, 20 minutes, not a setting) with no commit →
   `nocommit`.

### The finish line is a commit, deliberately

The board's existing `doing → review` move and the pipeline's `waitForIdle` both
infer completion from the pty going quiet for `agentIdleMs` — which defaults to
**1000 ms** (`settings.ts:340`). A thinking pause looks identical to being done.
In a race that inference is not merely imprecise, it is unfair: the gate would run
on half-written work and eliminate an agent that was still going.

A commit appearing on the branch is a fact. It costs a sentence of prompt and
removes the entire class of problem.

## Landing the winner

Selecting a survivor and confirming performs, in the **main process**:

```
git -C <worktree> diff --binary <baseHead>..HEAD    →  patch
git -C <projectPath> apply --3way                    ←  patch
```

Both halves stay in main so a large patch never crosses IPC. One handler,
`git:landFrom({ worktree, baseHead, target })`, returning `{ ok, error? }`. Both
`worktree` and `target` go through the existing `guardRepo` — the worktree path
qualifies via `worktrees.worktreeBase`, and guarding only one of the two would
leave the other an unchecked path from the renderer.

Then every race worktree is removed via `git.worktreeRemove`, the race is dropped
from the store, and `openChanges(projectPath, projectName)` opens the review flow.

**Landing requires a clean project working tree.** The button is disabled, with the
reason stated, when `git.status(projectPath).changes > 0`. Applying an agent's
patch on top of your own uncommitted work produces a mixed tree that cannot be
unpicked afterwards; refusing is the honest behaviour. `git.status` already
provides the check.

The winner's commits are deliberately **not** merged. The diff arrives unstaged so
you write the commit message and no agent-authored commit lands unread.

## UI

One `RaceModal`, opened from a card action on the board.

```
Race · add pull button                      gate: npm test
                                            spent so far  $0.59

● opus     committed   ✓ 18s    $0.42   +47 −3   [diff]
● haiku    committed   ✓ 12s    $0.06   +52 −8   [diff]
○ sonnet   failed      ✗ exit 1 · 2 tests failed [output]

                                    [ Land haiku ]  [Abandon]
```

Bound by `DESIGN.md`:

- **State in form, not colour alone** — a dot *and* a word per row, so status
  survives all 84 theme/style combinations.
- **Exactly one accent.** Rows are neutral and selectable; the single filled
  `Land <agent>` button lives in the footer. A Land button per survivor would put
  two accents on screen.
- Cost and diffstat in mono with tabular numerals; agent names in sans.
- Icons from `components/Icon.tsx`. No emoji.
- `[diff]` reuses `openChanges(entrant.worktree, entrant.agentName)` — the existing
  modal already takes a cwd and a label, so no new diff viewer is needed.

The running combined spend is shown deliberately: a race costs N times one card,
and that should be visible while it happens rather than discovered afterwards.

### Abandon, and the all-eliminated case

**Abandon** kills every entrant's session, removes every race worktree with its
branch, and drops the race from the store. It is available at any point, including
mid-run, and it is the only exit that discards work — so it confirms first, naming
what will be deleted.

When every entrant ends `failed` or `nocommit` there is no winner and no Land
button. The modal says so plainly and offers Abandon, keeping the gate output
visible: an all-failed race is a useful result about the card, usually that the
task was underspecified, and it should read as information rather than an error.

## Testing

`race.ts` is pure and carries the unit tests:

- `parseShortstat` on real `--shortstat` output, including insertions-only,
  deletions-only, and the empty case.
- `survivors(race)` returns only `passed`, and `raceSettled(race)` is true only
  when every entrant is terminal (`passed` / `failed` / `nocommit`).
- Two entrants on the same card produce **different** branch names — a collision
  would make two agents share a worktree and silently invalidate both their cost
  figures.
- The state machine: no transition out of a terminal status, and `nocommit` is
  reachable only after the timeout.

Everything touching git or IPC stays thin enough to verify in the running app via
the `run-app` skill.

## Out of scope

- Benchmark history, per-agent win rates, any accumulation between races.
- Ranking, scoring, or auto-landing a winner.
- Racing anything other than a board card.
- Persisting a race across an app restart.
- A configurable timeout.

## Known weaknesses, stated rather than discovered later

1. **The finish line depends on obedience.** An agent that summarises its work
   instead of committing scores `nocommit` and loses on instruction-following
   rather than merit. The row says `nocommit` and not `failed` precisely so this
   is legible, but it remains a real way for a good agent to lose.
2. **A race costs N times one card.** This is a tool for hard cards, not routine
   ones, and the UI should not make it feel free.
3. **Cost is a receipt only while the worktree is exclusive.** If you open your own
   terminal in an entrant's worktree during a race, its spend is counted against
   that agent. True by construction otherwise.
4. **`git apply --3way` can still fail** on a patch that does not apply. The
   failure is reported and nothing is left half-applied, but the fallback is
   manual — the worktree is still there to copy from.
