import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
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

// I2/I4: a controllable atomicWrite so specific tests can simulate a disk
// write failing (I2's throwing-write guarantee) without touching every other
// test's real writes. `shouldFail` is off by default and reset after every
// test, so only tests that opt in ever see a thrown write.
const atomicMock = vi.hoisted(() => ({ shouldFail: false }))
vi.mock("../src/main/atomic", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/main/atomic")>()
    return {
        atomicWrite: (file: string, data: string): void => {
            if (atomicMock.shouldFail) throw new Error("disk full (simulated)")
            actual.atomicWrite(file, data)
        }
    }
})

import {
    pairingToken,
    regeneratePairingToken,
    setPairingToken,
    authenticate,
    listDevices,
    revokeDevice,
    expireForTest,
    __resetCacheForTest
} from "../src/main/devices"

// Unlike aikeys.test.ts (which uses a distinct key per test and never asserts
// on the whole store), several tests here assert exact counts via
// listDevices(...).toHaveLength(...). Reset the store file before each test
// so those assertions aren't polluted by devices enrolled in earlier tests -
// and reset the in-memory store/decrypt cache (I4) too, or the deleted file
// would do nothing: load() would keep serving the previous test's cached
// store instead of noticing the file is gone.
beforeEach(() => {
    try {
        rmSync(join(h.dir, "remote-devices.json"))
    } catch {
        /* nothing to remove yet */
    }
    __resetCacheForTest()
})

afterEach(() => {
    atomicMock.shouldFail = false
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

    it("allowEnroll: false rejects a pairing token instead of enrolling a device", () => {
        // The WebSocket path's whole reason to exist: it has no way to hand a
        // fresh device token back to the client, so a socket presenting the
        // pairing token must be refused, not silently enrolled.
        const pt = pairingToken()
        const r = authenticate(pt, "phone", 30, false)
        expect(r.ok).toBe(false)
        expect(listDevices(30)).toHaveLength(0)
    })

    it("allowEnroll: false still accepts an already-paired device's own token", () => {
        const enrolled = authenticate(pairingToken(), "phone", 30)
        const token = enrolled.ok ? enrolled.deviceToken! : ""
        const r = authenticate(token, "phone", 30, false)
        expect(r.ok).toBe(true)
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

describe("setPairingToken (legacy settings.json migration)", () => {
    it("adopts a legacy token as the pairing token when none exists yet, and reports true", () => {
        expect(setPairingToken("legacy-plaintext-token")).toBe(true)
        expect(authenticate("legacy-plaintext-token", "phone", 30).ok).toBe(true)
    })

    it("is a one-way migration: does not clobber a DIFFERENT pairing token that already exists, and reports false", () => {
        const minted = pairingToken()
        expect(setPairingToken("legacy-plaintext-token")).toBe(false)
        expect(authenticate(minted, "phone", 30).ok).toBe(true)
        expect(authenticate("legacy-plaintext-token", "another phone", 30).ok).toBe(false)
    })

    it("reports true (safe to erase the legacy value) when it's already been migrated to this exact token", () => {
        // The caller retries every load; a second call carrying the SAME
        // legacy value after an earlier call already adopted it must not be
        // mistaken for "declined" - the migration already happened, so it
        // remains safe for settings.ts to scrub the plaintext from disk.
        setPairingToken("legacy-plaintext-token")
        expect(setPairingToken("legacy-plaintext-token")).toBe(true)
    })

    it("ignores an empty token and reports false", () => {
        expect(setPairingToken("")).toBe(false)
        expect(authenticate("", "phone", 30).ok).toBe(false)
    })

    it("a true result means the value was actually persisted, encrypted, never in plaintext", () => {
        // The whole point of using writeStore over save(): a write failure
        // must throw, not silently report success while nothing persisted.
        expect(setPairingToken("legacy-plaintext-token")).toBe(true)
        const raw = readFileSync(join(h.dir, "remote-devices.json"), "utf8")
        expect(raw).not.toContain("legacy-plaintext-token")
        const parsed = JSON.parse(raw) as { pairing: string }
        expect(parsed.pairing).toMatch(/^(enc:|b64:)/)
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
        // The in-memory store/decrypt cache (I4) means `authenticate` would
        // otherwise never re-read these bytes at all - it would keep serving
        // the pre-corruption cached store, and both assertions below would
        // pass for a reason that has nothing to do with decrypting a
        // corrupted entry. Drop the cache so this exercises the real
        // decryption-failure path again.
        __resetCacheForTest()

        expect(authenticate("", "phone", 30).ok).toBe(false)
        expect(authenticate("garbage", "phone", 30).ok).toBe(false)
    })
})

describe("write-failure surfacing (I2)", () => {
    it("pairingToken throws rather than silently minting a token nothing persisted", () => {
        atomicMock.shouldFail = true
        expect(() => pairingToken()).toThrow()
    })

    it("regeneratePairingToken throws on a failed write, and the old token stays live", () => {
        const old = pairingToken()
        atomicMock.shouldFail = true
        expect(() => regeneratePairingToken()).toThrow()
        atomicMock.shouldFail = false
        // The failed regenerate must not have left the store thinking a
        // different token is now the real one - the panel would otherwise
        // show/QR-encode a "new" token while the old, possibly-leaked one
        // silently kept working.
        expect(authenticate(old, "phone", 30).ok).toBe(true)
    })
})

describe("device cap (I4)", () => {
    it("caps enrolment at a bounded number of devices, and rejects past it", () => {
        const pt = pairingToken()
        for (let i = 0; i < 20; i++) {
            expect(authenticate(pt, `device ${i}`, 30).ok).toBe(true)
        }
        expect(listDevices(30)).toHaveLength(20)

        const over = authenticate(pt, "one too many", 30)
        expect(over.ok).toBe(false)
        expect(listDevices(30)).toHaveLength(20)
    })
})

describe("public device shape (M9)", () => {
    it("never exposes userAgent - the renderer only ever sees id/name/createdAt/lastSeenAt", () => {
        const r = authenticate(pairingToken(), "iPhone Safari", 30)
        expect(r.ok && "userAgent" in r.device).toBe(false)
        for (const d of listDevices(30)) {
            expect("userAgent" in d).toBe(false)
        }
    })
})

describe("expireForTest guard (M12)", () => {
    it("no-ops outside a test run, structurally - not merely by convention", () => {
        const r = authenticate(pairingToken(), "phone", 30)
        const id = r.ok ? r.device.id : ""
        const token = r.ok ? r.deviceToken! : ""

        const prevEnv = process.env.NODE_ENV
        process.env.NODE_ENV = "production"
        try {
            expireForTest(id, Date.now() - 3650 * 86_400_000)
        } finally {
            process.env.NODE_ENV = prevEnv
        }

        // Had the call taken effect, a 30-day TTL would reject and drop this
        // device outright - it must not have.
        expect(authenticate(token, "phone", 30).ok).toBe(true)
        expect(listDevices(30).some((d) => d.id === id)).toBe(true)
    })
})

describe("failure throttle (remedy 15)", () => {
    // The property: repeated failures from one address stop being answered,
    // and they stop being answered BEFORE the device loop, which is both the
    // guessing oracle and the per-request cost. Proven black-box by feeding a
    // locked-out address a token that would otherwise match a paired device.
    const enrol = (name: string, address = "10.0.0.1"): string => {
        const r = authenticate(pairingToken(), name, 30, true, address)
        return r.ok ? r.deviceToken! : ""
    }
    const fail = (n: number, address: string): void => {
        for (let i = 0; i < n; i++) authenticate(`bad-${i}`, "attacker", 30, true, address)
    }

    it("refuses a valid token from an address that has failed too often", () => {
        const token = enrol("phone")
        fail(6, "10.0.0.9")
        // Not "the token is wrong" - the address is inside its refusal window,
        // so the loop that would have matched this token never runs.
        expect(authenticate(token, "phone", 30, true, "10.0.0.9").ok).toBe(false)
    })

    it("keeps the same token working from a different address", () => {
        const token = enrol("phone")
        fail(20, "10.0.0.9")
        expect(authenticate(token, "phone", 30, true, "10.0.0.1").ok).toBe(true)
    })

    it("gives a legitimate device a few free misses before any lockout", () => {
        const token = enrol("phone", "10.0.0.7")
        // A phone reconnecting with a stale cookie must not be locked out of
        // its owner's own machine on the first handful of tries.
        fail(5, "10.0.0.7")
        expect(authenticate(token, "phone", 30, true, "10.0.0.7").ok).toBe(true)
    })

    it("clears the count on any success, so misses don't accumulate forever", () => {
        const token = enrol("phone", "10.0.0.7")
        fail(5, "10.0.0.7")
        expect(authenticate(token, "phone", 30, true, "10.0.0.7").ok).toBe(true)
        // Without the reset, these five would be failures 6-10 and lock the
        // address out; with it, they are 1-5 again.
        fail(5, "10.0.0.7")
        expect(authenticate(token, "phone", 30, true, "10.0.0.7").ok).toBe(true)
    })

    it("lets the address back in once the window passes, and caps how long that is", () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-08-29T12:00:00Z"))
        try {
            const token = enrol("phone", "10.0.0.7")
            // Far past the point where doubling would exceed any sane wait -
            // what is capped is the delay, never the number of attempts, so
            // this must not be a permanent ban.
            fail(40, "10.0.0.7")
            expect(authenticate(token, "phone", 30, true, "10.0.0.7").ok).toBe(false)
            vi.advanceTimersByTime(30_001)
            expect(authenticate(token, "phone", 30, true, "10.0.0.7").ok).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })

    it("throttles a caller that supplies no address rather than exempting it", () => {
        const token = enrol("phone", "10.0.0.1")
        for (let i = 0; i < 6; i++) authenticate(`bad-${i}`, "attacker", 30)
        expect(authenticate(token, "phone", 30).ok).toBe(false)
    })

    it("counts an expired device's own token as a failure, not a free retry", () => {
        const token = enrol("old phone", "10.0.0.7")
        const id = listDevices(30)[0].id
        expireForTest(id, Date.now() - 31 * 86_400_000)
        // Five expired-token rejections plus one bad guess is six failures.
        for (let i = 0; i < 5; i++) authenticate(token, "old phone", 30, true, "10.0.0.7")
        authenticate("bad", "old phone", 30, true, "10.0.0.7")
        const fresh = authenticate(pairingToken(), "old phone", 30, true, "10.0.0.7")
        expect(fresh.ok).toBe(false)
    })
})
