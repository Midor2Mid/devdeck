import { describe, it, expect } from "vitest"

/**
 * The bind-vs-available divergence, as pure logic.
 *
 * `server.ts` picks its interface once, inside start(): a Tailscale address if
 * one exists, else 0.0.0.0 (every interface, LAN included). Bring Tailscale up
 * afterwards and the *available* list gains a private address while the socket
 * is still on 0.0.0.0 — so a panel that reads the available list tells you
 * you're private when you are not. These are the three states the UI derives.
 */
function remoteView(status: {
    running: boolean
    boundHost: string | null
    tailscale: string[]
    lan: string[]
}): { reach: "tailnet" | "wifi" | "down"; qrHost: string; staleBind: boolean } {
    const bound = status.boundHost
    const onTailnet = !!bound && bound !== "0.0.0.0"
    return {
        reach: !status.running || !bound ? "down" : onTailnet ? "tailnet" : "wifi",
        // 0.0.0.0 isn't dialable — a phone needs the concrete LAN address.
        qrHost: onTailnet ? bound : (status.lan[0] ?? ""),
        staleBind: !!bound && !onTailnet && status.tailscale.length > 0
    }
}

const LAN = ["192.168.1.20"]
const TS = ["100.101.102.103"]

describe("remote reachability", () => {
    it("bound to a tailnet address = reachable anywhere on the tailnet", () => {
        const v = remoteView({ running: true, boundHost: TS[0], tailscale: TS, lan: LAN })
        expect(v.reach).toBe("tailnet")
        expect(v.qrHost).toBe(TS[0])
        expect(v.staleBind).toBe(false)
    })

    it("bound to 0.0.0.0 with no tailnet = same Wi-Fi only", () => {
        const v = remoteView({ running: true, boundHost: "0.0.0.0", tailscale: [], lan: LAN })
        expect(v.reach).toBe("wifi")
        // The QR must carry a dialable address, never 0.0.0.0.
        expect(v.qrHost).toBe(LAN[0])
        expect(v.staleBind).toBe(false)
    })

    it("stopped server reports down and no host", () => {
        const v = remoteView({ running: false, boundHost: null, tailscale: TS, lan: LAN })
        expect(v.reach).toBe("down")
    })

    // The actual bug: Tailscale installed while the server was already running.
    it("flags a stale bind when a tailnet address appears after start", () => {
        const v = remoteView({ running: true, boundHost: "0.0.0.0", tailscale: TS, lan: LAN })
        expect(v.staleBind).toBe(true)
        // And it must NOT claim the tailnet address, which is the misleading part.
        expect(v.reach).toBe("wifi")
        expect(v.qrHost).toBe(LAN[0])
    })

    it("clears the stale flag once restarted onto the tailnet", () => {
        const before = remoteView({ running: true, boundHost: "0.0.0.0", tailscale: TS, lan: LAN })
        const after = remoteView({ running: true, boundHost: TS[0], tailscale: TS, lan: LAN })
        expect(before.staleBind).toBe(true)
        expect(after.staleBind).toBe(false)
        expect(after.reach).toBe("tailnet")
    })

    it("does not flag a stale bind when there is no tailnet to move to", () => {
        const v = remoteView({ running: true, boundHost: "0.0.0.0", tailscale: [], lan: LAN })
        expect(v.staleBind).toBe(false)
    })

    it("yields an empty host when there is no usable address at all", () => {
        const v = remoteView({ running: true, boundHost: "0.0.0.0", tailscale: [], lan: [] })
        expect(v.qrHost).toBe("")
    })
})
