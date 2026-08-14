import { describe, it, expect } from "vitest"
import {
    runTotals,
    filterRuns,
    formatCost,
    formatDuration,
    runsSentence,
    type RunTotals
} from "../src/renderer/src/ledgerView"
import type { RunRecord } from "../src/main/ledger"

function rec(over: Partial<RunRecord> = {}): RunRecord {
    return {
        id: "r1", kind: "card", projectId: "p1", projectName: "Proj",
        label: "Fix the login redirect", startedAt: 1000, endedAt: 2000,
        agentIds: ["claude"], cost: 0.42, tokens: 1234, exclusive: true, ...over
    }
}

describe("runTotals", () => {
    it("sums only exclusive runs and reports the exclusions", () => {
        const t = runTotals([
            rec({ cost: 1, tokens: 10, exclusive: true }),
            rec({ cost: 2, tokens: 20, exclusive: true }),
            rec({ cost: 99, tokens: 990, exclusive: false, reason: "shared" })
        ])
        expect(t).toEqual({
            cost: 3, counted: 2, excluded: 1, excludedShared: 1, excludedUnpriced: 0
        })
    })

    it("reports zero with the exclusion count when nothing is eligible", () => {
        // Not an empty string, not a dash: the honest answer is $0 plus the
        // reason the rows on screen did not contribute to it.
        expect(runTotals([rec({ cost: 5, exclusive: false, reason: "shared" })])).toEqual({
            cost: 0, counted: 0, excluded: 1, excludedShared: 1, excludedUnpriced: 0
        })
    })

    it("counts the two exclusion reasons apart", () => {
        const t = runTotals([
            rec({ exclusive: false, reason: "shared" }),
            rec({ exclusive: false, reason: "unpriced" }),
            rec({ exclusive: false, reason: "unpriced" })
        ])
        expect(t).toMatchObject({ excluded: 3, excludedShared: 1, excludedUnpriced: 2 })
    })

    // Written before runs carried a reason. It is excluded, and that is all it
    // says - inventing one for it is the fabrication the field exists to stop.
    it("counts a reasonless exclusion without guessing at a reason", () => {
        const t = runTotals([rec({ exclusive: false })])
        expect(t).toMatchObject({ excluded: 1, excludedShared: 0, excludedUnpriced: 0 })
    })

    it("is zero for no runs at all", () => {
        expect(runTotals([])).toEqual({
            cost: 0, counted: 0, excluded: 0, excludedShared: 0, excludedUnpriced: 0
        })
    })
})

describe("filterRuns", () => {
    it("filters by kind and by project independently and together", () => {
        const runs = [
            rec({ id: "a", kind: "card", projectId: "p1" }),
            rec({ id: "b", kind: "race", projectId: "p1" }),
            rec({ id: "c", kind: "card", projectId: "p2" })
        ]
        expect(filterRuns(runs, "card").map((r) => r.id)).toEqual(["a", "c"])
        expect(filterRuns(runs, undefined, "p1").map((r) => r.id)).toEqual(["a", "b"])
        expect(filterRuns(runs, "card", "p1").map((r) => r.id)).toEqual(["a"])
        expect(filterRuns(runs).map((r) => r.id)).toEqual(["a", "b", "c"])
    })
})

describe("formatCost", () => {
    it("writes zero as $0, never blank and never a dash", () => {
        expect(formatCost(0)).toBe("$0")
        expect(formatCost(4.184)).toBe("$4.18")
        expect(formatCost(0.004)).toBe("$0.00")
    })
})

describe("runsSentence", () => {
    const totals = (over: Partial<RunTotals> = {}): RunTotals => ({
        cost: 0, counted: 0, excluded: 0, excludedShared: 0, excludedUnpriced: 0, ...over
    })

    it("counts the rows on screen, not the rows that paid into the total", () => {
        // 15 rows, 3 of them attributions: the money is the exclusive 12's, but
        // "N runs" describes what the user is looking at. Stating 12 above 15
        // rendered rows would be false about the screen.
        const s = runsSentence(
            totals({ cost: 4.18, counted: 12, excluded: 3, excludedShared: 3 }),
            15,
            true
        )
        expect(s.count).toBe(15)
        expect(s.unit).toBe("runs")
        expect(s.cost).toBe("$4.18")
        expect(s.why).toBe("3 excluded from the total (shared a project with another session)")
    })

    it("says $0 and why when every row on screen is an attribution", () => {
        const s = runsSentence(totals({ excluded: 3, excludedShared: 3 }), 3, true)
        expect(s.count).toBe(3)
        expect(s.cost).toBe("$0")
        expect(s.why).toBe("3 excluded from the total (shared a project with another session)")
    })

    // The two reasons are different facts about the user's money, so a mix says
    // both - and each gets its own count, because one number can no longer
    // stand for the whole clause.
    it("names each exclusion reason when the excluded rows differ", () => {
        const s = runsSentence(
            totals({ excluded: 4, excludedShared: 1, excludedUnpriced: 3 }),
            4,
            true
        )
        expect(s.why).toBe(
            "4 excluded from the total (1 shared a project with another session, " +
                "3 had no cost to vouch for)"
        )
    })

    it("says only that a reasonless exclusion is not a receipt", () => {
        expect(runsSentence(totals({ excluded: 2 }), 2, true).why).toBe(
            "2 excluded from the total (not receipts)"
        )
    })

    it("uses the whole-clause phrasing when one reason covers every exclusion", () => {
        expect(runsSentence(totals({ excluded: 2, excludedUnpriced: 2 }), 2, true).why).toBe(
            "2 excluded from the total (had no cost to vouch for)"
        )
    })

    it("distinguishes an empty ledger from a filter that matched nothing", () => {
        expect(runsSentence(totals(), 0, false).why).toBe("nothing recorded yet")
        expect(runsSentence(totals(), 0, true).why).toBe("no runs match this filter")
    })

    it("has no trailing clause when the total covers every row shown", () => {
        const s = runsSentence(totals({ cost: 1.5, counted: 1 }), 1, true)
        expect(s.unit).toBe("run")
        expect(s.why).toBe("")
    })
})

describe("formatDuration", () => {
    it("reads in the largest sensible unit", () => {
        expect(formatDuration(45_000)).toBe("45s")
        expect(formatDuration(90_000)).toBe("1m 30s")
        expect(formatDuration(3_700_000)).toBe("1h 1m")
    })
    it("never renders a negative or nonsense duration", () => {
        expect(formatDuration(-5)).toBe("0s")
        expect(formatDuration(NaN)).toBe("0s")
    })
})
