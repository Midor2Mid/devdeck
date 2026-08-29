import { lookup } from "dns/promises"
import { isBlockedAddress, isBlockedRemoteUrl } from "./guards"

export interface HttpRequest {
    method: string
    url: string
    headers?: Record<string, string>
    body?: string
}

export interface HttpResponse {
    ok: boolean
    status?: number
    statusText?: string
    headers?: Record<string, string>
    body?: string
    timeMs: number
    error?: string
}

const BODYLESS = new Set(["GET", "HEAD"])

export interface HttpOptions {
    /**
     * Apply the SSRF guard to the resolved address of every hop, not just to
     * the text of the URL the caller handed in. Set for requests relayed from
     * the phone; the desktop API panel is the user's own browser-equivalent
     * and is deliberately unguarded.
     */
    guardRemote?: boolean
}

/** Refusals stay in one place so the phone gets one message, not five. */
const BLOCKED = "Blocked: remote requests to local/private hosts aren't allowed."
/** Redirect chains are bounded; undici's own default is 20. */
const MAX_HOPS = 10
const REDIRECTS = new Set([301, 302, 303, 307, 308])

/**
 * Would this URL reach somewhere the phone must not reach?
 *
 * Two questions, because a hostname is a promise about an address:
 * `isBlockedRemoteUrl` reads the text (scheme, obvious local names), and then
 * the name is actually resolved and every address it yields is checked. That
 * second half is what stops `http://127.1/`, `http://2130706433/`, and a
 * public hostname whose A record points into the LAN - none of which look
 * local as text.
 *
 * A name that will not resolve is refused rather than handed to fetch: the
 * point of the guard is that "we could not tell" is not an allow.
 *
 * What this does NOT stop is DNS rebinding - `fetch` resolves the name again
 * for itself, and a record with a one-second TTL can answer differently the
 * second time. Pinning would mean connecting by address and carrying the Host
 * header ourselves, which breaks TLS SNI/verification for the ordinary case.
 * The exposure is a request to a LAN host by a party who already controls a
 * DNS zone the user's phone asked about, and it is written down here rather
 * than silently accepted.
 */
async function blockedTarget(raw: string): Promise<boolean> {
    if (isBlockedRemoteUrl(raw)) return true
    let host: string
    try {
        host = new URL(raw).hostname.replace(/^\[|\]$/g, "")
    } catch {
        return true
    }
    try {
        const addrs = await lookup(host, { all: true, verbatim: true })
        if (addrs.length === 0) return true
        return addrs.some((a) => isBlockedAddress(a.address))
    } catch {
        return true
    }
}

/**
 * `fetch` with the redirects followed by hand, so the guard runs on every hop
 * instead of only on the URL the caller typed.
 *
 * This is the actual hole the guard had: `fetch` defaults to
 * `redirect: "follow"`, the check ran once at the entry point, and any allowed
 * public host could answer `302 Location: http://127.0.0.1:8787/` - DevDeck's
 * own MCP server, on the machine the phone is remote-controlling - or
 * `http://169.254.169.254/`. One check, then an unbounded number of unchecked
 * requests.
 *
 * Returns `null` for a refusal (the caller turns that into BLOCKED) rather
 * than throwing, so a refusal never reaches the user as a transport error.
 */
async function guardedFetch(req: HttpRequest, method: string): Promise<Response | null> {
    let url = req.url
    let verb = method
    let body = BODYLESS.has(method) ? undefined : req.body

    for (let hop = 0; hop <= MAX_HOPS; hop++) {
        if (await blockedTarget(url)) return null
        const res = await fetch(url, { method: verb, headers: req.headers, body, redirect: "manual" })
        if (!REDIRECTS.has(res.status)) return res

        const location = res.headers.get("location")
        // A redirect with nowhere to go is just a response; hand it back
        // rather than inventing an error about it.
        if (!location) return res
        try {
            url = new URL(location, url).toString()
        } catch {
            return null
        }
        // 303 always becomes GET; 301/302 do so for anything that isn't
        // GET/HEAD, which is what every browser and undici already do. 307/308
        // keep the method and the body by definition.
        if (res.status === 303 || (res.status !== 307 && res.status !== 308 && !BODYLESS.has(verb))) {
            verb = "GET"
            body = undefined
        }
    }
    // Out of hops. A redirect loop is not a reason to stop checking, so this
    // is a refusal, not a "follow the last one anyway".
    return null
}

// Runs in the main process, so it is free of browser CORS restrictions -
// the whole point of a Postman-style client.
export async function httpSend(req: HttpRequest, opts: HttpOptions = {}): Promise<HttpResponse> {
    const start = Date.now()
    try {
        const method = (req.method || "GET").toUpperCase()
        const res = opts.guardRemote
            ? await guardedFetch(req, method)
            : await fetch(req.url, {
                  method,
                  headers: req.headers,
                  body: BODYLESS.has(method) ? undefined : req.body
              })
        if (!res) return { ok: false, error: BLOCKED, timeMs: Date.now() - start }
        const body = await res.text()
        const headers: Record<string, string> = {}
        res.headers.forEach((value, key) => {
            headers[key] = value
        })
        return {
            ok: true,
            status: res.status,
            statusText: res.statusText,
            headers,
            body,
            timeMs: Date.now() - start
        }
    } catch (err) {
        // Undici reports every transport failure as a bare "fetch failed" and
        // hides the useful part (ECONNREFUSED, ENOTFOUND, cert errors) in
        // err.cause - so surface that too or the UI says nothing actionable.
        let error = err instanceof Error ? err.message : String(err)
        const cause = err instanceof Error ? (err.cause as { code?: string; message?: string }) : null
        const detail = cause?.code || cause?.message
        if (detail && !error.includes(detail)) error += ` (${detail})`
        return { ok: false, error, timeMs: Date.now() - start }
    }
}
