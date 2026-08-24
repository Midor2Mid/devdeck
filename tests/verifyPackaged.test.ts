import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { defaultExe, expectedElectronMajor, matchesExpectedElectron } from "../scripts/verify-packaged.mjs"

describe("defaultExe", () => {
    // electron-builder names the exe after productName, not the package name, so
    // deriving it from `name` would look in the wrong place ("devdeck.exe").
    it("derives the artifact path from productName", () => {
        expect(defaultExe("D:/repo", { build: { productName: "DevDeck" } })).toBe(
            join("D:/repo", "release", "win-unpacked", "DevDeck.exe")
        )
    })

    it("falls back to the package name when productName is unset", () => {
        expect(defaultExe("D:/repo", { name: "thing" })).toBe(
            join("D:/repo", "release", "win-unpacked", "thing.exe")
        )
    })
})

describe("expectedElectronMajor", () => {
    // The point of this check: an artifact packaged BEFORE a toolchain bump would
    // still open and still pass every other assertion, while being the old binary.
    it("reads the major from a caret range", () => {
        expect(expectedElectronMajor({ devDependencies: { electron: "^43.4.1" } })).toBe("43")
    })

    it("reads it from an exact pin", () => {
        expect(expectedElectronMajor({ devDependencies: { electron: "33.3.1" } })).toBe("33")
    })

    it("returns null when electron is not a dependency at all", () => {
        expect(expectedElectronMajor({ devDependencies: {} })).toBeNull()
    })
})

describe("matchesExpectedElectron", () => {
    it("accepts a matching major", () => {
        expect(matchesExpectedElectron("43.4.1", "43")).toBe(true)
    })

    it("rejects a stale artifact from before a bump", () => {
        expect(matchesExpectedElectron("33.4.11", "43")).toBe(false)
    })

    // With nothing to compare against, this must not invent a verdict: the check
    // is skipped rather than passed.
    it("is undecided when there is no expectation", () => {
        expect(matchesExpectedElectron("43.4.1", null)).toBeNull()
    })

    it("is undecided when the running version could not be read", () => {
        expect(matchesExpectedElectron("unknown", "43")).toBeNull()
    })
})
