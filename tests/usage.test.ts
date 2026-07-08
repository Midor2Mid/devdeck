import { describe, it, expect } from "vitest"
import { parseUsageLines, priceFor, costOf } from "../src/main/usage"

const line = (o: unknown): string => JSON.stringify(o)

describe("parseUsageLines", () => {
    it("extracts usage + model + timestamp from assistant lines", () => {
        const content = [
            line({
                type: "assistant",
                timestamp: "2026-06-20T10:47:42.469Z",
                message: {
                    model: "claude-opus-4-8",
                    usage: {
                        input_tokens: 5524,
                        cache_creation_input_tokens: 6088,
                        cache_read_input_tokens: 22786,
                        output_tokens: 273
                    }
                }
            }),
            line({ type: "user", message: { role: "user", content: "hi" } }),
            "not json"
        ].join("\n")
        expect(parseUsageLines(content)).toEqual([
            {
                model: "claude-opus-4-8",
                input: 5524,
                output: 273,
                cacheRead: 22786,
                cacheCreate: 6088,
                ts: "2026-06-20T10:47:42.469Z"
            }
        ])
    })
})

describe("priceFor", () => {
    it("selects family by model substring, defaults to sonnet", () => {
        expect(priceFor("claude-opus-4-8").output).toBe(75)
        expect(priceFor("claude-sonnet-4-6").output).toBe(15)
        expect(priceFor("claude-haiku-4-5").output).toBe(4)
        expect(priceFor("mystery-model").output).toBe(15)
    })
})

describe("costOf", () => {
    it("computes USD from per-Mtok rates", () => {
        // 1M input + 1M output on opus = 15 + 75 = 90
        const c = costOf({ model: "claude-opus-4-8", input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheCreate: 0, ts: "" })
        expect(c).toBeCloseTo(90, 5)
    })
    it("includes cache read/creation", () => {
        const c = costOf({ model: "claude-sonnet-4-6", input: 0, output: 0, cacheRead: 1_000_000, cacheCreate: 1_000_000, ts: "" })
        // sonnet cacheRead 0.3 + cacheCreate 3.75 = 4.05
        expect(c).toBeCloseTo(4.05, 5)
    })
})
