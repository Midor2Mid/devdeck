import { describe, it, expect, beforeEach, vi } from "vitest"
import { appendFileSync, readFileSync, rmSync } from "fs"

// Wrap readFileSync in a call-tracked passthrough so tests can assert whether
// ledger.ts read the file, without changing its behavior. This has to go
// through vi.mock (not vi.spyOn on a required "fs" object) because the
// mocked module is what every importer - including ledger.ts - resolves "fs"
// to; a spy attached to a separately-obtained reference after the fact does
// not intercept calls other modules already bound at their own import time.
vi.mock("fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("fs")>()
    return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})

// Mock Electron: a temp userData dir, so the ledger never touches the real store.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join: pjoin } = require("path")
    return { dir: mkdtempSync(pjoin(tmpdir(), "ledger-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir }
}))

import { appendRun, readRuns, clearRuns, storePath, RUN_CAP, RUN_KEEP, type RunRecord } from "../src/main/ledger"

function rec(over: Partial<RunRecord> = {}): RunRecord {
    return {
        id: "r1", kind: "card", projectId: "p1", projectName: "Proj",
        label: "Fix the login redirect", startedAt: 1000, endedAt: 2000,
        agentIds: ["claude"], cost: 0.42, tokens: 1234, exclusive: true, ...over
    }
}

describe("appendRun / readRuns", () => {
    // Each test starts with no store file at all - not just an empty one - so
    // "returns empty when the file does not exist" actually exercises that path.
    // clearRuns() first resets the module's private in-memory line count to 0
    // (matching the file it just emptied) before the file is removed entirely -
    // otherwise the count would carry a stale value from whatever the previous
    // test appended, corrupting the cap-rotation test below.
    beforeEach(() => {
        clearRuns()
        try {
            rmSync(storePath(), { force: true })
        } catch {
            /* ignore */
        }
    })

    it("round-trips a record", () => {
        appendRun(rec())
        expect(readRuns()).toEqual([rec()])
    })

    it("returns newest first", () => {
        appendRun(rec({ id: "a", endedAt: 1 }))
        appendRun(rec({ id: "b", endedAt: 2 }))
        expect(readRuns().map((r) => r.id)).toEqual(["b", "a"])
    })

    it("honours a limit, taking the newest", () => {
        for (const id of ["a", "b", "c"]) appendRun(rec({ id }))
        expect(readRuns(2).map((r) => r.id)).toEqual(["c", "b"])
    })

    it("skips an unparseable line instead of throwing", () => {
        // The case that justifies JSONL: a crash mid-append leaves a torn final
        // line. Losing one record must not lose the file.
        appendRun(rec({ id: "good" }))
        appendFileSync(storePath(), '{"id":"torn","kind":"car\n')
        appendRun(rec({ id: "after" }))
        expect(readRuns().map((r) => r.id)).toEqual(["after", "good"])
    })

    it("returns empty when the file does not exist", () => {
        expect(readRuns()).toEqual([])
    })

    it("rotates once past the cap, keeping the most recent in order", () => {
        // RUN_CAP=5000, RUN_KEEP=4000: crossing the cap fires exactly one
        // rewrite (checked after appending, not on every append), which keeps
        // the newest RUN_KEEP lines at that moment. The 5 appends made after
        // that single rewrite are not re-trimmed - re-trimming on every append
        // once past the cap is exactly the behavior this design avoids - so
        // the file settles at RUN_KEEP + 4, not RUN_KEEP.
        for (let i = 0; i < RUN_CAP + 5; i++) appendRun(rec({ id: `r${i}`, endedAt: i }))
        const all = readRuns()
        expect(all).toHaveLength(RUN_KEEP + 4)
        expect(all[0].id).toBe(`r${RUN_CAP + 4}`)
        expect(all[all.length - 1].id).toBe(`r${RUN_CAP + 1 - RUN_KEEP}`)
    })

    it("clears", () => {
        appendRun(rec())
        clearRuns()
        expect(readRuns()).toEqual([])
    })

    it("drops syntactically valid but ill-shaped records without truncating the read", () => {
        // Unlike the torn-line test above, every line written here is valid
        // JSON - the point is that isValidRunRecord must still reject a
        // wrong-typed field, a missing required field, and blank lines, while
        // a good record on either side of them survives untouched.
        appendRun(rec({ id: "first" }))

        const wrongTypedCost = JSON.stringify({ ...rec({ id: "bad-cost" }), cost: "0.42" })
        const { exclusive: _exclusive, ...missingExclusive } = rec({ id: "missing-exclusive" })
        appendFileSync(storePath(), wrongTypedCost + "\n")
        appendFileSync(storePath(), JSON.stringify(missingExclusive) + "\n")
        appendFileSync(storePath(), "\n")
        appendFileSync(storePath(), "   \n")

        appendRun(rec({ id: "second" }))

        expect(readRuns().map((r) => r.id)).toEqual(["second", "first"])
    })

    it("does not read the file on repeated appends below the cap", () => {
        // The store's own rationale (top of ledger.ts) is that appending must
        // not depend on the file's size. A spy on readFileSync proves it: with
        // the in-memory line count already known (reset to 0 by beforeEach via
        // clearRuns()), none of these appends should touch the file to check
        // whether it needs rotating.
        vi.mocked(readFileSync).mockClear()
        for (let i = 0; i < 50; i++) appendRun(rec({ id: `r${i}` }))
        expect(readFileSync).not.toHaveBeenCalled()
    })
})
