import { describe, it, expect } from "vitest"
import {
    THEMES,
    contrast,
    deriveAccentVars,
    relLuminance,
    resolveAccent,
    resolveTheme
} from "../src/renderer/src/themes"

// The ink `deriveAccentVars` may choose between. Repeated here on purpose: if
// someone changes the pair in themes.ts, these tests should fail rather than
// silently re-measure themselves against the new value.
const INK_DARK = "#14110d"
const INK_LIGHT = "#f6f6f4"
const TEXT_FLOOR = 4.5
const MIN_STEP = 1.05

const derive = (themeId: "sumi" | "washi" | "slate", accent: string) => {
    const t = THEMES[themeId]
    return deriveAccentVars(accent, t.vars["--bg"])
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * The regression that produced this file: `themes.ts` declared
 * `--accent-soft: #9c6a3d` in Washi's palette AND overwrote it on every
 * launch, so every contrast figure quoted in the design work was measured
 * against a colour the app never painted. There is now exactly one place that
 * states these three values, and this test is what keeps it that way.
 */
describe("no theme declares a derived accent value", () => {
    for (const theme of Object.values(THEMES)) {
        for (const key of ["--accent-soft", "--accent-lift", "--on-accent"]) {
            it(`${theme.id} leaves ${key} to deriveAccentVars`, () => {
                expect(theme.vars[key]).toBeUndefined()
            })
        }
    }
})

describe("the shipped skins", () => {
    // Exact values, so a change to the derivation shows up as a diff in the
    // numbers rather than as a quiet shift in three skins.
    const EXPECTED = {
        sumi: { soft: "#c59e79", lift: "#c59e79", ink: INK_DARK },
        washi: { soft: "#90643d", lift: "#be926b", ink: INK_DARK },
        slate: { soft: "#efb679", lift: "#efb679", ink: INK_DARK }
    } as const

    for (const [id, want] of Object.entries(EXPECTED)) {
        it(`${id} derives the documented values`, () => {
            const t = THEMES[id as keyof typeof EXPECTED]
            const got = deriveAccentVars(t.accent, t.vars["--bg"])
            expect(got["--accent-soft"]).toBe(want.soft)
            expect(got["--accent-lift"]).toBe(want.lift)
            expect(got["--on-accent"]).toBe(want.ink)
        })
    }

    // The figures DESIGN.md and styles.css quote. Measured against
    // deriveAccentVars' output - the only value the app paints.
    const FIGURES = {
        sumi: { labelRest: 6.07, labelHover: 7.65, fillRest: 5.61, fillHover: 7.07, ink: 7.07 },
        washi: { labelRest: 5.13, labelHover: 6.73, fillRest: 3.2, fillHover: 2.44, ink: 4.49 },
        slate: { labelRest: 9.09, labelHover: 10.43, fillRest: 9.32, fillHover: 10.7, ink: 10.7 }
    } as const

    for (const [id, want] of Object.entries(FIGURES)) {
        it(`${id} measures the documented ratios`, () => {
            const t = THEMES[id as keyof typeof FIGURES]
            const bg = t.vars["--bg"]
            const v = deriveAccentVars(t.accent, bg)
            const ink = v["--on-accent"]
            expect(r2(contrast(ink, t.accent))).toBe(want.labelRest)
            expect(r2(contrast(ink, v["--accent-lift"]))).toBe(want.labelHover)
            expect(r2(contrast(t.accent, bg))).toBe(want.fillRest)
            expect(r2(contrast(v["--accent-lift"], bg))).toBe(want.fillHover)
            expect(r2(contrast(v["--accent-soft"], bg))).toBe(want.ink)
        })
    }

    it("Washi's hover no longer drops the label under the text floor", () => {
        // The defect: the fill used to hover to --accent-soft (#90643d), where
        // the near-black label measured 3.65:1 and the button read as pressed.
        const washi = THEMES.washi
        expect(r2(contrast(INK_DARK, "#90643d"))).toBe(3.65)
        const v = deriveAccentVars(washi.accent, washi.vars["--bg"])
        expect(v["--accent-lift"]).not.toBe(v["--accent-soft"])
        expect(contrast(v["--on-accent"], v["--accent-lift"])).toBeGreaterThan(TEXT_FLOOR)
    })

    it("only the light theme needs the two tokens to differ", () => {
        // Soft steps away from the ground, lift away from the label. On a dark
        // theme those are the same direction, which is why one token survived.
        for (const id of ["sumi", "slate"] as const) {
            const v = derive(id, THEMES[id].accent)
            expect(v["--accent-lift"]).toBe(v["--accent-soft"])
        }
    })
})

// A user can type any colour into the accent picker, so the properties below
// are asserted over a sweep rather than over the three shipped values.
const SWEEP: string[] = []
for (const r of [0, 0x22, 0x44, 0x66, 0x88, 0xaa, 0xcc, 0xee, 0xff]) {
    for (const g of [0, 0x33, 0x7f, 0xbb, 0xff]) {
        for (const b of [0, 0x55, 0xaa, 0xff]) {
            SWEEP.push(
                "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")
            )
        }
    }
}
const THEME_IDS = ["sumi", "washi", "slate"] as const

describe("properties that hold for an arbitrary accent", () => {
    it("sweeps a real grid", () => {
        expect(SWEEP.length).toBe(180)
    })

    it("the label never gets harder to read on hover than at rest", () => {
        const bad: string[] = []
        for (const id of THEME_IDS) {
            for (const accent of SWEEP) {
                const v = derive(id, accent)
                const rest = contrast(v["--on-accent"], accent)
                const hover = contrast(v["--on-accent"], v["--accent-lift"])
                // The lift steps AWAY from the label, so hover >= rest - unless
                // that direction had no headroom and the step was inverted, in
                // which case the label must still clear the text floor.
                if (!(hover >= rest - 1e-9 || hover >= TEXT_FLOOR)) {
                    bad.push(`${id} ${accent}: ${r2(rest)} -> ${r2(hover)}`)
                }
            }
        }
        expect(bad).toEqual([])
    })

    it("the hover is always a visible change", () => {
        const bad: string[] = []
        for (const id of THEME_IDS) {
            for (const accent of SWEEP) {
                const v = derive(id, accent)
                for (const key of ["--accent-soft", "--accent-lift"] as const) {
                    if (contrast(v[key], accent) < MIN_STEP) {
                        bad.push(`${id} ${accent} ${key}: ${r2(contrast(v[key], accent))}`)
                    }
                }
            }
        }
        expect(bad).toEqual([])
    })

    it("the ink is always the better of the two, and never worse than 4.17:1", () => {
        // 4.17 is the mathematical floor for this ink pair (see INK_CROSSOVER):
        // an accent sitting on the crossover cannot clear 4.5 with any ink.
        let worst = 21
        let worstAccent = ""
        for (const accent of SWEEP) {
            const v = derive("slate", accent)
            const chosen = contrast(v["--on-accent"], accent)
            const other = contrast(v["--on-accent"] === INK_DARK ? INK_LIGHT : INK_DARK, accent)
            expect(chosen).toBeGreaterThanOrEqual(other - 1e-9)
            if (chosen < worst) {
                worst = chosen
                worstAccent = accent
            }
        }
        expect(worst, `worst accent in the sweep was ${worstAccent}`).toBeGreaterThan(4.17)
    })

    it("the ink choice made for rest is still the right choice on hover", () => {
        // Because the lift steps away from the ink, it moves further from the
        // crossover - so a second ink is never needed for the hover state.
        for (const id of THEME_IDS) {
            for (const accent of SWEEP) {
                const v = derive(id, accent)
                const other = v["--on-accent"] === INK_DARK ? INK_LIGHT : INK_DARK
                const lift = v["--accent-lift"]
                if (contrast(v["--on-accent"], lift) < contrast(other, lift)) {
                    throw new Error(`${id} ${accent}: hover would prefer ${other}`)
                }
            }
        }
    })
})

describe("the extremes, stated so nobody rediscovers them", () => {
    it("a near-white accent on Washi has no legible reading, and the hover says so honestly", () => {
        const v = derive("washi", "#fafafa")
        const bg = THEMES.washi.vars["--bg"]
        // Illegible at rest and illegible on hover - the derivation cannot fix
        // an accent choice, only refuse to make it worse.
        expect(r2(contrast("#fafafa", bg))).toBe(1.1)
        expect(r2(contrast(v["--accent-soft"], bg))).toBe(1.39)
        // The fill still works, because the label follows the accent's luminance.
        expect(v["--on-accent"]).toBe(INK_DARK)
        expect(contrast(v["--on-accent"], v["--accent-lift"])).toBeGreaterThan(TEXT_FLOOR)
        // White cannot get whiter, so the step inverts rather than vanishing.
        expect(v["--accent-lift"]).toBe("#cdcdcd")
    })

    it("a near-black accent on Slate flips the ink and still moves on hover", () => {
        const v = derive("slate", "#0a0a0a")
        const bg = THEMES.slate.vars["--bg"]
        expect(v["--on-accent"]).toBe(INK_LIGHT)
        expect(r2(contrast("#0a0a0a", bg))).toBe(1.03)
        expect(r2(contrast(v["--accent-soft"], bg))).toBe(1.6)
        expect(contrast(v["--accent-lift"], "#0a0a0a")).toBeGreaterThanOrEqual(MIN_STEP)
        expect(contrast(v["--on-accent"], v["--accent-lift"])).toBeGreaterThan(TEXT_FLOOR)
    })

    it("a saturated primary trades label contrast for a visible hover, and says how much", () => {
        // #00ff00 cannot get greener, so the away step is imperceptible and the
        // step inverts: the label drops 13.72 -> 9.07, still far above the floor.
        const v = derive("slate", "#00ff00")
        expect(v["--accent-lift"]).toBe("#00d100")
        expect(r2(contrast(INK_DARK, "#00ff00"))).toBe(13.72)
        expect(r2(contrast(INK_DARK, v["--accent-lift"]))).toBe(9.07)
    })

    it("pure black and pure white are both handled", () => {
        for (const id of THEME_IDS) {
            for (const accent of ["#000000", "#ffffff"]) {
                const v = derive(id, accent)
                expect(contrast(v["--accent-lift"], accent)).toBeGreaterThanOrEqual(MIN_STEP)
                expect(contrast(v["--accent-soft"], accent)).toBeGreaterThanOrEqual(MIN_STEP)
                expect(contrast(v["--on-accent"], v["--accent-lift"])).toBeGreaterThan(TEXT_FLOOR)
            }
        }
    })
})

describe("relLuminance / contrast", () => {
    it("anchors on black and white", () => {
        expect(relLuminance("#000000")).toBe(0)
        expect(relLuminance("#ffffff")).toBe(1)
        expect(r2(contrast("#000000", "#ffffff"))).toBe(21)
    })

    it("is symmetric and 1 for a colour against itself", () => {
        expect(contrast("#b07a4a", "#f4efe4")).toBe(contrast("#f4efe4", "#b07a4a"))
        expect(contrast("#b07a4a", "#b07a4a")).toBe(1)
    })

    it("reads a hex with or without the hash, in either case", () => {
        expect(relLuminance("b07a4a")).toBe(relLuminance("#B07A4A"))
    })

    it("returns 0 for something that is not a colour", () => {
        // Deliberate: an unparseable value must not be treated as light. It is
        // resolveAccent's job to make sure one never reaches the derivation.
        expect(relLuminance("nope")).toBe(0)
    })
})

describe("resolveAccent", () => {
    const theme = resolveTheme("washi")

    it("keeps a valid accent, normalised", () => {
        expect(resolveAccent("#B07A4A", theme)).toBe("#b07a4a")
        expect(resolveAccent("  #eba65c  ", theme)).toBe("#eba65c")
    })

    it("adds the hash a bare hex is missing, so what is derived is what paints", () => {
        expect(resolveAccent("aabbcc", theme)).toBe("#aabbcc")
    })

    it("falls back to the theme's own accent for anything else", () => {
        for (const bad of [undefined, null, "", "red", "#abc", "#12345g", 42, {}]) {
            expect(resolveAccent(bad, theme)).toBe(theme.accent)
        }
    })

    it("does not resolve an inherited property name to a colour", () => {
        expect(resolveAccent("constructor", theme)).toBe(theme.accent)
    })
})
