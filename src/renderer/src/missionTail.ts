// Capture a readable "last output" peek from a terminal's raw pty stream, for the
// Mission Control agent tiles. We do NOT parse agent output — we just strip the
// terminal control noise and keep the tail so you can glance at what each agent
// last said. Tails live in a module Map (not the store) so the fast pty stream
// never churns React state; consumers poll on an interval.

const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
const CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const OTHER = /\x1b[=>()][0-9A-Za-z]?/g
// Control chars to drop — but keep \t (09) and \n (0a); \r is handled first.
const CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g

/** Append a chunk to the prior tail, strip terminal control noise, cap length. */
export function cleanTail(prev: string, chunk: string, max = 200): string {
    let s = prev + chunk
    s = s.replace(OSC, "").replace(CSI, "").replace(OTHER, "")
    s = s.replace(/\r/g, "\n").replace(CTRL, "")
    if (s.length > max) s = s.slice(s.length - max)
    return s
}

/** The last non-empty, trimmed line of a cleaned tail — the display peek. */
export function peekLine(tail: string): string {
    const lines = tail.split("\n")
    for (let i = lines.length - 1; i >= 0; i--) {
        const t = lines[i].trim()
        if (t) return t
    }
    return ""
}

/** The last N non-empty, trimmed lines of a cleaned tail — for the expanded view. */
export function lastLines(tail: string, n: number): string {
    return tail
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-n)
        .join("\n")
}

/** Cap on a carried segment, so a stream with no newline can't grow it unbounded. */
export const CARRY_MAX = 4000

/**
 * Committed printable characters in a raw pty chunk — the trace's unit of work.
 *
 * Deliberately NOT cleanTail: that rewrites \r to \n, which is right for a
 * readable peek and wrong here, because every spinner frame would then look like
 * a completed line and a wedged agent would draw a healthy trace. Here only a
 * BARE \r discards the pending segment, the way a carriage return overwrites a
 * terminal line — \r\n is an ordinary terminator, which matters because ConPTY
 * emits it by default and treating it as a redraw would score real output as
 * silence.
 *
 * `carry` is the caller's unfinished segment from last time and comes back out
 * on every call: agents stream token by token, so a line routinely spans many
 * chunks and a stateless count would drop nearly all of it.
 */
export function printableDelta(chunk: string, carry = ""): { chars: number; carry: string } {
    const s = carry + chunk.replace(OSC, "").replace(CSI, "").replace(OTHER, "").replace(CTRL, "")
    // A chunk may end mid-CRLF; hold the \r back so the next chunk can complete it.
    const heldCr = s.endsWith("\r")
    const body = heldCr ? s.slice(0, -1) : s
    let committed = ""
    let pending = ""
    for (let i = 0; i < body.length; i++) {
        const ch = body[i]
        if (ch === "\n") {
            committed += pending
            pending = ""
        } else if (ch === "\r") {
            if (body[i + 1] === "\n") {
                committed += pending
                pending = ""
                i++
            } else {
                pending = ""
            }
        } else {
            pending += ch
        }
    }
    if (pending.length > CARRY_MAX) pending = pending.slice(-CARRY_MAX)
    return { chars: committed.replace(/\s/g, "").length, carry: pending + (heldCr ? "\r" : "") }
}

import type { AgentStatus, AnySession } from "./store"

const tails = new Map<string, string>()
const lastAt = new Map<string, number>()

const BUCKET_MS = 2000
const BUCKETS = 60
/**
 * The trace window and the stall threshold are the same number by construction.
 * The design claims a flat trace on a working session IS a stall; deriving one
 * from the other is what stops that claim quietly becoming false in a later edit.
 */
export const STALL_MS = BUCKET_MS * BUCKETS
/** Characters in one bucket that count as a full-height bar. */
const CEILING = 4096

interface Ring {
    /** Oldest first, newest last; always BUCKETS long. */
    buckets: number[]
    /** Start time of the newest bucket. */
    at: number
    /** printableDelta's unfinished segment, carried between chunks. */
    carry: string
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
 * Add a pty chunk's committed output to a session's current bucket. Called from
 * the same place as recordTail; a chunk that scores zero still keeps the ring
 * current, so a spinning agent flatlines rather than showing no trace at all.
 */
export function recordRate(id: string, chunk: string, now = Date.now()): void {
    let r = rings.get(id)
    if (!r) {
        r = { buckets: new Array<number>(BUCKETS).fill(0), at: now, carry: "" }
        rings.set(id, r)
    }
    roll(r, now)
    // The carry is per session: a line split across chunks is counted once, when
    // it completes, rather than lost.
    const out = printableDelta(chunk, r.carry)
    r.carry = out.carry
    r.buckets[BUCKETS - 1] += out.chars
}

/** A session's trace, oldest first, each sample 0..1. Always BUCKETS long. */
export function getTrace(id: string, now = Date.now()): number[] {
    const r = rings.get(id)
    if (!r) return new Array<number>(BUCKETS).fill(0)
    roll(r, now)
    return r.buckets.map(scale)
}

/**
 * Every bucket empty. Read together with the session's status: flat + working is
 * a stall, flat + idle is just a finished agent being quiet. Exported because the
 * test suite asserts it agrees with isStalled — that agreement is the design.
 */
export function isFlat(trace: number[]): boolean {
    return trace.every((v) => v === 0)
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
 * A "working" agent that hasn't produced output for longer than `thresholdMs`
 * is likely stalled or stuck in a loop — worth surfacing so you can check on it.
 */
export function isStalled(
    status: AgentStatus,
    lastAt: number | undefined,
    now: number,
    thresholdMs = STALL_MS
): boolean {
    return status === "working" && !!lastAt && now - lastAt > thresholdMs
}

const RANK: Record<AgentStatus, number> = { attention: 0, waiting: 1, working: 2, idle: 3 }

/** Order sessions attention-first, then waiting-on-you, then working, then idle. */
export function sortForFollow(sessions: AnySession[]): AnySession[] {
    return sessions
        .map((s, i) => [s, i] as const)
        .sort((a, b) => RANK[a[0].status] - RANK[b[0].status] || a[1] - b[1])
        .map(([s]) => s)
}
