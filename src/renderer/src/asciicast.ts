/**
 * Convert a DevDeck terminal recording into the asciinema v2 "cast" format so a
 * captured session can be shared as a repro artifact: play it with
 * `asciinema play file.cast`, or `asciinema upload file.cast` for a link.
 *
 * Format (JSON-lines): a header object on line 1, then one `[time, "o", data]`
 * array per output event, where `time` is seconds since the start. Pure +
 * dependency-free so it is unit-testable and adds no runtime weight.
 */

export interface CastEvent {
    dt: number // ms since the previous event
    data: string
}
export interface CastRecording {
    label: string
    createdAt: number
    events: CastEvent[]
}
export interface CastOpts {
    width?: number
    height?: number
}

export function toAsciicast(rec: CastRecording, opts: CastOpts = {}): string {
    const header = {
        version: 2,
        width: opts.width ?? 80,
        height: opts.height ?? 24,
        timestamp: Math.floor((rec.createdAt || 0) / 1000),
        title: rec.label || "session",
        env: { TERM: "xterm-256color" }
    }
    const lines = [JSON.stringify(header)]
    let t = 0
    for (const e of rec.events ?? []) {
        t += Math.max(0, e.dt) / 1000
        lines.push(JSON.stringify([Number(t.toFixed(3)), "o", e.data]))
    }
    return lines.join("\n") + "\n"
}
