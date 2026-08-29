import { describe, it, expect } from "vitest"
import {
    stripAnsi,
    gateActive,
    evaluateGate,
    maxAttempts,
    isCommandGate,
    commandGatePasses,
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

describe("command (ground-truth) gates", () => {
    it("recognises the command modes", () => {
        expect(isCommandGate(gate({ mode: "command" }))).toBe(true)
        expect(isCommandGate(gate({ mode: "commandFails" }))).toBe(true)
        expect(isCommandGate(gate({ mode: "contains" }))).toBe(false)
        expect(isCommandGate(gate({ mode: "regex" }))).toBe(false)
        expect(isCommandGate(undefined)).toBe(false)
    })

    it("is active only with a command to run", () => {
        expect(gateActive(gate({ mode: "command", pattern: "npm test" }))).toBe(true)
        expect(gateActive(gate({ mode: "command", pattern: "   " }))).toBe(false)
    })

    it("`command` passes on exit 0 only", () => {
        expect(commandGatePasses("command", 0)).toBe(true)
        expect(commandGatePasses("command", 1)).toBe(false)
        expect(commandGatePasses("command", 137)).toBe(false)
    })

    // `git diff --quiet` exits non-zero exactly when the tree is dirty, which is
    // how you assert "the agent actually changed something".
    it("`commandFails` passes on a non-zero exit only", () => {
        expect(commandGatePasses("commandFails", 1)).toBe(true)
        expect(commandGatePasses("commandFails", 0)).toBe(false)
    })

    // -1 is what the main process reports when the command never launched or was
    // killed on timeout. That must never read as success.
    it("treats a never-launched command (-1) as a failure for `command`", () => {
        expect(commandGatePasses("command", -1)).toBe(false)
    })

    it("never passes a text mode through the command verdict", () => {
        expect(commandGatePasses("contains", 0)).toBe(false)
        expect(commandGatePasses("none", 0)).toBe(false)
    })

    // The important safety property: if a caller forgets the async path and
    // sends a command gate through the text evaluator, it must NOT silently pass
    // a check that was never run.
    it("evaluateGate fails closed on a command gate", () => {
        expect(evaluateGate(gate({ mode: "command", pattern: "npm test" }), "All tests passed!")).toBe(
            false
        )
        expect(
            evaluateGate(gate({ mode: "commandFails", pattern: "git diff --quiet" }), "done")
        ).toBe(false)
    })
})

// M7: no assertion passes on an observation that was never made. `absent` is a
// NEGATIVE check, and `!"".includes(p)` is true — so a shell that never spawned,
// or a prompt that never reached one, produced "✓ gate passed" for a check with
// nothing to check. Exactly the defect the verify:terminal harness was fixed for
// (CHANGELOG "the only one that touched the terminal contents was NEGATIVE …
// which a blank screen satisfies perfectly") and the shipped engine was not.
describe("an absent gate on output that was never produced", () => {
    it("fails on empty output instead of passing vacuously", () => {
        expect(evaluateGate(gate({ mode: "absent", pattern: "error" }), "")).toBe(false)
    })

    it("fails on whitespace-only output too", () => {
        expect(evaluateGate(gate({ mode: "absent", pattern: "error" }), "   \r\n  ")).toBe(false)
    })

    it("still passes when there is real output and the pattern is genuinely absent", () => {
        expect(evaluateGate(gate({ mode: "absent", pattern: "error" }), "build ok\n")).toBe(true)
    })

    it("still fails when the pattern is present", () => {
        expect(evaluateGate(gate({ mode: "absent", pattern: "error" }), "error: nope\n")).toBe(false)
    })
})
