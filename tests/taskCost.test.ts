import { describe, it, expect } from "vitest"
import { costWindow, formatCost, type BoardTask } from "../src/renderer/src/board"

const task = (over: Partial<BoardTask>): BoardTask => ({
    id: "t1",
    projectId: "p1",
    title: "Do the thing",
    column: "todo",
    createdAt: 1000,
    ...over
})

describe("costWindow", () => {
    it("is null for a card never dispatched", () => {
        expect(costWindow(task({}), 5000)).toBeNull()
    })

    it("runs from dispatch to now while the card is still open", () => {
        expect(costWindow(task({ dispatchedAt: 2000 }), 5000)).toEqual({ from: 2000, to: 5000 })
    })

    it("closes at endedAt once the card is done", () => {
        expect(costWindow(task({ dispatchedAt: 2000, endedAt: 4000 }), 9999)).toEqual({
            from: 2000,
            to: 4000
        })
    })
})

describe("formatCost", () => {
    // The reason this exists: real per-card spend is often fractions of a cent, and
    // toFixed(2) renders that as "$0.00", which reads as free.
    it("never shows sub-cent work as $0.00", () => {
        expect(formatCost(0.004)).toBe("<$0.01")
        expect(formatCost(0.0001)).toBe("<$0.01")
    })

    it("shows exactly zero as $0", () => {
        expect(formatCost(0)).toBe("$0")
        expect(formatCost(-1)).toBe("$0")
    })

    it("shows cents for small amounts", () => {
        expect(formatCost(0.42)).toBe("$0.42")
        expect(formatCost(3.5)).toBe("$3.50")
    })

    it("drops decimals once the figure is large", () => {
        expect(formatCost(12.34)).toBe("$12")
        expect(formatCost(250.9)).toBe("$251")
    })
})
