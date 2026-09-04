import { describe, it, expect } from "vitest"
import {
    THEMES,
    STYLES,
    resolveTheme,
    resolveStyle,
    migrateAppearance,
    DEFAULT_THEME_ID,
    DEFAULT_STYLE_ID
} from "../src/renderer/src/themes"

describe("the reduced skin set", () => {
    it("keeps exactly the three themes and two styles that were ruled to stay", () => {
        expect(Object.keys(THEMES).sort()).toEqual(["slate", "sumi", "washi"])
        expect(Object.keys(STYLES).sort()).toEqual(["modern", "wabi"])
    })

    it("ships the defaults settings.ts already writes", () => {
        // settings.ts DEFAULTS.appearance is { theme: "slate", style: "modern" }.
        // If these drift apart a fresh install renders one skin and reports another.
        expect(DEFAULT_THEME_ID).toBe("slate")
        expect(DEFAULT_STYLE_ID).toBe("modern")
        expect(THEMES[DEFAULT_THEME_ID]).toBeTruthy()
        expect(STYLES[DEFAULT_STYLE_ID]).toBeTruthy()
    })
})

describe("migrating a settings.json written before the cut", () => {
    // 0.12.0 shipped 7 themes x 12 styles. A real profile - including the
    // author's - may name any of the deleted ids. An unknown id must land on the
    // default, never on `undefined`, which renders an unstyled window.
    it("falls back to the default for a theme id that no longer exists", () => {
        for (const gone of ["graphite", "zen", "aurora", "neo"]) {
            expect(resolveTheme(gone).id).toBe("slate")
        }
    })

    it("falls back to the default for a style id that no longer exists", () => {
        const gone = [
            "minimal",
            "neon",
            "flat",
            "bauhaus",
            "crt",
            "lacquer",
            "modernplus",
            "aurora",
            "neo",
            "kinetic"
        ]
        for (const id of gone) expect(resolveStyle(id).id).toBe("modern")
    })

    it("still returns a surviving skin unchanged", () => {
        expect(resolveTheme("sumi").id).toBe("sumi")
        expect(resolveTheme("washi").id).toBe("washi")
        expect(resolveStyle("wabi").id).toBe("wabi")
        expect(resolveStyle("modern").id).toBe("modern")
    })

    it("tolerates the shapes a corrupt or absent settings.json produces", () => {
        // Not a hypothetical: appearance.theme is typed, but the JSON on disk is
        // not, and a hand-edited or truncated file reaches here as anything.
        for (const junk of [undefined, null, "", "  ", 7, {}, []]) {
            expect(resolveTheme(junk as never).id).toBe("slate")
            expect(resolveStyle(junk as never).id).toBe("modern")
        }
    })

    it("does not resolve an inherited Object.prototype key to a skin", () => {
        expect(resolveTheme("constructor").id).toBe("slate")
        expect(resolveStyle("toString").id).toBe("modern")
    })
})

describe("migrateAppearance", () => {
    // Resolving inside applyTheme alone left the store holding the dead id, so
    // the picker showed nothing selected and THEMES[theme] was undefined for
    // every other reader. Observed in the real app before this existed.
    it("rewrites a deleted theme and style onto the defaults", () => {
        expect(
            migrateAppearance({ theme: "aurora" as never, style: "kinetic" as never })
        ).toEqual({ theme: "slate", style: "modern" })
    })

    it("leaves a surviving skin exactly as it was", () => {
        const kept = { theme: "sumi" as const, style: "wabi" as const }
        expect(migrateAppearance(kept)).toEqual(kept)
    })

    it("keeps the accent, which is a user choice and not a skin", () => {
        expect(
            migrateAppearance({ theme: "neo" as never, style: "neon" as never, accent: "#8b93ff" })
        ).toEqual({ theme: "slate", style: "modern", accent: "#8b93ff" })
    })
})
