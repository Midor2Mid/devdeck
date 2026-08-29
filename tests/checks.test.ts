import { describe, it, expect } from "vitest"
import { runCheck } from "../src/main/checks"
import { join } from "path"

// Real child processes through the platform shell — the point of a ground-truth
// gate is that it actually runs, so mocking the spawn would test nothing.
const WIN = process.platform === "win32"
const CWD = process.cwd()
// runCheck refuses a cwd outside every root it is handed, so each call has to
// say where it is allowed to run - see the confinement suite at the end.
const ROOTS = [CWD]

describe("runCheck", () => {
    it("reports exit 0 for a command that succeeds", async () => {
        const r = await runCheck(CWD, WIN ? "cmd /c exit 0" : "true", ROOTS)
        expect(r.exitCode).toBe(0)
        expect(r.timedOut).toBe(false)
        expect(r.error).toBeUndefined()
    })

    it("reports the real non-zero exit code", async () => {
        const r = await runCheck(CWD, WIN ? "cmd /c exit 3" : "exit 3", ROOTS)
        expect(r.exitCode).toBe(3)
        expect(r.timedOut).toBe(false)
    })

    it("captures output from stdout", async () => {
        const r = await runCheck(CWD, "node -e \"console.log('hello-gate')\"", ROOTS)
        expect(r.exitCode).toBe(0)
        expect(r.output).toContain("hello-gate")
    })

    it("captures output from stderr too", async () => {
        const r = await runCheck(CWD, "node -e \"console.error('boom'); process.exit(2)\"", ROOTS)
        expect(r.exitCode).toBe(2)
        expect(r.output).toContain("boom")
    })

    // A hung check must never wedge the pipeline.
    it("kills and fails a command that exceeds its timeout", async () => {
        const r = await runCheck(CWD, "node -e \"setTimeout(()=>{}, 30000)\"", ROOTS, 1200)
        expect(r.timedOut).toBe(true)
        expect(r.exitCode).toBe(-1)
        expect(r.error).toMatch(/timed out/i)
    }, 20000)

    it("fails rather than throwing when the command can't run", async () => {
        const r = await runCheck(CWD, "definitely-not-a-real-binary-xyz", ROOTS)
        expect(r.exitCode).not.toBe(0)
    })

    it("rejects an empty command instead of passing it", async () => {
        const r = await runCheck(CWD, "   ", ROOTS)
        expect(r.exitCode).toBe(-1)
        expect(r.error).toBe("empty command")
    })

    it("runs in the directory it is given", async () => {
        const r = await runCheck(CWD, "node -e \"console.log(process.cwd())\"", ROOTS)
        expect(r.output.trim().toLowerCase()).toContain(CWD.toLowerCase().slice(0, 12))
    })

    it("caps very large output instead of buffering it all", async () => {
        const r = await runCheck(CWD, "node -e \"console.log('x'.repeat(200000))\"", ROOTS)
        expect(r.exitCode).toBe(0)
        expect(r.output.length).toBeLessThanOrEqual(8000 + 100)
    })
})

describe("runCheck confinement (remedy 14)", () => {
    // This function spawns a shell. The one thing a caller must never be able
    // to do is forget to say where that is allowed to happen, so an empty root
    // list is a refusal rather than "no restriction".
    const outside = WIN ? "C:\Windows\Temp" : "/tmp"

    it("refuses a cwd outside every root", async () => {
        const r = await runCheck(outside, WIN ? "cmd /c exit 0" : "true", ROOTS)
        expect(r.exitCode).toBe(-1)
        expect(r.error).toMatch(/outside every open project/i)
    })

    it("refuses when handed no roots at all", async () => {
        const r = await runCheck(CWD, WIN ? "cmd /c exit 0" : "true", [])
        expect(r.exitCode).toBe(-1)
        expect(r.error).toMatch(/outside every open project/i)
    })

    it("refuses an empty cwd", async () => {
        const r = await runCheck("", WIN ? "cmd /c exit 0" : "true", ROOTS)
        expect(r.exitCode).toBe(-1)
    })

    it("still allows a directory inside a root", async () => {
        const r = await runCheck(join(CWD, "src"), WIN ? "cmd /c exit 0" : "true", ROOTS)
        expect(r.exitCode).toBe(0)
    })
})
