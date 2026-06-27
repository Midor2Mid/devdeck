// Pure security guards for the remote server (no Electron/native deps, so unit-testable).

/**
 * Block remote-initiated requests to local/private/link-local hosts (SSRF guard).
 * The desktop API panel is unaffected — this only gates the phone's relayed requests.
 */
export function isBlockedRemoteUrl(raw: string): boolean {
    try {
        const u = new URL(raw)
        if (u.protocol !== "http:" && u.protocol !== "https:") return true
        const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "")
        if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true
        if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true
        const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
        if (m) {
            const a = Number(m[1])
            const b = Number(m[2])
            if (a === 127 || a === 0 || a === 10) return true
            if (a === 169 && b === 254) return true // link-local + cloud metadata
            if (a === 192 && b === 168) return true
            if (a === 172 && b >= 16 && b <= 31) return true
        }
        return false
    } catch {
        return true
    }
}

/** Remote DB access is read-only — only data-returning statements are allowed. */
export function isReadOnlySql(sql: string): boolean {
    return /^\s*(select|with|explain|pragma|show|desc|describe)\b/i.test(sql)
}
