import { describe, it, expect } from "vitest"
import { parseGitGrep } from "../src/main/search"

describe("parseGitGrep", () => {
    it("parses path:line:text lines", () => {
        const out = parseGitGrep("src/a.ts:12:const x = 1\nsrc/b.ts:3:hello", 50)
        expect(out).toEqual([
            { file: "src/a.ts", line: 12, text: "const x = 1" },
            { file: "src/b.ts", line: 3, text: "hello" }
        ])
    })

    it("keeps colons that appear in the matched text", () => {
        const out = parseGitGrep("src/a.ts:7:const url = http://x:8080/y", 50)
        expect(out[0]).toEqual({ file: "src/a.ts", line: 7, text: "const url = http://x:8080/y" })
    })

    it("normalizes backslashes in the path to forward slashes", () => {
        const out = parseGitGrep("src\\main\\a.ts:1:hi", 50)
        expect(out[0].file).toBe("src/main/a.ts")
    })

    it("skips blank and malformed lines", () => {
        const out = parseGitGrep("\nnotavalidline\nsrc/a.ts:1:ok\n", 50)
        expect(out).toEqual([{ file: "src/a.ts", line: 1, text: "ok" }])
    })

    it("caps at maxPerProject", () => {
        const lines = Array.from({ length: 10 }, (_, i) => `f${i}.ts:1:x`).join("\n")
        expect(parseGitGrep(lines, 3)).toHaveLength(3)
    })

    it("clamps very long match text to 300 chars", () => {
        const long = "a".repeat(500)
        expect(parseGitGrep(`f.ts:1:${long}`, 50)[0].text).toHaveLength(300)
    })
})
