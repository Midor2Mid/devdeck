import type { AnySession } from "./store"

export interface DeckStrip {
    projectId: string
    projectName: string
    /** Agent sessions in this project (plain shells are excluded upstream). */
    keys: AnySession[]
    /** True when keys should render compressed (dot + badge, name hidden). */
    compressed: boolean
}

/** Max agent keys shown expanded per project before compression kicks in. */
export const COMPRESS_THRESHOLD = 4

/**
 * Group agent sessions into per-project deck strips, in first-seen project
 * order. A project with no agent sessions produces no strip — it is "cold" and
 * reachable from the switcher, not the deck. When `active` is supplied and has
 * no strip, an empty strip is prepended so the user can start its first session.
 */
export function deriveDeckStrips(
    sessions: AnySession[],
    active?: { id: string; name: string }
): DeckStrip[] {
    const order: string[] = []
    const byId = new Map<string, DeckStrip>()
    for (const s of sessions) {
        let strip = byId.get(s.projectId)
        if (!strip) {
            strip = { projectId: s.projectId, projectName: s.projectName, keys: [], compressed: false }
            byId.set(s.projectId, strip)
            order.push(s.projectId)
        }
        strip.keys.push(s)
    }
    const strips = order.map((id) => {
        const strip = byId.get(id)!
        return { ...strip, compressed: strip.keys.length > COMPRESS_THRESHOLD }
    })
    if (active && !byId.has(active.id)) {
        strips.unshift({ projectId: active.id, projectName: active.name, keys: [], compressed: false })
    }
    return strips
}

/**
 * The termId to jump to when cycling agent sessions (Ctrl+Tab). Cycles across
 * all sessions in order; wraps; returns the first when `current` is unknown and
 * null when there are fewer than two sessions.
 */
export function nextSession(
    sessions: AnySession[],
    currentTermId: string | null,
    dir: 1 | -1
): string | null {
    if (sessions.length < 2) return null
    const idx = sessions.findIndex((s) => s.termId === currentTermId)
    if (idx < 0) return sessions[0].termId
    return sessions[(idx + dir + sessions.length) % sessions.length].termId
}
