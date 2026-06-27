import { describe, it, expect } from "vitest"
import { globToRegExp, matchGlob, normalizeRel } from "../src/main/glob"

describe("normalizeRel", () => {
    it("converts backslashes and strips ./", () => {
        expect(normalizeRel("src\\app\\Foo.cs")).toBe("src/app/Foo.cs")
        expect(normalizeRel("./a/b")).toBe("a/b")
    })
})

describe("globToRegExp", () => {
    it("* does not cross slashes", () => {
        expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true)
        expect(globToRegExp("src/*.ts").test("src/sub/a.ts")).toBe(false)
    })
    it("** crosses slashes", () => {
        expect(globToRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true)
    })
    it("? matches a single non-slash char", () => {
        expect(globToRegExp("a?.ts").test("ab.ts")).toBe(true)
        expect(globToRegExp("a?.ts").test("a/.ts")).toBe(false)
    })
    it("is case-insensitive", () => {
        expect(globToRegExp("*.CS").test("foo.cs")).toBe(true)
    })
})

describe("matchGlob", () => {
    it("empty glob matches anything", () => {
        expect(matchGlob("", "any/path.txt")).toBe(true)
    })
    it("slash-less pattern matches basename anywhere", () => {
        expect(matchGlob("*.cs", "src/app/Foo.cs")).toBe(true)
        expect(matchGlob("*.cs", "src/app/Foo.ts")).toBe(false)
    })
    it("path pattern matches full relative path", () => {
        expect(matchGlob("src/**/*.cs", "src/a/b/Foo.cs")).toBe(true)
        expect(matchGlob("src/**/*.cs", "tests/Foo.cs")).toBe(false)
    })
    it("normalizes backslash paths before matching", () => {
        expect(matchGlob("src/**/*.ts", "src\\app\\x.ts")).toBe(true)
    })
})
