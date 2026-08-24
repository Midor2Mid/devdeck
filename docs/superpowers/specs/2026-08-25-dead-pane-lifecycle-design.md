# A dead pane keeps its evidence — and asks before it restarts

**Status:** draft, awaiting review
**Date:** 2026-08-25

## The problem

Clicking an `EXITED` tile on Mission silently resurrects a shell in place of the
corpse, and destroys the record of why the process died.

The path, verified end to end:

1. `main/pty.ts`'s `proc.onExit` calls `sessions.delete(id)`. The session's
   buffer — everything the process printed, including whatever explains the
   failure — dies with the entry.
2. Only the **active tab's** panes are mounted. `TerminalView` itself stays
   mounted across views (`App.tsx` toggles `display`), but it renders
   `<SplitView node={activeTab.root}>`, so every pane in another tab or another
   project is unmounted.
3. `TerminalPane`'s mount effect calls `spawn()` unconditionally.
4. `createPty` early-returns only `if (sessions.has(id))`, which is false for a
   corpse — so it **spawns a brand-new shell** in the same directory.
5. `getBuffer(id)` returns `""`, so nothing replays.
6. `onPtyData` then calls `clearExit(id)` on the new shell's first output, so the
   Mission tile flips from `EXITED` to `QUIET` and the last trace is gone.

With eight terminals across projects — the situation Mission exists for — most
`EXITED` tiles are in a tab that is not the active one. This is the default
path, not a corner case.

**This predates the state chip.** A dead pane has always respawned on remount.
What changed is that DevDeck never used to say a pane was dead, so nobody went
looking. The chip did not create the bug; it created the traffic, and it now
actively solicits the click — the tile says `EXITED`, and offers **Review** right
beside it when the session changed files.

## What this is not

**Not session persistence.** A pty does not survive the app closing and this
does not try to make it. A corpse lives in memory, for as long as its pane is
open, and no longer.

**Not a new surface.** Everything here lands on the pane that already exists and
the hold overlay that already exists.

## The rule that governs the design

**A corpse is not a session.** Every code path that assumes a live process must
be made to say so, and the compiler — not a grep — is what finds them.

`Session` today is `{ proc, buffer }`. Adding a `dead: true` flag to that shape
would leave `session.proc.write(...)` compiling everywhere and failing at
runtime for whichever call site was missed. Instead the two states become
different types, and a corpse has **no `proc` field at all**:

```ts
type Live = { kind: "live"; proc: IPty; buffer: string }
type Corpse = { kind: "dead"; buffer: string; exitCode: number; diedAt: number }
type Entry = Live | Corpse
```

Every existing `.proc` access becomes a type error, so `tsc` enumerates the
audit. This project already requires `npm run typecheck` at zero errors, which
makes that enumeration a task the toolchain drives rather than a promise in a
review.

## The main-process contract

Four changes, all in `src/main/pty.ts`:

| Function | Today | After |
| --- | --- | --- |
| `proc.onExit` | `sessions.delete(id)` | replaces the live entry with a corpse carrying the buffer and the code |
| `createPty` | early-returns `if (sessions.has(id))` | early-returns only for `kind: "live"`; a corpse is not live, so a deliberate restart spawns and overwrites it |
| `getBuffer` | `sessions.get(id)?.buffer ?? ""` | answers for a corpse too — this is the whole point |
| `killPty` / `killAll` | kills `session.proc`, deletes | drops a corpse without trying to kill a process that is not there |

`hasSession` has **no callers anywhere in the codebase** — checked, not assumed.
It should either keep the live-only meaning its name implies (a corpse is not a
session anyone can write to) or be deleted outright. Deleting it is the honest
default: the implementation may keep it only if it acquires a real caller during
this work.

### Two things fall out for free

- **The mobile client stops seeing an empty box.** `server.ts:349` replays
  `getBuffer(id)` on attach, so a remote client attaching to a dead session gets
  the same evidence the desktop pane does.
- **`writePty` on a corpse becomes a typed no-op** rather than a throw. Today a
  remote client typing into a dead session is saved only by a `try/catch`.

### Memory

One corpse per pane, each already capped at `BUFFER_CAP`, freed when the pane
closes. Bounded by open panes, which is the same bound live sessions already
have.

## The renderer: hold, don't spawn

`agentResumePending: Record<string, boolean>` already holds a restored pane
un-spawned and renders Resume / Fresh over it. **A dead pane is that same state
with a different cause**, so the field generalises rather than gaining a
neighbour:

```ts
paneHold: Record<string, "resume" | "restart">
```

- `"resume"` — today's case: a workspace was restored and the agent has not been
  started yet.
- `"restart"` — new: this pane's process exited. Set from the store's global
  `pty.onExit` subscription, beside the `recordExit` call already there.

The mount check changes from "is this pending" to "is this held". The overlay
picks its buttons from the reason:

- **Agent panes** — `Resume` (the agent's `resumeArgs`, continuing the
  conversation) and `Fresh` (the cold command). The same pair, and the same
  machinery, as a restored session.
- **Plain shells** — one `Restart`.

Above the buttons, the pane shows what died: the replayed buffer, then the exit
notice.

### Why the rename is load-bearing, not cosmetic

`startResumedAgent` bails unless the pane is flagged, then calls `markLaunched`
and `logUsageStart`. Routing a restart through it means **a restarted agent is
accounted for**, which matters more than it first appears: the ledger answers
exclusivity from `usageLog`, so an unlogged session sitting in a project
directory silently lets every card, pipeline and session whose window it
overlaps be written as an exclusive receipt over money that was partly its.

That function's comment currently says resume is the *only* way a restored agent
session ever starts. After this it is one of two ways, and the comment must say
so.

### A replay is not new output

Main sends the replayed buffer through `pty:data`. The store's `onPtyData` calls
`clearExit(id)` on any data for an agent id — so **replaying a corpse would erase
its own exit record**, and the tile would flip from `EXITED` to `WORKING` because
the pane was visited. The feature would break itself.

A held pane does not call `pty.create` — that is the entire point — and replay
today happens *inside* the `pty:create` handler. So a marker on `pty:data` would
never fire for a held dead pane: it would replay nothing at all.

The corpse is therefore fetched, not pushed. A read-only IPC returns it for an
id, and the held pane writes it into xterm itself:

```ts
ipcMain.handle("pty:buffer", (_e, id: string) => ptyMgr.bufferOf(id))
// -> { buffer: string; exitCode: number | undefined }
```

Nothing on this path passes through `onPtyData`, so `clearExit` is never
reached and no `{ replay: true }` flag has to be threaded through main, preload
and the store. The ordering the pane needs — the output first, then the exit
notice — becomes an ordinary `await` instead of a race against a pushed event.

The live re-attach path (a still-running session whose pane remounts) keeps
replaying through `pty:create` exactly as it does today, and is not touched.

### The `lastAt` stamp stays as it is — deliberately

Replay runs through `recordTail`, which stamps `lastAt`, so re-attaching to a
long-quiet session makes it look like it just spoke and resets stall detection
for a session that has said nothing. That is a real pre-existing lie of the same
family, and it was **considered and cut from this work**: it changes stall
behaviour for every re-attach in the app, not only for dead panes, and it
deserves its own change with its own review rather than riding in on this one.

Implementers must therefore leave `recordTail` alone on the replay path. The
temptation to "fix it while we're here" is the thing being refused; a test pins
the current behaviour so the decision is visible rather than assumed.

## What clears a corpse

- **A restart** — the spawn overwrites it.
- **Closing the pane** — `killPty` drops it in main, `forget` clears the
  renderer's records.

Nothing else. It deliberately does not survive an app restart, because the
process it describes does not either.

## Out of scope

- **No Restart button on the Mission tile** (decided, not merely unbuilt). The defect was that the jump was
  destructive; once the jump is safe, the tile needs nothing new. The state-chip
  spec rejected a kill button on a dense one-click tile for the same reason a
  spawn button does not belong there either.
- **No auto-restart.** A process that died wants a person to look at why. A pane
  that quietly restarts itself is the current bug with better manners.
- **No change to what `EXITED` means on the chip**, or to its precedence.
- **No session persistence across app restarts.**

## Testing

- **The corpse lifecycle**, against a faked `node-pty`: spawn → data → exit, then
  assert the buffer survives, `getBuffer` still answers, `createPty` spawns again
  rather than early-returning, and `killPty` drops it.
- **`tsc` is part of the proof.** The discriminated union means a passing
  typecheck demonstrates no path still assumes a live `proc` — that is why the
  union was chosen over a flag.
- **The hold decision** as a pure function over (exit code present, restore
  pending) → the reason, or none.
- **A replay is not liveness**: through the existing store-stub pattern
  (`tests/exitRecord.test.ts`), assert that a replayed chunk does **not** clear
  the exit record while a live chunk does — and, pinning the decision above,
  that a replayed chunk **still stamps `lastAt`** exactly as today. That second
  assertion exists so the cut is a recorded choice rather than an oversight
  someone later "fixes" without noticing it was deliberate.
- **Restart is accounted**: a restarted agent pane produces a usage-start event,
  pinned the way `tests/signalSites.test.ts` pins the launch sites today.
- **In the running app** (there is no headless renderer): kill a process, switch
  to another tab, come back — the output is still there, the notice is there, no
  new shell appeared, and the Mission tile still says `EXITED`. Then restart it
  and confirm the pane comes back and the chip stops saying `EXITED`.
