import { describe, it, expect } from "vitest"
import {
    missingRecommended,
    RECOMMENDED_COMMANDS,
    type AgentPreset
} from "../src/renderer/src/settings"

const preset = (over: Partial<AgentPreset>): AgentPreset => ({
    id: "custom",
    name: "Custom",
    command: "something",
    resumeArgs: "",
    badge: "",
    apiKeyEnv: "",
    model: "",
    modelEnv: "",
    runMode: "agent",
    icon: "",
    category: "",
    ...over
})

describe("missingRecommended", () => {
    it("offers the whole set when nothing is configured", () => {
        expect(missingRecommended([])).toHaveLength(RECOMMENDED_COMMANDS.length)
    })

    it("offers nothing when the full set is already present", () => {
        expect(missingRecommended(RECOMMENDED_COMMANDS)).toEqual([])
    })

    it("matches by id even if the user renamed it", () => {
        const renamed = preset({ id: "claude", name: "My Claude", command: "claude-wrapper" })
        expect(missingRecommended([renamed]).some((r) => r.id === "claude")).toBe(false)
    })

    // The dedupe rule that matters in practice: someone added the same command by
    // hand under their own name, so re-adding would give them two identical cards.
    it("matches by command + run mode when the id differs", () => {
        const byHand = preset({ id: "mine", name: "Claude (mine)", command: "claude" })
        expect(missingRecommended([byHand]).some((r) => r.command === "claude" && r.runMode === "agent")).toBe(
            false
        )
    })

    it("treats the same command in a different run mode as distinct", () => {
        const asShell = preset({ id: "mine", command: "claude", runMode: "normal" })
        expect(missingRecommended([asShell]).some((r) => r.id === "claude")).toBe(true)
    })

    it("ignores surrounding whitespace when comparing commands", () => {
        const padded = preset({ id: "mine", command: "  claude  " })
        expect(missingRecommended([padded]).some((r) => r.id === "claude")).toBe(false)
    })

    it("returns copies, so adding them cannot mutate the canonical set", () => {
        const before = RECOMMENDED_COMMANDS[0].name
        const got = missingRecommended([])
        got[0].name = "mutated"
        expect(RECOMMENDED_COMMANDS[0].name).toBe(before)
    })
})
