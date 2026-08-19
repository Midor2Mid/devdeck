import { describe, expect, it, afterEach } from "vitest"
import { newPathsSince, captureBaseline, baselineOf, forgetSignals } from "../src/renderer/src/agentSignals"

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

/** Stub the slice of window.api that captureBaseline reads. */
function stubGitChanges(changes: () => Promise<{ path: string }[]>): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: { git: { changes } }
    }
}

describe("captureBaseline", () => {
    afterEach(() => {
        delete (globalThis as unknown as { window?: unknown }).window
    })

    it("records the baseline on a successful read", async () => {
        stubGitChanges(async () => [{ path: "a.ts" }, { path: "b.ts" }])
        captureBaseline("s-ok", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-ok")).toEqual(new Set(["a.ts", "b.ts"]))
        forgetSignals("s-ok")
    })

    it("records an empty (not unknown) baseline for a genuinely clean repo", async () => {
        // Distinguishes "clean" from "unknown" at this layer too, not only in
        // newPathsSince's pure logic above: a clean repo must produce a real
        // (empty) Set, so a later comparison can tell it apart from a session
        // whose capture never resolved at all.
        stubGitChanges(async () => [])
        captureBaseline("s-clean", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-clean")).toEqual(new Set())
        forgetSignals("s-clean")
    })

    it("keeps the baseline unknown when the read rejects, not clean", async () => {
        // This exercises captureBaseline's OWN .catch, which was already
        // correct before this fix round -- the bug lived one layer down, in
        // main/changes.ts's listChanges resolving [] on a failed `git status`
        // instead of rejecting (see tests/changes.test.ts, which pins that
        // directly). This test guards against a regression here, at the
        // boundary this module actually owns.
        stubGitChanges(async () => {
            throw new Error("git status failed")
        })
        captureBaseline("s-fail", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-fail")).toBeUndefined()
        forgetSignals("s-fail")
    })
})
