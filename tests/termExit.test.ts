import { describe, it, expect } from "vitest"
import { exitNotice, FASTFAIL, recordExit, exitCodeOf, clearExit } from "../src/renderer/src/termExit"

describe("exitNotice", () => {
    it("shows a plain notice on clean exit (code 0)", () => {
        expect(exitNotice(0, true)).toBe("[process exited]")
        expect(exitNotice(0, false)).toBe("[process exited]")
    })

    it("includes the code and hex for a non-zero exit", () => {
        const msg = exitNotice(1, true)
        expect(msg).toContain("process exited: 1")
        expect(msg).toContain("0x1")
    })

    it("adds an antivirus hint for the Windows fast-fail code", () => {
        const msg = exitNotice(FASTFAIL, true)
        expect(msg).toContain("0xC0000409")
        expect(msg.toLowerCase()).toContain("antivirus")
        expect(msg).toContain("Settings → Terminal")
    })

    it("does not show the Windows-specific hint off Windows", () => {
        const msg = exitNotice(FASTFAIL, false)
        expect(msg.toLowerCase()).not.toContain("antivirus")
        // still reports the raw code
        expect(msg).toContain("0xC0000409")
    })

    it("FASTFAIL is the 0xC0000409 fast-fail code as an int32", () => {
        expect(FASTFAIL).toBe(-1073740791)
        expect((FASTFAIL >>> 0).toString(16).toUpperCase()).toBe("C0000409")
    })
})

describe("the per-session exit record", () => {
    it("reads undefined for a session that has not exited", () => {
        clearExit("t-none")
        expect(exitCodeOf("t-none")).toBeUndefined()
    })

    it("records a code and reads it back", () => {
        recordExit("t-1", 1)
        expect(exitCodeOf("t-1")).toBe(1)
        clearExit("t-1")
    })

    // 0 is falsy: every consumer must test `!== undefined`, never truthiness,
    // or a clean exit reads as a running process.
    it("distinguishes a clean exit from no exit at all", () => {
        recordExit("t-0", 0)
        expect(exitCodeOf("t-0")).toBe(0)
        expect(exitCodeOf("t-0")).not.toBeUndefined()
        clearExit("t-0")
    })

    it("clears a session's code", () => {
        recordExit("t-2", FASTFAIL)
        clearExit("t-2")
        expect(exitCodeOf("t-2")).toBeUndefined()
    })
})
