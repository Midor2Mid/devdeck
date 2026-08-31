export const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
export const CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
export const OTHER = /\x1b[=>()][0-9A-Za-z]?/g
// Control chars to drop — but keep \t (09) and \n (0a); \r is handled first.
export const CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g

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
