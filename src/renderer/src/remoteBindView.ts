// Pure derivation of the Remote settings panel's bind-status view from the
// server's raw status plus the user's bind/tls choices. Extracted out of
// RemoteSection (SettingsModal.tsx) specifically so the two exposure-sensitive
// conditions below can be unit tested directly.
//
// That matters here because the running app can't exercise the "Tailscale is
// installed but the server bound wider anyway" branch safely: contextBridge
// deep-freezes `window.api` (confirmed via the CDP harness - both plain
// reassignment and `Object.defineProperty` on `window.api.server.status`
// fail: "Cannot redefine property"), so IPC responses can't be mocked from
// the renderer, and this dev machine has no real Tailscale interface to
// produce the scenario for real. Binding "lan"/"auto" for real to manufacture
// it would expose this machine's actual Wi-Fi, which is exactly the thing
// this file exists to warn about - not an acceptable price for a test. A
// pure function taking plain data is the only way left to pin the branch
// down; see tests/remoteBindView.test.ts.
import type { ServerStatus, BindMode } from "../../preload/index"

export interface RemoteBindView {
    /** The server is actually reachable on a Tailscale address, not 0.0.0.0. */
    onTailnet: boolean
    /**
     * Bound to 0.0.0.0 - every interface on this machine, not just this
     * Wi-Fi. If Tailscale is up, that INCLUDES the tailnet interface: a
     * status line that says "this Wi-Fi only" in this state is false, since
     * any tailnet peer can reach it too. Drives the running-status line so
     * it states reach correctly instead of assuming "not on Tailscale" means
     * "just this Wi-Fi".
     */
    boundWide: boolean
    /**
     * Tailscale came up after a bind that would now prefer it. Only "auto" is
     * defined to re-pick Tailscale when it appears, so that is the only mode
     * a "stale" bind means anything for - "lan" always resolves to 0.0.0.0 by
     * design (see `chooseBind` in main/guards.ts) regardless of whether
     * Tailscale is present, so Tailscale appearing later is irrelevant to a
     * choice that was never about it, not stale. Without this gate, a
     * deliberate "lan" pick with Tailscale installed showed this banner
     * permanently, and its own "Restart to bind privately" advice re-ran
     * `chooseBind("lan", …)`, got 0.0.0.0 again, and the banner never
     * cleared - the fix H1 in the Task 5 review closes.
     */
    staleBind: boolean
    /**
     * The dialable link is a plain LAN `http://` with no TLS. Keyed on what
     * is actually bound (`onTailnet`), not on whether Tailscale merely
     * happens to be *installed*: a "lan"/"auto" pick with Tailscale present
     * still binds 0.0.0.0 and serves a plain-LAN link, which is exactly the
     * situation this must warn about. Keying it off Tailscale's mere
     * availability (the pre-fix condition) suppressed the warning in
     * precisely that case - the fix H2 in the Task 5 review closes.
     */
    unencryptedLan: boolean
}

export function deriveRemoteBindView(
    status: Pick<ServerStatus, "boundHost" | "tailscale"> | null,
    bind: BindMode,
    tls: boolean
): RemoteBindView {
    const bound = status?.boundHost ?? null
    const onTailnet = !!bound && bound !== "0.0.0.0"
    const boundWide = bound === "0.0.0.0"
    const staleBind =
        bind === "auto" && !!bound && !onTailnet && (status?.tailscale.length ?? 0) > 0
    const unencryptedLan = !onTailnet && !tls
    return { onTailnet, boundWide, staleBind, unencryptedLan }
}
