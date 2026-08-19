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

const STORE = fileURLToPath(new URL("../src/renderer/src/store.ts", import.meta.url))

/**
 * store.ts with its comments blanked out.
 *
 * Not cosmetic: without it, commenting a call OUT still satisfies the scan -
 * which is precisely the mutation this file exists to catch, and it passed
 * against a `// markLaunched(...)` on the first attempt. Line-oriented and
 * deliberately crude: the only things scanned for are call sites.
 */
const lines = readFileSync(STORE, "utf8")
    .split("\n")
    .map((l) => {
        const t = l.trim()
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return ""
        return l.replace(/\/\/.*$/, "")
    })

/** 1-based line numbers of real code containing `needle`. */
function linesWith(needle: string): number[] {
    const hits: number[] = []
    lines.forEach((l, i) => {
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
