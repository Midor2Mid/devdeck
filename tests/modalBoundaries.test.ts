import { describe, it, expect, vi } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { ModalBoundary } from "../src/renderer/src/components/Modal"
import { RegionBoundary } from "../src/renderer/src/components/RegionBoundary"

/**
 * Every overlay is behind a boundary, and each boundary has a way out.
 *
 * The failure this guards is specific and was reproduced on purpose: a throw
 * inside WorktreesModal took the WHOLE renderer down, leaving several ptys
 * running in main with nothing able to see or answer them. A stranger who
 * whitescreens on day one gives you an uninstall, not evidence.
 *
 * Crude on purpose, in the manner of tests/shortcutsWiring.test.ts and
 * tests/signalSites.test.ts: it reads the source and looks for the literal
 * wiring. What it buys is that the enumeration cannot silently regress - a new
 * overlay added without a boundary fails here, which is exactly how the last
 * eleven of these came to be missing one at a time.
 */

const dir = fileURLToPath(new URL("../src/renderer/src/components/", import.meta.url))
const read = (f: string): string => readFileSync(dir + f, "utf8")

/**
 * A file's executable text: comments blanked, newlines kept. A scan a `//` can
 * satisfy reports a confidence it does not have - and every one of these files
 * mentions the boundary in prose.
 */
function stripComments(text: string): string {
    let inBlock = false
    return text
        .split("\n")
        .map((line) => {
            let out = ""
            let i = 0
            while (i < line.length) {
                if (inBlock) {
                    const end = line.indexOf("*/", i)
                    if (end === -1) return out
                    inBlock = false
                    i = end + 2
                    continue
                }
                if (line.startsWith("/*", i)) {
                    inBlock = true
                    i += 2
                    continue
                }
                if (line.startsWith("//", i)) return out
                out += line[i]
                i++
            }
            return out
        })
        .join("\n")
}

/** `Modal.tsx` is the shared shell and the boundary itself, not an overlay. */
const SHELL = "Modal.tsx"
/**
 * Overlays whose boundary sits at the App.tsx call site instead, verified
 * below. Listed rather than skipped: an exemption nobody can see is how a
 * count of "17 unguarded" got carried in a comment for a whole release.
 */
const GUARDED_AT_CALL_SITE = ["SettingsModal.tsx"]

const overlays = readdirSync(dir)
    .filter((f) => f.endsWith("Modal.tsx") && f !== SHELL)
    .sort()

describe("every overlay is behind an error boundary", () => {
    it("finds the overlays to check", () => {
        // If this drops to nothing the two tests below pass vacuously.
        expect(overlays.length).toBeGreaterThan(8)
    })

    for (const file of overlays) {
        if (GUARDED_AT_CALL_SITE.includes(file)) continue
        it(`${file} renders its body inside a ModalBoundary`, () => {
            const src = stripComments(read(file))
            expect(src).toContain("<ModalBoundary")
            // The boundary must be the body's PARENT, not a sibling inside it:
            // React only catches throws from descendants, and these components
            // crash in their own render. A file that wrapped its own JSX would
            // pass a plain "contains ModalBoundary" check and catch nothing.
            expect(src).toMatch(/<ModalBoundary[\s\S]*?<[A-Z]\w*Body\b[\s\S]*?<\/ModalBoundary>/)
            expect(src).toMatch(/^function [A-Z]\w*Body\b/m)
        })
    }

    for (const file of GUARDED_AT_CALL_SITE) {
        it(`${file} is wrapped where App renders it`, () => {
            const app = stripComments(
                readFileSync(fileURLToPath(new URL("../src/renderer/src/App.tsx", import.meta.url)), "utf8")
            )
            const component = file.replace(".tsx", "")
            expect(app).toMatch(
                new RegExp(
                    String.raw`<RegionBoundary[\s\S]*?<` +
                        component +
                        String.raw`\s*/>[\s\S]*?</RegionBoundary>`
                )
            )
        })
    }
})

describe("ModalBoundary", () => {
    // No hooks, so the component can be called directly in the node env.
    const el = ModalBoundary({
        title: "t",
        description: "d",
        onClose: () => undefined,
        children: "body"
    })

    it("renders a RegionBoundary as an overlay", () => {
        // Not a panel-filling card: a modal has no slot to fill, and without
        // this the card takes flex:1 in the app column and shoves the deck off
        // screen while claiming only one region failed.
        expect(el.type).toBe(RegionBoundary)
        expect(el.props.overlay).toBe(true)
    })

    it("carries the way out, because the crashed modal took its own with it", () => {
        const onClose = vi.fn()
        const withClose = ModalBoundary({
            title: "t",
            description: "d",
            onClose,
            children: "body"
        })
        // The actions node is the Close control RegionBoundary renders beside
        // `Try again`. Without it the card is a dead end and the only escape is
        // the whole-app reload the boundary exists to avoid.
        const actions = withClose.props.actions as {
            props: { onClick: () => void; children: unknown }
        }
        expect(actions.props.children).toBe("Close")
        actions.props.onClick()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("passes no resetKey, so a latched card clears only on Try again or a reopen", () => {
        // RegionBoundary documents the bug: a boundary that treats any parent
        // re-render as a reset re-throws once per render, and App re-renders on
        // agent status, sessions, tabs and projects.
        expect(el.props.resetKey).toBeUndefined()
    })
})

/**
 * The containment itself, driven directly.
 *
 * There is no headless renderer here (no DOM environment, and no component
 * tests by policy), so the runtime proof is split: the tests above pin that the
 * boundary is the crashing component's PARENT, and these pin what the boundary
 * does once it latches. React's own dispatch between the two is its contract,
 * and is what the three overlays App already guarded were verified against.
 */
describe("a latched boundary contains the crash", () => {
    const props = {
        title: "The Worktrees window hit an error",
        description: "No worktree was created or removed.",
        overlay: true,
        children: "the modal body"
    }

    it("renders the card instead of the children it was handed", () => {
        expect(RegionBoundary.getDerivedStateFromError(new Error("boom"))).toEqual({
            error: expect.any(Error)
        })
        const b = new RegionBoundary(props)
        b.state = { error: new Error("boom"), key: undefined }
        const out = b.render() as { props: { className: string } }
        // Same scrim and z-index as .modal-backdrop: a crashed modal is still a
        // modal, and the cockpit behind it is still there.
        expect(out.props.className).toBe("region-crash overlay")
        // The children are not in the returned tree at all - that is the whole
        // of "the throw did not reach the root".
        expect(JSON.stringify(out)).not.toContain("the modal body")
    })

    it("reports the crash, so a window nobody was watching still leaves evidence", () => {
        const report = vi.fn()
        ;(globalThis as unknown as { window: unknown }).window = { api: { diagnostics: { report } } }
        const err = vi.spyOn(console, "error").mockImplementation(() => undefined)
        try {
            const b = new RegionBoundary(props)
            b.componentDidCatch(new Error("boom"), { componentStack: "at WorktreesBody" })
            expect(report).toHaveBeenCalledWith({
                source: "RegionBoundary: The Worktrees window hit an error",
                message: "boom",
                componentStack: "at WorktreesBody"
            })
        } finally {
            err.mockRestore()
        }
    })
})
