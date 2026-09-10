import { describe, it, expect, beforeEach, vi } from "vitest"

// The guard's job is to decide where a request is allowed to LAND, so the two
// things it depends on - name resolution and the redirect chain - are what the
// test controls. Nothing here opens a socket: a test that had to reach the
// network to prove an SSRF guard would be proving it against whatever DNS
// answered that morning.
const dnsMock = vi.hoisted(() => ({
    map: new Map<string, string[]>()
}))
vi.mock("dns/promises", () => ({
    lookup: async (host: string) => {
        // Real getaddrinfo hands a NUMERIC host straight back - re-confirmed on
        // Windows 2026-09-10 for 64:ff9b::7f00:1, ::7f00:1, 2002:7f00:1::,
        // ::ffff:0:7f00:1 and 2001:0:0:0:0:0:3f57:fffe. Without this branch the
        // mock throws ENOTFOUND for a literal, `blockedTarget` refuses it for
        // "would not resolve", and the suite cannot see that both layers of the
        // guard ask the same question of a literal and get the same answer -
        // i.e. it would pass for a reason production does not have.
        if (host.includes(":") && /^[0-9a-f:.]+$/i.test(host)) {
            return [{ address: host, family: 6 }]
        }
        const addrs = dnsMock.map.get(host)
        if (!addrs) throw new Error(`ENOTFOUND ${host}`)
        return addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))
    }
}))

const { httpSend } = await import("../src/main/http")

const BLOCKED = "Blocked: remote requests to local/private hosts aren't allowed."

/** A fetch stub driven by a url -> response table, recording every call. */
function stubFetch(table: Record<string, { status: number; location?: string; body?: string }>) {
    const calls: {
        url: string
        method: string
        redirect?: string
        body?: unknown
        headers?: Record<string, string>
        res?: Response
    }[] = []
    const impl = vi.fn(async (url: string, init: RequestInit = {}) => {
        const entry = {
            url,
            method: String(init.method ?? "GET"),
            redirect: init.redirect,
            body: init.body,
            headers: (init.headers ?? {}) as Record<string, string>
        }
        calls.push(entry)
        const hit = table[url] ?? { status: 200, body: "ok" }
        const headers = new Headers()
        if (hit.location) headers.set("location", hit.location)
        const res = new Response(hit.body ?? "", { status: hit.status, headers })
        ;(entry as { res?: Response }).res = res
        return res
    })
    vi.stubGlobal("fetch", impl)
    return calls
}

beforeEach(() => {
    vi.unstubAllGlobals()
    dnsMock.map.clear()
    dnsMock.map.set("api.example.com", ["93.184.216.34"])
    dnsMock.map.set("hop.example.com", ["93.184.216.34"])
})

describe("relayed HTTP - a redirect must not carry credentials with it", () => {
    // Following redirects by hand means inheriting what `fetch` was doing for
    // us. It strips credential headers when a redirect crosses origins; a loop
    // that replays req.headers verbatim would hand a saved request's API token
    // to whatever host the endpoint named - making the HARDENED path the leaky
    // one.
    const secret = { Authorization: "Bearer SECRET", Cookie: "session=abc", "X-Trace": "keep-me" }

    it("drops Authorization and Cookie when the origin changes", async () => {
        const calls = stubFetch({
            "https://api.example.com/x": { status: 302, location: "https://hop.example.com/y" },
            "https://hop.example.com/y": { status: 200, body: "ok" }
        })
        await httpSend(
            { method: "GET", url: "https://api.example.com/x", headers: { ...secret } },
            { guardRemote: true }
        )
        expect(calls[0].headers).toMatchObject({ Authorization: "Bearer SECRET" })
        const forwarded = calls[1].headers ?? {}
        expect(Object.keys(forwarded).map((k) => k.toLowerCase())).not.toContain("authorization")
        expect(Object.keys(forwarded).map((k) => k.toLowerCase())).not.toContain("cookie")
        // Non-credential headers still travel - this is a credential rule, not
        // a "forget everything" rule.
        expect(forwarded["X-Trace"]).toBe("keep-me")
    })

    it("keeps them on a same-origin redirect", async () => {
        const calls = stubFetch({
            "https://api.example.com/x": { status: 302, location: "https://api.example.com/y" },
            "https://api.example.com/y": { status: 200, body: "ok" }
        })
        await httpSend(
            { method: "GET", url: "https://api.example.com/x", headers: { ...secret } },
            { guardRemote: true }
        )
        expect(calls[1].headers).toMatchObject({ Authorization: "Bearer SECRET" })
    })

    it("consumes each redirect body instead of parking the socket", async () => {
        const calls = stubFetch({
            "https://api.example.com/x": { status: 302, location: "https://hop.example.com/y" },
            "https://hop.example.com/y": { status: 200, body: "landed" }
        })
        await httpSend({ method: "GET", url: "https://api.example.com/x" }, { guardRemote: true })
        // Undici holds the connection until the body is read or cancelled.
        expect(calls[0].res?.bodyUsed).toBe(true)
    })
})

describe("relayed HTTP - the guard runs on every hop (remedy 14)", () => {
    it("refuses a redirect into loopback instead of following it", async () => {
        // The actual hole: one check at the entry point, then fetch followed
        // the 302 to DevDeck's own MCP server on the machine being remoted.
        const calls = stubFetch({
            "https://api.example.com/x": { status: 302, location: "http://127.0.0.1:8787/tools" }
        })
        const res = await httpSend({ method: "GET", url: "https://api.example.com/x" }, { guardRemote: true })
        expect(res.ok).toBe(false)
        expect(res.error).toBe(BLOCKED)
        // Exactly one request left the machine: the redirect target was never
        // fetched, which is the whole point.
        expect(calls).toHaveLength(1)
        expect(calls[0].redirect).toBe("manual")
    })

    it("refuses a redirect to the cloud metadata address", async () => {
        const calls = stubFetch({
            "https://api.example.com/x": { status: 307, location: "http://169.254.169.254/latest/meta-data/" }
        })
        const res = await httpSend({ method: "GET", url: "https://api.example.com/x" }, { guardRemote: true })
        expect(res.error).toBe(BLOCKED)
        expect(calls).toHaveLength(1)
    })

    it("refuses a public hostname that resolves into the LAN, before any request", async () => {
        dnsMock.map.set("nas.example.com", ["10.0.0.5"])
        const calls = stubFetch({})
        const res = await httpSend({ method: "GET", url: "https://nas.example.com/" }, { guardRemote: true })
        expect(res.error).toBe(BLOCKED)
        expect(calls).toHaveLength(0)
    })

    it("refuses shorthand and integer spellings of loopback", async () => {
        const calls = stubFetch({})
        // Neither of these looks like a dotted quad to the text check; the
        // resolver is what gives them away.
        dnsMock.map.set("127.1", ["127.0.0.1"])
        dnsMock.map.set("2130706433", ["127.0.0.1"])
        expect((await httpSend({ method: "GET", url: "http://127.1/" }, { guardRemote: true })).error).toBe(BLOCKED)
        expect((await httpSend({ method: "GET", url: "http://2130706433/" }, { guardRemote: true })).error).toBe(BLOCKED)
        expect(calls).toHaveLength(0)
    })

    it("refuses a name that will not resolve rather than handing it to fetch", async () => {
        const calls = stubFetch({})
        const res = await httpSend({ method: "GET", url: "https://nope.example.com/" }, { guardRemote: true })
        expect(res.error).toBe(BLOCKED)
        expect(calls).toHaveLength(0)
    })

    it("follows a redirect that stays public, checking each hop", async () => {
        const calls = stubFetch({
            "https://api.example.com/x": { status: 302, location: "https://hop.example.com/y" },
            "https://hop.example.com/y": { status: 200, body: "landed" }
        })
        const res = await httpSend({ method: "GET", url: "https://api.example.com/x" }, { guardRemote: true })
        expect(res.ok).toBe(true)
        expect(res.status).toBe(200)
        expect(res.body).toBe("landed")
        expect(calls.map((c) => c.url)).toEqual([
            "https://api.example.com/x",
            "https://hop.example.com/y"
        ])
    })

    it("downgrades a 303 to GET and drops the body, like a browser would", async () => {
        const calls = stubFetch({
            "https://api.example.com/x": { status: 303, location: "https://hop.example.com/y" },
            "https://hop.example.com/y": { status: 200, body: "ok" }
        })
        await httpSend(
            { method: "POST", url: "https://api.example.com/x", body: "a=1" },
            { guardRemote: true }
        )
        expect(calls[1].method).toBe("GET")
        expect(calls[1].body).toBeUndefined()
    })

    it("keeps method and body across a 307, also like a browser would", async () => {
        const calls = stubFetch({
            "https://api.example.com/x": { status: 307, location: "https://hop.example.com/y" },
            "https://hop.example.com/y": { status: 200, body: "ok" }
        })
        await httpSend(
            { method: "POST", url: "https://api.example.com/x", body: "a=1" },
            { guardRemote: true }
        )
        expect(calls[1].method).toBe("POST")
        expect(calls[1].body).toBe("a=1")
    })

    it("refuses a redirect loop instead of following the last one anyway", async () => {
        const calls = stubFetch({
            "https://api.example.com/x": { status: 302, location: "https://hop.example.com/y" },
            "https://hop.example.com/y": { status: 302, location: "https://api.example.com/x" }
        })
        const res = await httpSend({ method: "GET", url: "https://api.example.com/x" }, { guardRemote: true })
        expect(res.ok).toBe(false)
        expect(res.error).toBe(BLOCKED)
        expect(calls.length).toBeLessThanOrEqual(11)
    })

    it("leaves the desktop API panel alone - no guard, no manual redirects", async () => {
        // The desktop panel is the user's own browser-equivalent; guarding it
        // would break testing your own localhost API, which is most of what
        // the panel is for.
        const calls = stubFetch({ "http://127.0.0.1:3000/health": { status: 200, body: "up" } })
        const res = await httpSend({ method: "GET", url: "http://127.0.0.1:3000/health" })
        expect(res.ok).toBe(true)
        expect(res.body).toBe("up")
        expect(calls[0].redirect).toBeUndefined()
    })
})

/**
 * The hole F-1 names, driven end to end: `isBlockedAddress` enumerated exactly
 * one IPv4-in-IPv6 embedding and answered "not local" for the rest, and the
 * resolved-address layer cannot save it because a resolver returns a literal
 * verbatim. Every case below reached the stubbed `fetch` with
 * `{ ok: true, body: "REACHED" }` before the fix - the guard did not
 * mis-rank the address, it never refused the request.
 */
describe("relayed HTTP - IPv4 wearing a hat other than ::ffff:", () => {
    const cases: [string, string][] = [
        [
            "NAT64 well-known prefix -> the cloud metadata address",
            "http://[64:ff9b::a9fe:a9fe]/latest/meta-data/"
        ],
        ["6to4 -> loopback", "http://[2002:7f00:1::]:8787/mcp"],
        ["IPv4-compatible -> loopback", "http://[::7f00:1]:8787/mcp"],
        ["IPv4-translated -> loopback", "http://[::ffff:0:7f00:1]:8787/mcp"],
        ["Teredo -> 192.168.0.1", "http://[2001:0:0:0:0:0:3f57:fffe]/"]
    ]
    for (const [why, url] of cases) {
        it(`refuses ${why}`, async () => {
            const calls = stubFetch({})
            const res = await httpSend({ method: "GET", url }, { guardRemote: true })
            expect(res.error).toBe(BLOCKED)
            expect(calls).toEqual([])
        })
    }

    it("refuses a hostname whose AAAA record is a NAT64-mapped private address", async () => {
        // The attacker owns the zone, so the address is theirs to choose and
        // the text layer never sees it. This is the reachable form: no literal
        // in the URL at all.
        dnsMock.map.set("rebind.example.com", ["64:ff9b::c0a8:1"])
        const calls = stubFetch({})
        const res = await httpSend(
            { method: "GET", url: "http://rebind.example.com/" },
            { guardRemote: true }
        )
        expect(res.error).toBe(BLOCKED)
        expect(calls).toEqual([])
    })

    it("refuses a redirect hop into a NAT64-mapped loopback", async () => {
        const calls = stubFetch({
            "https://api.example.com/": {
                status: 302,
                location: "http://[64:ff9b::7f00:1]:8787/mcp"
            }
        })
        const res = await httpSend(
            { method: "GET", url: "https://api.example.com/" },
            { guardRemote: true }
        )
        expect(res.error).toBe(BLOCKED)
        expect(calls.map((c) => c.url)).toEqual(["https://api.example.com/"])
    })

    it("still relays an ordinary public request - the control case", async () => {
        const calls = stubFetch({ "https://api.example.com/x": { status: 200, body: "ok" } })
        const res = await httpSend(
            { method: "GET", url: "https://api.example.com/x" },
            { guardRemote: true }
        )
        expect(res.ok).toBe(true)
        expect(res.body).toBe("ok")
        expect(calls).toHaveLength(1)
    })

    it("still relays to a global IPv6 literal", async () => {
        const url = "https://[2606:2800:220:1:248:1893:25c8:1946]/"
        const calls = stubFetch({ [url]: { status: 200, body: "ok" } })
        const res = await httpSend({ method: "GET", url }, { guardRemote: true })
        expect(res.ok).toBe(true)
        expect(calls).toHaveLength(1)
    })
})
