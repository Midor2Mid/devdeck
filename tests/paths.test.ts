import { describe, it, expect } from "vitest"
import { normDir, sameDir } from "../src/shared/paths"

describe("sameDir", () => {
    it("folds both sides to one spelling, which is the key an identity is built on", () => {
        // normDir is exported because buildOwnership keys its map on it: the
        // comparison and the KEY have to be the same fold, or two agents in one
        // tree land in two buckets - the a0d925a bug, one level up.
        expect(normDir("D:\\A\\b\\")).toBe("d:/a/b")
        expect(normDir("D:/A/b")).toBe(normDir("d:\\a\\B"))
    })
    it("matches across separator styles, which is the bug it exists for", () => {
        expect(sameDir("D:\\repo.worktrees\\br", "D:/repo.worktrees/br")).toBe(true)
    })
    it("ignores a trailing separator and case", () => {
        expect(sameDir("D:/A/b/", "d:/a/B")).toBe(true)
    })
    it("does not match different directories", () => {
        expect(sameDir("D:/a/b", "D:/a/c")).toBe(false)
    })
    it("is false for an empty path on either side", () => {
        expect(sameDir("", "D:/a")).toBe(false)
        expect(sameDir("D:/a", "")).toBe(false)
    })
})
