import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// The wiring, pinned in source. The whole-branch reviewer commented out ALL
// EIGHT markLaunched/captureBaseline calls in store.ts and ran the five suites
// that plausibly covered them: 126/126 passed. The unit tests seed their own
// signals by calling markLaunched and captureBaseline directly, so the only
// thing standing between the shipped behaviour and Task 3's original
// newTab-only bug was a JSDoc sentence.
//
// Two invariants, two shapes. `markLaunched` genuinely belongs on every launch
// path - stall applies to every session - so it is pinned here, structurally,
// against the one marker every launch path already has. `captureBaseline` is
// NOT a launch concern: the baseline is a property of the CARD, and only
// dispatchBoardTask ever writes task.termId, so it has exactly two card-
// lifecycle sites and a new launch path needs no change at all. That count is
// what this file pins; tests/cardReview.test.ts and tests/dispatchBoardTask.ts
// pin the behaviour of each site.

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))
const STORE = src("../src/renderer/src/store.ts")

/**
 * A file's EXECUTABLE lines: comments and quoted literals blanked, line numbers
 * preserved.
 *
 * Not cosmetic - every removal here was added because a mutation got past the
 * version without it. Stripping `//` came first (commenting a call OUT still
 * satisfied the scan, the exact mutation this file exists to catch). A
 * re-review then got two more through: a block comment wrapped around a call,
 * and a decoy string literal spelling the call. A scan a one-line edit can fool
 * is worse than no scan, because it reports a confidence it does not have.
 *
 * Deliberately crude for all that: line-oriented, and the only things looked
 * for are call sites. It is not a parser and must not grow into one.
 */
function stripCode(text: string): string[] {
    let inBlock = false
    return text
        .split("\n")
        .map((raw) => {
            let l = raw
            if (inBlock) {
                const end = l.indexOf("*/")
                if (end === -1) return ""
                l = " ".repeat(end + 2) + l.slice(end + 2)
                inBlock = false
            }
            // Block comments opened and closed within this line.
            l = l.replace(/\/\*[\s\S]*?\*\//g, " ")
            const opens = l.indexOf("/*")
            if (opens !== -1) {
                l = l.slice(0, opens)
                inBlock = true
            }
            const slashes = l.indexOf("//")
            if (slashes !== -1) l = l.slice(0, slashes)
            // A quoted literal can spell a call without being one.
            return l
                .replace(/"[^"]*"/g, '""')
                .replace(/'[^']*'/g, "''")
                .replace(/`[^`]*`/g, "``")
        })
}

/** The executable lines of a file on disk. */
function codeLines(path: string): string[] {
    return stripCode(readFileSync(path, "utf8"))
}

const lines = codeLines(STORE)

/** 1-based line numbers of real code containing `needle`. */
function linesWith(needle: string, from: string[] = lines): number[] {
    const hits: number[] = []
    from.forEach((l, i) => {
        if (l.includes(needle)) hits.push(i + 1)
    })
    return hits
}

describe("every agent-launch path stamps a launch instant", () => {
    // logUsageStart is the marker: it is called on every path that spawns an
    // agent pty (it has to be - an unlogged session breaks cost exclusivity),
    // and it is money-critical, so it is the one call nobody quietly drops.
    const launchSites = linesWith("logUsageStart(")

    it("finds the launch sites at all", () => {
        // Guards the test itself: a rename that made the scan match nothing
        // would otherwise leave this file passing vacuously forever.
        expect(launchSites.length).toBeGreaterThanOrEqual(4)
    })

    it.each(launchSites)("markLaunched precedes the logUsageStart at line %i", (line) => {
        // A few lines of slack: the two calls sit together, but the usage call
        // is a multi-line `useSettings.getState().logUsageStart(` on most paths.
        const window = lines.slice(Math.max(0, line - 9), line).join("\n")
        expect(window).toContain("markLaunched(")
    })
})

describe("the baseline is captured on the card's lifecycle, not the pane's", () => {
    it("has exactly two capture sites", () => {
        // Dispatch (the only writer of task.termId) and entering `doing` (the
        // rebase). Adding a third means the baseline has drifted back into
        // being a property of the session - which is what left splitActive and
        // openWorkspacePreset firing `git status` for baselines no reader could
        // ever consult.
        expect(linesWith("captureBaseline(")).toHaveLength(2)
    })
})

describe("the scanner itself", () => {
    // The scan is only worth anything if it cannot be talked out of a finding,
    // so the stripping is tested directly against the three mutations that have
    // actually got past it.
    // Exercising the same function the real scan runs on store.ts, not a
    // re-implementation of it - the point of the whole file is that a pin which
    // paraphrases the thing it pins proves nothing.
    const strip = stripCode

    it("ignores a line-commented call", () => {
        expect(strip("    // markLaunched(termId)")[0]).not.toContain("markLaunched(")
    })

    it("ignores a call wrapped in a block comment on one line", () => {
        expect(strip("    /* markLaunched(termId) */")[0]).not.toContain("markLaunched(")
    })

    it("ignores a call inside a block comment spanning lines", () => {
        const out = strip("    /*\n    markLaunched(termId)\n    */\n    real()")
        expect(out.slice(0, 3).join("\n")).not.toContain("markLaunched(")
        // …and comes back out the other side, so a block comment cannot blind
        // the scan to everything below it.
        expect(out[3]).toContain("real()")
    })

    it("ignores a call spelled inside a string literal", () => {
        expect(strip('    const decoy = "markLaunched(termId)"')[0]).not.toContain(
            "markLaunched("
        )
        expect(strip("    const decoy = `markLaunched(termId)`")[0]).not.toContain(
            "markLaunched("
        )
    })

    it("still sees a real call on a line that also carries a comment", () => {
        expect(strip("    markLaunched(termId) // stamp it")[0]).toContain("markLaunched(")
    })
})

// N3. The two fixes that live in a component were pinned by nothing: this repo
// has no component tests, so replacing MissionControl's `awaited.has(s.termId)`
// argument with a constant `true` restored the I1 regression - every quiet
// session marked stalled - with the entire suite green. Same class for the
// Settings field: idleClamp.test.ts drives the two pure functions through a
// local harness, which says nothing about whether the component still calls
// them. These are argument-level pins, in the same style as the launch scan
// above, and they are the cheapest thing that fails when the wiring is undone.
//
// Mission's tile-decision task moved the direct `isStalled(` call out of this
// component and into `resolveTileState` (tileState.ts), which is now the one
// place isStalled is called from — tileState.test.ts pins that call at the
// pure-function level. What remained a component-only risk, and still needs
// this file's kind of scan, is the WIRING one level up: does the component
// still pass the real awaited set into the resolver, or a constant.

const MISSION = src("../src/renderer/src/components/MissionControl.tsx")
const SETTINGS = src("../src/renderer/src/components/SettingsModal.tsx")

/** The `n` code lines starting at the sole line containing `needle`. */
function callSite(needle: string, from: string[], n = 12): string {
    const at = linesWith(needle, from)
    expect(at, "expected exactly one " + needle + " call site").toHaveLength(1)
    return from.slice(at[0] - 1, at[0] - 1 + n).join("\n")
}

describe("the stall marker is still gated on expectation", () => {
    const mission = codeLines(MISSION)

    // The fields resolveTileState is given now live one level up, in the
    // `input` object each resolved entry keeps (so the header's wantsYou count
    // and the tile's own resolveTileState call agree on the same facts) - so
    // the wiring pin has to anchor on that object, not on the resolveTileState
    // call site itself, which now just reads `resolveTileState(input, now)`.
    it("builds the tile-state input from the awaited set, the exit code and the changed count - not constants", () => {
        const input = callSite("const input = {", mission, 8)
        expect(input).toContain("awaited: awaited.has(s.termId)")
        // A constant in any of these positions type-checks and leaves the
        // suite green - the exact failure mode this file exists to catch.
        // `awaited: true` restores I1's stalled-everything regression;
        // `exitCode: undefined` makes every corpse read as its live state;
        // `changedCount: 0` is I4's swallowed-git-error bug moved into the
        // wiring itself.
        expect(input).not.toContain("awaited: true")
        expect(input).toContain("exitCode: exitCodeOf(s.termId)")
        expect(input).not.toContain("exitCode: undefined")
        expect(input).toContain("changedCount: changedBySession[s.termId] ?? 0")
        expect(input).not.toContain("changedCount: 0")
    })

    it("passes that same input into resolveTileState, rather than rebuilding it", () => {
        expect(callSite("resolveTileState(", mission, 1)).toContain("resolveTileState(input, now)")
    })

    it("derives the awaited set from the board and the pipeline run", () => {
        const derive = callSite("awaitedTermIds(", mission, 1)
        expect(derive).toContain("boardTasks")
        expect(derive).toContain("pipelineRun")
    })
})

describe("the quiet-after field still commits rather than clamps as you type", () => {
    const settings = codeLines(SETTINGS)
    // Anchored on the label rather than on any one call, so the window covers
    // the whole input including the attributes above the value binding - and so
    // ripping the wiring out cannot move the window away from the evidence.
    const field = (): string => callSite("Quiet after (ms)", settings, 36)

    it("renders the draft and commits on blur", () => {
        expect(field()).toContain("value={idleFieldValue(")
        expect(field()).toContain("setIdleDraft(e.target.value)")
        expect(field()).toContain("commitIdleMs(")
        // THE REGRESSION: clamping inside onChange. `setAgentIdleMs` belongs in
        // the blur/commit handler, never against a keystroke.
        expect(field()).not.toContain("onChange={(e) => setAgentIdleMs(")
    })

    it("takes its floor from the exported constant", () => {
        // M2: a hardcoded 300 beside an exported IDLE_MIN.
        expect(field()).toContain("min={IDLE_MIN}")
        expect(field()).not.toContain("min={300}")
    })

    it("cancels the draft on Escape instead of losing it", () => {
        // N5. Commit-on-blur made this the one Settings field whose typing could
        // vanish: the modal's Escape unmounts the input and React fires no blur
        // on unmount. Capture phase, because Modal's own Escape listener is a
        // native bubble-phase one on a DOM ancestor. (The key name itself is a
        // string literal, which the scanner blanks - these three tokens are what
        // survives, and they are only ever written together.)
        const f = field()
        expect(f).toContain("onKeyDownCapture")
        expect(f).toContain("e.stopPropagation()")
        expect(f).toContain("setIdleDraft(null)")
    })
})
