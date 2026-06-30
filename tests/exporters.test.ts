import { describe, it, expect } from "vitest"
import { toCsv, toJson } from "../src/renderer/src/exporters"

const cols = ["id", "name", "note"]
const rows = [
    { id: 1, name: "alice", note: "ok" },
    { id: 2, name: "bob, jr", note: 'say "hi"' },
    { id: 3, name: null, note: "line1\nline2" }
]

describe("toCsv", () => {
    it("emits a header + CRLF rows", () => {
        const csv = toCsv(cols, rows)
        expect(csv.split("\r\n")[0]).toBe("id,name,note")
        expect(csv.split("\r\n").length).toBe(4)
    })
    it("quotes cells with commas, quotes, or newlines and escapes quotes", () => {
        const csv = toCsv(cols, rows)
        expect(csv).toContain('"bob, jr"')
        expect(csv).toContain('"say ""hi"""')
        expect(csv).toContain('"line1\nline2"')
    })
    it("renders null as empty and objects as JSON", () => {
        expect(toCsv(["a"], [{ a: null }])).toBe("a\r\n")
        expect(toCsv(["a"], [{ a: { x: 1 } }])).toBe('a\r\n"{""x"":1}"')
    })
})

describe("toJson", () => {
    it("pretty-prints the rows array", () => {
        const json = toJson(rows)
        expect(JSON.parse(json)).toEqual(rows)
        expect(json).toContain("\n")
    })
})
