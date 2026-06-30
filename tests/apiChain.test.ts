import { describe, it, expect } from "vitest"
import { runExtractors, extractValue, type Extractor } from "../src/renderer/src/apiChain"

const ex = (p: Partial<Extractor>): Extractor => ({
    id: "x",
    varName: "v",
    source: "json",
    path: "",
    ...p
})

const resp = {
    status: 201,
    headers: { "x-request-id": "req-789", location: "/users/42" },
    body: JSON.stringify({ token: "abc.def", user: { id: 42 } })
}

describe("extractValue", () => {
    it("extracts a JSON path", () => {
        expect(extractValue(ex({ source: "json", path: "token" }), resp)).toBe("abc.def")
        expect(extractValue(ex({ source: "json", path: "user.id" }), resp)).toBe("42")
    })
    it("extracts a header (case-insensitive)", () => {
        expect(extractValue(ex({ source: "header", path: "X-Request-Id" }), resp)).toBe("req-789")
    })
    it("extracts the status code", () => {
        expect(extractValue(ex({ source: "status" }), resp)).toBe("201")
    })
    it("extracts a regex capture group from the body", () => {
        expect(extractValue(ex({ source: "regex", path: '"token":"([^"]+)"' }), resp)).toBe("abc.def")
    })
    it("returns empty on a missing path / bad regex", () => {
        expect(extractValue(ex({ source: "json", path: "nope.x" }), resp)).toBe("")
        expect(extractValue(ex({ source: "regex", path: "(" }), resp)).toBe("")
    })
})

describe("runExtractors", () => {
    it("marks ok only for named, non-empty extractions", () => {
        const results = runExtractors(
            [
                ex({ varName: "token", source: "json", path: "token" }),
                ex({ varName: "", source: "json", path: "token" }), // unnamed → not ok
                ex({ varName: "missing", source: "json", path: "nope" }) // empty → not ok
            ],
            resp
        )
        expect(results.map((r) => r.ok)).toEqual([true, false, false])
        expect(results[0].value).toBe("abc.def")
    })
})
