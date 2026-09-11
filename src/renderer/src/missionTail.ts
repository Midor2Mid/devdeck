// Capture a readable "last output" peek from a terminal's raw pty stream, for the
// Mission Control agent tiles. We do NOT parse agent output — we just strip the
// terminal control noise and keep the tail so you can glance at what each agent
// last said. Tails live in a module Map (not the store) so the fast pty stream
// never churns React state; consumers poll on an interval.

import { cleanTail, lastLines, peekLine, CARRY_MAX, OSC, CSI, OTHER, CTRL } from "../../shared/tail"
export { cleanTail, lastLines, peekLine, CARRY_MAX }
import type { AnySession } from "./store"
import type { ApprovalPrompt } from "./approval"
import type { DecisionSnapshot, DecisionView } from "../../shared/decision"
import type { DeckKeyStatus } from "./deck"

const tails = new Map<string, string>()
const lastAt = new Map<string, number>()

/**
 * Main's current answer for each session, keyed by terminal id.
 *
 * A module Map for the same reason the tails above are one: `promptFor` runs
 * once per tile per second-tick, and routing that through React state would
 * churn the whole grid on every pty burst. It also must not be a store slice
 * read through a selector — a selector that built a fresh object per render is
 * how this app has spun forever before.
 */
const decisions = new Map<string, DecisionView>()

/**
 * Replace the cache with main's snapshot. Wired to `decisions:changed` in
 * App.tsx; called directly by tests.
 *
 * A wholesale replace, not a merge: main sends its complete answer every time,
 * so a session that no longer has a decision is expressed by its absence. A
 * merge would leave the last prompt sitting in the cache after the agent moved
 * on, and the tile would keep offering Approve for a question nobody asked.
 */
export function setDecisions(snapshot: DecisionSnapshot): void {
    decisions.clear()
    for (const [termId, d] of Object.entries(snapshot)) decisions.set(termId, d)
}

// Per-session OSC-scanning state. `open` is true while inside an OSC escape
// whose terminator (BEL or ST) has not arrived yet. `pendingEsc` is true when
// the chunk ended on a lone, unpaired ESC — pty chunks can split anywhere, so
// not only can the terminating BEL land in the *next* chunk, the two-byte
// opener (ESC ]) and the two-byte ST terminator (ESC \) can each split across
// the chunk boundary themselves, with the ESC in one chunk and its partner
// byte in the next.
interface OscState {
    open: boolean
    pendingEsc: boolean
}
const oscState = new Map<string, OscState>()

/**
 * Does this chunk contain a real BEL — as opposed to the BEL that terminates an
 * OSC escape (a terminal-title set, an OSC 8 hyperlink)? Stateful per session so
 * an OSC — or the two-byte opener/terminator that bounds it — split across
 * chunks is never mistaken for a bell, and a real bell is never swallowed.
 * Cleared by forgetTail.
 */
export function hasBell(id: string, chunk: string): boolean {
    const prev = oscState.get(id)
    let open = prev?.open ?? false
    let pendingEsc = prev?.pendingEsc ?? false
    let bell = false
    let i = 0

    // An empty chunk must be a complete no-op: with nothing to resolve
    // pendingEsc against, entering the resolution branch below would discard
    // it (there is no chunk[0] to pair it with), losing the carried ESC even
    // though no byte actually arrived. Guarding on length here means a
    // zero-length chunk — whether or not the pty ever actually emits one —
    // can never be the reason a pairing across chunks is missed.
    if (pendingEsc && chunk.length > 0) {
        pendingEsc = false
        const c = chunk[0]
        if (!open && c === "]") {
            open = true
            i = 1
        } else if (open && c === "\\") {
            open = false
            i = 1
        }
        // Otherwise the ESC carried from the last chunk did not pair with an
        // opener or a terminator — it was some other escape (or nothing).
        // `c` is deliberately NOT consumed here: it falls through to the loop
        // below and is evaluated on its own merits. That is the safer of the
        // two readings when we can't be sure what the lone ESC was for — at
        // worst a stray bracket shows up in the tail, whereas discarding `c`
        // could silently swallow a real bell in that position, which is the
        // one outcome this function exists to prevent.
    }

    for (; i < chunk.length; i++) {
        const c = chunk[i]
        const next = chunk[i + 1]
        if (open) {
            // OSC ends at BEL or ST (ESC \). Either way it is not a bell.
            if (c === "\x07") {
                open = false
            } else if (c === "\x1b") {
                if (next === "\\") {
                    open = false
                    i++
                } else if (next === undefined) {
                    // ESC is the last byte of this chunk — its terminator
                    // status is decided by the first byte of the next one.
                    pendingEsc = true
                }
            }
            continue
        }
        if (c === "\x1b") {
            if (next === "]") {
                open = true
                i++
            } else if (next === undefined) {
                pendingEsc = true
            }
            continue
        }
        if (c === "\x07") bell = true
    }
    // Mutate the existing per-session record in place rather than allocating
    // a fresh object on every chunk — this runs on every pty chunk of every
    // session, and a session's record already exists after its first chunk.
    if (prev) {
        prev.open = open
        prev.pendingEsc = pendingEsc
    } else {
        oscState.set(id, { open, pendingEsc })
    }
    return bell
}

/**
 * How long a session something is waiting on may be silent before it reads as
 * stalled.
 *
 * Two minutes, and it used to be written as BUCKET_MS * BUCKETS because the
 * output-rate trace shared the window. The trace was deleted on 2026-09-07 -
 * it measured output VOLUME and DESIGN.md had to carry five sentences of legend
 * explaining that an agent repainting in place with a bare CR reads as silent,
 * which is a channel that can state something untrue to a stranger in their
 * first five minutes. isStalled never read the ring; it reads wall-clock
 * silence. The number is unchanged.
 */
export const STALL_MS = 120_000
/**
 * Record a raw pty chunk for a terminal (cheap; no React state).
 *
 * `replay` splits the two things this does. The TAIL is a record of what the
 * agent said, and a replayed transcript is exactly that - after a renderer
 * reload it is the only copy left, so the peek keeps taking it (re-appending
 * bytes already in the tail is a no-op for the display: the last lines of
 * `transcript + transcript` are the last lines of the transcript).
 *
 * `lastAt` is not a record of bytes, it is an INSTANT - "when this terminal
 * last produced output" - and a replay carries none of its own. Main resends
 * whatever it kept, which may be an hour old, so stamping `now` for it said the
 * agent had just spoken. That postponed `isStalled` by however long the user
 * looked away, i.e. glancing at a tab cleared a STALLED chip: visibility
 * deciding what a session IS, which is the defect class the replay flag exists
 * to close one field over (see store.ts's onPtyData, tests/ptyReplay.test.ts).
 *
 * Nothing legitimately wants the stamp here. A re-attach does mean the pane was
 * just looked at, but that is the acknowledgement axis (`seen`), not the
 * silence clock - and `markLaunched` already covers the only case a replay
 * could plausibly be asked to seed, a session that has emitted nothing yet.
 * After a renderer reload `lastAt` is simply absent, and absent is the honest
 * answer: `isStalled` needs a real instant (`!!lastAt`) and `relTime` renders
 * "" rather than a made-up duration, so the app says nothing instead of
 * something untrue.
 *
 * Defaults to live, matching the payload's own `replay?: boolean`: a missing
 * flag reads as live, and the unit tests here stamp by calling with two args.
 */
export function recordTail(id: string, chunk: string, replay = false): void {
    // Keep a larger window than the one-line peek so tiles can expand to context.
    tails.set(id, cleanTail(tails.get(id) ?? "", chunk, 4000))
    if (!replay) lastAt.set(id, Date.now())
}

/** The current display peek (last non-empty line) for a terminal. */
export function getTail(id: string): string {
    return peekLine(tails.get(id) ?? "")
}

/** The last N non-empty lines for a terminal — the expanded tile view. */
export function getFullTail(id: string, n = 8): string {
    return lastLines(tails.get(id) ?? "", n)
}

/** When this terminal last produced output (ms epoch), or undefined. */
export function getLastAt(id: string): number | undefined {
    return lastAt.get(id)
}

/** Drop a terminal's tail when its session closes. */
export function forgetTail(id: string): void {
    tails.delete(id)
    lastAt.delete(id)
    oscState.delete(id)
    decisions.delete(id)
}

/** A short "time since" label: "" · "now" · "35s" · "2m" · "1h". */
export function relTime(now: number, then?: number): string {
    if (!then) return ""
    const d = now - then
    if (d < 5000) return "now"
    if (d < 60000) return `${Math.floor(d / 1000)}s`
    if (d < 3600000) return `${Math.floor(d / 60000)}m`
    return `${Math.floor(d / 3600000)}h`
}

/**
 * The sessions something is currently WAITING ON: a board card in `doing` that
 * names the session, or the pipeline step a live run is blocked on.
 *
 * This is what makes a stall a stall. Status cannot separate "stuck" from
 * "finished" — that is the spec's own point, and why isStalled ignores it — but
 * expectation can: if nothing is waiting on a session, its silence is the normal
 * resting state of an agent that finished and handed back to you, and saying
 * "stalled" about it is noise.
 *
 * Structurally typed rather than importing BoardTask / PipelineRun, so this
 * module still has no dependency on the store it would otherwise have to reach
 * into. Pure: callers pass the state in.
 */
export function awaitedTermIds(
    cards: readonly { column: string; termId?: string }[],
    run: { status: string; steps: readonly { status: string; termId?: string }[] } | null | undefined
): Set<string> {
    const ids = new Set<string>()
    // A card in review or done is not waiting on its agent — you are. Only
    // `doing` is an outstanding expectation, the same column the evidence read
    // gates the card move on.
    for (const c of cards) if (c.column === "doing" && c.termId) ids.add(c.termId)
    // "waiting" is the run's word for "the agent asked the user something" — the
    // step is still the reason that session is being watched. paused/done/
    // stopped/error are not blocked on any agent.
    if (run && (run.status === "running" || run.status === "waiting")) {
        for (const s of run.steps) if (s.status === "running" && s.termId) ids.add(s.termId)
    }
    return ids
}

/**
 * A live session something is waiting on that has produced no output for longer
 * than `thresholdMs` is stalled — stuck in a loop, waiting on something that
 * will not arrive, or dead without exiting.
 *
 * This deliberately does NOT read AgentStatus. `working` cannot survive
 * `agentIdleMs` (1s by default), so a status-based stall check could never fire;
 * quiet duration plus liveness can. `lastAt` is stamped at launch by
 * markLaunched, so a session that crashed before printing anything still counts.
 *
 * `awaited` is what keeps that from marking everything. `alive` is structurally
 * true for every session the Mission grid renders, so quiet-and-live alone flags
 * every agent that finished its turn and every pane opened and never typed into
 * — a marker that is always on, which carries exactly as much information as one
 * that never fires. See awaitedTermIds for what counts as waiting on a session.
 */
export function isStalled(
    lastAt: number | undefined,
    alive: boolean,
    awaited: boolean,
    now: number,
    thresholdMs = STALL_MS
): boolean {
    return alive && awaited && !!lastAt && now - lastAt > thresholdMs
}

/**
 * The earliest instant at which this silence WOULD read as a stall — the
 * inverse of the comparison above, solved for `now`.
 *
 * Why this exists: a stall is the one classification in the app that arrives
 * with no store write at all. Every other state change is something an agent or
 * the user did; this one is the wall clock crossing a line while nothing
 * happens. A surface therefore cannot notice it by subscribing — it has to be
 * told — and until 2026-09-12 only Mission was, by a `setInterval` of its own.
 * The deck bar's wants-you control and the taskbar badge that rides it were not,
 * so the badge was absent for exactly the state it exists for (2026-09-12
 * verification, §3).
 *
 * The fix is a single alarm in the store set for this instant, not a second
 * clock per surface. That is why this returns the INSTANT rather than a
 * boolean: an alarm can be armed from it, and an alarm cannot drift from a
 * predicate the way two intervals sampling one fact can.
 *
 * Deliberately reads ONE of `isStalled`'s four inputs. `alive` and `awaited`
 * are facts that change by a store write, so a surface already hears about
 * them; only `lastAt` moves silently. A caller arming an alarm off this is
 * therefore over-inclusive — it may wake for a session that turns out not to be
 * stalled — and that is the safe direction: waking early costs one comparison,
 * waking late is the defect. The ANSWER stays `isStalled`'s alone.
 *
 * `+ 1` because the comparison is strictly `>`: at `lastAt + thresholdMs` the
 * session is not yet stalled, and one millisecond later it is.
 * `tests/stallClock.test.ts` pins that identity against `isStalled` itself
 * rather than restating the arithmetic.
 */
export function stallsAt(lastAt: number | undefined, thresholdMs = STALL_MS): number | null {
    if (!lastAt) return null
    return lastAt + thresholdMs + 1
}

/**
 * Stamp a launch instant, so "has emitted nothing since it started" is a
 * measurable silence rather than an unknown. Never overwrites a real output
 * time — recordTail always wins.
 *
 * Invariant: every agent-launch path must call this beside its
 * `logUsageStart` call — that call is made on every path that spawns an agent
 * pty (currently `newTab`, `releaseHold`, `splitActive`, and
 * `openWorkspacePreset` in store.ts), so it is where the next new launch path
 * should add this too rather than assume `newTab` covers it.
 *
 * That invariant is no longer only a sentence: tests/signalSites.test.ts scans
 * store.ts and fails if any `logUsageStart(` is not preceded by a
 * `markLaunched(`. A launch path that forgets this one is a session whose
 * silence is unmeasurable, and the unit tests here call markLaunched directly,
 * so nothing else would notice.
 */
export function markLaunched(id: string, now = Date.now()): void {
    if (!lastAt.has(id)) lastAt.set(id, now)
}

const RANK: Record<DeckKeyStatus, number> = {
    attention: 0,
    waiting: 1,
    working: 2,
    idle: 3,
    // Last, and it is the reason this is keyed on the DERIVED status. A session
    // whose process is gone kept its last status - `attention` outlives the
    // agent that raised it - so a corpse took the first slot in Mission and in
    // Overview, above every agent still running. Attention-first is the right
    // order; the thing it sorted was the wrong fact.
    "not-running": 4
}

/**
 * Where a session sits in the follow order, as a number.
 *
 * Takes the DERIVED status (`useKeyStatus` / `deckKeyStatus`) as an argument
 * rather than reading `s.status`, for the reason spelled out in `promptFor`
 * below: `s.status` is what the agent last DID and it outlives the process
 * that did it. A caller therefore has to derive a status before it can rank
 * anything, and `hasProcess` stays derived in exactly one place.
 *
 * Exported for the one caller that has to rank a *group* of sessions rather
 * than sort a list of them (Overview's grid). It exists so that caller can read
 * this order instead of writing its own: a private rank in one surface is how
 * two surfaces come to show the same sessions in different orders.
 */
export const followRank = (status: DeckKeyStatus): number => RANK[status]

/**
 * Order sessions attention-first, then waiting-on-you, then working, then idle,
 * then the ones with nothing behind them. Stable within a rank.
 *
 * `keyStatus` is the shared resolver, passed in the same shape
 * `projectSessionCounts` (deck.ts) takes it - this module is pure and store-
 * free, and the derivation needs a `paneHold` subscription only a component has.
 */
export function sortForFollow(
    sessions: AnySession[],
    keyStatus: (s: AnySession) => DeckKeyStatus
): AnySession[] {
    return sessions
        .map((s, i) => [s, i] as const)
        .sort((a, b) => followRank(keyStatus(a[0])) - followRank(keyStatus(b[0])) || a[1] - b[1])
        .map(([s]) => s)
}

/**
 * The permission prompt this session is blocked on, or null.
 *
 * The gate, not the detector — and no longer the classifier either. Main owns
 * detection now (main/decisions.ts), reading its own copy of the same tail
 * through the same `shared/approval.ts`, so the phone card and this tile cannot
 * describe one prompt two ways. This surface keeps the *status* gate, because
 * that is its own rule about when it may ACT: answering sends a keystroke to a
 * live agent, and a match on a session that is merely mid-stream is a keystroke
 * nobody asked for. Main applies the identical gate before minting a decision
 * (`refreshDecision`); keeping it here too is deliberate belt-and-braces, and
 * it is what makes this function safe no matter how the cache was filled.
 *
 * `status` is the DERIVED status (`useKeyStatus` / `deckKeyStatus`), and it is a
 * required argument rather than `s.status` read from the session, because the
 * sentence above is the whole point: answering sends a keystroke to a LIVE
 * agent. `s.status` outlives the process, so Overview offered live Approve /
 * Deny buttons on a `not-running` session, and the tile's own precedence puts
 * `prompt` above its NOT-RUNNING rule - so a corpse holding a decision would
 * have read NEEDS YOU there too. Gating here fixes every consumer at once, and
 * a caller now has to derive a status before it can even ask the question.
 *
 * Reads the module cache, never IPC: callers run it once per tile per render.
 */
export function promptFor(s: AnySession, status: DeckKeyStatus): ApprovalPrompt | null {
    if (!s.isAgent || (status !== "attention" && status !== "waiting")) return null
    const d = decisions.get(s.termId)
    if (!d) return null
    // Main always mints exactly two options, Approve then Deny (refreshDecision).
    const [approve, deny] = d.options
    if (!approve || !deny) return null
    return { kind: d.kind, question: d.question, approve: approve.send, deny: deny.send }
}
