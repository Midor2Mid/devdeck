// Pure helpers for two-way sync between the URL bar and the query-params table.

export interface KvPair {
    key: string
    value: string
}

function safeDecode(s: string): string {
    try {
        return decodeURIComponent(s.replace(/\+/g, " "))
    } catch {
        return s
    }
}

/** Split a URL into the part before "?" and the raw query string (without "?"). */
export function splitUrl(url: string): { base: string; query: string } {
    const q = url.indexOf("?")
    if (q === -1) return { base: url, query: "" }
    return { base: url.slice(0, q), query: url.slice(q + 1) }
}

/** Parse the query string of a URL into decoded key/value pairs. */
export function parseQueryPairs(url: string): KvPair[] {
    const { query } = splitUrl(url)
    if (!query) return []
    return query
        .split("&")
        .filter(Boolean)
        .map((seg) => {
            const eq = seg.indexOf("=")
            if (eq === -1) return { key: safeDecode(seg), value: "" }
            return { key: safeDecode(seg.slice(0, eq)), value: safeDecode(seg.slice(eq + 1)) }
        })
}

/**
 * Rebuild a URL from a base and a set of param rows. Only enabled rows with a
 * non-empty key are included; keys and values are URL-encoded.
 */
export function buildUrl(
    base: string,
    rows: Array<{ enabled: boolean; key: string; value: string }>
): string {
    const active = rows.filter((r) => r.enabled && r.key.trim() !== "")
    if (active.length === 0) return base
    const qs = active
        .map((r) => `${encodeURIComponent(r.key)}=${encodeURIComponent(r.value)}`)
        .join("&")
    return `${base}?${qs}`
}
