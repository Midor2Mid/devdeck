/**
 * Pure timing helpers for terminal replay. Kept free of React/xterm so the
 * playback math can be unit-tested in isolation.
 */

/** Longest gap we ever wait between frames, in ms (long pauses are collapsed). */
export const MAX_FRAME_GAP = 5000

/**
 * Delay before writing frame `index`, given its stored inter-event gap `dt`
 * and the current playback `speed` multiplier. The first frame plays
 * immediately; later gaps are clamped to [0, MAX_FRAME_GAP] then divided by
 * speed.
 */
export function frameDelay(index: number, dt: number, speed: number): number {
    if (index <= 0) return 0
    const clamped = Math.min(Math.max(dt, 0), MAX_FRAME_GAP)
    const s = speed > 0 ? speed : 1
    return clamped / s
}

/** Total wall-clock duration of a recording at 1× (sum of clamped gaps). */
export function totalDuration(events: { dt: number }[]): number {
    return events.reduce(
        (sum, e, i) => (i === 0 ? 0 : sum + Math.min(Math.max(e.dt, 0), MAX_FRAME_GAP)),
        0
    )
}
