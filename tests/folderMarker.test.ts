import { describe, it, expect } from "vitest"
import { folderMarker, sameStates } from "../src/renderer/src/folderStates"

describe("folderMarker", () => {
    it("renders nothing for a folder that resolved", () => {
        expect(folderMarker("ok")).toBeNull()
    })

    it("renders nothing before the first check lands", () => {
        // Absence is the honest default while a probe is in flight; a healthy
        // project and an unexamined one look identical, and should.
        expect(folderMarker(undefined)).toBeNull()
    })

    it("qualifies a missing folder in form, not hue", () => {
        expect(folderMarker("missing")).toEqual({
            state: "missing",
            pill: "FOLDER MISSING",
            qualified: true
        })
    })

    it("does not qualify the project when only our knowledge is qualified", () => {
        // `unchecked` keeps full colour and a SOLID pill: nothing about the
        // project is in doubt, only whether we managed to look.
        const m = folderMarker("unchecked")
        expect(m).toEqual({ state: "unchecked", pill: "UNCHECKED", qualified: false })
        expect(m?.qualified).toBe(false)
    })

    it("never labels either state 'MISSING' alone or the two the same", () => {
        expect(folderMarker("missing")?.pill).not.toBe(folderMarker("unchecked")?.pill)
    })
})

describe("sameStates", () => {
    it("is true for an identical report", () => {
        expect(sameStates({ a: "ok", b: "missing" }, { a: "ok", b: "missing" })).toBe(true)
    })

    it("is false when a state changed", () => {
        expect(sameStates({ a: "ok" }, { a: "missing" })).toBe(false)
    })

    it("is false when a project appeared or left", () => {
        expect(sameStates({ a: "ok" }, { a: "ok", b: "ok" })).toBe(false)
        expect(sameStates({ a: "ok", b: "ok" }, { a: "ok" })).toBe(false)
    })

    it("is true for two empty reports", () => {
        expect(sameStates({}, {})).toBe(true)
    })
})
