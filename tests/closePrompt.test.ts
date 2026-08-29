import { describe, it, expect } from "vitest"
import { closePrompt } from "../src/main/closePrompt"

// The Ctrl+W complaint (M2): main is the only process that can refuse a window
// close, and it had no idea whether anything was running. `closePrompt` is that
// decision extracted from the dialog, so it can be asserted without Electron.
describe("closePrompt", () => {
    it("does not ask when nothing is running", () => {
        expect(closePrompt([])).toBeNull()
    })

    it("names the count for one agent, in the singular", () => {
        const p = closePrompt(["claude"])
        expect(p?.message).toContain("1 agent")
        expect(p?.message).not.toContain("agents")
        expect(p?.detail).toContain("claude")
    })

    it("counts panes, not distinct agents", () => {
        // Two panes running Claude are two pieces of work in flight. Reporting
        // "1 agent" because the ids match would undercount what is being killed.
        const p = closePrompt(["claude", "claude", "codex"])
        expect(p?.message).toContain("3 agents")
        expect(p?.detail).toContain("claude")
        expect(p?.detail).toContain("codex")
    })

    it("puts Cancel first, so the destructive button is never the default", () => {
        const p = closePrompt(["claude"])
        expect(p?.buttons[0]).toBe("Cancel")
        expect(p?.buttons[1]).toMatch(/close/i)
    })

    it("does not spell out every agent when there are many", () => {
        const p = closePrompt(["a", "b", "c", "d", "e"])
        expect(p?.message).toContain("5 agents")
        expect(p?.detail).toContain("a, b, c and 2 more")
    })
})
