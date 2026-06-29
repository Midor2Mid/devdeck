import { describe, it, expect, vi } from "vitest"
import { join } from "path"
import { readFileSync } from "fs"

// Mock Electron: a temp userData dir, and force the base64 fallback (no DPAPI in
// the test runner) so encryption is deterministic and we can assert on the file.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join: pjoin } = require("path")
    return { dir: mkdtempSync(pjoin(tmpdir(), "aikeys-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

import { setKey, getKey, status, clearKey } from "../src/main/aikeys"

describe("aikeys (encrypted key store)", () => {
    it("stores and retrieves a key (roundtrip)", () => {
        setKey("claude", "sk-test-123")
        expect(getKey("claude")).toBe("sk-test-123")
        expect(status().claude).toBe(true)
    })

    it("never writes the plaintext key to disk", () => {
        setKey("claude", "sk-secret-xyz")
        const raw = readFileSync(join(h.dir, "aikeys.json"), "utf8")
        expect(raw).not.toContain("sk-secret-xyz")
        expect(raw).toContain("b64:") // fallback scheme prefix
    })

    it("clears a key", () => {
        setKey("codex", "k")
        expect(status().codex).toBe(true)
        clearKey("codex")
        expect(status().codex).toBeFalsy()
        expect(getKey("codex")).toBe("")
    })

    it("treats an empty key as a removal", () => {
        setKey("gemini", "x")
        setKey("gemini", "")
        expect(status().gemini).toBeFalsy()
    })

    it("returns empty for an unknown agent", () => {
        expect(getKey("nope")).toBe("")
    })
})
