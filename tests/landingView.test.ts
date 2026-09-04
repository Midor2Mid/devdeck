import { describe, it, expect } from "vitest"
import { resolveViewFor } from "../src/renderer/src/store"

// The view a project opens on. Extracted from the store as a pure function so
// it can be asserted in the node environment - there are no component tests
// here, and this is a decision about first contact that is worth pinning.
describe("resolveViewFor", () => {
    it("lands a never-opened project on Terminal, not Mission", () => {
        expect(resolveViewFor("new-project-id", { viewByProject: {} })).toBe("terminal")
    })

    it("still restores a returning project's remembered view", () => {
        expect(resolveViewFor("seen", { viewByProject: { seen: "editor" } })).toBe("editor")
    })

    // This changes first contact, not Mission's standing: a project whose
    // recorded view IS Mission still comes back to Mission.
    it("restores a remembered Mission", () => {
        expect(resolveViewFor("seen", { viewByProject: { seen: "mission" } })).toBe("mission")
    })

    it("does not borrow another project's remembered view", () => {
        expect(resolveViewFor("fresh", { viewByProject: { other: "database" } })).toBe("terminal")
    })
})
