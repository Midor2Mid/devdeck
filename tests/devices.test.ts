import { describe, it, expect, beforeEach, vi } from "vitest"
import { join } from "path"
import { rmSync, readFileSync, writeFileSync } from "fs"

// Mock Electron: a temp userData dir, and force the base64 fallback (no DPAPI in
// the test runner) so encryption is deterministic. Same setup as aikeys.test.ts.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join: pjoin } = require("path")
    return { dir: mkdtempSync(pjoin(tmpdir(), "devices-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

import {
    pairingToken,
    regeneratePairingToken,
    authenticate,
    listDevices,
    revokeDevice,
    expireForTest
} from "../src/main/devices"

// Unlike aikeys.test.ts (which uses a distinct key per test and never asserts
// on the whole store), several tests here assert exact counts via
// listDevices(...).toHaveLength(...). Reset the store file before each test
// so those assertions aren't polluted by devices enrolled in earlier tests.
beforeEach(() => {
    try {
        rmSync(join(h.dir, "remote-devices.json"))
    } catch {
        /* nothing to remove yet */
    }
})

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
        // Stale by more than the 60s re-stamp gate (authenticate skips the
        // write when a device was seen very recently, to avoid a disk write
        // on every request from a legitimate, frequently-polling phone) but
        // nowhere near the 30-day expiry window. The brief's literal `1000`
        // (an absolute epoch ms, i.e. 1970) would itself be "expired" under
        // ttlDays: 30 against a real clock, contradicting the "successful
        // connection" this test is named for. See task-2-report.md.
        const stale = Date.now() - 65_000
        expireForTest(id, stale)
        authenticate(r.ok ? r.deviceToken! : "", "phone", 30)
        expect(listDevices(0).find((d) => d.id === id)!.lastSeenAt).toBeGreaterThan(stale)
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

describe("on-disk encryption", () => {
    it("never writes a raw token to disk, and every stored token/pairing carries an enc:/b64: prefix", () => {
        const a = authenticate(pairingToken(), "phone A", 30)
        const b = authenticate(pairingToken(), "phone B", 30)
        expect(a.ok && b.ok).toBe(true)

        const raw = readFileSync(join(h.dir, "remote-devices.json"), "utf8")
        // Tokens are randomBytes(32).toString("hex") - a raw 64-hex-char run
        // on disk would mean a plaintext token, not a base64 ciphertext blob.
        expect(raw).not.toMatch(/[0-9a-f]{64}/)

        const parsed = JSON.parse(raw) as { pairing: string; tokens: Record<string, string> }
        expect(parsed.pairing).toMatch(/^(enc:|b64:)/)
        expect(Object.values(parsed.tokens).length).toBeGreaterThan(0)
        for (const enc of Object.values(parsed.tokens)) {
            expect(enc).toMatch(/^(enc:|b64:)/)
        }
    })
})

describe("corrupted store", () => {
    it("rejects both an empty and a garbage token against a corrupted device-token entry", () => {
        const r = authenticate(pairingToken(), "phone", 30)
        const id = r.ok ? r.device.id : ""

        // Corrupt the token entry directly on disk - no enc:/b64: prefix, so
        // decrypt() can't recognise it and falls back to "".
        const file = join(h.dir, "remote-devices.json")
        const store = JSON.parse(readFileSync(file, "utf8"))
        store.tokens[id] = "not-a-valid-ciphertext-blob"
        writeFileSync(file, JSON.stringify(store), "utf8")

        expect(authenticate("", "phone", 30).ok).toBe(false)
        expect(authenticate("garbage", "phone", 30).ok).toBe(false)
    })
})
