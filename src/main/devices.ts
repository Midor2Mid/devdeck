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
            pairing: s.pairing ?? "",
            devices: s.devices ?? [],
            tokens: s.tokens ?? {}
        }
    } catch {
        return { pairing: "", devices: [], tokens: {} }
    }
}
function save(store: Store): void {
    try {
        atomicWrite(storeFile(), JSON.stringify(store, null, 2))
    } catch (err) {
        console.error("[devices] failed to save:", err)
    }
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

/** Return a copy of the record with no secret fields, safe to hand to the renderer. */
function toPublic(device: RemoteDevice): RemoteDevice {
    return { ...device }
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
 * Authenticate a request from the phone. Device tokens are checked first: a
 * match against an expired device fails *and* removes that device's record,
 * so it re-pairs cleanly instead of resurrecting. Only if no device token
 * matches do we fall through to the pairing token, which enrols a new device.
 */
export function authenticate(token: string, userAgent: string, ttlDays: number): AuthResult {
    const store = load()
    const now = Date.now()

    for (const device of store.devices) {
        const deviceToken = decrypt(store.tokens[device.id])
        if (!deviceToken || !tokenOk(token, deviceToken)) continue

        if (isExpired(device.lastSeenAt, ttlDays, now)) {
            drop(store, device.id)
            save(store)
            return { ok: false }
        }

        device.lastSeenAt = now
        save(store)
        return { ok: true, device: toPublic(device) }
    }

    const pairing = ensurePairing(store)
    if (tokenOk(token, pairing)) {
        const deviceToken = newToken()
        const device: RemoteDevice = {
            id: randomBytes(16).toString("hex"),
            name: deviceName(userAgent),
            createdAt: now,
            lastSeenAt: now,
            userAgent
        }
        store.devices.push(device)
        store.tokens[device.id] = encrypt(deviceToken)
        save(store)
        return { ok: true, device: toPublic(device), deviceToken }
    }

    // Even on outright rejection, persist a pairing token minted above so the
    // next call doesn't mint (and thus invalidate) a different one.
    save(store)
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
    device.name = name
    save(store)
}

export function revokeDevice(id: string): void {
    const store = load()
    drop(store, id)
    save(store)
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
