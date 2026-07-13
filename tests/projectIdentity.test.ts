import { describe, it, expect } from "vitest"
import { monogram, autoColorKey, identity, PALETTE_KEYS, PALETTE } from "../src/renderer/src/projectIdentity"

describe("monogram", () => {
    it("first letters of the first two tokens", () => {
        expect(monogram("my-api-gateway")).toBe("MA")
    })
    it("splits camelCase", () => {
        expect(monogram("LauChoySeng")).toBe("LC")
    })
    it("two letters for a single token", () => {
        expect(monogram("devdeck")).toBe("DE")
    })
    it("strips surrounding brackets", () => {
        expect(monogram("[ACME] - BE")).toBe("AB")
    })
    it("? when there are no alphanumerics", () => {
        expect(monogram("")).toBe("?")
        expect(monogram("---")).toBe("?")
    })
})

describe("autoColorKey", () => {
    it("is deterministic", () => {
        expect(autoColorKey("devdeck")).toBe(autoColorKey("devdeck"))
    })
    it("returns a valid palette key", () => {
        expect(PALETTE_KEYS).toContain(autoColorKey("anything"))
    })
})

describe("identity", () => {
    it("monogram + auto color when nothing overridden", () => {
        const id = identity({ name: "devdeck" })
        expect(id.isEmoji).toBe(false)
        expect(id.label).toBe("DE")
        expect(id.bg).toMatch(/^#/)
    })
    it("emoji override wins", () => {
        const id = identity({ name: "devdeck", emoji: "🚀" })
        expect(id.isEmoji).toBe(true)
        expect(id.label).toBe("🚀")
    })
    it("color override sets the tile bg", () => {
        expect(identity({ name: "devdeck", color: "teal" }).bg).toBe(PALETTE.teal.bg)
    })
    it("invalid color falls back to auto", () => {
        expect(identity({ name: "devdeck", color: "notacolor" }).bg).toBe(identity({ name: "devdeck" }).bg)
    })
})
