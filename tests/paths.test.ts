import { describe, it, expect } from "vitest"
import { samePath } from "../src/renderer/src/paths"

describe("samePath", () => {
    it("matches across separator styles, which is the bug it exists for", () => {
        expect(samePath("D:\\repo.worktrees\\br", "D:/repo.worktrees/br")).toBe(true)
    })
    it("ignores a trailing separator and case", () => {
        expect(samePath("D:/A/b/", "d:/a/B")).toBe(true)
    })
    it("does not match different directories", () => {
        expect(samePath("D:/a/b", "D:/a/c")).toBe(false)
    })
    it("is false for an empty path on either side", () => {
        expect(samePath("", "D:/a")).toBe(false)
        expect(samePath("D:/a", "")).toBe(false)
    })
})
