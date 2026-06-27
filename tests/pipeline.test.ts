import { describe, it, expect } from "vitest"
import {
    isRunnable,
    runnableSteps,
    sessionPlan,
    moveItem,
    type Pipeline,
    type PipelineStep
} from "../src/renderer/src/pipeline"

const step = (over: Partial<PipelineStep> = {}): PipelineStep => ({
    id: "s",
    title: "t",
    agentId: "claude",
    prompt: "do something",
    fresh: false,
    ...over
})

const pipe = (over: Partial<Pipeline> = {}): Pipeline => ({
    id: "p",
    name: "My pipeline",
    steps: [step()],
    ...over
})

describe("isRunnable", () => {
    it("needs a name and at least one prompted step", () => {
        expect(isRunnable(pipe())).toBe(true)
    })
    it("rejects a nameless pipeline", () => {
        expect(isRunnable(pipe({ name: "  " }))).toBe(false)
    })
    it("rejects a pipeline with only empty steps", () => {
        expect(isRunnable(pipe({ steps: [step({ prompt: "" }), step({ prompt: "   " })] }))).toBe(false)
    })
})

describe("runnableSteps", () => {
    it("drops steps with blank prompts", () => {
        const p = pipe({ steps: [step({ id: "a" }), step({ id: "b", prompt: "" }), step({ id: "c" })] })
        expect(runnableSteps(p).map((s) => s.id)).toEqual(["a", "c"])
    })
})

describe("sessionPlan", () => {
    it("reuses an existing session for the same agent", () => {
        expect(sessionPlan(step(), { claude: "term-1" })).toEqual({ reuse: true, termId: "term-1" })
    })
    it("spawns fresh when forced even if a session exists", () => {
        expect(sessionPlan(step({ fresh: true }), { claude: "term-1" })).toEqual({ reuse: false })
    })
    it("spawns fresh when no session exists for the agent", () => {
        expect(sessionPlan(step({ agentId: "codex" }), { claude: "term-1" })).toEqual({ reuse: false })
    })
})

describe("moveItem", () => {
    it("moves an item up", () => {
        expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"])
    })
    it("moves an item down", () => {
        expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"])
    })
    it("is a no-op for out-of-range targets", () => {
        expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"])
        expect(moveItem(["a", "b"], 1, 5)).toEqual(["a", "b"])
    })
})
