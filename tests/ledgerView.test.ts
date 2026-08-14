import { describe, it, expect } from "vitest"
import { runTotals, filterRuns, formatDuration } from "../src/renderer/src/ledgerView"
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
            rec({ cost: 99, tokens: 990, exclusive: false })
        ])
        expect(t).toEqual({ cost: 3, tokens: 30, counted: 2, excluded: 1 })
    })

    it("reports zero with the exclusion count when nothing is eligible", () => {
        // Not an empty string, not a dash: the honest answer is $0 plus the
        // reason the rows on screen did not contribute to it.
        expect(runTotals([rec({ cost: 5, exclusive: false })])).toEqual({
            cost: 0, tokens: 0, counted: 0, excluded: 1
        })
    })

    it("is zero for no runs at all", () => {
        expect(runTotals([])).toEqual({ cost: 0, tokens: 0, counted: 0, excluded: 0 })
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
