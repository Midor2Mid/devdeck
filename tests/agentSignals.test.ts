import { describe, expect, it, afterEach } from "vitest"
import {
    newPathsSince,
    captureBaseline,
    adoptBaseline,
    baselineOf,
    forgetSignals,
    ensureBaseline,
    newCounts,
    nextChangedCounts
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

/**
 * The launch paths' capture, and the one thing it must not do.
 *
 * `captureBaseline` OVERWRITES on purpose - a dispatch, or a card dragged back
 * into `doing`, is a deliberate statement that what came before stops counting.
 * A launch is not that statement: resume and restart reuse the same termId, so a
 * launch that overwrote would re-inherit the files the session itself created
 * and turn a real conflict silent. Filling a gap and rebasing are different acts
 * and this is the first of the two.
 */
describe("ensureBaseline", () => {
    afterEach(() => {
        delete (globalThis as unknown as { window?: unknown }).window
    })

    it("captures for a session that has no baseline", async () => {
        stubGitChanges(async () => [{ path: "a.ts" }])
        ensureBaseline("s-ens", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-ens")).toEqual(new Set(["a.ts"]))
        forgetSignals("s-ens")
    })

    it("leaves an existing baseline exactly as it was", async () => {
        stubGitChanges(async () => [{ path: "a.ts" }])
        captureBaseline("s-ens2", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        const first = baselineOf("s-ens2")

        // The tree is dirtier now - because this session made it so.
        stubGitChanges(async () => [{ path: "a.ts" }, { path: "written-by-me.ts" }])
        ensureBaseline("s-ens2", "/repo")
        await new Promise((r) => setTimeout(r, 0))

        expect(baselineOf("s-ens2")).toBe(first)
        forgetSignals("s-ens2")
    })

    it("stands down while a capture is still in flight", async () => {
        // Presence of a ticket answers "has one", the same way adoptBaseline
        // reads it: a second read issued here would race the first for no gain.
        let release: (files: { path: string }[]) => void = () => undefined
        stubGitChanges(
            () =>
                new Promise<{ path: string }[]>((r) => {
                    release = r
                })
        )
        captureBaseline("s-ens3", "/repo")
        ensureBaseline("s-ens3", "/repo")
        release([{ path: "first.ts" }])
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-ens3")).toEqual(new Set(["first.ts"]))
        forgetSignals("s-ens3")
    })

    it("still leaves the baseline unknown when the read fails", async () => {
        // Fail-closed is the contract tests/changes.test.ts pins on purpose:
        // unknown means "no evidence", never "nothing changed".
        stubGitChanges(async () => {
            throw new Error("index.lock")
        })
        ensureBaseline("s-ens4", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-ens4")).toBeUndefined()
        forgetSignals("s-ens4")
    })
})

describe("adoptBaseline", () => {
    afterEach(() => {
        delete (globalThis as unknown as { window?: unknown }).window
    })

    it("records the paths the caller already fetched", () => {
        adoptBaseline("s-adopt", ["a.ts", "b.ts"])
        expect(baselineOf("s-adopt")).toEqual(new Set(["a.ts", "b.ts"]))
        forgetSignals("s-adopt")
    })

    it("stands down while a capture is in flight, and lets it win", async () => {
        // N2. The adopt used to claim a fresh ticket, which SUPERSEDED a capture
        // that was still out - and that capture is the later, truer answer: it
        // was issued after the read these paths came from. A rebase capture
        // dropped this way reinstates C1's snap-back exactly (see the store-level
        // repro in tests/cardReview.test.ts). An outstanding capture is now
        // knowable, and the self-heal defers to it.
        let release: (files: { path: string }[]) => void = () => undefined
        stubGitChanges(
            () =>
                new Promise<{ path: string }[]>((r) => {
                    release = r
                })
        )
        captureBaseline("s-adopt2", "/repo")
        adoptBaseline("s-adopt2", ["stale.ts"])
        // Still unknown: deferring means the card does not advance this pause,
        // which is the fail-closed direction.
        expect(baselineOf("s-adopt2")).toBeUndefined()

        release([{ path: "truer.ts" }])
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-adopt2")).toEqual(new Set(["truer.ts"]))
        forgetSignals("s-adopt2")
    })

    it("heals once a failed capture is known to have arrived", async () => {
        // The other side of standing down: a capture that REJECTED is no longer
        // outstanding, so the next self-heal must be allowed through. Holding
        // off on a capture that will never arrive would restore the permanent
        // stranding I2 exists to end.
        stubGitChanges(async () => {
            throw new Error("index.lock")
        })
        captureBaseline("s-adopt3", "/repo")
        await new Promise((r) => setTimeout(r, 0))
        expect(baselineOf("s-adopt3")).toBeUndefined()

        adoptBaseline("s-adopt3", ["healed.ts"])
        expect(baselineOf("s-adopt3")).toEqual(new Set(["healed.ts"]))
        forgetSignals("s-adopt3")
    })

    it("heals after a capture with no directory to read", async () => {
        // `captureBaseline(id, "")` issues nothing at all. It must not leave a
        // phantom capture outstanding, or every later self-heal defers to a read
        // that was never made.
        stubGitChanges(async () => [])
        captureBaseline("s-adopt4", "")
        adoptBaseline("s-adopt4", ["healed.ts"])
        expect(baselineOf("s-adopt4")).toEqual(new Set(["healed.ts"]))
        forgetSignals("s-adopt4")
    })

    it("heals after a capture whose read throws synchronously", async () => {
        // Same hazard as N1, one module over: a synchronous throw means no
        // promise, so no arrival, so no ticket would ever be cleared. It must
        // also not reach the launch/rebase path that called it.
        stubGitChanges(() => {
            throw new Error("bridge torn down")
        })
        expect(() => captureBaseline("s-adopt5", "/repo")).not.toThrow()
        adoptBaseline("s-adopt5", ["healed.ts"])
        expect(baselineOf("s-adopt5")).toEqual(new Set(["healed.ts"]))
        forgetSignals("s-adopt5")
    })
})

describe("newCounts", () => {
    afterEach(() => {
        forgetSignals("a")
        forgetSignals("b")
    })

    it("counts only paths that were not dirty when the session started", () => {
        adoptBaseline("a", ["src/old.ts"])
        const counts = newCounts([{ termId: "a", files: ["src/old.ts", "src/new.ts"] }])
        expect(counts.a).toBe(1)
    })

    // Unknown baseline means NO EVIDENCE, never "everything is new" - the whole
    // reason baselines exist is that a dirty repo would otherwise mark every
    // agent as productive forever.
    it("counts zero for a session with no baseline", () => {
        const counts = newCounts([{ termId: "b", files: ["src/a.ts", "src/b.ts"] }])
        expect(counts.b).toBe(0)
    })

    it("returns an entry per session, including empty ones", () => {
        adoptBaseline("a", [])
        adoptBaseline("b", [])
        const counts = newCounts([
            { termId: "a", files: ["x.ts"] },
            { termId: "b", files: [] }
        ])
        expect(counts).toEqual({ a: 1, b: 0 })
    })
})

describe("nextChangedCounts", () => {
    afterEach(() => {
        forgetSignals("a")
        forgetSignals("b")
    })

    // I4: git.changes rejects on a transient failure (mid-rebase, an
    // index.lock, the timeout). Mapping that straight to [] claimed "nothing
    // changed" about a session that may still have a dozen changed files.
    // The failure is now carried IN the value: null, not the previous count.
    // Carrying the previous count forward was the older fix, and it presented
    // a number that was true eight seconds ago as the current one - remedy
    // item 9 replaced both halves with a nullable count.
    it("records a failed session as unknown, not as its previous count", () => {
        adoptBaseline("a", [])
        const next = nextChangedCounts({ a: 12 }, [{ termId: "a", files: null }])
        expect(next.a).toBeNull()
    })

    it("updates a session whose read succeeded", () => {
        adoptBaseline("a", [])
        const next = nextChangedCounts({ a: 12 }, [{ termId: "a", files: ["x.ts", "y.ts"] }])
        expect(next.a).toBe(2)
    })

    it("mixes a failed session with a successful one in the same poll", () => {
        adoptBaseline("a", [])
        adoptBaseline("b", [])
        const next = nextChangedCounts(
            { a: 12, b: 3 },
            [
                { termId: "a", files: null },
                { termId: "b", files: ["x.ts"] }
            ]
        )
        expect(next).toEqual({ a: null, b: 1 })
    })

    it("records a never-seen session's failed read as unknown too", () => {
        // MissionControl reads a missing key as `?? null` - unknown either way -
        // so the map and the absence now agree instead of one of them meaning 0.
        expect(nextChangedCounts({}, [{ termId: "a", files: null }])).toEqual({ a: null })
    })
})
