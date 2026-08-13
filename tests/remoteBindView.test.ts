import { describe, it, expect } from "vitest"
import { deriveRemoteBindView } from "../src/renderer/src/remoteBindView"

// Regression coverage for the Task 5 review's H1 (staleBind fired for every
// non-"auto" bind whenever Tailscale was merely installed) and H2 (the
// unencrypted-LAN warning was suppressed by Tailscale's mere availability,
// not by what was actually bound) findings. These can't be exercised live in
// the running app - contextBridge deep-freezes window.api (no IPC mocking
// from the renderer) and this dev machine has no real Tailscale interface -
// so a pure-function table is what actually pins the fixed behaviour down.

describe("deriveRemoteBindView - staleBind (H1)", () => {
    it("fires for bind=auto when Tailscale is installed but the server is bound wide", () => {
        const status = { boundHost: "0.0.0.0", tailscale: ["100.64.1.5"] }
        expect(deriveRemoteBindView(status, "auto", false).staleBind).toBe(true)
    })

    it("does NOT fire for bind=lan in the exact same situation - a deliberate LAN pick is not stale", () => {
        const status = { boundHost: "0.0.0.0", tailscale: ["100.64.1.5"] }
        expect(deriveRemoteBindView(status, "lan", false).staleBind).toBe(false)
    })

    it("does not fire for bind=tailscale either (tailscale bind is never 0.0.0.0 in the first place)", () => {
        const status = { boundHost: "100.64.1.5", tailscale: ["100.64.1.5"] }
        expect(deriveRemoteBindView(status, "tailscale", false).staleBind).toBe(false)
    })

    it("does not fire when nothing is bound yet (status not loaded)", () => {
        expect(deriveRemoteBindView(null, "auto", false).staleBind).toBe(false)
    })

    it("does not fire for auto when no Tailscale address is available at all", () => {
        const status = { boundHost: "0.0.0.0", tailscale: [] }
        expect(deriveRemoteBindView(status, "auto", false).staleBind).toBe(false)
    })
})

describe("deriveRemoteBindView - unencryptedLan (H2)", () => {
    it("warns when bound wide (0.0.0.0) with no TLS, even though Tailscale is installed", () => {
        // This is exactly the case the pre-fix `tailscale.length === 0` key
        // suppressed: Tailscale is available (length 1) but not what's bound.
        const status = { boundHost: "0.0.0.0", tailscale: ["100.64.1.5"] }
        expect(deriveRemoteBindView(status, "lan", false).unencryptedLan).toBe(true)
    })

    it("does not warn once actually bound to a Tailscale address", () => {
        const status = { boundHost: "100.64.1.5", tailscale: ["100.64.1.5"] }
        expect(deriveRemoteBindView(status, "tailscale", false).unencryptedLan).toBe(false)
    })

    it("does not warn when TLS is on, even bound wide", () => {
        const status = { boundHost: "0.0.0.0", tailscale: [] }
        expect(deriveRemoteBindView(status, "lan", true).unencryptedLan).toBe(false)
    })

    it("reports true (not private) when status hasn't loaded yet - the caller only ever renders this " +
        "inside `url && (...)`, which is already false with no status, so this is never actually shown", () => {
        expect(deriveRemoteBindView(null, "lan", false).unencryptedLan).toBe(true)
    })
})

describe("deriveRemoteBindView - onTailnet", () => {
    it("true only when bound to a real address, not 0.0.0.0", () => {
        expect(deriveRemoteBindView({ boundHost: "100.64.1.5", tailscale: [] }, "tailscale", false).onTailnet).toBe(
            true
        )
        expect(deriveRemoteBindView({ boundHost: "0.0.0.0", tailscale: [] }, "lan", false).onTailnet).toBe(false)
        expect(deriveRemoteBindView(null, "lan", false).onTailnet).toBe(false)
    })
})
