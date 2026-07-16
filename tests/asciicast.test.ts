import { describe, it, expect } from "vitest"
import { toAsciicast } from "../src/renderer/src/asciicast"

const rec = {
    label: "repro run",
    createdAt: 1_700_000_000_000, // ms
    events: [
        { dt: 500, data: "$ npm test\r\n" },
        { dt: 1200, data: "FAIL src/x.test\r\n" },
        { dt: 300, data: "done\r\n" }
    ]
}

describe("toAsciicast", () => {
    const out = toAsciicast(rec)
    const lines = out.trimEnd().split("\n")

    it("emits a v2 header with timestamp in seconds", () => {
        const h = JSON.parse(lines[0])
        expect(h.version).toBe(2)
        expect(h.width).toBe(80)
        expect(h.height).toBe(24)
        expect(h.timestamp).toBe(1_700_000_000) // ms → s
        expect(h.title).toBe("repro run")
    })

    it("emits one output line per event with cumulative seconds", () => {
        expect(lines).toHaveLength(4) // header + 3 events
        const e0 = JSON.parse(lines[1])
        const e1 = JSON.parse(lines[2])
        const e2 = JSON.parse(lines[3])
        expect(e0).toEqual([0.5, "o", "$ npm test\r\n"])
        expect(e1).toEqual([1.7, "o", "FAIL src/x.test\r\n"]) // 0.5 + 1.2
        expect(e2).toEqual([2.0, "o", "done\r\n"]) // + 0.3
    })

    it("honors width/height overrides", () => {
        const h = JSON.parse(toAsciicast(rec, { width: 120, height: 40 }).split("\n")[0])
        expect(h.width).toBe(120)
        expect(h.height).toBe(40)
    })

    it("round-trips control characters through JSON", () => {
        const cast = toAsciicast({ label: "x", createdAt: 0, events: [{ dt: 0, data: "[31mred[0m" }] })
        const line = cast.trimEnd().split("\n")[1]
        expect(JSON.parse(line)[2]).toBe("[31mred[0m")
    })

    it("produces a trailing newline and only valid JSON lines", () => {
        expect(out.endsWith("\n")).toBe(true)
        for (const l of lines) expect(() => JSON.parse(l)).not.toThrow()
    })
})
