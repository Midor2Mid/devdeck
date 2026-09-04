import { describe, it, expect } from "vitest"
import { RECOMMENDED_COMMANDS, isUnsafeAgent } from "../src/renderer/src/settings"

/**
 * The starter set ships one preset that runs an agent with permission prompts
 * off. The user ruled it stays - so the words shipped alongside it are the only
 * warning a stranger gets before the click, and they are what this file pins.
 */
describe("the bundled permission-bypassing preset", () => {
    const bypass = RECOMMENDED_COMMANDS.filter((a) => isUnsafeAgent(a.command))

    it("is exactly one preset, and it is the skip-permissions Claude", () => {
        expect(bypass.map((a) => a.id)).toEqual(["claude-yolo"])
        expect(bypass[0].command).toContain("--dangerously-skip-permissions")
    })

    it("says in its name what it does", () => {
        expect(bypass[0].name).toBe("Claude (no permission prompts)")
    })

    it("carries no cheerful shorthand for the risk, in the name or the badge", () => {
        // "YOLO" was the whole marking: a word that makes bypassing permissions
        // sound like a mood rather than a grant of unattended write access.
        for (const field of [bypass[0].name, bypass[0].badge]) {
            expect(field.toLowerCase()).not.toContain("yolo")
        }
    })

    it("keeps a badge short enough for the surfaces that render it", () => {
        // The badge appears on a ~24px deck key next to a status dot and an
        // attention glyph. Every other bundled badge is <= 6 characters; a
        // longer one buys loudness on the launcher by crowding the deck.
        const others = RECOMMENDED_COMMANDS.filter((a) => a.badge && !isUnsafeAgent(a.command))
        const widest = Math.max(...others.map((a) => a.badge.length))
        expect(bypass[0].badge.length).toBeLessThanOrEqual(widest)
    })

    it("does not offer a resume for a session it never records", () => {
        // Unchanged, and asserted so it stays that way: the pane's Resume
        // affordances all gate on resumeArgs, and this preset has none.
        expect(bypass[0].resumeArgs).toBe("")
    })
})
