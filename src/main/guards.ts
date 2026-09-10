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
 * Is this *numeric address* one the phone must never be able to reach?
 *
 * Separate from `isBlockedRemoteUrl` because the two answer different
 * questions. This one takes an address that a resolver actually produced, so
 * it is the check that survives `http://127.1/`, `http://2130706433/`, and a
 * public hostname whose A record points at 10.0.0.5 - none of which look
 * local as text. Anything that is not a recognisable literal address fails
 * closed: this function is only ever handed resolver output, so a value it
 * cannot parse means something upstream is not what we think it is.
 *
 * Deliberately NOT blocked: 100.64.0.0/10 (CGNAT). That is where Tailscale
 * addresses live, and DevDeck itself offers a tailnet bind - blocking it here
 * would refuse the user's own machines while adding nothing, since a tailnet
 * peer is not a loopback the phone was never meant to see.
 */
export function isBlockedAddress(ip: string): boolean {
    const h = ip.trim().toLowerCase().replace(/^\[|\]$/g, "")
    if (!h) return true

    const quad = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (quad) return blockedV4(quad.slice(1).map(Number))

    if (h.includes(":")) {
        const groups = parseIpv6(h)
        if (!groups) return true // an address we cannot read is not an address we allow
        // Any IPv4 address this literal CARRIES is judged as that address.
        // `::ffff:/96` used to be the only embedding enumerated here, and the
        // bare `return false` below answered "not local" for 127.0.0.1 wearing
        // any of the other five hats - see embeddedV4. `::` and `::1` need no
        // branch of their own any more: they come out of ::/96 as 0.0.0.0 and
        // 0.0.0.1, both of which blockedV4 already refuses.
        const v4 = embeddedV4(groups)
        if (v4.length > 0) return v4.some(blockedV4)
        if ((groups[0] & 0xffc0) === 0xfe80) return true // fe80::/10, link-local
        if ((groups[0] & 0xfe00) === 0xfc00) return true // fc00::/7, unique-local
        if ((groups[0] & 0xffc0) === 0xfec0) return true // fec0::/10, deprecated site-local
        if ((groups[0] & 0xff00) === 0xff00) return true // ff00::/8, multicast
        return false
    }
    return true
}

/**
 * Every IPv4 address an IPv6 address carries, as four-octet quads. Empty when
 * it carries none.
 *
 * "Is this loopback?" is a question about where the packet lands, and several
 * prefixes exist whose entire purpose is to carry an IPv4 destination inside an
 * IPv6 literal. Enumerating one of them (`::ffff:/96`) and answering "allowed"
 * for the rest was the `[::ffff:7f00:1]` bug again in five more spellings:
 * `[64:ff9b::a9fe:a9fe]`, `[2002:7f00:1::]`, `[::7f00:1]`, `[::ffff:0:7f00:1]`
 * and `[2001:0:0:0:0:0:3f57:fffe]` all reached `fetch` through
 * `httpSend({ guardRemote: true })`.
 *
 * There is no second layer behind this for a literal: `dns.lookup(h, {
 * verbatim: true })` returns a numeric host unchanged (confirmed on Windows for
 * all five), so `http.ts`'s "check the RESOLVED address" pass asks this same
 * function the same question and gets the same answer. This IS the boundary.
 *
 * A quad is returned even when the carried address is public - `2002:5db8:d822::`
 * is 6to4 for 93.184.216.34 and stays allowed - because the caller judges the
 * address, not the prefix. Returning a LIST rather than one quad is what lets
 * Teredo be judged on both the addresses it embeds instead of a chosen one.
 *
 * What this cannot do: a site-specific NAT64 prefix (RFC 6052 allows any
 * network-specific prefix, not only 64:ff9b::/96) is not enumerable from the
 * address alone. That exposure is unclosed and is an argument for pinning the
 * resolved address on plain-http targets, not something this function can fix.
 */
function embeddedV4(g: number[]): number[][] {
    const split = (hi: number, lo: number): number[] => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]
    const zeros = (from: number, to: number): boolean => g.slice(from, to).every((x) => x === 0)
    // ::ffff:0:0/96 IPv4-mapped - and ::/96 IPv4-compatible (RFC 4291 2.5.5.1),
    // deprecated but still parsed by every stack and still returned verbatim by
    // a resolver, which is all it needs to be a route to loopback.
    if (zeros(0, 5) && (g[5] === 0xffff || g[5] === 0)) return [split(g[6], g[7])]
    // ::ffff:0:0:0/96 IPv4-translated (RFC 2765 SIIT).
    if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return [split(g[6], g[7])]
    // 64:ff9b::/96 NAT64 well-known prefix (RFC 6052) - every IPv6-only mobile
    // network runs one of these, and it is a plain /96 translation.
    if (g[0] === 0x0064 && g[1] === 0xff9b && zeros(2, 6)) return [split(g[6], g[7])]
    // 2002::/16 6to4 (RFC 3056): the v4 address is the next 32 bits.
    if (g[0] === 0x2002) return [split(g[1], g[2])]
    // 2001:0::/32 Teredo (RFC 4380). Two v4 addresses: the client's, in the
    // last 32 bits stored bitwise-inverted, and the relay server's in groups
    // 2-3. Both are judged, because either one being local is enough - and
    // "check only the one I thought of" is the exact mistake above.
    if (g[0] === 0x2001 && g[1] === 0) {
        return [split(~g[6] & 0xffff, ~g[7] & 0xffff), split(g[2], g[3])]
    }
    return []
}

function blockedV4(o: number[]): boolean {
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
    const [a, b] = o
    if (a === 127 || a === 0 || a === 10) return true
    if (a === 169 && b === 254) return true // link-local + cloud metadata
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    return false
}

/**
 * An IPv6 literal as its eight 16-bit groups, or null if it isn't one.
 *
 * Written out rather than pattern-matched on the text because the prefix
 * checks this replaces were wrong in both directions: `startsWith("fe80:")`
 * missed the rest of fe80::/10 (`feb0::1` is link-local too), and neither
 * spelling of an IPv4-mapped address was recognised at all.
 */
function parseIpv6(raw: string): number[] | null {
    const zone = raw.indexOf("%")
    const h = zone === -1 ? raw : raw.slice(0, zone)
    const halves = h.split("::")
    if (halves.length > 2) return null

    const expand = (part: string): number[] | null => {
        if (!part) return []
        const out: number[] = []
        for (const piece of part.split(":")) {
            // A trailing dotted quad (`::ffff:127.0.0.1`) is two groups.
            const dotted = piece.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
            if (dotted) {
                const o = dotted.slice(1).map(Number)
                if (o.some((n) => n > 255)) return null
                out.push((o[0] << 8) | o[1], (o[2] << 8) | o[3])
                continue
            }
            if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
            out.push(parseInt(piece, 16))
        }
        return out
    }

    const head = expand(halves[0])
    const tail = halves.length === 2 ? expand(halves[1]) : []
    if (!head || !tail) return null
    if (halves.length === 1) return head.length === 8 ? head : null
    const gap = 8 - head.length - tail.length
    if (gap < 1) return null
    return [...head, ...Array(gap).fill(0), ...tail]
}

/**
 * Block remote-initiated requests to local/private/link-local hosts (SSRF guard),
 * judging only the URL's *text*. The desktop API panel is unaffected - this
 * only gates the phone's relayed requests.
 *
 * This is the cheap first pass, not the boundary: a hostname is a promise
 * about an address, and the promise is kept by a DNS server we do not own.
 * `httpSend`'s `guardRemote` mode is what resolves the name and re-checks
 * every redirect hop; see the note there.
 */
export function isBlockedRemoteUrl(raw: string): boolean {
    try {
        const u = new URL(raw)
        if (u.protocol !== "http:" && u.protocol !== "https:") return true
        // A single trailing dot is the DNS root, not part of the name:
        // `localhost.` resolves to 127.0.0.1 on every stack and, read as text,
        // was neither "localhost" nor a dotted quad. Same for `nas.local.`.
        const h = u.hostname
            .toLowerCase()
            .replace(/^\[|\]$/g, "")
            .replace(/\.$/, "")
        if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true
        // Any literal address - v4 or v6 - is judged by the one function that
        // knows what an address means. The v6 checks used to be duplicated here
        // as string prefixes, and the copy was the one that was wrong.
        if (h.includes(":") || /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(h)) return isBlockedAddress(h)
        return false
    } catch {
        return true
    }
}

// isReadOnlySql lived here: a regex on a statement's first word, called "the
// whole security model" by the tool that depended on it. It let through
// `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x` (starts with "with")
// and, on pg's simple-query protocol, `SELECT 1; DROP TABLE t` (one call, two
// statements). It is deliberately not replaced by a better regex: read-only is
// a capability the driver has - a transaction, or a connection flag - and
// db.ts's runReadOnly now uses it per driver, refusing the one kind
// (SQL Server) that has none.

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
