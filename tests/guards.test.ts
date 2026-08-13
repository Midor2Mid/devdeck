import { describe, it, expect } from "vitest"
import { chooseBind, isExpired } from "../src/main/guards"

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
})
