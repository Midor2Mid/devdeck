import { describe, it, expect } from "vitest"
import { frameDelay, totalDuration, MAX_FRAME_GAP } from "../src/renderer/src/recPlayback"

describe("frameDelay", () => {
    it("plays the first frame immediately", () => {
        expect(frameDelay(0, 9999, 1)).toBe(0)
    })

    it("waits the stored gap at 1x", () => {
        expect(frameDelay(1, 120, 1)).toBe(120)
    })

    it("scales by speed", () => {
        expect(frameDelay(3, 200, 2)).toBe(100)
        expect(frameDelay(3, 200, 4)).toBe(50)
    })

    it("clamps long pauses to MAX_FRAME_GAP", () => {
        expect(frameDelay(2, 60_000, 1)).toBe(MAX_FRAME_GAP)
    })

    it("never returns negative for odd gaps", () => {
        expect(frameDelay(1, -50, 1)).toBe(0)
    })

    it("falls back to 1x when speed is invalid", () => {
        expect(frameDelay(1, 100, 0)).toBe(100)
    })
})

describe("totalDuration", () => {
    it("ignores the first frame's gap", () => {
        expect(totalDuration([{ dt: 500 }, { dt: 100 }, { dt: 200 }])).toBe(300)
    })

    it("clamps each gap", () => {
        expect(totalDuration([{ dt: 0 }, { dt: 99_999 }])).toBe(MAX_FRAME_GAP)
    })

    it("is zero for empty or single-frame recordings", () => {
        expect(totalDuration([])).toBe(0)
        expect(totalDuration([{ dt: 300 }])).toBe(0)
    })
})
