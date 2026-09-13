import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { pointerStep, type PointerAt } from "../src/renderer/src/hoverSelect"

/**
 * The rule that keeps a resting mouse out of the keyboard's way.
 *
 * The palette scrolls the selected row into view on every arrow key. Scrolling
 * slides a NEW row under a pointer that never moved, and the browser then fires
 * hover events at it to refresh `:hover` - `mouseenter`, and in Chromium a
 * synthetic `mousemove` carrying the pointer's UNCHANGED coordinates. Wiring
 * hover-select to either of those hands the cursor back to wherever the mouse
 * happens to be lying, about seven rows down: the bottom of the list becomes
 * unreachable, and `Ctrl+K, Enter` preselects whichever project the mouse is
 * resting on instead of the previous one.
 *
 * So movement is defined by COORDINATES, not by the event's name, and the first
 * position we ever see is a sighting rather than a move - that is the palette
 * opening under a pointer that has been still for a minute.
 */
describe("pointerStep", () => {
    const at = (x: number, y: number): PointerAt => ({ x, y })

    it("treats the first sighting as a resting place, not a move", () => {
        // The palette opens centred under wherever the mouse already is. If
        // that first event selected, `Ctrl+K, Enter` would run the row the
        // mouse is lying on - the exact gesture the merge had to preserve.
        expect(pointerStep(null, at(400, 300))).toEqual({ at: at(400, 300), moved: false })
    })

    it("never lets a stationary pointer win, however many events arrive", () => {
        let last: PointerAt | null = null
        // Twenty arrow keys, each scrolling the list and each re-firing hover
        // at the same screen coordinates.
        for (let i = 0; i < 20; i++) {
            const step = pointerStep(last, at(400, 300))
            expect(step.moved).toBe(false)
            last = step.at
        }
    })

    it("selects as soon as the pointer really moves, by a single pixel", () => {
        expect(pointerStep(at(400, 300), at(401, 300)).moved).toBe(true)
        expect(pointerStep(at(400, 300), at(400, 301)).moved).toBe(true)
    })

    it("stops selecting again once the pointer comes to rest somewhere new", () => {
        const moved = pointerStep(at(400, 300), at(400, 340))
        expect(moved).toEqual({ at: at(400, 340), moved: true })
        // The list scrolls under it from here; same coordinates, no more steals.
        expect(pointerStep(moved.at, at(400, 340)).moved).toBe(false)
    })

    it("tracks the latest position even when it did not select", () => {
        // A seeded position must still be updated, or a pointer that was seen
        // at the palette's edge and then rested mid-list would compare against
        // a stale point forever and select on every scroll.
        expect(pointerStep(null, at(10, 10)).at).toEqual(at(10, 10))
    })
})

/**
 * The wiring, scanned rather than rendered: `environment: "node"` and no
 * component tests, so the gate above can be correct while the palette still
 * carries the ungated door. Crude in the manner of tests/shortcutsWiring.ts -
 * what it buys is that removing the gate cannot be quiet.
 */
const GATED_LISTS = ["CommandPalette.tsx", "SearchModal.tsx"]

/** A component's source with comments blanked - a doc comment may name a handler. */
function componentCode(file: string): string {
    const src = readFileSync(
        fileURLToPath(new URL("../src/renderer/src/components/" + file, import.meta.url)),
        "utf8"
    )
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
}

describe.each(GATED_LISTS)("%s's hover-select goes through the gate", (file) => {
    const code = componentCode(file)

    it("does not select on mouseenter, which fires when the list scrolls", () => {
        expect(code).not.toContain("onMouseEnter")
    })

    it("selects on a real pointer move, through pointerStep", () => {
        expect(code).toContain("onMouseMove")
        expect(code).toContain("pointerStep(")
    })
})

/**
 * And the same rule for a list nobody has written yet.
 *
 * The pin above names the two scrolling lists that exist. SearchModal carried
 * the identical ungated handler and was found only because a human read the
 * palette's fix and went looking - the defect is a shape, not a file, so the
 * third list must not arrive unguarded the way the second one did. Directory
 * scoped for the same reason the status pins in tests/signalSites.test.ts are:
 * a new file is covered by existing.
 *
 * Deliberately narrow. `onMouseEnter` is legitimate - AgentKey uses it for a
 * tooltip - and only setting the SELECTION from it is the defect, because that
 * is the state the arrow keys also own. A rule that banned the handler outright
 * would be ignored within a week.
 */
describe("no renderer component selects from a bare mouseenter", () => {
    const dir = fileURLToPath(new URL("../src/renderer/src/components/", import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"))

    it("has components to scan at all", () => {
        expect(files.length).toBeGreaterThan(20)
    })

    it.each(files)("%s", (file) => {
        const code = componentCode(file)
        // The exact shape that fought the keyboard in two files: a mouseenter
        // whose whole body is a selection setter.
        expect(code).not.toMatch(/onMouseEnter=\{\(\)\s*=>\s*set(Sel|Selected|Index|Active)/)
    })
})
