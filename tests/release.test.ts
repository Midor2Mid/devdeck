import { describe, it, expect } from "vitest"
import { parseCommit } from "../src/main/release"

const SEP = "\x1f"

describe("parseCommit", () => {
    it("parses a well-formed commit line", () => {
        const line = ["a1b2c3d", "feat: add board", "Ray", "2 hours ago"].join(SEP)
        expect(parseCommit(line)).toEqual({
            sha: "a1b2c3d",
            subject: "feat: add board",
            author: "Ray",
            when: "2 hours ago"
        })
    })
    it("returns null for empty/short lines", () => {
        expect(parseCommit("")).toBeNull()
        expect(parseCommit("a1b2c3d" + SEP + "only two")).toBeNull()
    })
    it("keeps subjects that contain separators-safe text", () => {
        const line = ["sha", "fix: a, b and c", "Dev", "yesterday"].join(SEP)
        expect(parseCommit(line)?.subject).toBe("fix: a, b and c")
    })
})
