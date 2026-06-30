import { describe, it, expect, vi } from "vitest"
import { join } from "path"
import { readFileSync } from "fs"

// Mock Electron: temp userData + base64 fallback (no DPAPI in the test runner).
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join: pjoin } = require("path")
    return { dir: mkdtempSync(pjoin(tmpdir(), "projectenv-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

import { getEnv, setEnv, envMap } from "../src/main/projectenv"

describe("projectenv (encrypted per-project env store)", () => {
    it("roundtrips pairs and drops empty-keyed rows", () => {
        setEnv("p1", [
            { key: "NODE_ENV", value: "development", enabled: true },
            { key: "  ", value: "ignored", enabled: true }
        ])
        const got = getEnv("p1")
        expect(got).toEqual([{ key: "NODE_ENV", value: "development", enabled: true }])
    })

    it("never writes plaintext values to disk", () => {
        setEnv("p1", [{ key: "API_KEY", value: "super-secret-xyz", enabled: true }])
        const raw = readFileSync(join(h.dir, "projectenv.json"), "utf8")
        expect(raw).not.toContain("super-secret-xyz")
        expect(raw).toContain("b64:") // fallback scheme prefix
    })

    it("envMap includes only enabled, non-empty keys (trimmed)", () => {
        setEnv("p2", [
            { key: " A ", value: "1", enabled: true },
            { key: "B", value: "2", enabled: false },
            { key: "", value: "3", enabled: true }
        ])
        expect(envMap("p2")).toEqual({ A: "1" })
    })

    it("treats an empty list as a removal", () => {
        setEnv("p3", [{ key: "X", value: "y", enabled: true }])
        expect(getEnv("p3").length).toBe(1)
        setEnv("p3", [])
        expect(getEnv("p3")).toEqual([])
        expect(envMap("p3")).toEqual({})
    })

    it("returns empty for an unknown project", () => {
        expect(getEnv("nope")).toEqual([])
        expect(envMap("nope")).toEqual({})
    })
})
