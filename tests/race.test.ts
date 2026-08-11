import { describe, it, expect } from "vitest"
import {
    parseShortstat,
    entrantBranch,
    isTerminal,
    survivors,
    raceSettled,
    raceSpend,
    type Entrant,
    type Race
} from "../src/renderer/src/race"

function ent(over: Partial<Entrant>): Entrant {
    return {
        agentId: "a", agentName: "Agent", worktree: "/w", branch: "b",
        baseHead: "1111111", status: "working", ...over
    }
}

function race(entrants: Entrant[]): Race {
    return {
        cardId: "c1", projectId: "p1", projectPath: "/proj", title: "add a button",
        gateCommand: "npm test", startedAt: 0, entrants
    }
}

describe("parseShortstat", () => {
    it("reads insertions and deletions", () => {
        expect(parseShortstat(" 3 files changed, 47 insertions(+), 3 deletions(-)")).toEqual({
            added: 47,
            removed: 3
        })
    })

    it("handles insertions only", () => {
        expect(parseShortstat(" 1 file changed, 12 insertions(+)")).toEqual({ added: 12, removed: 0 })
    })

    it("handles deletions only", () => {
        expect(parseShortstat(" 1 file changed, 5 deletions(-)")).toEqual({ added: 0, removed: 5 })
    })

    it("handles the singular forms git uses for one line", () => {
        expect(parseShortstat(" 1 file changed, 1 insertion(+), 1 deletion(-)")).toEqual({
            added: 1,
            removed: 1
        })
    })

    it("returns zeroes for empty or unrecognised output", () => {
        expect(parseShortstat("")).toEqual({ added: 0, removed: 0 })
        expect(parseShortstat("fatal: bad revision")).toEqual({ added: 0, removed: 0 })
    })
})

describe("entrantBranch", () => {
    it("combines the card title and the agent name", () => {
        expect(entrantBranch("Add pull button", "Claude")).toBe("Add pull button Claude")
    })

    it("gives two agents on one card different branches", () => {
        // A collision would put two agents in one worktree and silently invalidate
        // both their cost figures — this is the test that matters most here.
        expect(entrantBranch("same card", "Opus")).not.toBe(entrantBranch("same card", "Haiku"))
    })
})

describe("isTerminal", () => {
    it("is true only for finished states", () => {
        expect(isTerminal("passed")).toBe(true)
        expect(isTerminal("failed")).toBe(true)
        expect(isTerminal("nocommit")).toBe(true)
        expect(isTerminal("starting")).toBe(false)
        expect(isTerminal("working")).toBe(false)
        expect(isTerminal("gating")).toBe(false)
    })
})

describe("survivors", () => {
    it("returns only entrants that passed their gate", () => {
        const r = race([
            ent({ agentId: "x", status: "passed" }),
            ent({ agentId: "y", status: "failed" }),
            ent({ agentId: "z", status: "nocommit" }),
            ent({ agentId: "w", status: "working" })
        ])
        expect(survivors(r).map((e) => e.agentId)).toEqual(["x"])
    })

    it("is empty when everyone was eliminated", () => {
        expect(survivors(race([ent({ status: "failed" }), ent({ status: "nocommit" })]))).toEqual([])
    })
})

describe("raceSettled", () => {
    it("is true only when every entrant is terminal", () => {
        expect(raceSettled(race([ent({ status: "passed" }), ent({ status: "failed" })]))).toBe(true)
        expect(raceSettled(race([ent({ status: "passed" }), ent({ status: "gating" })]))).toBe(false)
    })

    it("is false for a race with no entrants", () => {
        // Nothing has finished because nothing started; "settled" would be a lie.
        expect(raceSettled(race([]))).toBe(false)
    })
})

describe("raceSpend", () => {
    it("totals what the race has cost so far", () => {
        expect(raceSpend(race([ent({ cost: 0.42 }), ent({ cost: 0.06 }), ent({})]))).toBeCloseTo(0.48, 5)
    })

    it("is zero before anything has been priced", () => {
        expect(raceSpend(race([ent({}), ent({})]))).toBe(0)
    })
})
