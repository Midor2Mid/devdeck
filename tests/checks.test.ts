import { describe, it, expect } from "vitest"
import { runCheck } from "../src/main/checks"

// Real child processes through the platform shell — the point of a ground-truth
// gate is that it actually runs, so mocking the spawn would test nothing.
const WIN = process.platform === "win32"
const CWD = process.cwd()

describe("runCheck", () => {
    it("reports exit 0 for a command that succeeds", async () => {
        const r = await runCheck(CWD, WIN ? "cmd /c exit 0" : "true")
        expect(r.exitCode).toBe(0)
        expect(r.timedOut).toBe(false)
        expect(r.error).toBeUndefined()
    })

    it("reports the real non-zero exit code", async () => {
        const r = await runCheck(CWD, WIN ? "cmd /c exit 3" : "exit 3")
        expect(r.exitCode).toBe(3)
        expect(r.timedOut).toBe(false)
    })

    it("captures output from stdout", async () => {
        const r = await runCheck(CWD, "node -e \"console.log('hello-gate')\"")
        expect(r.exitCode).toBe(0)
        expect(r.output).toContain("hello-gate")
    })

    it("captures output from stderr too", async () => {
        const r = await runCheck(CWD, "node -e \"console.error('boom'); process.exit(2)\"")
        expect(r.exitCode).toBe(2)
        expect(r.output).toContain("boom")
    })

    // A hung check must never wedge the pipeline.
    it("kills and fails a command that exceeds its timeout", async () => {
        const r = await runCheck(CWD, "node -e \"setTimeout(()=>{}, 30000)\"", 1200)
        expect(r.timedOut).toBe(true)
        expect(r.exitCode).toBe(-1)
        expect(r.error).toMatch(/timed out/i)
    }, 20000)

    it("fails rather than throwing when the command can't run", async () => {
        const r = await runCheck(CWD, "definitely-not-a-real-binary-xyz")
        expect(r.exitCode).not.toBe(0)
    })

    it("rejects an empty command instead of passing it", async () => {
        const r = await runCheck(CWD, "   ")
        expect(r.exitCode).toBe(-1)
        expect(r.error).toBe("empty command")
    })

    it("runs in the directory it is given", async () => {
        const r = await runCheck(CWD, "node -e \"console.log(process.cwd())\"")
        expect(r.output.trim().toLowerCase()).toContain(CWD.toLowerCase().slice(0, 12))
    })

    it("caps very large output instead of buffering it all", async () => {
        const r = await runCheck(CWD, "node -e \"console.log('x'.repeat(200000))\"")
        expect(r.exitCode).toBe(0)
        expect(r.output.length).toBeLessThanOrEqual(8000 + 100)
    })
})
