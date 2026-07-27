import { describe, it, expect } from "vitest"
import { diffPrompt } from "../src/renderer/src/diffai"

const DIFF = "diff --git a/x.ts b/x.ts\n+const a = 1"

describe("diffPrompt", () => {
    it("wraps the diff in a fenced block", () => {
        const p = diffPrompt("review", DIFF)
        expect(p).toContain("```diff")
        expect(p).toContain("const a = 1")
    })

    it("says so plainly when there is nothing to look at", () => {
        expect(diffPrompt("review", "   ")).toContain("(no changes detected)")
    })

    it("asks for report-only on review, so it doesn't start editing", () => {
        expect(diffPrompt("review", DIFF)).toMatch(/do not change anything/i)
    })

    it("uses a distinct intro per kind", () => {
        const intros = (["review", "explain", "commit", "pr"] as const).map(
            (k) => diffPrompt(k, DIFF).split("```")[0]
        )
        expect(new Set(intros).size).toBe(4)
    })
})

describe("cross-agent handoff framing", () => {
    it("tells a different agent it did not write the code", () => {
        const p = diffPrompt("review", DIFF, { independent: true })
        expect(p).toMatch(/written by a different agent/i)
        expect(p).toMatch(/do not assume they are correct/i)
    })

    it("stays silent about provenance for self-review", () => {
        const p = diffPrompt("review", DIFF, { independent: false })
        expect(p).not.toMatch(/different agent/i)
        expect(diffPrompt("review", DIFF)).not.toMatch(/different agent/i)
    })

    // The framing is a reviewing stance — on a commit message or PR description
    // it would just be noise the model has to work around.
    it("only applies to review, not to commit/PR/explain", () => {
        for (const kind of ["commit", "pr", "explain"] as const) {
            expect(diffPrompt(kind, DIFF, { independent: true })).not.toMatch(/different agent/i)
        }
    })

    it("still includes the normal review instructions alongside it", () => {
        const p = diffPrompt("review", DIFF, { independent: true })
        expect(p).toMatch(/different agent/i)
        expect(p).toMatch(/cite file:line/i)
    })
})
