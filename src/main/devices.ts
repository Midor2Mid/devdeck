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

/**
 * The shape safe to hand to the renderer: `RemoteDevice` minus `userAgent`.
 * Nothing in the UI displays it (it exists only to compute the cosmetic
 * `name` guess at enrolment time), and the CHANGELOG already documents the
 * wire payload as `{ id, name, createdAt, lastSeenAt }` - this is what makes
 * that literally true instead of describing a field the payload still
 * carried.
 */
export type PublicRemoteDevice = Omit<RemoteDevice, "userAgent">

export type AuthResult =
    | { ok: false }
    | { ok: true; device: PublicRemoteDevice; deviceToken?: string }

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

// Every unauthenticated HTTP request and WS upgrade calls authenticate(),
// which used to mean a synchronous readFileSync + JSON.parse (load()) AND a
// DPAPI decrypt of every paired device's token (in authenticate's loop) on
// EVERY single call - attacker-paced, on the same thread that drives the UI
// and relays every PTY. Before per-device tokens existed, rejecting a bad
// token was one in-memory hash compare; this is meant to get back close to
// that cost on the common path. (What bounds the *rate* of those calls is the
// failure throttle further down, next to `authenticate` itself.)
//
// `cachedRaw` holds the parsed (still-encrypted) store; `decryptedCache` holds
// already-decrypted token/pairing values keyed by device id (or the
// `PAIRING_KEY` sentinel for the pairing token). Both are invalidated by
// `writeStore` - devices.ts is the sole writer of remote-devices.json, so
// nothing else can make either cache stale.
//
// IMPORTANT: `load`/`writeStore` are deliberately *synchronous*. That is what
// makes two near-simultaneous enrolments safe - each call fully reads,
// mutates, and writes before another can start, so there is no interleaving
// window for two writes to race and one to clobber the other. Anyone
// converting either to async must add real locking, or a concurrent pairing-
// token use can drop a device's write.
let cachedRaw: Store | null = null
const decryptedCache = new Map<string, string>()
const PAIRING_KEY = "__pairing__"

function load(): Store {
    if (!cachedRaw) {
        try {
            const s = JSON.parse(readFileSync(storeFile(), "utf8")) as Store
            cachedRaw = {
                pairing: typeof s.pairing === "string" ? s.pairing : "",
                // A hand-corrupted `"devices": {}` would otherwise blow up the
                // `for...of` loops in authenticate/listDevices on every request.
                devices: Array.isArray(s.devices) ? s.devices : [],
                tokens: s.tokens && typeof s.tokens === "object" ? s.tokens : {}
            }
        } catch {
            cachedRaw = { pairing: "", devices: [], tokens: {} }
        }
    }
    // A fresh shallow copy per call, not the cached reference itself: callers
    // mutate whatever `load()` returns in place (push a device, delete one,
    // reassign `pairing`) before persisting it via `writeStore`/`save`. If a
    // write then fails (disk full, permissions), the mutation must not have
    // already corrupted the shared cache - the next `load()` would hand out
    // the same half-applied state, and the next SUCCESSFUL write of anything
    // else would carry it to disk for real, even though the operation that
    // produced it never actually persisted.
    return {
        pairing: cachedRaw.pairing,
        devices: cachedRaw.devices.map((d) => ({ ...d })),
        tokens: { ...cachedRaw.tokens }
    }
}
function writeStore(store: Store): void {
    atomicWrite(storeFile(), JSON.stringify(store, null, 2))
    // Only once the write actually lands: this call's (mutated, now-persisted)
    // store becomes the shared cache, and every decrypted value cached against
    // the PREVIOUS store is potentially stale (a token may have been added,
    // rotated, or dropped) and must be re-derived on next use.
    cachedRaw = store
    decryptedCache.clear()
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

/**
 * Anyone holding the pairing token can otherwise enrol devices with no limit,
 * and every additional device permanently raises the per-request cost of the
 * very authentication path this guards - one more decrypt in `authenticate`'s
 * loop, forever. A generous cap for a personal-use feature; revoking old
 * devices (or regenerating the pairing token) is the way past it, not raising
 * the number.
 */
const MAX_DEVICES = 20

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
/** `decrypt`, cached by key (a device id, or `PAIRING_KEY`) until the next write. */
function decryptCached(key: string, enc: string | undefined): string {
    const cached = decryptedCache.get(key)
    if (cached !== undefined) return cached
    const value = decrypt(enc)
    decryptedCache.set(key, value)
    return value
}

/**
 * TEST-ONLY: drop the in-memory store/decrypt cache so the next `load()`
 * re-reads from disk. Tests reset state between cases by deleting
 * remote-devices.json directly; without this the cache would keep serving a
 * previous case's in-memory store even after the file backing it is gone.
 * Not used by the app - nothing outside tests has a reason to force a re-read
 * given devices.ts is the sole writer of the file it caches.
 */
export function __resetCacheForTest(): void {
    cachedRaw = null
    decryptedCache.clear()
    // The failure throttle is module state too: without this, a case that
    // deliberately fails authentication would leave the next case inside a
    // refusal window it never asked for.
    attempts.clear()
}

function newToken(): string {
    return randomBytes(32).toString("hex")
}

/**
 * Mint the pairing token into `store` if it isn't set yet. Mutates
 * `store.pairing` so callers can tell (`store.pairing !== before`) that a
 * mint happened and needs persisting. Deliberately does NOT cache the freshly
 * minted plaintext in `decryptedCache`: the caller may still fail to persist
 * it (`authenticate`'s fallthrough uses the swallowing `save`), and caching
 * an optimistic value here would have the next call's `decryptCached` return
 * a token that was never actually written, while the store rebuilt from disk
 * disagrees. Leaving the mint uncached means a failed persist is simply
 * retried next time, instead of poisoning future reads with a value nothing
 * durable backs.
 */
function ensurePairing(store: Store): string {
    const existing = decryptCached(PAIRING_KEY, store.pairing)
    if (existing) return existing
    const token = newToken()
    store.pairing = encrypt(token)
    return token
}

/**
 * Return a copy of the record with no secret fields, safe to hand to the
 * renderer. Built field-by-field rather than `{ ...device }` so the
 * guarantee is structural: a tampered store file (or a later field added to
 * the on-disk shape) can't smuggle an extra key through this boundary -
 * `userAgent` included: it's cosmetic input already folded into `name` at
 * enrolment time, and nothing downstream needs it a second time.
 */
function toPublic(device: RemoteDevice): PublicRemoteDevice {
    return {
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt
    }
}

/** Remove a device's record and its token together - they must never be split. */
function drop(store: Store, id: string): void {
    store.devices = store.devices.filter((d) => d.id !== id)
    delete store.tokens[id]
}

/**
 * Current pairing token, minting one on first use. Uses the throwing
 * `writeStore`, not `save`: this is what the Settings panel displays AND
 * QR-encodes as the way to pair a new device, so a swallowed write failure
 * here would show (and offer to scan) a token that isn't actually the one
 * live in the store - the same class of false confirmation `revokeDevice`
 * and `setPairingToken` already avoid, for the same reason.
 */
export function pairingToken(): string {
    const store = load()
    const before = store.pairing
    const token = ensurePairing(store)
    if (store.pairing !== before) writeStore(store)
    return token
}

/**
 * Invalidate the current pairing token and mint a fresh one. Already-paired
 * devices are unaffected. Uses the throwing `writeStore`, not `save`: a
 * caller regenerating the token is explicitly trying to invalidate a leaked
 * one, so a swallowed write failure here would tell the user it worked while
 * the leaked token stayed live - the exact false confirmation this whole
 * action exists to prevent.
 */
export function regeneratePairingToken(): string {
    const store = load()
    const token = newToken()
    store.pairing = encrypt(token)
    writeStore(store)
    return token
}

/**
 * One-way settings migration: adopt a legacy `remote.token` (the single
 * plaintext, non-expiring token this feature replaces) as the pairing token,
 * so a phone that already has the old URL bookmarked keeps working - it
 * re-pairs as a device on its next load instead of being locked out. Only
 * takes effect while no *different* pairing token has been minted yet: once
 * one exists, a stale `remote.token` still lingering in settings.json must
 * not stomp a token the user may since have regenerated.
 *
 * Returns whether it is now safe for the caller to erase the legacy value
 * from settings.json - true when this call actually seeded the store, or
 * when the existing pairing token already IS this exact value (an earlier
 * call already migrated it); false when a *different* token already exists,
 * or the input was empty. The caller (`settings.ts`'s `load()`) treats this
 * as the only signal that migration truly happened - resolving without a
 * thrown error is not enough, since a no-op decline must not be mistaken for
 * success. Uses the throwing `writeStore`, not `save`, because this is the
 * one path where a swallowed write failure would report success while
 * silently losing the only copy of the credential once the caller erases it.
 */
export function setPairingToken(token: string): boolean {
    if (!token) return false
    const store = load()
    const existing = decrypt(store.pairing)
    if (existing) return existing === token
    store.pairing = encrypt(token)
    writeStore(store)
    return true
}

// Below this idle gap, a successful reconnect doesn't bother re-stamping
// lastSeenAt. Expiry is day-granularity, so this loses no real precision,
// and it's what keeps a legitimate phone's every request from forcing a
// synchronous writeFileSync+renameSync on the main process's event loop -
// server.ts calls authenticate() per HTTP request and per WS upgrade.
const STAMP_INTERVAL_MS = 60_000

// --- Failure throttle ------------------------------------------------------
//
// `authenticate()` is reachable by anyone who can open a socket to the remote
// server, before any credential is proven, and it used to answer as fast as
// the attacker could ask. That made it two things at once: a guessing oracle
// against the pairing token, and a self-DoS - every miss walks the whole
// device list on the same thread that relays every PTY byte to every pane.
//
// The counter is keyed on the *failing* address and cleared by any success
// from that address, and what grows is the refusal WINDOW, not a strike count
// that eventually becomes permanent. That ordering is deliberate: the person
// most likely to fail repeatedly is the owner's own phone carrying a revoked
// or expired token, and a limiter that locks them out of their own machine
// after a few reconnects is worse than the attack it prevents. The window is
// capped at MAX_LOCK_MS, so the worst case for a legitimate device is one
// half-minute wait, while an attacker's throughput past the free attempts
// collapses to a couple of guesses a minute.
//
// This is a refusal window, not a sleep: authenticate() is synchronous and on
// the main process's event loop, so delaying a response by blocking would
// hand an attacker the very stall the throttle exists to prevent.
const FREE_FAILS = 5
const BASE_LOCK_MS = 1_000
const MAX_LOCK_MS = 30_000
/** Bound the map so a client cycling addresses can't grow it without limit. */
const MAX_THROTTLE_KEYS = 1_000

interface Attempts {
    /** Consecutive failures from this address; reset by any success. */
    fails: number
    /** Epoch ms before which this address is refused without being checked. */
    until: number
}
const attempts = new Map<string, Attempts>()

/** 0 for the first FREE_FAILS misses, then 1s, 2s, 4s ... capped at 30s. */
function lockMs(fails: number): number {
    const over = fails - FREE_FAILS
    if (over <= 0) return 0
    return Math.min(BASE_LOCK_MS * 2 ** (over - 1), MAX_LOCK_MS)
}

/** True if this address is inside its refusal window right now. */
function isLockedOut(key: string, now: number): boolean {
    const entry = attempts.get(key)
    return !!entry && entry.until > now
}

function noteFailure(key: string, now: number): void {
    const entry = attempts.get(key) ?? { fails: 0, until: 0 }
    entry.fails += 1
    entry.until = now + lockMs(entry.fails)
    attempts.set(key, entry)
    if (attempts.size <= MAX_THROTTLE_KEYS) return
    // Expired entries first - dropping one of those forgives nobody who is
    // currently being refused. Only if that isn't enough do we evict by
    // insertion order, and an attacker who forces that has to hold
    // MAX_THROTTLE_KEYS live lockouts to buy back a single address.
    for (const [k, v] of attempts) {
        if (v.until <= now) attempts.delete(k)
        if (attempts.size <= MAX_THROTTLE_KEYS) return
    }
    for (const k of attempts.keys()) {
        attempts.delete(k)
        if (attempts.size <= MAX_THROTTLE_KEYS) return
    }
}

/** Any success clears the address: a real device is never a step closer to a lockout. */
function noteSuccess(key: string): void {
    attempts.delete(key)
}

/**
 * Charge one failure to an address, for a caller that tries more than one
 * credential per request.
 *
 * `server.ts` tries the cookie and then `?token=`, which is ONE failed request
 * presenting two dead credentials - not two guesses. Letting `authenticate`
 * count both halved the free budget for exactly the case the cookie fallback
 * exists to serve: a browser holding a revoked device cookie with a long
 * Max-Age, which then loads a page, its assets, and a WebSocket. The owner
 * would spend five free misses in about three requests and be refused for up
 * to 30 s while holding a freshly scanned, entirely valid pairing token.
 */
export function noteAuthFailure(address: string): void {
    noteFailure(address, Date.now())
}

/** Is this address inside its refusal window? Exported for the same caller. */
export function isAuthLockedOut(address: string): boolean {
    return isLockedOut(address, Date.now())
}

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
 * an unauthenticated, attacker-paced call path, so a save on every rejected
 * or no-op request would be a real cost, not just disk wear.
 *
 * `address` is the peer address the attempt arrived from (`req.socket.
 * remoteAddress`), and it is what the failure throttle above counts against.
 * It defaults to a single shared bucket rather than to "no throttle": a
 * caller that cannot say where a request came from gets the limit applied
 * more broadly, never not at all.
 *
 * `countFailure: false` is for a caller that tries several credentials for one
 * request and charges the failure itself, once - see `noteAuthFailure`. The
 * lockout is still *enforced* in that mode; only the counting moves.
 */
export function authenticate(
    token: string,
    userAgent: string,
    ttlDays: number,
    allowEnroll = true,
    address = "",
    opts: { countFailure?: boolean } = {}
): AuthResult {
    const count = opts.countFailure !== false
    const failed = (): AuthResult => {
        if (count) noteFailure(address, Date.now())
        return { ok: false }
    }
    const now = Date.now()
    // Before load(), and before the decrypt loop: the point is that a refused
    // attempt costs an attacker a Map lookup of ours, not a walk of every
    // paired device's DPAPI decrypt.
    if (isLockedOut(address, now)) return { ok: false }

    const store = load()
    const pairingBefore = store.pairing

    for (const device of store.devices) {
        const deviceToken = decryptCached(device.id, store.tokens[device.id])
        if (!deviceToken || !tokenOk(token, deviceToken)) continue

        if (isExpired(device.lastSeenAt, ttlDays, now)) {
            drop(store, device.id)
            save(store)
            return failed()
        }

        if (now - device.lastSeenAt > STAMP_INTERVAL_MS) {
            device.lastSeenAt = now
            save(store)
        }
        noteSuccess(address)
        return { ok: true, device: toPublic(device) }
    }

    if (!allowEnroll) return failed()

    const pairing = ensurePairing(store)
    // `store.devices.length < MAX_DEVICES` (not a separate early return):
    // hitting the cap must still fall through to the persistence check below,
    // so a pairing token minted just above by `ensurePairing` on a fresh
    // install still gets saved even when the very first enrolment attempt
    // happens to be over some pre-existing cap.
    const pairingMatches = tokenOk(token, pairing)
    if (pairingMatches && store.devices.length < MAX_DEVICES) {
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
        noteSuccess(address)
        return { ok: true, device: toPublic(device), deviceToken }
    }

    // Persist a pairing token minted above (ensurePairing) so the next call
    // doesn't mint a different one - but only when it was actually minted,
    // not on every ordinary rejection.
    if (store.pairing !== pairingBefore) save(store)
    // A CORRECT pairing token that only failed because the device cap is full
    // is not a guess, and must not feed the guessing-oracle counter: the owner
    // would be presenting a valid credential and be answered with an
    // exponentially growing refusal for doing so.
    if (pairingMatches) return { ok: false }
    return failed()
}

/** Paired, non-expired devices - prunes expired records (and their tokens) as it reads. */
export function listDevices(ttlDays: number): PublicRemoteDevice[] {
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
 * wired to any IPC handler, but that was only ever enforced by nobody adding
 * one - a guard makes the restriction structural instead of a promise a future
 * edit could quietly break: outside a test run this is a no-op regardless of
 * who calls it.
 */
export function expireForTest(id: string, at: number): void {
    if (process.env.NODE_ENV !== "test") return
    const store = load()
    const device = store.devices.find((d) => d.id === id)
    if (!device) return
    device.lastSeenAt = at
    save(store)
}
