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
 * corrupted data. `ttlDays` gets the same treatment for the same reason: the
 * old `!ttlDays` check treated a malformed/missing value (`undefined`, `NaN`)
 * exactly like the deliberate policy value `0` ("never expire") - both are
 * falsy - so a bad settings payload silently granted the *most* permissive
 * outcome instead of the least. Only a literal `0` means never now; anything
 * else that isn't a finite, non-negative number fails closed (expires).
 */
export function isExpired(lastSeenAt: number, ttlDays: number, now: number): boolean {
    if (!Number.isFinite(lastSeenAt)) return true
    if (!Number.isFinite(ttlDays) || ttlDays < 0) return true
    if (ttlDays === 0) return false
    return now - lastSeenAt > ttlDays * 86_400_000
}

/** Name of the cookie carrying a device's own token. Never the pairing token. */
export const DEVICE_COOKIE = "devdeck_device"

/**
 * The actual cookie name, `__Host-`-prefixed under TLS. That prefix is a
 * browser-enforced promise - "this cookie was set with `Secure`, no `Domain`,
 * and `Path=/`" - which closes part of the cross-port leak plain cookies have
 * on `localhost`/a LAN IP: cookies are scoped by host, not host+port, so
 * `devdeck_device` set by this server on port 7420 is also sent to (and
 * overwritable by) any other local server on 3000/8080/5173/etc. `__Host-`
 * can't fix that by itself (the browser still sends it to same-host,
 * different-port servers - the prefix isn't port-aware either), but it does
 * guarantee no *other* origin/scheme quietly relaxed `Secure`/`Path` on a
 * cookie of this exact name, so it's worth carrying whenever TLS is on to
 * make that guarantee. Plain HTTP can't use it at all - `__Host-` requires
 * `Secure`, which requires TLS - so the un-prefixed name stays in play there.
 */
function deviceCookieName(tls: boolean): string {
    return tls ? `__Host-${DEVICE_COOKIE}` : DEVICE_COOKIE
}

/**
 * Pull the device-token cookie out of a raw `Cookie` header. A minimal parser
 * on purpose - DevDeck only ever sets the one cookie below, so there is no
 * need for a general RFC 6265 implementation here. A malformed percent-escape
 * on one matching-named entry does not abort the whole search: `continue`s to
 * a later entry rather than returning "" outright, so a duplicate cookie name
 * (browsers allow it; a stale one from an old Path/Domain can linger) still
 * gets a chance to match.
 *
 * Checks BOTH the plain and `__Host-`-prefixed names, preferring the
 * `__Host-` one when both are present, rather than only the single name
 * `tls` would otherwise dictate. Ticking the HTTPS setting changes which name
 * `deviceCookie` WRITES from that point on, but does nothing to a cookie the
 * browser is already holding under the other name - a device that paired
 * over plain HTTP keeps sending `devdeck_device`, never
 * `__Host-devdeck_device`, no matter what the server is now configured to
 * look for. Reading only the tls-dictated name locked every paired device
 * out the instant the HTTPS checkbox was toggled either way, and re-scanning
 * the QR "fixed" it by enrolling a *duplicate* device record rather than
 * recognising the one that already existed. `tls` still matters to
 * *writing* (`deviceCookie`/`clearDeviceCookie` below) - only reading needs
 * to tolerate whichever name the browser actually presents.
 */
export function cookieToken(header: string | undefined, tls = false): string {
    if (!header) return ""
    const hostPrefixed = `__Host-${DEVICE_COOKIE}`
    let plainValue = ""
    let hostValue = ""
    for (const part of header.split(";")) {
        const eq = part.indexOf("=")
        if (eq < 0) continue
        const name = part.slice(0, eq).trim()
        if (name !== DEVICE_COOKIE && name !== hostPrefixed) continue
        try {
            const value = decodeURIComponent(part.slice(eq + 1).trim())
            if (name === hostPrefixed) {
                if (!hostValue) hostValue = value
            } else if (!plainValue) {
                plainValue = value
            }
        } catch {
            continue
        }
    }
    return hostValue || plainValue
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
        `${deviceCookieName(tls)}=${encodeURIComponent(token)}`,
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
    const attrs = [`${deviceCookieName(tls)}=`, "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0"]
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
