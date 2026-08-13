# Remote Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DevDeck's single non-expiring plaintext remote token with per-device tokens that can be revoked individually, an idle expiry enforced at connect time, secrets held in the encrypted store, and a bind that the user chooses rather than one the app guesses.

**Architecture:** A new main-process module `src/main/devices.ts` owns device records and the pairing token, encrypted at rest with `safeStorage` exactly as `aikeys.ts` does. Pure decision logic — expiry, bind selection — lives in `src/main/guards.ts`, which is already the repo's home for unit-testable security logic. `server.ts`'s two auth points call into `devices.ts`; the renderer never receives a device token.

**Tech Stack:** TypeScript, Electron main process, `ws`, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-remote-hardening-design.md`

## Global Constraints

- 4-space indentation, double quotes for strings.
- **A device token must never reach the renderer.** `gitpat.ts` returns a boolean and `aikeys.ts` returns a status map for exactly this reason; follow that.
- **No hard-coded colours or sizes in components** — design tokens only. The app ships 7 themes × 12 styles.
- **State shown in form, not colour alone**; exactly one accent per frame; icons from `Icon.tsx`; no emoji.
- `npm run typecheck` must end at **zero errors** — the build does not typecheck.
- `npx vitest run` must pass. Baseline is **524 tests**.
- A zustand selector returning a fresh array or object causes an infinite render loop no test or typecheck catches.
- Conventional commit messages.
- **Never run `npm run dev`.**
- This feature is the app's largest attack surface. Where a choice exists between failing closed and degrading to something permissive, fail closed.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/main/guards.ts` | Pure expiry + bind decisions, beside the existing token/SSRF/SQL guards. | Modify |
| `src/main/devices.ts` | Device records + pairing token, encrypted at rest. | **Create** |
| `src/main/server.ts` | Auth at both entry points; bind selection; issue a device token. | Modify |
| `src/main/index.ts` | IPC for the device list, rename, revoke, pairing token. | Modify |
| `src/preload/index.ts` | `window.api.devices.*` + types. | Modify |
| `src/renderer/src/settings.ts` | `remote.bind`, `remote.deviceTtlDays`; drop `remote.token`. | Modify |
| `src/renderer/src/components/SettingsModal.tsx` | Bind chooser, expiry chooser, device list. | Modify |
| `tests/guards.test.ts` | Expiry + bind tests. | Modify or create |
| `tests/devices.test.ts` | Store behaviour with `electron` mocked. | **Create** |

---

### Task 1: Pure decisions in `guards.ts`

Expiry and bind selection are decisions, not I/O. They belong beside `tokenOk`, `isBlockedRemoteUrl` and `isReadOnlySql` — the file's own header says it exists so security logic can be unit-tested without Electron.

**Files:**
- Modify: `src/main/guards.ts`
- Test: `tests/guards.test.ts` (create if absent; check first)

**Interfaces produced:**

```ts
export type BindMode = "tailscale" | "lan" | "auto"
export type BindChoice = { ok: true; host: string } | { ok: false; reason: string }
export function chooseBind(mode: BindMode, addrs: { tailscale: string[]; lan: string[] }): BindChoice
export function isExpired(lastSeenAt: number, ttlDays: number, now: number): boolean
```

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/guards.test.ts`
Expected: FAIL — neither function exists.

- [ ] **Step 3: Implement**

Append to `src/main/guards.ts`:

```typescript
export type BindMode = "tailscale" | "lan" | "auto"
export type BindChoice = { ok: true; host: string } | { ok: false; reason: string }

/**
 * Which interface the remote server binds. This used to be
 * `tailscale[0] ?? "0.0.0.0"`, which meant asking for a private bind and getting
 * a network-wide one whenever the tailnet was down — the request silently
 * inverted, with full terminal access on the other side of it. Asking for
 * tailscale and not getting it is now a refusal to start.
 */
export function chooseBind(
    mode: BindMode,
    addrs: { tailscale: string[]; lan: string[] }
): BindChoice {
    const tail = addrs.tailscale[0]
    if (mode === "tailscale") {
        return tail
            ? { ok: true, host: tail }
            : { ok: false, reason: "No tailnet address found. Start Tailscale, or choose Local network." }
    }
    if (mode === "auto" && tail) return { ok: true, host: tail }
    if (addrs.lan.length === 0 && !tail) {
        return { ok: false, reason: "No network interface found to bind." }
    }
    return { ok: true, host: "0.0.0.0" }
}

/**
 * Has a paired device been idle longer than the policy allows? `ttlDays: 0`
 * means never. A `lastSeenAt` in the future is treated as current rather than
 * expired: clock skew or a restored backup should not lock someone out of their
 * own machine.
 */
export function isExpired(lastSeenAt: number, ttlDays: number, now: number): boolean {
    if (!ttlDays) return false
    return now - lastSeenAt > ttlDays * 86_400_000
}
```

- [ ] **Step 4: Run the tests, then the suite**

Run: `npx vitest run tests/guards.test.ts && npx vitest run && npm run typecheck`
Expected: new tests pass, suite green, zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/guards.ts tests/guards.test.ts
git commit -m "feat(remote): pure bind and expiry decisions"
```

---

### Task 2: `devices.ts` — the encrypted device store

**Files:**
- Create: `src/main/devices.ts`
- Test: `tests/devices.test.ts`

**Interfaces:**
- Consumes: `isExpired` from Task 1.
- Produces:

```ts
export interface RemoteDevice {
    id: string
    name: string
    createdAt: number
    lastSeenAt: number
    userAgent: string
}
export type AuthResult =
    | { ok: false }
    | { ok: true; device: RemoteDevice; deviceToken?: string }

export function pairingToken(): string
export function regeneratePairingToken(): string
export function authenticate(token: string, userAgent: string, ttlDays: number): AuthResult
export function listDevices(ttlDays: number): RemoteDevice[]
export function renameDevice(id: string, name: string): void
export function revokeDevice(id: string): void
export function deviceName(userAgent: string): string
```

Follow `src/main/aikeys.ts` closely: same `storeFile()`/`load()`/`save()` shape, the same `encrypt`/`decrypt` with the `enc:`/`b64:` prefixes and `safeStorage` fallback, the same `atomicWrite`. Store file is `remote-devices.json` in `app.getPath("userData")`.

Design notes the implementer must honour:

- **`RemoteDevice` carries no token.** The token lives in a separate map inside the store file keyed by device id, so the record the renderer receives cannot accidentally include it. This is the same separation `aikeys.ts` gets by returning `status()` instead of keys.
- **`authenticate` order matters.** Check device tokens first, then the pairing token. A device whose record has expired must fail *and be removed* before the pairing-token branch runs, so a stale device re-pairs cleanly rather than resurrecting.
- **Token comparison uses `tokenOk`** from `guards.ts` — constant-time, already tested. Never `===`.
- `deviceName` is a small readable guess from the user-agent ("iPhone · Safari", "Android · Chrome", "Unknown device"). It is cosmetic; keep it simple and do not parse exhaustively.
- Tokens are `randomBytes(32).toString("hex")` from `crypto`.

- [ ] **Step 1: Write the failing tests**

`tests/devices.test.ts`, mocking `electron` as `tests/aikeys.test.ts` does — read that file first and copy its mock setup, including a temp `userData` path so tests do not touch the real store.

```typescript
describe("authenticate", () => {
    it("enrols a new device when given the pairing token, and returns its token", () => {
        const pt = pairingToken()
        const r = authenticate(pt, "iPhone Safari", 30)
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.deviceToken).toBeTruthy()
            expect(r.deviceToken).not.toBe(pt)
            expect(r.device.id).toBeTruthy()
        }
    })

    it("accepts a device token on later connections and issues no new one", () => {
        const first = authenticate(pairingToken(), "iPhone Safari", 30)
        const token = first.ok ? first.deviceToken! : ""
        const again = authenticate(token, "iPhone Safari", 30)
        expect(again.ok).toBe(true)
        if (again.ok) expect(again.deviceToken).toBeUndefined()
    })

    it("rejects an unknown token", () => {
        expect(authenticate("not-a-real-token", "x", 30).ok).toBe(false)
    })

    it("rejects a revoked device and leaves the others working", () => {
        // The property the whole feature exists for.
        const a = authenticate(pairingToken(), "phone A", 30)
        const b = authenticate(pairingToken(), "phone B", 30)
        const tokenA = a.ok ? a.deviceToken! : ""
        const tokenB = b.ok ? b.deviceToken! : ""
        revokeDevice(a.ok ? a.device.id : "")
        expect(authenticate(tokenA, "phone A", 30).ok).toBe(false)
        expect(authenticate(tokenB, "phone B", 30).ok).toBe(true)
    })

    it("rejects an expired device and drops its record", () => {
        const r = authenticate(pairingToken(), "old phone", 30)
        const token = r.ok ? r.deviceToken! : ""
        const id = r.ok ? r.device.id : ""
        // Age it past the window by rewriting lastSeenAt through the store.
        expireForTest(id, Date.now() - 31 * 86_400_000)
        expect(authenticate(token, "old phone", 30).ok).toBe(false)
        expect(listDevices(30).some((d) => d.id === id)).toBe(false)
    })

    it("never expires anything when ttlDays is 0", () => {
        const r = authenticate(pairingToken(), "kiosk", 0)
        const token = r.ok ? r.deviceToken! : ""
        expireForTest(r.ok ? r.device.id : "", Date.now() - 3650 * 86_400_000)
        expect(authenticate(token, "kiosk", 0).ok).toBe(true)
    })

    it("stamps lastSeenAt on a successful connection", () => {
        const r = authenticate(pairingToken(), "phone", 30)
        const id = r.ok ? r.device.id : ""
        expireForTest(id, 1000)
        authenticate(r.ok ? r.deviceToken! : "", "phone", 30)
        expect(listDevices(0).find((d) => d.id === id)!.lastSeenAt).toBeGreaterThan(1000)
    })
})

describe("listDevices", () => {
    it("never returns a token field", () => {
        authenticate(pairingToken(), "phone", 30)
        for (const d of listDevices(30)) {
            expect(Object.keys(d)).not.toContain("token")
            expect(JSON.stringify(d)).not.toMatch(/[0-9a-f]{64}/)
        }
    })

    it("prunes expired records as it reads", () => {
        const r = authenticate(pairingToken(), "phone", 30)
        expireForTest(r.ok ? r.device.id : "", Date.now() - 31 * 86_400_000)
        expect(listDevices(30)).toHaveLength(0)
    })
})

describe("regeneratePairingToken", () => {
    it("invalidates the old pairing token but not paired devices", () => {
        const old = pairingToken()
        const paired = authenticate(old, "phone", 30)
        const token = paired.ok ? paired.deviceToken! : ""
        regeneratePairingToken()
        expect(authenticate(old, "another phone", 30).ok).toBe(false)
        expect(authenticate(token, "phone", 30).ok).toBe(true)
    })
})
```

`expireForTest(id, at)` is a test-only export on `devices.ts` — name it clearly as such in a comment. It is worth the small ugliness: the alternative is faking the clock across a module that also writes files.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/devices.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement `devices.ts`**

Following `aikeys.ts`'s structure. Store shape:

```typescript
interface Store {
    /** Pairing token, encrypted. Minted on first read. */
    pairing: string
    devices: RemoteDevice[]
    /** deviceId -> encrypted device token. Separate from the records so a
        record handed to the renderer cannot carry a secret by accident. */
    tokens: Record<string, string>
}
```

- [ ] **Step 4: Tests, suite, typecheck**

Run: `npx vitest run tests/devices.test.ts && npx vitest run && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/main/devices.ts tests/devices.test.ts
git commit -m "feat(remote): encrypted per-device token store"
```

---

### Task 3: Wire the server to devices and the chosen bind

**Files:**
- Modify: `src/main/server.ts`

**Interfaces:**
- Consumes: `authenticate`, `touch` semantics from Task 2; `chooseBind` from Task 1.
- Produces: `start()` returns/throws a legible refusal when the bind cannot be honoured; `ServerConfig` gains `bind` and `deviceTtlDays` and loses `token`.

- [ ] **Step 1: Authenticate both entry points**

`handleRequest` (`server.ts:113`) and `verifyClient` (`server.ts:148`) both currently call `tokenOk(url.searchParams.get("token"), config.token)`. Replace with a shared helper in `server.ts`:

```typescript
    // Either a device's own token or the pairing token gets you in; only the
    // pairing token mints a new device. Both entry points must agree, so this is
    // written once — an auth check that exists twice eventually disagrees.
    const authFor = (url: URL, userAgent: string): AuthResult =>
        authenticate(url.searchParams.get("token") ?? "", userAgent, config.deviceTtlDays)
```

On the HTTP path, when `authenticate` returns a `deviceToken`, the response must hand it to the client. Set it as a `Set-Cookie`-free inline value: serve `CLIENT_HTML` with a `<script>window.__DEVDECK_DEVICE_TOKEN__ = "…"</script>` injected ahead of the body, and let Task 4's client script pick it up. Do not put it in the URL.

`verifyClient` cannot inject anything; it only accepts or rejects. A WebSocket connecting with the pairing token will enrol a device whose token the socket never learns — acceptable, because the HTML always loads first in the real flow.

- [ ] **Step 2: Bind by choice, and refuse when it cannot be honoured**

Replace `const host = addrs.tailscale[0] ?? "0.0.0.0"` (`server.ts:340`) with `chooseBind(config.bind, addrs)`. On `{ ok: false }`, do not start the server: leave `httpServer` null and reject with the `reason` so the renderer can show it verbatim.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` — expect errors at the call sites in `index.ts` until Task 4; fix those there, not by loosening types here.

- [ ] **Step 4: Commit**

```bash
git add src/main/server.ts
git commit -m "feat(remote): per-device auth and an explicit bind"
```

---

### Task 4: IPC, preload, settings, and the client

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/settings.ts`, `src/main/server.ts` (the `CLIENT_HTML` string)

- [ ] **Step 1: IPC**

Add handlers beside the existing `server:*` ones (`index.ts:264`): `devices:list`, `devices:rename`, `devices:revoke`, `devices:pairingToken`, `devices:regeneratePairingToken`. `devices:list` returns `RemoteDevice[]` — **assert to yourself that no token can reach this call's return value** before moving on.

- [ ] **Step 2: Preload**

`window.api.devices.*` mirroring those, plus the `RemoteDevice` type export.

- [ ] **Step 3: Settings**

Also, from Task 3's review, two things this step must not leave alone:

- `applyServer()` calls `start()` with **no `.catch`**, so a bind refusal is an
  unhandled rejection and the panel keeps showing stale state. It also no longer
  calls `stop()` first, so a refused re-bind now leaves the *previous, wider*
  server running. Catch it, stop the old server, and surface `reason` verbatim.
- Migrating existing installs to `"auto"` means an install whose tailnet is down
  binds every interface. That is the same exposure H1 described, now reached
  through a persisted explicit choice rather than an undefined one. The UI in
  Task 5 must say so on the `auto` option in plain words, not bury it.


In `src/renderer/src/settings.ts`:
- Add `remote.bind: BindMode` (default `"tailscale"` for new installs) and `remote.deviceTtlDays: number` (default `30`).
- **Remove `remote.token`.** On load, if a legacy `raw.remote.token` exists, hand it to main once so it becomes the pairing token, then drop it from settings — a one-way migration, and the old plaintext value must not be written back.
- Existing installs migrate `bind` to `"auto"`, not `"tailscale"`: today's behaviour keeps working and the panel invites a choice. A new install gets `"tailscale"`.
- Delete `generateToken` and `regenerateToken` if nothing else uses them — check first; the MCP server also mints a bearer token (`settings.ts:666`).

- [ ] **Step 4: The client — a cookie, not localStorage**

**This step is load-bearing, not polish.** Task 3 made the WebSocket accept device
tokens only, so a client that still presents the pairing token on its socket is
refused and pairing fails silently at the last step. Nothing works until this lands.

The original design here — stash the device token in `localStorage`, strip it from
the URL — **cannot survive a page reload**, and the flaw is structural rather than
a detail. A reload issues an HTTP request before any script runs, so it arrives
with no credential at all, gets a 401, and the `localStorage` branch is never
reached. The token has to travel on the request itself.

Use a cookie. On the enrolment response, alongside the injected script:

```
Set-Cookie: devdeck_device=<token>; HttpOnly; SameSite=Strict; Path=/; Max-Age=…
```

with `Secure` added when `config.tls` is on. The browser then presents it
automatically on later page loads **and on the WebSocket upgrade**, which is the
same origin — so `verifyClient` reads it from the `Cookie` header.

This is better than what it replaces on three counts: a reload works; the token
never appears in a URL, so it cannot reach the address bar, browser history, or a
screenshot; and `HttpOnly` puts it out of reach of any script on the page, which
`localStorage` cannot do.

Auth precedence at both entry points becomes: **cookie first, then the `?token=`
query parameter** (the pairing path). Keep the injected
`window.__DEVDECK_DEVICE_TOKEN__` only if it earns its place after the cookie
works — most likely it does not, and deleting it removes a credential from the
page's script scope for nothing.

The client still calls `history.replaceState` to drop `?token=` from the address
bar after a successful pairing load, for the same reason as before.

Add a test that the WebSocket accepts a device token presented **only** as a
cookie, since that is now the sole path a returning device has.

- [ ] **Step 5: Typecheck and suite**

Run: `npm run typecheck && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/settings.ts src/main/server.ts
git commit -m "feat(remote): device IPC, settings migration, and client token storage"
```

---

### Task 5: The Settings UI

**Files:**
- Modify: `src/renderer/src/components/SettingsModal.tsx` (`RemoteSection`, ~line 1336)
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Bind chooser**

Three options — **Tailscale / VPN**, **Local network**, **Auto (legacy)** — as a segmented control following DESIGN.md's active-state grammar (tint fill **plus** font-weight 600; the tint alone does not clear the contrast floor on Washi). Each carries one line saying what it means, and the LAN option says plainly that every device on the network can reach a full terminal.

When the server refuses to start, show the `reason` verbatim where the status block goes. Do not paraphrase it into something reassuring.

- [ ] **Step 2: Expiry chooser**

**7 days · 30 days · Never**, same segmented idiom, with one line: how long an idle device stays paired, and that using a device resets its window.

- [ ] **Step 3: Device list**

One row per paired device: name (click to rename, inline), last seen as relative time, and a neutral **Revoke** button. Empty state says no devices are paired yet and points at the QR code. Keep the single accent on whatever the section's primary action already is — a Revoke button per row must be neutral, or a list of five devices puts five accents on screen.

- [ ] **Step 4: Typecheck, suite, and the app**

`npm run typecheck && npx vitest run`, then `npx electron-vite build` and verify with the **`run-app` skill**, using an **isolated `userDataDir`** — the default profile holds real projects. Check Slate and Washi. Note `Page.captureScreenshot` has been timing out in this environment; `Runtime.evaluate` + `getComputedStyle` is the fallback previous agents used.

Verify specifically: the bind chooser renders three options and selecting Tailscale with no tailnet address shows the refusal rather than starting.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SettingsModal.tsx src/renderer/src/styles.css
git commit -m "feat(remote): bind chooser, expiry policy, and the paired-device list"
```

---

### Task 6: Document the contract

**Files:** `DESIGN.md` if the segmented controls introduce anything new; `NOTES.md`; `CHANGELOG.md` under a new unreleased heading.

- [ ] **Step 1: Record what changed and what did not**

`NOTES.md`: remote is still full RCE for a paired device — this work changes *who gets in*, not *what they can do*. Per-device capability scoping is the next step and is deliberately not in this change.

- [ ] **Step 2: Commit**

```bash
git add NOTES.md CHANGELOG.md DESIGN.md
git commit -m "docs: record the remote hardening contract"
```

---

## Definition of done

- `npm run typecheck` at zero, `npx vitest run` green.
- Revoking one device leaves every other device working — asserted by test.
- No API reachable from the renderer can return a device token — asserted by test.
- Choosing Tailscale with no tailnet address refuses to start and says why, rather than binding `0.0.0.0`.
- A legacy install's plaintext `remote.token` is migrated into the encrypted store and removed from settings.json.
- The pairing token is stripped from the address bar after enrolment.
