import { describe, expect, it } from "vitest"
import { clampIdleMs, IDLE_MIN, IDLE_MAX, DEFAULT_IDLE_MS } from "../src/renderer/src/settings"

describe("clampIdleMs", () => {
    it("keeps a sane value", () => {
        expect(clampIdleMs(2500)).toBe(2500)
    })
    it("floors below the minimum", () => {
        expect(clampIdleMs(0)).toBe(IDLE_MIN)
        expect(clampIdleMs(-1)).toBe(IDLE_MIN)
    })
    it("caps absurd values", () => {
        expect(clampIdleMs(9_999_999)).toBe(IDLE_MAX)
    })
    it("falls back to the default for junk", () => {
        expect(clampIdleMs(Number.NaN)).toBe(DEFAULT_IDLE_MS)
        expect(clampIdleMs(undefined)).toBe(DEFAULT_IDLE_MS)
        expect(clampIdleMs("1200")).toBe(DEFAULT_IDLE_MS)
    })
    it("rounds to a whole millisecond", () => {
        expect(clampIdleMs(1500.7)).toBe(1501)
    })
})
