import { describe, it, expect } from "vitest"
import { LENSES, reviewPrompt, DEFAULT_LENSES } from "../src/renderer/src/reviewLenses"

describe("reviewLenses", () => {
    it("exposes lenses with unique ids and non-empty labels/focus", () => {
        expect(LENSES.length).toBeGreaterThanOrEqual(3)
        const ids = LENSES.map((l) => l.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const l of LENSES) {
            expect(l.label).toBeTruthy()
            expect(l.focus).toBeTruthy()
        }
    })

    it("includes correctness, security and a .NET lens", () => {
        const ids = LENSES.map((l) => l.id)
        expect(ids).toContain("correctness")
        expect(ids).toContain("security")
        expect(ids).toContain("dotnet")
    })

    it("DEFAULT_LENSES are all valid lens ids", () => {
        const ids = new Set(LENSES.map((l) => l.id))
        for (const d of DEFAULT_LENSES) expect(ids.has(d)).toBe(true)
    })

    it("reviewPrompt embeds the lens focus, a git diff instruction and a file:line ask", () => {
        const lens = LENSES.find((l) => l.id === "security")!
        const p = reviewPrompt(lens)
        expect(p).toContain(lens.focus)
        expect(p.toLowerCase()).toContain("git diff")
        expect(p.toLowerCase()).toContain("file:line")
    })
})
