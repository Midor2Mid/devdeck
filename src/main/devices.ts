import { app, safeStorage } from "electron"
import { join } from "path"
import { readFileSync } from "fs"
import { randomBytes } from "crypto"
import { atomicWrite } from "./atomic"
import { isExpired, tokenOk } from "./guards"

// Per-device pairing for the remote server, encrypted at rest (DPAPI via
// safeStorage, base64 fallback) - same scheme as AI keys and Git PATs. Each
// paired device gets its own revocable, idle-expiring token instead of the
// single shared token that used to live in settings.json forever.

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

interface Store {
    /** Pairing token, encrypted. Minted on first read. */
    pairing: string
    devices: RemoteDevice[]
    /** deviceId -> encrypted device token. Separate from the records so a
        record handed to the renderer cannot carry a secret by accident. */
    tokens: Record<string, string>
}

function storeFile(): string {
    return join(app.getPath("userData"), "remote-devices.json")
}
function load(): Store {
    try {
        const s = JSON.parse(readFileSync(storeFile(), "utf8")) as Store
        return {
            pairing: typeof s.pairing === "string" ? s.pairing : "",
            // A hand-corrupted `"devices": {}` would otherwise blow up the
            // `for...of` loops in authenticate/listDevices on every request.
            devices: Array.isArray(s.devices) ? s.devices : [],
            tokens: s.tokens && typeof s.tokens === "object" ? s.tokens : {}
        }
    } catch {
        return { pairing: "", devices: [], tokens: {} }
    }
}
function writeStore(store: Store): void {
    atomicWrite(storeFile(), JSON.stringify(store, null, 2))
}
function save(store: Store): void {
    try {
        writeStore(store)
    } catch (err) {
        console.error("[devices] failed to save:", err)
    }
}
/** Cap attacker/user-supplied strings before they land in the store and the UI. */
function cap(s: string, max = 200): string {
    return typeof s === "string" ? s.slice(0, max) : ""
}

function encrypt(plain: string): string {
    if (!plain) return ""
    try {
        if (safeStorage.isEncryptionAvailable()) {
            return "enc:" + safeStorage.encryptString(plain).toString("base64")
        }
    } catch {
        /* fall through */
    }
    return "b64:" + Buffer.from(plain, "utf8").toString("base64")
}
function decrypt(enc?: string): string {
    if (!enc) return ""
    try {
        if (enc.startsWith("enc:")) {
            return safeStorage.decryptString(Buffer.from(enc.slice(4), "base64"))
        }
        if (enc.startsWith("b64:")) {
            return Buffer.from(enc.slice(4), "base64").toString("utf8")
        }
    } catch (err) {
        console.error("[devices] failed to decrypt:", err)
    }
    return ""
}

function newToken(): string {
    return randomBytes(32).toString("hex")
}

/** Mint the pairing token into `store` if it isn't set yet. Mutates `store.pairing`. */
function ensurePairing(store: Store): string {
    const existing = decrypt(store.pairing)
    if (existing) return existing
    const token = newToken()
    store.pairing = encrypt(token)
    return token
}

/**
 * Return a copy of the record with no secret fields, safe to hand to the
 * renderer. Built field-by-field rather than `{ ...device }` so the
 * guarantee is structural: a tampered store file (or a later field added to
 * the on-disk shape) can't smuggle an extra key through this boundary.
 */
function toPublic(device: RemoteDevice): RemoteDevice {
    return {
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
        userAgent: device.userAgent
    }
}

/** Remove a device's record and its token together - they must never be split. */
function drop(store: Store, id: string): void {
    store.devices = store.devices.filter((d) => d.id !== id)
    delete store.tokens[id]
}

/** Current pairing token, minting one on first use. */
export function pairingToken(): string {
    const store = load()
    const before = store.pairing
    const token = ensurePairing(store)
    if (store.pairing !== before) save(store)
    return token
}

/** Invalidate the current pairing token and mint a fresh one. Already-paired devices are unaffected. */
export function regeneratePairingToken(): string {
    const store = load()
    const token = newToken()
    store.pairing = encrypt(token)
    save(store)
    return token
}

/**
 * One-way settings migration: adopt a legacy `remote.token` (the single
 * plaintext, non-expiring token this feature replaces) as the pairing token,
 * so a phone that already has the old URL bookmarked keeps working - it
 * re-pairs as a device on its next load instead of being locked out. Only
 * takes effect while no pairing token has been minted yet: once a real one
 * exists (freshly minted, or already migrated), a stale `remote.token` still
 * lingering in settings.json (e.g. a write that raced the migration) must
 * not stomp a token the user may since have regenerated.
 */
export function setPairingToken(token: string): void {
    if (!token) return
    const store = load()
    if (decrypt(store.pairing)) return
    store.pairing = encrypt(token)
    save(store)
}

// Below this idle gap, a successful reconnect doesn't bother re-stamping
// lastSeenAt. Expiry is day-granularity, so this loses no real precision,
// and it's what keeps a legitimate phone's every request from forcing a
// synchronous writeFileSync+renameSync on the main process's event loop -
// server.ts calls authenticate() per HTTP request and per WS upgrade.
const STAMP_INTERVAL_MS = 60_000

/**
 * Authenticate a request from the phone. Device tokens are checked first: a
 * match against an expired device fails *and* removes that device's record,
 * so it re-pairs cleanly instead of resurrecting. Only if no device token
 * matches do we fall through to the pairing token, which enrols a new device
 * - unless `allowEnroll` is false, in which case a pairing-token match is
 * simply rejected. `server.ts`'s WebSocket upgrade path passes `false`: it
 * has no way to hand a freshly-minted device token back to the client (unlike
 * the HTTP path, which can inject one into the page), and the client's own
 * reconnect-on-close loop would otherwise re-present the pairing token on
 * every dropped socket, enrolling - and synchronously writing - a fresh
 * device each time.
 *
 * Writes the store only when something actually changed (pairing minted,
 * device enrolled, device dropped, or lastSeenAt moved materially) - this is
 * an unauthenticated, unrate-limited, attacker-paced call path, so a save on
 * every rejected or no-op request would be a real cost, not just disk wear.
 */
export function authenticate(
    token: string,
    userAgent: string,
    ttlDays: number,
    allowEnroll = true
): AuthResult {
    const store = load()
    const now = Date.now()
    const pairingBefore = store.pairing

    for (const device of store.devices) {
        const deviceToken = decrypt(store.tokens[device.id])
        if (!deviceToken || !tokenOk(token, deviceToken)) continue

        if (isExpired(device.lastSeenAt, ttlDays, now)) {
            drop(store, device.id)
            save(store)
            return { ok: false }
        }

        if (now - device.lastSeenAt > STAMP_INTERVAL_MS) {
            device.lastSeenAt = now
            save(store)
        }
        return { ok: true, device: toPublic(device) }
    }

    if (!allowEnroll) return { ok: false }

    const pairing = ensurePairing(store)
    if (tokenOk(token, pairing)) {
        const deviceToken = newToken()
        const device: RemoteDevice = {
            id: randomBytes(16).toString("hex"),
            name: deviceName(userAgent),
            createdAt: now,
            lastSeenAt: now,
            userAgent: cap(userAgent)
        }
        store.devices.push(device)
        store.tokens[device.id] = encrypt(deviceToken)
        // Unlike the re-stamp write above, a failed save here must not be
        // swallowed: `save()` would hand the caller a deviceToken for a
        // record that was never actually written, so the phone looks paired
        // and then fails on every later connection. Let it throw so the
        // caller sees a real failure instead of a phantom pairing.
        writeStore(store)
        return { ok: true, device: toPublic(device), deviceToken }
    }

    // Persist a pairing token minted above (ensurePairing) so the next call
    // doesn't mint a different one - but only when it was actually minted,
    // not on every ordinary rejection.
    if (store.pairing !== pairingBefore) save(store)
    return { ok: false }
}

/** Paired, non-expired devices - prunes expired records (and their tokens) as it reads. */
export function listDevices(ttlDays: number): RemoteDevice[] {
    const store = load()
    const now = Date.now()
    const kept: RemoteDevice[] = []
    let changed = false

    for (const device of store.devices) {
        if (isExpired(device.lastSeenAt, ttlDays, now)) {
            delete store.tokens[device.id]
            changed = true
            continue
        }
        kept.push(device)
    }

    if (changed) {
        store.devices = kept
        save(store)
    }
    return kept.map(toPublic)
}

export function renameDevice(id: string, name: string): void {
    const store = load()
    const device = store.devices.find((d) => d.id === id)
    if (!device) return
    device.name = cap(name)
    save(store)
}

/**
 * Revoke a device. Unlike the other writes here, a failed save must not be
 * swallowed: revocation is the one security promise this whole feature
 * exists to deliver, and silently logging the error (as `save` does
 * elsewhere) would let a "revoked" device keep authenticating while the UI
 * reports it gone. Let the write error propagate so a caller can surface a
 * real failure instead of a false confirmation.
 */
export function revokeDevice(id: string): void {
    const store = load()
    drop(store, id)
    writeStore(store)
}

/** A small readable guess at the device from its user-agent. Cosmetic only. */
export function deviceName(userAgent: string): string {
    const ua = userAgent || ""
    const platform = /iphone/i.test(ua)
        ? "iPhone"
        : /ipad/i.test(ua)
          ? "iPad"
          : /android/i.test(ua)
            ? "Android"
            : /windows/i.test(ua)
              ? "Windows"
              : /mac os|macintosh/i.test(ua)
                ? "Mac"
                : /linux/i.test(ua)
                  ? "Linux"
                  : null
    const browser = /edg\//i.test(ua)
        ? "Edge"
        : /chrome\//i.test(ua)
          ? "Chrome"
          : /firefox\//i.test(ua)
            ? "Firefox"
            : /safari\//i.test(ua)
              ? "Safari"
              : null

    if (platform && browser) return `${platform} · ${browser}`
    if (platform) return platform
    if (browser) return browser
    return "Unknown device"
}

/**
 * TEST-ONLY: force a device's lastSeenAt through the store, to simulate idle
 * time without faking the clock across a module that also writes files. Not
 * used by the app.
 */
export function expireForTest(id: string, at: number): void {
    const store = load()
    const device = store.devices.find((d) => d.id === id)
    if (!device) return
    device.lastSeenAt = at
    save(store)
}
