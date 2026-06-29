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
    return { dir: mkdtempSync(pjoin(tmpdir(), "gitpat-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

import { setPat, getPat, status, clearPat } from "../src/main/gitpat"

describe("gitpat (encrypted PAT store)", () => {
    it("stores and retrieves a token (roundtrip)", () => {
        setPat("work", "ghp_test123")
        expect(getPat("work")).toBe("ghp_test123")
        expect(status().work).toBe(true)
    })

    it("never writes the plaintext token to disk", () => {
        setPat("work", "ghp_secretXYZ")
        const raw = readFileSync(join(h.dir, "gitpats.json"), "utf8")
        expect(raw).not.toContain("ghp_secretXYZ")
        expect(raw).toContain("b64:") // fallback scheme prefix
    })

    it("clears a token", () => {
        setPat("personal", "t")
        expect(status().personal).toBe(true)
        clearPat("personal")
        expect(status().personal).toBeFalsy()
        expect(getPat("personal")).toBe("")
    })

    it("treats an empty token as a removal", () => {
        setPat("temp", "x")
        setPat("temp", "")
        expect(status().temp).toBeFalsy()
    })

    it("returns empty for an unknown account", () => {
        expect(getPat("nope")).toBe("")
    })
})
