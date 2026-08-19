import { describe, expect, it, afterEach } from "vitest"
import {
    newPathsSince,
    captureBaseline,
    baselineOf,
    forgetSignals
} from "../src/renderer/src/agentSignals"

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

describe("captureBaseline invalidates before it reads (fail-closed rebase)", () => {
    afterEach(() => {
        delete (globalThis as unknown as { window?: unknown }).window
    })

    it("drops the previous baseline when the re-capture rejects", async () => {
        // C1. A rebase (card dragged back to doing) captures over a baseline
        // that already exists. If that capture fails - `.git/index.lock` lost a
        // race, or an AV product killed the child - keeping the OLD baseline
        // fails OPEN: the files that earned review the first time are still
        // "fresh", so the card snaps straight back to review having produced
        // nothing. Unknown is the only honest state after a failed capture.
        stubGitChanges(async () => [{ path: "a.ts" }])
        captureBaseline("s-rebase", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-rebase")).toEqual(new Set(["a.ts"]))

        stubGitChanges(async () => {
            throw new Error("index.lock")
        })
        captureBaseline("s-rebase", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-rebase")).toBeUndefined()
        forgetSignals("s-rebase")
    })

    it("drops the previous baseline when there is no cwd to re-read", async () => {
        // The other silent-keep path: an empty cwd returned before touching the
        // map at all, so a rebase on a session whose directory can no longer be
        // resolved kept a baseline taken against a different moment in time.
        stubGitChanges(async () => [{ path: "a.ts" }])
        captureBaseline("s-nocwd", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-nocwd")).toEqual(new Set(["a.ts"]))

        captureBaseline("s-nocwd", "")
        expect(baselineOf("s-nocwd")).toBeUndefined()
        forgetSignals("s-nocwd")
    })

    it("is unknown while a re-capture is still in flight", async () => {
        // The in-flight window matters as much as the failure: between the drag
        // and the read resolving, the old baseline was still being compared
        // against. An idle pause in that window moved the card.
        stubGitChanges(async () => [{ path: "a.ts" }])
        captureBaseline("s-inflight", "/repo")
        await new Promise((r) => setTimeout(r, 0))

        let release: (files: { path: string }[]) => void = () => undefined
        stubGitChanges(
            () =>
                new Promise<{ path: string }[]>((r) => {
                    release = r
                })
        )
        captureBaseline("s-inflight", "/repo")
        expect(baselineOf("s-inflight")).toBeUndefined()

        release([{ path: "b.ts" }])
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-inflight")).toEqual(new Set(["b.ts"]))
        forgetSignals("s-inflight")
    })
})

describe("a capture that resolves too late", () => {
    afterEach(() => {
        delete (globalThis as unknown as { window?: unknown }).window
    })

    it("does not resurrect a session that was forgotten mid-read", async () => {
        // M1. forgetSignals runs when the pane closes, but a capture already in
        // flight still had a `.then` waiting to write. Every such session left an
        // entry behind for the rest of the process's uptime.
        let release: (files: { path: string }[]) => void = () => undefined
        stubGitChanges(
            () =>
                new Promise<{ path: string }[]>((r) => {
                    release = r
                })
        )
        captureBaseline("s-closed", "/repo")
        forgetSignals("s-closed")

        release([{ path: "a.ts" }])
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-closed")).toBeUndefined()
    })

    it("does not overwrite the baseline a newer capture already recorded", async () => {
        // Two captures overlapping: the older reply must not land on top of the
        // newer one, or a rebase resolves backwards to the launch-time dirt.
        let releaseOld: (files: { path: string }[]) => void = () => undefined
        stubGitChanges(
            () =>
                new Promise<{ path: string }[]>((r) => {
                    releaseOld = r
                })
        )
        captureBaseline("s-race", "/repo")

        stubGitChanges(async () => [{ path: "new.ts" }])
        captureBaseline("s-race", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-race")).toEqual(new Set(["new.ts"]))

        releaseOld([{ path: "old.ts" }])
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-race")).toEqual(new Set(["new.ts"]))
        forgetSignals("s-race")
    })
})
