import { describe, it, expect } from "vitest"
import { agentInitCommand } from "../src/renderer/src/launchCommand"

// The store used `initialCommand ?? preset?.command ?? agentId`, and `??` lets
// `""` through: a preset with a blank command wrote a blank line into the fresh
// shell, so the pane opened and literally nothing happened. One click away.

describe("agentInitCommand", () => {
    it("runs the preset's command", () => {
        expect(agentInitCommand(true, undefined, "claude", "claude")).toBe("claude")
    })

    it("prefers an explicit override", () => {
        expect(agentInitCommand(true, "claude --continue", "claude", "claude")).toBe(
            "claude --continue"
        )
    })

    it("sends nothing for a preset whose command is blank", () => {
        // Not the id: `blank1` is a preset id, and typing it into a shell is
        // the fabrication this whole change exists to stop.
        expect(agentInitCommand(true, undefined, "", "blank1")).toBeUndefined()
        expect(agentInitCommand(true, undefined, "   ", "blank1")).toBeUndefined()
        expect(agentInitCommand(true, "", "", "blank1")).toBeUndefined()
        expect(agentInitCommand(true, "  \t ", "", "blank1")).toBeUndefined()
    })

    it("falls back to the id only when there is no preset at all", () => {
        // An agent whose preset was deleted: the id is a guess, but it is the
        // only string left and it has a chance of being the binary's name.
        expect(agentInitCommand(true, undefined, undefined, "claude")).toBe("claude")
    })

    it("treats a whitespace-only override as absent, not as a command", () => {
        expect(agentInitCommand(true, "   ", "claude", "claude")).toBe("claude")
    })

    it("leaves a shell alone - a plain shell only runs what it was handed", () => {
        expect(agentInitCommand(false, undefined, "claude", "shell")).toBeUndefined()
        expect(agentInitCommand(false, "ssh box", undefined, "shell")).toBe("ssh box")
        // Not normalised for a shell: the caller already passes `|| undefined`,
        // and this must not start rewriting what a shell was asked to run.
        expect(agentInitCommand(false, "", undefined, "shell")).toBe("")
    })
})
