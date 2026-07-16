import { describe, it, expect } from "vitest"
import { resolveTarget, failTarget, type PipelineStep } from "../src/renderer/src/pipeline"

const step = (id: string, extra: Partial<PipelineStep> = {}): PipelineStep => ({
    id,
    title: id,
    agentId: "claude",
    prompt: "do " + id,
    fresh: false,
    ...extra
})

const steps: PipelineStep[] = [step("a"), step("b"), step("c")]

describe("resolveTarget", () => {
    it("'next' advances by one", () => {
        expect(resolveTarget("next", 0, steps)).toBe(1)
        expect(resolveTarget("next", 2, steps)).toBe(3) // past the end → caller stops
    })
    it("'stop' returns -1", () => {
        expect(resolveTarget("stop", 1, steps)).toBe(-1)
    })
    it("goto resolves to the target index", () => {
        expect(resolveTarget({ goto: "a" }, 2, steps)).toBe(0)
        expect(resolveTarget({ goto: "c" }, 0, steps)).toBe(2)
    })
    it("unknown goto id returns -1 (stop) instead of hanging", () => {
        expect(resolveTarget({ goto: "zzz" }, 0, steps)).toBe(-1)
    })
    it("undefined uses the fallback", () => {
        expect(resolveTarget(undefined, 0, steps)).toBe(1) // default "next"
        expect(resolveTarget(undefined, 0, steps, "stop")).toBe(-1)
    })
})

describe("failTarget", () => {
    it("prefers an explicit step.onFail", () => {
        expect(failTarget(step("b", { onFail: { goto: "a" } }))).toEqual({ goto: "a" })
        expect(failTarget(step("b", { onFail: "next" }))).toBe("next")
    })
    it("falls back to the legacy gate.onFail", () => {
        expect(
            failTarget(step("b", { gate: { mode: "absent", pattern: "FAIL", retries: 1, onFail: "continue" } }))
        ).toBe("next")
        expect(
            failTarget(step("b", { gate: { mode: "absent", pattern: "FAIL", retries: 1, onFail: "stop" } }))
        ).toBe("stop")
    })
    it("defaults to stop when nothing is set", () => {
        expect(failTarget(step("b"))).toBe("stop")
    })
})
