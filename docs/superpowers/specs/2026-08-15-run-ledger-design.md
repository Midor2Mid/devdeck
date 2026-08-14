# Run ledger — a durable record of what agent work cost and produced

**Status:** draft, awaiting approval
**Date:** 2026-08-15

## The problem

DevDeck spends real money on your behalf and keeps almost no record of it.

- A **race** costs two or three agents' work. Land or abandon it and the entire
  race object — gate results, per-entrant cost, diffstats — is deleted from memory.
  Races were never persisted at all.
- A **pipeline run** shows a live spend figure in its bar, held in one component's
  local state. When the run ends the figure is discarded; `PipelineRun` has no cost
  field and no array of past runs exists anywhere.
- A **dispatched card** keeps its cost, but only as a field on the card. Delete the
  card and it is gone. Move it out of *done* and it is cleared.
- An **ad-hoc session** leaves the one persisted trace in the app — a `UsageEvent`
  with start and end timestamps — whose own doc comment says it deliberately
  carries no cost.

So the app can tell you what you spent last week by model and by day, and it can
tell you what a card cost while the card exists, but it cannot answer "what did
that race cost me" ten minutes after the race ended.

## The honesty problem, which shapes everything else

Cost in DevDeck is **an attribution over a directory and a time window**, not a
receipt. `costInWindow` reads every transcript under a project's directory and sums
the records inside the window. Its own doc comment is explicit: everything the
agent did in that project during the window counts, so a second session running
alongside is included, because Claude Code names transcripts by project, not by
pty.

That is fine for a live figure you read once. It is **not** fine for a ledger,
because a ledger invites arithmetic. Two cards dispatched into the same project at
the same time each record the *combined* spend of both, and a total across them
double-counts. Summing those rows produces a confident number that is simply wrong
— the exact failure this codebase has produced repeatedly.

So the ledger records, alongside every cost, **whether that cost was exclusive**:

- A race entrant works in its own git worktree, which is its own directory, so its
  cost genuinely is a receipt. `exclusive: true`.
- A card dispatched into a worktree, likewise.
- A card dispatched into the shared project tree while any other agent session was
  live in that same directory during the window: `exclusive: false`.

Exclusivity is decided at record time by asking how many agent sessions shared that
directory during the run — which the store knows. Non-exclusive rows are shown, and
are **excluded from every total**, with the count of what was excluded stated. A
ledger that silently sums overlapping attributions is worse than no ledger.

Pricing is also an estimate from a hardcoded rate table, not billed truth. Every
figure the ledger displays says so once, plainly, rather than in a footnote.

## What a run is

```ts
export type RunKind = "card" | "race" | "pipeline" | "session"

export interface RunRecord {
    id: string
    kind: RunKind
    /** Project this ran in, and its name at the time — projects can be removed. */
    projectId: string
    projectName: string
    /** What it was: the card title, the pipeline name, the agent name. */
    label: string
    startedAt: number
    endedAt: number
    /** Agent preset ids involved. One for a card, several for a race. */
    agentIds: string[]
    cost: number
    tokens: number
    /** False when another agent session shared the directory during the window. */
    exclusive: boolean
    /** Kind-specific facts, all optional and all small. */
    outcome?: "landed" | "abandoned" | "done" | "failed" | "stopped"
    added?: number
    removed?: number
    /** For a race: which entrant won, and how many were eliminated. */
    winner?: string
    eliminated?: number
}
```

A record is written **once, at the end of a run**, and never updated. That is what
makes the store append-only and what stops a half-finished run from being counted.

## Where it lives

A new `src/main/ledger.ts` writing `runs.jsonl` under `app.getPath("userData")` —
one JSON object per line, appended.

Every other persistent store in this app is read-whole, mutate, write-whole. That
is right for current state and wrong for a ledger: rewriting a growing history on
every append gets more expensive precisely as the history becomes more valuable,
and a crash mid-rewrite risks the whole file rather than one line. Appending a line
costs the same at row 10 and row 10,000, and a torn final line on a crash loses one
record — recoverable by skipping unparseable lines on read, which the reader does.

Capped at **5,000 records**. On exceeding it, the file is rewritten once keeping the
most recent 4,000 — a rare whole-file write, not a per-append one.

Not encrypted. It holds card titles and cost figures, not secrets — consistent with
`workspace.json`, which already holds the same card titles.

```ts
export function appendRun(rec: RunRecord): void
export function readRuns(limit?: number): RunRecord[]
export function clearRuns(): void
```

## Where records come from

Four call sites, each at the moment the run genuinely ends:

| Kind | Written when | Notes |
| --- | --- | --- |
| `card` | The card reaches *done* | The cost window already exists (`dispatchedAt` → `endedAt`). Moving a card back out of *done* does not retract the record; it was true when written. |
| `race` | `landRaceWinner` and `abandonRace`, before the race object is deleted | One record for the race, carrying the winner, the eliminated count, and the summed entrant costs — every entrant is exclusive by construction, so the sum is a real receipt. |
| `pipeline` | A run reaches a terminal status | The bar's live figure is read once more and recorded rather than discarded. |
| `session` | An agent pane closes | Pairs with the existing `usageLog`, but carries the cost that log deliberately omits. |

Deleting a card, abandoning a race, or removing a project does **not** delete its
records. That is the point: the ledger outlives the thing it describes. Records
carry `projectName` as it was, so a removed project's history stays readable.

## What it shows

A **Runs** section in the usage panel, which already exists and already explains
that cost is estimated — the ledger belongs beside that, not in a new view.

- Newest first: date, kind, label, project, agents, duration, cost.
- A total across the visible rows, **excluding non-exclusive ones**, with the
  excluded count stated next to it: "12 runs · $4.18 · 3 runs excluded from the
  total (shared a project with another session)".
- Filter by kind and by project. No charts — the existing panel already has the
  by-model and by-day breakdowns, and a ledger's job is the individual rows.
- A non-exclusive row shows its cost in a form that marks it as an attribution
  rather than a receipt, so it cannot be misread as a number you could add up.

## Testing

`ledger.ts` is main-process and file-backed, tested with `electron` mocked as
`aikeys.ts` and `devices.ts` are:

- A record appends and reads back identically.
- **An unparseable line is skipped, not fatal** — the crash-torn-line case that
  justifies the format.
- The cap rewrites once and keeps the most recent records in order.
- `readRuns(limit)` returns the newest `limit` records.

A pure `src/renderer/src/ledgerView.ts` holds the summing:

- The total excludes non-exclusive rows and reports how many it excluded.
- A total over zero eligible rows is `$0` with the exclusion count still stated,
  not an empty string.

## Out of scope

- **No retroactive backfill.** The ledger starts empty; past runs are gone and
  cannot honestly be reconstructed.
- **No per-session cost attribution.** It is not available — transcripts are named
  by project, not by pty. The `exclusive` flag exists precisely because this cannot
  be solved here.
- **No budgets, alerts, or projections.** A record of what happened, not a control.
- **No cost-aware routing** yet. This is the data that would make it possible, and
  deciding what to do with it is a separate piece of work.
