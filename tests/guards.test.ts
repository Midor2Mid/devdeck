import { describe, it, expect } from "vitest"
import {
    chooseBind,
    isExpired,
    cookieToken,
    deviceCookie,
    clearDeviceCookie,
    originOk,
    DEVICE_COOKIE
} from "../src/main/guards"

describe("chooseBind", () => {
    const both = { tailscale: ["100.64.0.1"], lan: ["192.168.1.5"] }
    const lanOnly = { tailscale: [], lan: ["192.168.1.5"] }

    it("binds the tailnet address when asked for tailscale", () => {
        expect(chooseBind("tailscale", both)).toEqual({ ok: true, host: "100.64.0.1" })
    })

    it("REFUSES rather than falling back when tailscale is asked for and absent", () => {
        // This is the whole point: the old code silently bound 0.0.0.0 here,
        // turning "keep this private" into "this is on the office wifi".
        const r = chooseBind("tailscale", lanOnly)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toMatch(/tailnet|tailscale/i)
    })

    it("binds every interface for lan, even when a tailnet address exists", () => {
        expect(chooseBind("lan", both)).toEqual({ ok: true, host: "0.0.0.0" })
    })

    it("auto prefers the tailnet and falls back to every interface", () => {
        expect(chooseBind("auto", both)).toEqual({ ok: true, host: "100.64.0.1" })
        expect(chooseBind("auto", lanOnly)).toEqual({ ok: true, host: "0.0.0.0" })
    })

    it("refuses lan and auto when there is no address at all", () => {
        const none = { tailscale: [], lan: [] }
        expect(chooseBind("lan", none).ok).toBe(false)
        expect(chooseBind("auto", none).ok).toBe(false)
    })

    it("refuses an unrecognised bind mode rather than defaulting to 0.0.0.0", () => {
        // A stale/undefined config field (or an untyped IPC payload) must not
        // fall through to the widest bind - that's the exact regression this
        // function exists to close.
        expect(chooseBind(undefined as never, both)).toEqual({
            ok: false,
            reason: expect.stringMatching(/unrecognised|bind mode/i)
        })
        expect(chooseBind("nonsense" as never, both).ok).toBe(false)
    })
})

describe("isExpired", () => {
    const now = 1_800_000_000_000
    const day = 86_400_000

    it("expires a device idle past the window", () => {
        expect(isExpired(now - 31 * day, 30, now)).toBe(true)
    })

    it("keeps a device seen inside the window", () => {
        expect(isExpired(now - 29 * day, 30, now)).toBe(false)
    })

    it("never expires when the window is 0", () => {
        expect(isExpired(now - 3650 * day, 0, now)).toBe(false)
    })

    it("treats a device from the future as current, not expired", () => {
        // Clock skew or a restored backup must not lock someone out.
        expect(isExpired(now + day, 30, now)).toBe(false)
    })

    it("does not expire at the exact boundary", () => {
        // The check is `>`, not `>=`, so at exactly ttlDays it's still current.
        const boundary = now - 30 * day
        expect(isExpired(boundary, 30, now)).toBe(false)
    })

    it("expires one millisecond past the boundary", () => {
        // One millisecond over the limit should expire.
        const past = now - 30 * day - 1
        expect(isExpired(past, 30, now)).toBe(true)
    })

    it("fails closed on NaN, even with ttlDays: 0", () => {
        // Corrupted or malformed timestamps must not create permanent credentials.
        expect(isExpired(NaN, 30, now)).toBe(true)
        expect(isExpired(NaN, 0, now)).toBe(true)
    })

    it("treats large future skew as current", () => {
        // A thousand days in the future should still be considered current,
        // since the subtraction uses plain `-` not Math.abs.
        expect(isExpired(now + 1000 * day, 30, now)).toBe(false)
    })
})

describe("chooseBind - return-value invariant", () => {
    // The renderer's remoteBindView.ts derives `onTailnet` as
    // `bound !== "0.0.0.0"` - i.e. it assumes any non-wide bind IS a tailnet
    // address, without re-checking membership. That assumption only holds
    // because chooseBind never returns anything else: not a raw LAN address,
    // not some other host. If a future change ever made it return a specific
    // LAN IP, `onTailnet` would silently read true, the unencrypted-LAN
    // warning would disappear for a real LAN exposure, and H2 would return
    // with no failing test anywhere near remoteBindView.ts. Pinning the
    // invariant here, where chooseBind actually decides it, is what would
    // catch that.
    const cases: { tailscale: string[]; lan: string[] }[] = [
        { tailscale: ["100.64.0.1"], lan: ["192.168.1.5"] },
        { tailscale: ["100.64.0.1"], lan: [] },
        { tailscale: [], lan: ["192.168.1.5"] },
        { tailscale: [], lan: [] },
        { tailscale: ["100.64.0.1", "100.64.0.2"], lan: ["192.168.1.5", "10.0.0.9"] }
    ]

    for (const bind of ["tailscale", "lan", "auto"] as const) {
        for (const addrs of cases) {
            it(`${bind} over ${JSON.stringify(addrs)} returns only a tailnet address or 0.0.0.0`, () => {
                const r = chooseBind(bind, addrs)
                if (!r.ok) return
                expect(r.host === "0.0.0.0" || addrs.tailscale.includes(r.host)).toBe(true)
            })
        }
    }
})

describe("chooseBind security", () => {
    it("refuses CGNAT addresses even when filed under lan", () => {
        // CGNAT (100.64.0.0/10) should never bind, even if incorrectly
        // listed as a LAN address. This test ensures that a future
        // simplification doesn't merge the arrays and reopen the hole.
        const r = chooseBind("tailscale", { tailscale: [], lan: ["100.64.0.1"] })
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toMatch(/tailnet|tailscale/i)
    })
})

describe("cookieToken", () => {
    it("returns empty for a missing header", () => {
        expect(cookieToken(undefined)).toBe("")
    })

    it("reads the value out of a single cookie", () => {
        expect(cookieToken(`${DEVICE_COOKIE}=abc123`)).toBe("abc123")
    })

    it("finds it among multiple cookies, with the usual '; ' whitespace", () => {
        expect(cookieToken(`theme=dark; ${DEVICE_COOKIE}=abc123; other=xyz`)).toBe("abc123")
    })

    it("tolerates no space after ';' and extra spaces around '='", () => {
        expect(cookieToken(`a=1;${DEVICE_COOKIE}=abc123;b=2`)).toBe("abc123")
    })

    it("decodes a percent-encoded value", () => {
        const raw = "a b/c?d"
        expect(cookieToken(`${DEVICE_COOKIE}=${encodeURIComponent(raw)}`)).toBe(raw)
    })

    it("only the FIRST '=' splits name from value - a literal '=' in the value survives", () => {
        // Written directly, not via encodeURIComponent - that would escape
        // this "=" too (to "%3D") and never actually exercise the
        // indexOf("=") split this test is for.
        expect(cookieToken(`${DEVICE_COOKIE}=abc=123==`)).toBe("abc=123==")
    })

    it("ignores cookies that aren't the device cookie", () => {
        expect(cookieToken("a=1; b=2; c=3")).toBe("")
    })

    it("a malformed percent-escape on one entry does not abort the search for a later duplicate", () => {
        // Browsers permit duplicate cookie names (e.g. a stale Path/Domain
        // scoping an old one); a decode failure on the first must not make
        // the whole lookup give up before trying the second.
        expect(cookieToken(`${DEVICE_COOKIE}=%E0%A4%A; ${DEVICE_COOKIE}=good-token`)).toBe(
            "good-token"
        )
    })

    it("returns empty when every matching entry is malformed", () => {
        expect(cookieToken(`${DEVICE_COOKIE}=%E0%A4%A`)).toBe("")
    })
})

describe("deviceCookie / clearDeviceCookie", () => {
    it("builds an HttpOnly, SameSite=Strict, Path=/ cookie without Secure over plain http", () => {
        const c = deviceCookie("tok123", false, 30)
        expect(c).toMatch(new RegExp(`^${DEVICE_COOKIE}=tok123;`))
        expect(c).toMatch(/HttpOnly/)
        expect(c).toMatch(/SameSite=Strict/)
        expect(c).toMatch(/Path=\//)
        expect(c).not.toMatch(/Secure/)
        expect(c).toMatch(`Max-Age=${30 * 86_400}`)
    })

    it("adds Secure under TLS", () => {
        expect(deviceCookie("tok123", true, 30)).toMatch(/Secure/)
    })

    it("caps Max-Age at 400 days, including when deviceTtlDays is 0 (never)", () => {
        expect(deviceCookie("t", false, 0)).toMatch(`Max-Age=${400 * 86_400}`)
        expect(deviceCookie("t", false, 10_000)).toMatch(`Max-Age=${400 * 86_400}`)
    })

    it("URL-encodes the token", () => {
        expect(deviceCookie("a b", false, 30)).toContain(`${DEVICE_COOKIE}=a%20b`)
    })

    it("clearDeviceCookie expires immediately and carries no token value", () => {
        const c = clearDeviceCookie(false)
        expect(c).toMatch(`${DEVICE_COOKIE}=;`)
        expect(c).toMatch(/Max-Age=0/)
    })
})

describe("originOk", () => {
    it("allows a missing Origin (non-browser client, not a CSRF actor)", () => {
        expect(originOk(undefined, "127.0.0.1:7420")).toBe(true)
    })

    it("allows a same-origin Origin", () => {
        expect(originOk("http://127.0.0.1:7420", "127.0.0.1:7420")).toBe(true)
        expect(originOk("https://100.64.0.1:7420", "100.64.0.1:7420")).toBe(true)
    })

    it("rejects a cross-origin Origin", () => {
        expect(originOk("http://evil.example:1234", "127.0.0.1:7420")).toBe(false)
        expect(originOk("http://127.0.0.1:9999", "127.0.0.1:7420")).toBe(false)
    })

    it("rejects a garbage Origin rather than throwing", () => {
        expect(originOk("not a url", "127.0.0.1:7420")).toBe(false)
    })
})
