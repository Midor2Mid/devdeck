import { describe, it, expect } from "vitest"
import {
    primaryAgentPreset,
    canResumePreset,
    type AgentPreset
} from "../src/renderer/src/settings"

const preset = (p: Partial<AgentPreset> & { id: string }): AgentPreset => ({
    name: p.id,
    command: p.id,
    resumeArgs: "",
    badge: "",
    apiKeyEnv: "",
    model: "",
    modelEnv: "",
    runMode: "agent",
    icon: "",
    category: "",
    ...p
})

describe("primaryAgentPreset", () => {
    it("is the first AI-mode preset, not the first preset", () => {
        // The divergence this function exists to close: the launch button
        // skipped normal-mode commands, Ctrl+Shift+Enter took agents[0], so a
        // dev server sitting first in Settings sent them to different processes.
        const agents = [
            preset({ id: "dev", runMode: "normal" }),
            preset({ id: "claude" }),
            preset({ id: "codex" })
        ]
        expect(primaryAgentPreset(agents)?.id).toBe("claude")
    })

    it("falls back to the first preset when none are AI-mode", () => {
        const agents = [preset({ id: "dev", runMode: "normal" })]
        expect(primaryAgentPreset(agents)?.id).toBe("dev")
    })

    it("is undefined when there is nothing configured", () => {
        // The button is not rendered in this state either, so the chord doing
        // nothing is the two agreeing - it used to guess at "claude".
        expect(primaryAgentPreset([])).toBeUndefined()
    })
})

describe("canResumePreset", () => {
    const claude = preset({ id: "claude", command: "claude", resumeArgs: "--continue" })
    const opus = preset({ id: "claude-opus", command: "claude", resumeArgs: "--continue" })
    const codex = preset({ id: "codex", command: "codex", resumeArgs: "resume" })
    const agents = [claude, opus, codex]

    it("is false on a project that has never run the agent", () => {
        expect(canResumePreset(claude, agents, [])).toBe(false)
        expect(canResumePreset(claude, agents, ["shell", "shell"])).toBe(false)
    })

    it("is true once a session of the same preset has existed", () => {
        expect(canResumePreset(claude, agents, ["claude"])).toBe(true)
    })

    it("counts a sibling preset that runs the same command", () => {
        // `claude --continue` reattaches to whatever the CLI recorded in this
        // directory, and Claude Opus recorded it under the same binary.
        expect(canResumePreset(claude, agents, ["claude-opus"])).toBe(true)
    })

    it("does not count a different agent's history", () => {
        expect(canResumePreset(claude, agents, ["codex"])).toBe(false)
    })

    it("is false for a preset with no resume command", () => {
        // claude-yolo and gemini ship without one; Resume would run the same
        // cold command as the launch button beside it.
        const noResume = preset({ id: "gemini", command: "gemini" })
        expect(canResumePreset(noResume, [...agents, noResume], ["gemini"])).toBe(false)
    })

    it("is false for a preset with no command at all", () => {
        // Otherwise two command-less presets would count as each other's
        // history, and Resume would offer to continue nothing.
        const blank = preset({ id: "blank", command: "", resumeArgs: "--continue" })
        const other = preset({ id: "other", command: "  " })
        expect(canResumePreset(blank, [blank, other], ["other", "blank"])).toBe(false)
    })

    it("ignores an id whose preset has since been deleted", () => {
        expect(canResumePreset(claude, agents, ["a-preset-that-is-gone"])).toBe(false)
    })

    it("is false when there is no primary preset to resume", () => {
        expect(canResumePreset(undefined, agents, ["claude"])).toBe(false)
    })
})
