import { describe, it, expect } from "vitest"
import { evalTests, resolveJsonPath, opsFor, type ApiTest } from "../src/renderer/src/apiTests"

const t = (p: Partial<ApiTest>): ApiTest => ({ id: "x", source: "status", target: "", op: "eq", value: "", ...p })

const resp = {
    status: 200,
    timeMs: 123,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true, data: { id: 5, items: [{ name: "a" }, { name: "b" }] } })
}

describe("evalTests", () => {
    it("checks status numerically (eq / lt / gt)", () => {
        expect(evalTests([t({ source: "status", op: "eq", value: "200" })], resp)[0].pass).toBe(true)
        expect(evalTests([t({ source: "status", op: "eq", value: "201" })], resp)[0].pass).toBe(false)
        expect(evalTests([t({ source: "status", op: "lt", value: "300" })], resp)[0].pass).toBe(true)
    })

    it("checks response time", () => {
        expect(evalTests([t({ source: "time", op: "lt", value: "500" })], resp)[0].pass).toBe(true)
        expect(evalTests([t({ source: "time", op: "gt", value: "500" })], resp)[0].pass).toBe(false)
    })

    it("checks body contains", () => {
        expect(evalTests([t({ source: "body", op: "contains", value: '"ok":true' })], resp)[0].pass).toBe(true)
    })

    it("checks a header case-insensitively", () => {
        const r = evalTests([t({ source: "header", target: "Content-Type", op: "contains", value: "json" })], resp)
        expect(r[0].pass).toBe(true)
    })

    it("resolves JSON paths incl. array indexing", () => {
        expect(resolveJsonPath(JSON.parse(resp.body), "data.id")).toBe(5)
        expect(resolveJsonPath(JSON.parse(resp.body), "$.data.items[1].name")).toBe("b")
        expect(evalTests([t({ source: "json", target: "data.id", op: "eq", value: "5" })], resp)[0].pass).toBe(true)
        expect(evalTests([t({ source: "json", target: "data.items[0].name", op: "eq", value: "a" })], resp)[0].pass).toBe(true)
    })

    it("reports the actual value and fails gracefully on bad JSON path", () => {
        const r = evalTests([t({ source: "json", target: "nope.x", op: "eq", value: "1" })], resp)
        expect(r[0].pass).toBe(false)
        expect(r[0].actual).toBe("")
    })

    it("exposes sensible ops per source", () => {
        expect(opsFor("status")).toContain("lt")
        expect(opsFor("body")).toContain("contains")
        expect(opsFor("body")).not.toContain("lt")
    })
})

// M7, second engine: `actualFor` used to fold "could not be read" into "", and
// compare() reads "" as a value. An unreadable body made `neq` true and `lt`
// true for any positive threshold — a green tick per row and "Tests ✓" at the
// tab, for a request whose body never parsed.
describe("a test whose observation could not be made", () => {
    it("fails a neq against a body that is not JSON, instead of passing", () => {
        const [r] = evalTests([t({ source: "json", target: "a.b", op: "neq", value: "1" })], {
            body: "not json"
        })
        expect(r.pass).toBe(false)
        expect(r.actual).toBeNull()
    })

    it("fails an lt when there was no timing to compare", () => {
        const [r] = evalTests([t({ source: "time", op: "lt", value: "500" })], {
            body: ""
        })
        expect(r.pass).toBe(false)
        expect(r.actual).toBeNull()
    })

    it("fails a neq on a header the response never sent", () => {
        const [r] = evalTests([t({ source: "header", target: "x-trace", op: "neq", value: "1" })], {
            body: "",
            headers: {}
        })
        expect(r.pass).toBe(false)
    })

    it("keeps an EMPTY value distinct from an unreadable one", () => {
        // An empty body is a real observation: "" !== "1", so neq genuinely holds.
        const [r] = evalTests([t({ source: "body", op: "neq", value: "1" })], { body: "" })
        expect(r.actual).toBe("")
        expect(r.pass).toBe(true)
    })

    it("still passes a test that really was observed", () => {
        const [r] = evalTests([t({ source: "status", op: "eq", value: "200" })], {
            body: "",
            status: 200
        })
        expect(r.pass).toBe(true)
        expect(r.actual).toBe("200")
    })
})
