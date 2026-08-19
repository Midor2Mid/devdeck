import { describe, expect, it } from "vitest"
import { newPathsSince } from "../src/renderer/src/agentSignals"

describe("newPathsSince", () => {
    it("reports a path that appeared after the baseline", () => {
        expect(newPathsSince(new Set(["a.ts"]), ["a.ts", "b.ts"])).toEqual(["b.ts"])
    })
    it("ignores dirt that was already there", () => {
        // The dominant false positive: a project dirty before the agent started.
        expect(newPathsSince(new Set(["a.ts", "b.ts"]), ["a.ts", "b.ts"])).toEqual([])
    })
    it("treats an unknown baseline as no evidence, not as everything", () => {
        expect(newPathsSince(undefined, ["a.ts", "b.ts"])).toEqual([])
    })
    it("handles an empty baseline in a clean repo", () => {
        expect(newPathsSince(new Set(), ["new.ts"])).toEqual(["new.ts"])
    })
    it("does not report a path that disappeared", () => {
        expect(newPathsSince(new Set(["a.ts"]), [])).toEqual([])
    })
    it("returns paths in the order given", () => {
        expect(newPathsSince(new Set(), ["z.ts", "a.ts"])).toEqual(["z.ts", "a.ts"])
    })
})
