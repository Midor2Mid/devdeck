import { describe, it, expect, beforeEach } from "vitest"
import { shouldLaunch, resetLaunchGuard, DOUBLE_CLICK_MS } from "../src/renderer/src/launchGuard"

/**
 * A launch card is a single-click control and Windows delivers a double-click
 * to one as two clicks, so a stray double-click started two sessions. For an
 * agent that is two paid CLI processes.
 */
describe("shouldLaunch", () => {
    beforeEach(() => {
        resetLaunchGuard()
    })

    it("allows the first launch", () => {
        expect(shouldLaunch("claude", 1000)).toBe(true)
    })

    it("swallows the same id inside the double-click window", () => {
        expect(shouldLaunch("claude", 1000)).toBe(true)
        expect(shouldLaunch("claude", 1000)).toBe(false)
        expect(shouldLaunch("claude", 1000 + DOUBLE_CLICK_MS - 1)).toBe(false)
    })

    it("allows the same id once the window has passed", () => {
        // A deliberate second session must still be possible - this is a
        // double-click guard, not a rate limit.
        expect(shouldLaunch("claude", 1000)).toBe(true)
        expect(shouldLaunch("claude", 1000 + DOUBLE_CLICK_MS)).toBe(true)
    })

    it("never blocks a different id", () => {
        // Clicking Claude then Codex in quick succession is two intents.
        expect(shouldLaunch("claude", 1000)).toBe(true)
        expect(shouldLaunch("codex", 1000)).toBe(true)
        expect(shouldLaunch("shell", 1000)).toBe(true)
    })

    it("is shared across click sites, because one gesture can hit two of them", () => {
        // The launcher card and the tab bar's `+ <agent>` are different
        // components offering the same act.
        expect(shouldLaunch("claude", 5000)).toBe(true)
        expect(shouldLaunch("claude", 5100)).toBe(false)
    })

    it("does not block a re-launch after an unrelated one intervenes", () => {
        expect(shouldLaunch("claude", 1000)).toBe(true)
        expect(shouldLaunch("codex", 1100)).toBe(true)
        // `last` now holds codex, so claude is allowed again even inside 500ms.
        // That is correct: two different controls were pressed, not one twice.
        expect(shouldLaunch("claude", 1200)).toBe(true)
    })
})
