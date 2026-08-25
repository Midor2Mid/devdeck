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

    // Claude Code writes one line per content block of a streamed message, each
    // repeating the same cumulative usage. Counting lines double-counted 1.9x of
    // a real week, and that figure reached runs.jsonl and the task-card chips.
    const streamed = (id: string, requestId: string, out: number, cacheRead: number): string =>
        line({
            type: "assistant",
            timestamp: "2026-08-25T01:00:00.000Z",
            requestId,
            uuid: `row-${id}-${out}`,
            message: { id, model: "claude-opus-5", usage: { output_tokens: out, cache_read_input_tokens: cacheRead } }
        })

    it("folds repeated rows of one streamed message into a single rec", () => {
        const content = [
            streamed("msg_A", "req_1", 498, 187883),
            streamed("msg_A", "req_1", 498, 187883),
            streamed("msg_A", "req_1", 498, 187883)
        ].join("\n")
        const recs = parseUsageLines(content)
        expect(recs).toHaveLength(1)
        expect(recs[0].output).toBe(498)
        expect(recs[0].cacheRead).toBe(187883)
    })

    it("keeps the most complete count when a later row carries more", () => {
        // The later row is not a correction of the earlier one, it is a fuller
        // version of it - so max, not first-wins and not last-wins.
        const content = [
            streamed("msg_B", "req_2", 120, 5000),
            streamed("msg_B", "req_2", 640, 5000),
            streamed("msg_B", "req_2", 300, 9000)
        ].join("\n")
        const recs = parseUsageLines(content)
        expect(recs).toHaveLength(1)
        expect(recs[0].output).toBe(640)
        expect(recs[0].cacheRead).toBe(9000)
    })

    it("does not fold two genuinely different messages", () => {
        const content = [
            streamed("msg_C", "req_3", 100, 10),
            streamed("msg_D", "req_4", 200, 20)
        ].join("\n")
        expect(parseUsageLines(content)).toHaveLength(2)
    })

    it("separates the same message id under different request ids", () => {
        // A retry reuses the message id but bills again under a new request.
        const content = [
            streamed("msg_E", "req_5", 100, 10),
            streamed("msg_E", "req_6", 100, 10)
        ].join("\n")
        expect(parseUsageLines(content)).toHaveLength(2)
    })

    it("falls back to uuid when a row has no message id", () => {
        const row = (uuid: string, out: number): string =>
            line({
                type: "assistant",
                timestamp: "2026-08-25T01:00:00.000Z",
                uuid,
                message: { model: "claude-opus-5", usage: { output_tokens: out } }
            })
        const recs = parseUsageLines([row("u-1", 50), row("u-1", 50), row("u-2", 70)].join("\n"))
        expect(recs).toHaveLength(2)
        expect(recs.map((r) => r.output)).toEqual([50, 70])
    })

    it("keeps every row that carries no identity at all", () => {
        // Nothing to fold on: dropping these would silently lose real usage.
        const bare = line({
            type: "assistant",
            timestamp: "2026-08-25T01:00:00.000Z",
            message: { model: "claude-opus-5", usage: { output_tokens: 42 } }
        })
        expect(parseUsageLines([bare, bare].join("\n"))).toHaveLength(2)
    })
})

describe("priceFor", () => {
    it("prices each model generation at its own rate", () => {
        expect(priceFor("claude-opus-5").output).toBe(25)
        expect(priceFor("claude-opus-4-8").output).toBe(25)
        expect(priceFor("claude-sonnet-5").output).toBe(15)
        expect(priceFor("claude-haiku-4-5").output).toBe(5)
        expect(priceFor("claude-fable-5").output).toBe(50)
    })

    it("keeps the legacy Opus generation expensive", () => {
        // Opus 4 / 4.1 really did bill at $15/$75; only 4.5 onwards dropped.
        expect(priceFor("claude-opus-4").output).toBe(75)
        expect(priceFor("claude-opus-4-1").output).toBe(75)
        expect(priceFor("claude-opus-4-20250514").output).toBe(75)
        expect(priceFor("claude-opus-4-5").output).toBe(25)
    })

    it("does not let a longer version match a shorter rule", () => {
        // The regression that priced this machine's week 3x over: `opus-4-8`
        // matching an `opus-4` rule and inheriting $15/$75.
        for (const m of ["claude-opus-4-5", "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8"]) {
            expect(priceFor(m).output).toBe(25)
        }
    })

    it("resolves an unknown family member to the current generation, not the oldest", () => {
        // A model id newer than this table must not be billed as legacy Opus.
        expect(priceFor("claude-opus-9").output).toBe(25)
        expect(priceFor("claude-opus-future-thinking").output).toBe(25)
        expect(priceFor("claude-haiku-9").output).toBe(5)
    })

    it("normalises dotted ids, vendor prefixes, and case", () => {
        expect(priceFor("claude-opus-4.8").output).toBe(25)
        expect(priceFor("anthropic/claude-opus-5").output).toBe(25)
        expect(priceFor("CLAUDE-OPUS-5").output).toBe(25)
        expect(priceFor("claude-opus-4.1").output).toBe(75)
    })

    it("derives cache rates from input at 0.1x and 1.25x", () => {
        const opus5 = priceFor("claude-opus-5")
        expect(opus5.cacheRead).toBeCloseTo(0.5, 5)
        expect(opus5.cacheCreate).toBeCloseTo(6.25, 5)
    })

    it("falls back to mid-range for an unrecognisable id", () => {
        expect(priceFor("mystery-model").output).toBe(15)
    })
})

describe("costOf", () => {
    it("computes USD from per-Mtok rates", () => {
        // 1M input + 1M output on Opus 5 = 5 + 25 = 30
        const c = costOf({ model: "claude-opus-5", input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheCreate: 0, ts: "" })
        expect(c).toBeCloseTo(30, 5)
    })
    it("includes cache read/creation", () => {
        const c = costOf({ model: "claude-sonnet-4-6", input: 0, output: 0, cacheRead: 1_000_000, cacheCreate: 1_000_000, ts: "" })
        // sonnet cacheRead 0.3 + cacheCreate 3.75 = 4.05
        expect(c).toBeCloseTo(4.05, 5)
    })
    it("prices cache reads at a tenth of input, which is most of a real bill", () => {
        // 98% of a Claude Code week is cache reads; getting this factor wrong
        // moves the headline more than anything else in the table.
        const c = costOf({ model: "claude-opus-5", input: 0, output: 0, cacheRead: 10_000_000, cacheCreate: 0, ts: "" })
        expect(c).toBeCloseTo(5, 5)
    })
})
