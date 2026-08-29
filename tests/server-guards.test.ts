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
        expect(isBlockedAddress("fec0::1")).toBe(false) // outside the /10
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
