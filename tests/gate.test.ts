import { describe, it, expect } from "vitest"
import {
    stripAnsi,
    gateActive,
    evaluateGate,
    maxAttempts,
    type StepGate
} from "../src/renderer/src/gate"

const gate = (over: Partial<StepGate> = {}): StepGate => ({
    mode: "contains",
    pattern: "ok",
    retries: 1,
    onFail: "stop",
    ...over
})

describe("stripAnsi", () => {
    it("removes color codes", () => {
        expect(stripAnsi("\x1b[32mAll tests passed\x1b[0m")).toBe("All tests passed")
    })
    it("removes carriage returns", () => {
        expect(stripAnsi("line\r\nnext")).toBe("line\nnext")
    })
    it("leaves plain text untouched", () => {
        expect(stripAnsi("0 errors")).toBe("0 errors")
    })
})

describe("gateActive", () => {
    it("is false for none / empty / missing", () => {
        expect(gateActive(undefined)).toBe(false)
        expect(gateActive(gate({ mode: "none" }))).toBe(false)
        expect(gateActive(gate({ pattern: "   " }))).toBe(false)
    })
    it("is true for a real check", () => {
        expect(gateActive(gate())).toBe(true)
    })
})

describe("evaluateGate", () => {
    it("inactive gate always passes", () => {
        expect(evaluateGate(undefined, "anything")).toBe(true)
        expect(evaluateGate(gate({ mode: "none" }), "")).toBe(true)
    })
    it("contains matches against ANSI-stripped output", () => {
        expect(evaluateGate(gate({ pattern: "passed" }), "\x1b[32mtests passed\x1b[0m")).toBe(true)
        expect(evaluateGate(gate({ pattern: "passed" }), "tests failed")).toBe(false)
    })
    it("absent passes only when the text is missing", () => {
        expect(evaluateGate(gate({ mode: "absent", pattern: "FAIL" }), "all green")).toBe(true)
        expect(evaluateGate(gate({ mode: "absent", pattern: "FAIL" }), "1 FAIL")).toBe(false)
    })
    it("regex matches case-insensitively", () => {
        expect(evaluateGate(gate({ mode: "regex", pattern: "\\b0 errors?\\b" }), "Found 0 errors")).toBe(true)
        expect(evaluateGate(gate({ mode: "regex", pattern: "\\b0 errors?\\b" }), "Found 3 errors")).toBe(false)
    })
    it("invalid regex fails closed", () => {
        expect(evaluateGate(gate({ mode: "regex", pattern: "(" }), "anything")).toBe(false)
    })
})

describe("maxAttempts", () => {
    it("is 1 with no active gate", () => {
        expect(maxAttempts(undefined)).toBe(1)
        expect(maxAttempts(gate({ mode: "none" }))).toBe(1)
    })
    it("is 1 + retries, clamped", () => {
        expect(maxAttempts(gate({ retries: 2 }))).toBe(3)
        expect(maxAttempts(gate({ retries: 0 }))).toBe(1)
        expect(maxAttempts(gate({ retries: 99 }))).toBe(11)
    })
})
