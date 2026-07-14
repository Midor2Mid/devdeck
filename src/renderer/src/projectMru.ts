// Most-recently-used project ordering. Pure — unit-tested in isolation.

/** Move `id` to the front of the MRU list (no duplicates). */
export function recordMru(mru: string[], id: string): string[] {
    return [id, ...mru.filter((x) => x !== id)]
}

/** Sort `ids` by MRU rank; ids not in the MRU go last, keeping their input order. */
export function orderByMru(ids: string[], mru: string[]): string[] {
    const rank = new Map(mru.map((id, i) => [id, i] as const))
    return [...ids].sort(
        (a, b) =>
            (rank.has(a) ? (rank.get(a) as number) : Infinity) -
            (rank.has(b) ? (rank.get(b) as number) : Infinity)
    )
}

/** The most recently used project that isn't `currentId`, or null. */
export function previousProjectId(mru: string[], currentId: string | null): string | null {
    const rest = mru.filter((x) => x !== currentId)
    return rest[0] ?? null
}
