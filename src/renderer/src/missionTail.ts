// Capture a readable "last output" peek from a terminal's raw pty stream, for the
// Mission Control agent tiles. We do NOT parse agent output — we just strip the
// terminal control noise and keep the tail so you can glance at what each agent
// last said. Tails live in a module Map (not the store) so the fast pty stream
// never churns React state; consumers poll on an interval.

import { cleanTail, lastLines, peekLine, CARRY_MAX, OSC, CSI, OTHER, CTRL } from "../../shared/tail"
export { cleanTail, lastLines, peekLine, CARRY_MAX }

/** printableDelta's state, threaded by the caller between chunks of one stream. */
export interface DeltaState {
    /** Unfinished segment from the last chunk — a line routinely spans many chunks. */
    carry: string
}

const EMPTY_STATE: DeltaState = { carry: "" }

/**
 * Printable characters committed in a raw pty chunk — the trace's unit of
 * activity. Every completed line counts at its non-whitespace length, full
 * stop: this is a measure of output volume, not of whether the line is new.
 * A TUI that repaints a spinner or a ticking counter with `\r\n`-terminated
 * frames scores the same as one writing genuinely new lines (a bare-`\r`
 * repaint is the one case this module can tell apart — see below) —
 * distinguishing the general case needs the rendered terminal buffer, not the
 * pty byte stream (three attempts at deriving it from the stream all failed
 * review; see NOTES.md).
 *
 * Deliberately NOT cleanTail: that rewrites \r to \n, which is right for a
 * readable peek and wrong here, because it would make a bare-\r overwrite look
 * like a completed line. A bare \r overwrites the pending segment in place, the
 * way a terminal cursor return does, so the overwritten text does not survive
 * on screen — not counting it is correct terminal semantics, not a claim about
 * spinners. \r\n and \n commit the pending segment as a line.
 *
 * `state` is the caller's carry from the previous call and comes back out on
 * every call: agents stream token by token, so a line routinely spans many
 * chunks and a stateless count would drop nearly all of it.
 */
export function printableDelta(
    chunk: string,
    state: DeltaState = EMPTY_STATE
): { chars: number; state: DeltaState } {
    const s = state.carry + chunk.replace(OSC, "").replace(CSI, "").replace(OTHER, "").replace(CTRL, "")
    // A chunk may end mid-CRLF; hold the \r back so the next chunk can complete it.
    const heldCr = s.endsWith("\r")
    const body = heldCr ? s.slice(0, -1) : s
    let chars = 0
    let pending = ""
    const commit = (line: string): void => {
        chars += line.replace(/\s/g, "").length
    }
    for (let i = 0; i < body.length; i++) {
        const ch = body[i]
        if (ch === "\n") {
            commit(pending)
            pending = ""
        } else if (ch === "\r") {
            if (body[i + 1] === "\n") {
                commit(pending)
                pending = ""
                i++
            } else {
                // A bare \r overwrites the pending segment in place — it does
                // not survive on screen, so it is discarded here too.
                pending = ""
            }
        } else {
            pending += ch
        }
    }
    if (pending.length > CARRY_MAX) pending = pending.slice(-CARRY_MAX)
    return { chars, state: { carry: pending + (heldCr ? "\r" : "") } }
}

import type { AgentStatus, AnySession } from "./store"
import { detectApproval, type ApprovalPrompt } from "./approval"

const tails = new Map<string, string>()
const lastAt = new Map<string, number>()

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

const BUCKET_MS = 2000
const BUCKETS = 60
/**
 * The trace window's width in ms, and isStalled's default silence threshold —
 * historically the same number, but the two no longer read each other:
 * isStalled looks at wall-clock silence on a session something is waiting on,
 * the trace only at recent output volume.
 */
export const STALL_MS = BUCKET_MS * BUCKETS
/** Characters in one bucket that count as a full-height bar. */
const CEILING = 4096

interface Ring {
    /** Oldest first, newest last; always BUCKETS long. */
    buckets: number[]
    /** Start time of the newest bucket. */
    at: number
    /** printableDelta's carry, threaded between chunks of this session. */
    state: DeltaState
}
const rings = new Map<string, Ring>()

/** Advance a ring to `now`, zero-filling the buckets that elapsed. */
function roll(r: Ring, now: number): void {
    const steps = Math.floor((now - r.at) / BUCKET_MS)
    if (steps <= 0) return
    r.at += steps * BUCKET_MS
    if (steps >= BUCKETS) {
        r.buckets.fill(0)
        return
    }
    for (let i = 0; i < steps; i++) {
        r.buckets.shift()
        r.buckets.push(0)
    }
}

/** Log scale against a fixed ceiling, so quiet and loud agents both stay legible. */
function scale(chars: number): number {
    if (chars <= 0) return 0
    return Math.min(1, Math.log(1 + chars) / Math.log(1 + CEILING))
}

/**
 * Add a pty chunk's output volume to a session's current bucket. Called from
 * the same place as recordTail, on every pty data event — a chunk that scores
 * zero still keeps the ring current, so the trace reflects recent silence
 * accurately rather than going stale. Never throws: this runs in the hot path
 * of every agent's raw output, so a bad chunk must not take the pty listener
 * down with it.
 */
export function recordRate(id: string, chunk: string, now = Date.now()): void {
    try {
        let r = rings.get(id)
        if (!r) {
            r = { buckets: new Array<number>(BUCKETS).fill(0), at: now, state: EMPTY_STATE }
            rings.set(id, r)
        }
        roll(r, now)
        // The state is per session: a line split across chunks is counted once,
        // when it completes.
        const out = printableDelta(chunk, r.state)
        r.state = out.state
        r.buckets[BUCKETS - 1] += out.chars
    } catch {
        // Losing one chunk's contribution to the trace is harmless; losing the
        // pty listener is not.
    }
}

/** A session's trace, oldest first, each sample 0..1. Always BUCKETS long. */
export function getTrace(id: string, now = Date.now()): number[] {
    const r = rings.get(id)
    if (!r) return new Array<number>(BUCKETS).fill(0)
    roll(r, now)
    return r.buckets.map(scale)
}

/**
 * An SVG path of one bar per sample, for a `0 0 <len> <height>` viewBox drawn
 * with preserveAspectRatio="none". Bars are 0.7 units wide on a 1-unit pitch, so
 * the gap is part of the path rather than a separate element. Empty samples get a
 * 1-unit stub, which is the baseline that makes silence read as a flat line.
 */
export function barsPath(trace: number[], height = 12): string {
    return trace
        .map((v, i) => {
            const h = Math.max(1, v * height)
            const top = height - h
            return `M${i} ${height} L${i} ${top} L${i + 0.7} ${top} L${i + 0.7} ${height} Z`
        })
        .join(" ")
}

/** Record a raw pty chunk for a terminal (cheap; no React state). */
export function recordTail(id: string, chunk: string): void {
    // Keep a larger window than the one-line peek so tiles can expand to context.
    tails.set(id, cleanTail(tails.get(id) ?? "", chunk, 4000))
    lastAt.set(id, Date.now())
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

/** Drop a terminal's tail and trace when its session closes. */
export function forgetTail(id: string): void {
    tails.delete(id)
    lastAt.delete(id)
    rings.delete(id)
    oscState.delete(id)
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

const RANK: Record<AgentStatus, number> = { attention: 0, waiting: 1, working: 2, idle: 3 }

/** Order sessions attention-first, then waiting-on-you, then working, then idle. */
export function sortForFollow(sessions: AnySession[]): AnySession[] {
    return sessions
        .map((s, i) => [s, i] as const)
        .sort((a, b) => RANK[a[0].status] - RANK[b[0].status] || a[1] - b[1])
        .map(([s]) => s)
}

/**
 * The permission prompt this session is blocked on, or null.
 *
 * The gate, not the detector. `approval.ts` is deliberately conservative but
 * still asks its callers to run it only for sessions already flagged
 * attention/waiting, because a surface that ACTS on a match sends a keystroke
 * to a live agent. Mission and Overview are both such surfaces, so the rule
 * lives here once instead of being copied into each of them.
 *
 * 16 lines is the same window Overview has always read.
 */
export function promptFor(s: AnySession): ApprovalPrompt | null {
    if (!s.isAgent || (s.status !== "attention" && s.status !== "waiting")) return null
    return detectApproval(getFullTail(s.termId, 16))
}
