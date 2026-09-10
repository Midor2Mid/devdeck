import { describe, it, expect } from "vitest"
import { isBlockedAddress, isBlockedRemoteUrl, tokenOk } from "../src/main/guards"

describe("isBlockedRemoteUrl (SSRF guard)", () => {
    it("blocks loopback / localhost", () => {
        expect(isBlockedRemoteUrl("http://localhost:3000")).toBe(true)
        expect(isBlockedRemoteUrl("http://127.0.0.1/x")).toBe(true)
        expect(isBlockedRemoteUrl("http://[::1]/")).toBe(true)
    })
    it("blocks private + link-local + metadata ranges", () => {
        expect(isBlockedRemoteUrl("http://10.0.0.5")).toBe(true)
        expect(isBlockedRemoteUrl("http://192.168.1.9")).toBe(true)
        expect(isBlockedRemoteUrl("http://172.16.0.1")).toBe(true)
        expect(isBlockedRemoteUrl("http://169.254.169.254/latest/meta-data/")).toBe(true)
    })
    it("blocks non-http schemes and junk", () => {
        expect(isBlockedRemoteUrl("file:///etc/passwd")).toBe(true)
        expect(isBlockedRemoteUrl("not a url")).toBe(true)
    })
    it("allows normal public URLs", () => {
        expect(isBlockedRemoteUrl("https://api.github.com/repos")).toBe(false)
        expect(isBlockedRemoteUrl("http://example.com:8080/x")).toBe(false)
    })
})

// The text check above and this one answer different questions: that one reads
// a URL a caller typed, this one reads an address a resolver produced. See
// tests/http-ssrf.test.ts for the two working together over a redirect chain.
describe("isBlockedAddress (what the resolver actually returned)", () => {
    it("blocks loopback, private, link-local and metadata addresses", () => {
        for (const ip of ["127.0.0.1", "0.0.0.0", "10.1.2.3", "192.168.0.1", "172.20.0.1", "169.254.169.254"]) {
            expect(isBlockedAddress(ip)).toBe(true)
        }
    })
    it("blocks IPv6 loopback, link-local and unique-local", () => {
        for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "[::1]"]) {
            expect(isBlockedAddress(ip)).toBe(true)
        }
    })
    it("sees through an IPv4-mapped IPv6 address", () => {
        expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true)
        expect(isBlockedAddress("::ffff:93.184.216.34")).toBe(false)
    })
    it("allows ordinary public addresses", () => {
        expect(isBlockedAddress("93.184.216.34")).toBe(false)
        expect(isBlockedAddress("8.8.8.8")).toBe(false)
        expect(isBlockedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false)
    })
    it("allows CGNAT, where tailnet addresses live", () => {
        // Blocking 100.64/10 would refuse the user's own machines - DevDeck
        // offers a tailnet bind of its own.
        expect(isBlockedAddress("100.101.102.103")).toBe(false)
    })
    it("fails closed on anything that is not an address", () => {
        for (const junk of ["", "   ", "example.com", "999.1.1.1", "not an ip"]) {
            expect(isBlockedAddress(junk)).toBe(true)
        }
    })
})

// The spelling that got through: WHATWG URL normalises `[::ffff:127.0.0.1]` to
// `[::ffff:7f00:1]`, and a resolver returns the same hex - so a check that
// only understood the DOTTED form of an IPv4-mapped address let every private
// range through, in the one spelling a caller controls.
describe("isBlockedAddress and IPv4-mapped IPv6", () => {
    it("blocks a mapped loopback in hex, dotted, and uncompressed form", () => {
        expect(isBlockedAddress("::ffff:7f00:1")).toBe(true)
        expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true)
        expect(isBlockedAddress("0:0:0:0:0:ffff:7f00:1")).toBe(true)
    })
    it("blocks mapped private and metadata addresses", () => {
        expect(isBlockedAddress("::ffff:a00:1")).toBe(true) // 10.0.0.1
        expect(isBlockedAddress("::ffff:c0a8:1")).toBe(true) // 192.168.0.1
        expect(isBlockedAddress("::ffff:a9fe:a9fe")).toBe(true) // 169.254.169.254
    })
    it("still allows a mapped PUBLIC address", () => {
        expect(isBlockedAddress("::ffff:5db8:d822")).toBe(false) // 93.184.216.34
    })
    it("blocks all of fe80::/10, not just addresses starting fe80:", () => {
        expect(isBlockedAddress("feb0::1")).toBe(true)
        expect(isBlockedAddress("febf::1")).toBe(true)
        // `fec0::1` IS outside fe80::/10 - which is what this `it` pins - but
        // it is inside fec0::/10, deprecated site-local, which had no branch
        // at all. The expectation was reversed on 2026-09-10: asserting `false`
        // here was a test asserting a bypass, and it was the line that kept the
        // suite green while five other IPv4-in-IPv6 embeddings walked through
        // `guardRemote`. The boundary this test exists for is pinned by `febf::1`
        // above and by the global-IPv6 cases in the next describe.
        expect(isBlockedAddress("fec0::1")).toBe(true) // fec0::/10, not fe80::/10
    })
    it("refuses a malformed IPv6 literal rather than reading it as public", () => {
        for (const junk of ["::ffff:zz", "1::2::3", "12345::1", ":::1"]) {
            expect(isBlockedAddress(junk)).toBe(true)
        }
    })
    it("blocks the URL form too - one function decides, not a copy of it", () => {
        expect(isBlockedRemoteUrl("http://[::ffff:127.0.0.1]/")).toBe(true)
        expect(isBlockedRemoteUrl("http://[::ffff:7f00:1]:8787/tools")).toBe(true)
        expect(isBlockedRemoteUrl("http://[::ffff:169.254.169.254]/")).toBe(true)
        expect(isBlockedRemoteUrl("https://[2606:2800:220:1:248:1893:25c8:1946]/")).toBe(false)
    })
})

/**
 * The bug this pins is not "::ffff: was wrong" - that one was found and fixed.
 * It is that `::ffff:/96` was the only embedding ENUMERATED, and a bare
 * `return false` answered for every other way of writing an IPv4 address inside
 * an IPv6 one. One instance of a class is not the class.
 *
 * These are not theoretical spellings. `dns.lookup(h, { verbatim: true })`
 * hands a numeric host straight back - re-confirmed on this machine 2026-09-10
 * for all five - so `blockedTarget`'s "check the RESOLVED address" second layer
 * asks the same question of the same literal and gets the same wrong answer.
 * There is no defence in depth behind this function for a literal address; it
 * IS the boundary. See tests/http-ssrf.test.ts for the same inputs driven
 * through `httpSend({ guardRemote: true })` with fetch stubbed.
 */
describe("isBlockedAddress: every embedding of an IPv4 address, not just ::ffff:", () => {
    const embedded: [string, string][] = [
        ["::7f00:1", "IPv4-compatible, RFC 4291 2.5.5.1"],
        ["::127.0.0.1", "IPv4-compatible, dotted"],
        ["::ffff:0:7f00:1", "IPv4-translated, RFC 2765"],
        ["64:ff9b::7f00:1", "NAT64 well-known prefix, RFC 6052"],
        ["64:ff9b::a00:1", "NAT64 -> 10.0.0.1"],
        ["64:ff9b::c0a8:1", "NAT64 -> 192.168.0.1"],
        ["64:ff9b::a9fe:a9fe", "NAT64 -> the cloud metadata address"],
        ["2002:7f00:1::", "6to4, RFC 3056"],
        ["2002:c0a8:1::1", "6to4 -> 192.168.0.1"],
        ["2001:0:0:0:0:0:3f57:fffe", "Teredo, RFC 4380 - client v4 is the last 32 bits, inverted"]
    ]
    for (const [addr, why] of embedded) {
        it(`blocks ${addr} (${why})`, () => expect(isBlockedAddress(addr)).toBe(true))
    }

    it("blocks the two IPv6 scopes that had no branch at all", () => {
        // fec0::/10 is the one the suite was asserting REACHABLE (see above).
        // ff00::/8 is included on fail-closed grounds rather than a
        // demonstrated exploit: TCP does not establish to a multicast address,
        // so no request test can be written for it, and the decision point is
        // already parsing the address anyway.
        expect(isBlockedAddress("fec0::1")).toBe(true)
        expect(isBlockedAddress("feff::1")).toBe(true)
        expect(isBlockedAddress("ff02::1")).toBe(true)
        expect(isBlockedAddress("ff05::1:3")).toBe(true)
    })

    it("still allows ordinary global IPv6 - the fix must not be a blanket refusal", () => {
        expect(isBlockedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false)
        expect(isBlockedAddress("2606:4700::1111")).toBe(false)
        // 2001:4860::/32 is Google, not Teredo: Teredo is 2001:0::/32, so the
        // second group is what separates them. A prefix check on "2001:" would
        // have taken half the modern internet with it.
        expect(isBlockedAddress("2001:4860:4860::8888")).toBe(false)
        // 6to4 and NAT64 carrying a PUBLIC v4 address are allowed, because the
        // question is where the packet lands, not which prefix it wears.
        expect(isBlockedAddress("2002:5db8:d822::")).toBe(false)
        expect(isBlockedAddress("64:ff9b::5db8:d822")).toBe(false)
    })

    it("keeps failing closed on a literal it cannot parse", () => {
        for (const junk of ["::ffff:zz", "1::2::3", "12345::1", ":::1", "64:ff9b::gg"]) {
            expect(isBlockedAddress(junk)).toBe(true)
        }
    })
})

describe("isBlockedRemoteUrl: the text layer reads the URL forms too", () => {
    it("blocks an embedded IPv4 address in a URL host", () => {
        expect(isBlockedRemoteUrl("http://[64:ff9b::a9fe:a9fe]/latest/meta-data/")).toBe(true)
        expect(isBlockedRemoteUrl("http://[2002:7f00:1::]:8787/mcp")).toBe(true)
        expect(isBlockedRemoteUrl("http://[::7f00:1]:8787/mcp")).toBe(true)
        expect(isBlockedRemoteUrl("http://[::ffff:0:7f00:1]:8787/mcp")).toBe(true)
        expect(isBlockedRemoteUrl("http://[2001:0:0:0:0:0:3f57:fffe]/")).toBe(true)
    })

    it("reads a trailing root dot as the name it is", () => {
        // Defence in depth, not the boundary: the resolver layer catches
        // `localhost.` because it resolves to ::1 + 127.0.0.1. But a text guard
        // that cannot see the most common FQDN spelling of the one name it
        // hard-codes is not doing its job, and `.local.` / `.internal.` are the
        // same shape.
        expect(isBlockedRemoteUrl("http://localhost./")).toBe(true)
        expect(isBlockedRemoteUrl("http://LOCALHOST./")).toBe(true)
        expect(isBlockedRemoteUrl("http://nas.local./")).toBe(true)
        expect(isBlockedRemoteUrl("http://api.internal./")).toBe(true)
        // A trailing dot on an ordinary public name is still ordinary.
        expect(isBlockedRemoteUrl("https://api.github.com./repos")).toBe(false)
    })
})

describe("tokenOk (constant-time remote auth)", () => {
    const secret = "a".repeat(48)
    it("accepts the exact token", () => {
        expect(tokenOk(secret, secret)).toBe(true)
    })
    it("rejects wrong, partial, and superstring tokens", () => {
        expect(tokenOk("b".repeat(48), secret)).toBe(false)
        expect(tokenOk(secret.slice(0, 47), secret)).toBe(false)
        expect(tokenOk(secret + "a", secret)).toBe(false)
    })
    it("rejects missing/empty tokens, and never matches an empty secret", () => {
        expect(tokenOk(null, secret)).toBe(false)
        expect(tokenOk(undefined, secret)).toBe(false)
        expect(tokenOk("", secret)).toBe(false)
        expect(tokenOk("", "")).toBe(false)
        expect(tokenOk("anything", "")).toBe(false)
    })
})
