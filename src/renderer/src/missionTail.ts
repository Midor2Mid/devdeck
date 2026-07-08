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

import type { AgentStatus, AnySession } from "./store"

const tails = new Map<string, string>()
const lastAt = new Map<string, number>()

/** Record a raw pty chunk for a terminal (cheap; no React state). */
export function recordTail(id: string, chunk: string): void {
    tails.set(id, cleanTail(tails.get(id) ?? "", chunk))
    lastAt.set(id, Date.now())
}

/** The current display peek (last non-empty line) for a terminal. */
export function getTail(id: string): string {
    return peekLine(tails.get(id) ?? "")
}

/** When this terminal last produced output (ms epoch), or undefined. */
export function getLastAt(id: string): number | undefined {
    return lastAt.get(id)
}

/** Drop a terminal's tail when its session closes. */
export function forgetTail(id: string): void {
    tails.delete(id)
    lastAt.delete(id)
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

const RANK: Record<AgentStatus, number> = { attention: 0, working: 1, idle: 2 }

/** Order sessions attention-first (then working, then idle), stable within a status. */
export function sortForFollow(sessions: AnySession[]): AnySession[] {
    return sessions
        .map((s, i) => [s, i] as const)
        .sort((a, b) => RANK[a[0].status] - RANK[b[0].status] || a[1] - b[1])
        .map(([s]) => s)
}
