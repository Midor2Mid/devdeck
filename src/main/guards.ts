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
 *
 * `mode` is typed as `BindMode`, but callers upstream of the type checker
 * (an untyped IPC payload, a stale/undefined config field) can hand this an
 * arbitrary value at runtime. An unrecognised mode refuses rather than
 * falling through to the widest bind ("0.0.0.0") - the whole point of this
 * function is that the widest exposure is never the answer to an input the
 * code doesn't understand.
 */
export function chooseBind(
    mode: BindMode,
    addrs: { tailscale: string[]; lan: string[] }
): BindChoice {
    if (mode !== "tailscale" && mode !== "lan" && mode !== "auto") {
        return { ok: false, reason: `Unrecognised bind mode: ${String(mode)}.` }
    }
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
 *
 * NaN timestamps fail closed (expire immediately), even when ttlDays is 0,
 * because "never expire" is a policy about idle time, not a license to accept
 * corrupted data.
 */
export function isExpired(lastSeenAt: number, ttlDays: number, now: number): boolean {
    if (!Number.isFinite(lastSeenAt)) return true
    if (!ttlDays) return false
    return now - lastSeenAt > ttlDays * 86_400_000
}

/** Name of the cookie carrying a device's own token. Never the pairing token. */
export const DEVICE_COOKIE = "devdeck_device"

/**
 * Pull the device-token cookie out of a raw `Cookie` header. A minimal parser
 * on purpose - DevDeck only ever sets the one cookie below, so there is no
 * need for a general RFC 6265 implementation here. A malformed percent-escape
 * on one matching-named entry does not abort the whole search: `continue`s to
 * a later entry rather than returning "" outright, so a duplicate cookie name
 * (browsers allow it; a stale one from an old Path/Domain can linger) still
 * gets a chance to match.
 */
export function cookieToken(header: string | undefined): string {
    if (!header) return ""
    for (const part of header.split(";")) {
        const eq = part.indexOf("=")
        if (eq < 0) continue
        if (part.slice(0, eq).trim() !== DEVICE_COOKIE) continue
        try {
            return decodeURIComponent(part.slice(eq + 1).trim())
        } catch {
            continue
        }
    }
    return ""
}

/**
 * The `Set-Cookie` value for a device's token, issued on enrolment and
 * re-issued on every later authenticated response. `HttpOnly` keeps the token
 * out of reach of any script running on the page (unlike the `localStorage`
 * design this replaces); `SameSite=Strict` keeps it off any cross-site
 * request; `Secure` is added under TLS.
 *
 * Browsers cap `Max-Age` around 400 days regardless of what's asked for, so
 * `deviceTtlDays: 0` ("never" idle-expire) asks for that ceiling rather than
 * an unbounded value nothing would honour. The real access control stays
 * server-side - `authenticate()`'s idle check runs on every request, sliding
 * forward on each use - which is exactly why the caller must re-issue this
 * cookie on every authenticated response, not only a fresh enrolment: set
 * once, the cookie's own fixed Max-Age would otherwise expire a
 * daily-used device on a schedule the server-side check never agreed to.
 */
export function deviceCookie(token: string, tls: boolean, deviceTtlDays: number): string {
    const days = deviceTtlDays > 0 ? Math.min(deviceTtlDays, 400) : 400
    const attrs = [
        `${DEVICE_COOKIE}=${encodeURIComponent(token)}`,
        "HttpOnly",
        "SameSite=Strict",
        "Path=/",
        `Max-Age=${days * 86_400}`
    ]
    if (tls) attrs.push("Secure")
    return attrs.join("; ")
}

/**
 * Clears a device cookie that just failed to authenticate. Without this, a
 * dropped/expired/revoked device's browser keeps re-presenting the same dead
 * cookie on every load - and since the cookie wins over `?token=` when it
 * successfully authenticates, but a *stale* cookie previously short-circuited
 * the fallback to a fresh pairing token too, a user who re-scans the QR code
 * would still 401 forever with no way to clear it themselves short of
 * clearing site data. Sent on a 401/reject so the next load starts clean.
 */
export function clearDeviceCookie(tls: boolean): string {
    const attrs = [`${DEVICE_COOKIE}=`, "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0"]
    if (tls) attrs.push("Secure")
    return attrs.join("; ")
}

/**
 * Defense in depth for the WebSocket upgrade now that auth can ride along as
 * an ambient cookie instead of only an unguessable URL token: `SameSite=Strict`
 * already keeps the cookie off a cross-site request in current browsers, but
 * enforcement of `SameSite` for non-HTTP(S) schemes (`ws:`/`wss:`) has not
 * always been consistent across engines, so this checks it again explicitly.
 *
 * A missing `Origin` is not rejected: a real browser always sends `Origin` on
 * a WebSocket handshake, so its absence means a non-browser client (a direct
 * `?token=` connection, a test) - not a cross-site page, which is the only
 * thing this guards against.
 */
export function originOk(origin: string | undefined, host: string | undefined): boolean {
    if (!origin) return true
    try {
        return new URL(origin).host === (host ?? "")
    } catch {
        return false
    }
}
