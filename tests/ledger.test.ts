import { describe, it, expect, beforeEach, vi } from "vitest"
import { appendFileSync, rmSync } from "fs"

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
    beforeEach(() => {
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
})
