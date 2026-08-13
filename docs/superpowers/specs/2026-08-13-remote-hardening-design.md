# Remote hardening — paired devices, expiry, and an explicit bind

**Status:** approved design, not yet implemented
**Date:** 2026-08-13

## The problem

DevDeck's remote server is not a status viewer. A client that gets in can attach
to any terminal and type into it, write files anywhere inside an open project,
run read-only SQL against saved database connections, relay HTTP requests, and
upload files. `server.ts:87` says so plainly in a comment. It is remote code
execution by design, which is the point of the feature.

Four things guard it, and all four are weaker than the capability warrants:

1. **One shared token, no expiry.** Minted on first enable (`settings.ts:653`),
   valid forever until manually rotated. Every client that has ever been given
   the URL keeps working indefinitely.
2. **No device identity.** The server's `Client` type tracks only which terminals
   a socket is watching. There is no way to see what is connected, name it, or
   revoke one phone without rotating the token and kicking off everything.
3. **Plaintext at rest.** The token lives in `AppSettings.remote.token` in
   settings.json — while this same codebase encrypts git PATs (`gitpat.ts`) and
   agent API keys (`aikeys.ts`) at rest. The most dangerous secret in the app is
   the least protected.
4. **A silent bind decision.** `start()` binds `addrs.tailscale[0] ?? "0.0.0.0"`
   (`server.ts:340`). With no tailnet address the app exposes full RCE to the
   entire local network, chosen by a heuristic, surfaced only as a warning line.

The fix is not to reduce what remote can do. It is to make getting in
per-device, expiring, and explicitly scoped.

## Paired devices

The settings token stops being the credential and becomes a **pairing token**,
used once to enrol a device.

- A client arriving with a valid pairing token is served the app and issued a
  **device token** (32 random bytes) plus a device record. The client stores the
  device token in `localStorage` and uses it from then on.
- Both the HTTP handler and the WebSocket `verifyClient` accept **either** a
  valid device token or the pairing token. Pairing stays possible from a second
  phone without rotating anything.
- A device record is `{ id, name, token, createdAt, lastSeenAt, userAgent }`.
  `name` defaults to a readable guess from the user-agent ("iPhone · Safari") and
  is user-editable.
- `lastSeenAt` is stamped on every successful WebSocket connection, not on every
  message — one write per connection, not per keystroke.

Revoking a device deletes its record. That device's token stops working
immediately on its next connection; every other device is unaffected. This is the
capability the current design cannot express at all.

## Expiry

Per-device idle expiry, with the window a single setting: **7 days · 30 days ·
never**, defaulting to 30. A device whose `lastSeenAt` is older than the window is
refused and its record dropped.

Expiry is enforced **at connection time**, not by a background timer — a sweep
that runs while the app is closed is meaningless, and the only moment that
matters is when a stale device tries to get back in. The settings list prunes
expired records when it renders, so the UI never shows a device that would be
refused.

"Never" is offered because a permanently-paired tablet on a private tailnet is a
legitimate setup, and a expiry policy nobody can opt out of gets worked around by
leaving the token in a note somewhere.

## Encrypted at rest

Device records and the pairing token move out of settings.json into a dedicated
main-process store encrypted with `safeStorage`, following `aikeys.ts` — the
established pattern in this codebase for exactly this problem. The renderer never
sees a device token; it receives only `{ id, name, createdAt, lastSeenAt }` for
display, the same way `gitpat.ts` exposes a boolean rather than the PAT.

The pairing token is still shown in Settings, because you cannot pair without
reading it. It is the one secret with a reason to be visible.

## The bind becomes a choice

`remote.bind` replaces the silent fallback:

| Value | Behaviour |
| --- | --- |
| `"tailscale"` | Bind the first tailnet address. **If none exists, refuse to start** and say why. |
| `"lan"` | Bind `0.0.0.0`. The UI states plainly that every device on the network can reach it. |
| `"auto"` | Today's behaviour: tailnet if present, otherwise `0.0.0.0`. |

New installs default to `"tailscale"`. Existing configs migrate to `"auto"` so
nothing that works today silently stops, but the panel flags `"auto"` as the
legacy choice and invites picking one.

**Refusing to start is the point.** The current fallback quietly converts "I want
this private" into "this is on the office Wi-Fi", and the only signal is a warning
line most people will not read. A feature that cannot honour the safe option
should stop rather than substitute the unsafe one.

Cloudflare-style public tunnelling is deliberately **not** included. Publishing an
RCE endpoint to the open internet is not a default this app should make available,
whatever label sits next to it.

## Interfaces

Main process, new module `src/main/devices.ts`:

```ts
export interface RemoteDevice {
    id: string
    name: string
    createdAt: number
    lastSeenAt: number
    userAgent: string
}
/** What the renderer is allowed to see — never the token. */
export type RemoteDevicePublic = Omit<RemoteDevice, never>

export function pairingToken(): string
export function regeneratePairingToken(): string
/** Valid device token, or the pairing token → enrols and returns the new device. */
export function authenticate(token: string, userAgent: string, ttlDays: number):
    { ok: false } | { ok: true; deviceToken?: string; device: RemoteDevice }
export function listDevices(ttlDays: number): RemoteDevicePublic[]
export function renameDevice(id: string, name: string): void
export function revokeDevice(id: string): void
export function touchDevice(id: string): void
```

`authenticate` returns `deviceToken` only on a fresh enrolment; an existing device
authenticating gets `{ ok: true, device }` with no token to hand back.

Settings gains `remote.bind: "tailscale" | "lan" | "auto"` and
`remote.deviceTtlDays: 7 | 30 | 0` (0 = never). `remote.token` is removed from
settings; reads migrate to the encrypted store on first run.

## The client

`CLIENT_HTML` changes in two small ways: on load it reads a device token from
`localStorage`, falling back to the `?token=` pairing token in the URL; and when
the server returns a freshly-issued device token it stores it and strips the
pairing token from the address bar with `history.replaceState`, so a screenshot or
a shared URL no longer carries a working credential.

## Testing

`guards.ts` is the existing home for unit-testable security logic and gets the new
pure parts; `devices.ts` follows `aikeys.ts` in being tested with `electron`
mocked.

- `authenticate`: a valid device token passes; the pairing token enrols and
  returns a new token; an unknown token fails; a revoked device's token fails; a
  device past the TTL fails **and is dropped**; `ttlDays: 0` never expires.
- Two enrolments produce two records with different tokens, and revoking one
  leaves the other working — the property the whole design exists for.
- `listDevices` never returns a token field, asserted directly.
- Bind selection is a pure function of `(bind, addresses)` and gets a table test,
  including the case that matters: `"tailscale"` with no tailnet address returns
  a refusal rather than `0.0.0.0`.

## Out of scope

- Public tunnelling of any kind.
- Per-device capability scoping (a read-only device). Worth having later; it needs
  the server's message handlers to carry a permission check, which is a larger
  change than this.
- Rate limiting or brute-force lockout on the pairing token. 24 random bytes is
  not guessable; the exposure this spec closes is a leaked URL, not a guessed one.
- Any change to what a paired device can do once in.
