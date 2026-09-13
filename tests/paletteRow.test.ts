import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * A palette row's flex order: what shrinks, and what may not.
 *
 * Two defects of the same family, found on the real rows in all six skins:
 *
 *   - `.palette-title` and `.palette-path` both carried `flex-shrink: 1`, so
 *     flexbox took from both in proportion to their base widths. The NAME - the
 *     identity - rendered at 17-20px and clipped to `q..` while the path, the
 *     disambiguator, kept 388-446px. Exactly inverted.
 *   - `.probe-tag` was shrinkable and wrapping, so `FOLDER MISSING` went to two
 *     lines and made its row 52px against 37px for every other row. The same
 *     defect `.tab-dot`, `.claude-attn` and `.deck-key .agent-badge` were each
 *     fixed for: a trailing run on a flex row is a fact, not slack.
 *
 * Pinned in CSS text rather than measured, because there is no renderer here.
 */
describe("what shrinks on a palette row", () => {
    const css = readFileSync(
        fileURLToPath(new URL("../src/renderer/src/styles.css", import.meta.url)),
        "utf8"
    )
    const rule = (sel: string): string => {
        const i = css.indexOf("\n" + sel + " {")
        expect(i, `no rule for ${sel}`).toBeGreaterThan(-1)
        return css.slice(i, css.indexOf("}", i))
    }

    it("gives the path a zero basis, so it absorbs the slack and yields it back first", () => {
        // `flex: 1 1 0` and not `1 1 auto`: with a zero basis the path's share
        // of any DEFICIT is zero, so it gives its grown width back before the
        // title loses a character - and it still fills the free space when
        // there is any. `auto` is what made the two runs shrink together.
        expect(rule(".palette-path")).toContain("flex: 1 1 0")
    })

    it("keeps the name's shrink as a last resort, after the path is gone", () => {
        // Not `flex: none`: a pathological project name must ellipsise rather
        // than push the counts and the flag word off the row.
        const r = rule(".palette-title")
        expect(r).toContain("flex: 0 1 auto")
        expect(r).toContain("text-overflow: ellipsis")
    })

    it("lets no trailing run on a row shrink or wrap", () => {
        // `.probe-tag` is the one that was missing both, and the row it sits on
        // is the one whose folder is gone - the row least able to afford a
        // second defect.
        for (const sel of [
            ".palette-dim",
            ".palette-branch",
            ".palette-want",
            ".palette-kbd",
            ".probe-tag"
        ]) {
            const r = rule(sel)
            expect(r, `${sel} may wrap`).toContain("white-space: nowrap")
            expect(r, `${sel} may shrink`).toContain("flex: none")
        }
    })
})
