import { describe, it, expect } from "vitest"
import { CONTEXT_FILES, template, mergeContext } from "../src/renderer/src/contextCatalog"

describe("CONTEXT_FILES", () => {
    it("lists the known root memory files with unique names and metadata", () => {
        const names = CONTEXT_FILES.map((f) => f.name)
        expect(names).toEqual(["CLAUDE.md", "AGENTS.md", "GEMINI.md"])
        expect(new Set(names).size).toBe(names.length)
        for (const f of CONTEXT_FILES) {
            expect(f.agent).toBeTruthy()
            expect(f.description).toBeTruthy()
        }
    })
})

describe("template", () => {
    it("injects the project name and includes the standard sections", () => {
        const out = template("CLAUDE.md", "devdeck")
        expect(out).toContain("# devdeck")
        expect(out).toContain("## Conventions")
        expect(out).toContain("## Architecture")
        expect(out).toContain("## Gotchas")
    })
    it("falls back to a generic heading when project name is empty", () => {
        expect(template("AGENTS.md", "")).toContain("# this project")
    })
})

describe("mergeContext", () => {
    it("marks a file present only when its exact name is in the listing", () => {
        const entries = mergeContext(["CLAUDE.md", "src", "package.json"])
        const byName = Object.fromEntries(entries.map((e) => [e.name, e.exists]))
        expect(byName["CLAUDE.md"]).toBe(true)
        expect(byName["AGENTS.md"]).toBe(false)
        expect(byName["GEMINI.md"]).toBe(false)
    })
    it("returns one entry per catalog file and ignores unknown files", () => {
        const entries = mergeContext(["README.md", "claude.md"]) // wrong case, unknown
        expect(entries).toHaveLength(CONTEXT_FILES.length)
        expect(entries.every((e) => e.exists === false)).toBe(true)
    })
    it("handles an empty listing", () => {
        expect(mergeContext([]).every((e) => !e.exists)).toBe(true)
    })
})
