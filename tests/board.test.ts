import { describe, it, expect } from "vitest"
import { COLUMNS, tasksByColumn, parseChecklist, type BoardTask } from "../src/renderer/src/board"

function task(over: Partial<BoardTask>): BoardTask {
    return { id: "t", projectId: "p", title: "x", column: "todo", createdAt: 0, ...over }
}

describe("COLUMNS", () => {
    it("is the four columns in order", () => {
        expect(COLUMNS).toEqual(["todo", "doing", "review", "done"])
    })
})

describe("tasksByColumn", () => {
    it("filters to the project and groups by column, preserving order", () => {
        const g = tasksByColumn(
            [
                task({ id: "a", projectId: "p1", column: "todo" }),
                task({ id: "b", projectId: "p2", column: "todo" }),
                task({ id: "c", projectId: "p1", column: "doing" }),
                task({ id: "d", projectId: "p1", column: "todo" })
            ],
            "p1"
        )
        expect(g.todo.map((t) => t.id)).toEqual(["a", "d"])
        expect(g.doing.map((t) => t.id)).toEqual(["c"])
        expect(g.review).toEqual([])
        expect(g.done).toEqual([])
    })
})

describe("parseChecklist", () => {
    it("splits lines and strips bullet / numbering / checkbox markers", () => {
        expect(parseChecklist("- one\n* two\n1. three\n[ ] four\n[x] five")).toEqual([
            "one",
            "two",
            "three",
            "four",
            "five"
        ])
    })
    it("skips blank lines and trims", () => {
        expect(parseChecklist("  a  \n\n   \n b ")).toEqual(["a", "b"])
    })
})
