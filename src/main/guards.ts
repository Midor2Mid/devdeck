// Pure security guards for the remote server (no Electron/native deps, so unit-testable).

import { timingSafeEqual, createHash } from "crypto"

/**
 * Constant-time token check for the remote server. Both sides are hashed to
 * fixed-length digests first, so the comparison can't leak the token's length
 * or contents via timing; a missing/empty token never matches.
 */
export function tokenOk(provided: string | null | undefined, expected: string): boolean {
    if (!provided || !expected) return false
    const a = createHash("sha256").update(provided).digest()
    const b = createHash("sha256").update(expected).digest()
    return timingSafeEqual(a, b)
}

/**
 * Block remote-initiated requests to local/private/link-local hosts (SSRF guard).
 * The desktop API panel is unaffected - this only gates the phone's relayed requests.
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

/** Remote DB access is read-only - only data-returning statements are allowed. */
export function isReadOnlySql(sql: string): boolean {
    return /^\s*(select|with|explain|pragma|show|desc|describe)\b/i.test(sql)
}

export type BindMode = "tailscale" | "lan" | "auto"
export type BindChoice = { ok: true; host: string } | { ok: false; reason: string }

/**
 * Which interface the remote server binds. This used to be
 * `tailscale[0] ?? "0.0.0.0"`, which meant asking for a private bind and getting
 * a network-wide one whenever the tailnet was down — the request silently
 * inverted, with full terminal access on the other side of it. Asking for
 * tailscale and not getting it is now a refusal to start.
 */
export function chooseBind(
    mode: BindMode,
    addrs: { tailscale: string[]; lan: string[] }
): BindChoice {
    const tail = addrs.tailscale[0]
    if (mode === "tailscale") {
        return tail
            ? { ok: true, host: tail }
            : { ok: false, reason: "No tailnet address found. Start Tailscale, or choose Local network." }
    }
    if (mode === "auto" && tail) return { ok: true, host: tail }
    if (addrs.lan.length === 0 && !tail) {
        return { ok: false, reason: "No network interface found to bind." }
    }
    return { ok: true, host: "0.0.0.0" }
}

/**
 * Has a paired device been idle longer than the policy allows? `ttlDays: 0`
 * means never. A `lastSeenAt` in the future is treated as current rather than
 * expired: clock skew or a restored backup should not lock someone out of their
 * own machine.
 */
export function isExpired(lastSeenAt: number, ttlDays: number, now: number): boolean {
    if (!ttlDays) return false
    return now - lastSeenAt > ttlDays * 86_400_000
}
