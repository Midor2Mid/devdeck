import { describe, it, expect } from "vitest"
import { isUnsafeAgent, RECOMMENDED_COMMANDS } from "../src/renderer/src/settings"

describe("isUnsafeAgent", () => {
    it("flags permission-bypassing flags", () => {
        expect(isUnsafeAgent("claude --dangerously-skip-permissions")).toBe(true)
        expect(isUnsafeAgent("gemini --yolo")).toBe(true)
        expect(isUnsafeAgent("codex --full-auto")).toBe(true)
        expect(isUnsafeAgent("agent --auto-approve")).toBe(true)
    })

    it("is case-insensitive and matches mid-command", () => {
        expect(isUnsafeAgent("CLAUDE --DANGEROUSLY-SKIP-PERMISSIONS --model x")).toBe(true)
    })

    it("leaves ordinary commands alone", () => {
        expect(isUnsafeAgent("claude")).toBe(false)
        expect(isUnsafeAgent("npm run dev")).toBe(false)
        expect(isUnsafeAgent("")).toBe(false)
        // --force is common and benign; it must not trip the danger styling.
        expect(isUnsafeAgent("git push --force")).toBe(false)
    })

    // Matching on the command line rather than a preset id is the point: a
    // hand-rolled agent carrying the flag is flagged the same as the bundled one.
    it("flags exactly the bundled YOLO preset and nothing else", () => {
        const unsafe = RECOMMENDED_COMMANDS.filter((a) => isUnsafeAgent(a.command)).map((a) => a.id)
        expect(unsafe).toEqual(["claude-yolo"])
    })
})
