import { describe, it, expect } from "vitest"
import { buildOwnership } from "../src/renderer/src/ownership"

describe("buildOwnership", () => {
    it("flags a file two agents in the same project both touched as a conflict", () => {
        const m = buildOwnership([
            { termId: "a", sessionName: "claude 1", projectName: "App", files: ["src/x.ts", "src/y.ts"] },
            { termId: "b", sessionName: "claude 2", projectName: "App", files: ["src/x.ts"] }
        ])
        expect(m.conflicts).toBe(1)
        const x = m.files.find((f) => f.path === "src/x.ts")!
        expect(x.owners.map((o) => o.termId).sort()).toEqual(["a", "b"])
        // conflict sorts first
        expect(m.files[0].path).toBe("src/x.ts")
    })

    it("does not treat identical paths in different projects as a conflict", () => {
        const m = buildOwnership([
            { termId: "a", sessionName: "s", projectName: "P1", files: ["index.ts"] },
            { termId: "b", sessionName: "s", projectName: "P2", files: ["index.ts"] }
        ])
        expect(m.conflicts).toBe(0)
        expect(m.files).toHaveLength(2)
    })

    it("dedupes the same owner listed for the same file", () => {
        const m = buildOwnership([
            { termId: "a", sessionName: "s", projectName: "P", files: ["a.ts", "a.ts"] }
        ])
        expect(m.files[0].owners).toHaveLength(1)
    })

    it("returns empty for no entries", () => {
        expect(buildOwnership([])).toEqual({ files: [], conflicts: 0 })
    })
})
