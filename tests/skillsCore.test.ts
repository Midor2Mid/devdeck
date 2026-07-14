import { describe, it, expect } from "vitest"
import { discover, targetPath, parseFrontmatter } from "../src/main/skillsCore"

describe("discover", () => {
    it("finds skill dirs by SKILL.md and agents by agents/*.md", () => {
        const r = discover([
            "skills/foo/SKILL.md",
            "skills/foo/AUDIT.md",
            "skills/bar/SKILL.md",
            "agents/reviewer.md",
            "README.md",
            ".git/config",
            "node_modules/x/SKILL.md"
        ])
        expect(r.skills).toEqual(["skills/bar", "skills/foo"])
        expect(r.agents).toEqual(["agents/reviewer.md"])
    })
    it("handles a top-level SKILL.md (dir = '')", () => {
        expect(discover(["SKILL.md"]).skills).toEqual([""])
    })
})

describe("targetPath", () => {
    const opts = { home: "/home/u", projectPath: "/proj" }
    it("global skill", () => {
        expect(targetPath("global", "skill", "foo", opts)).toBe("/home/u/.claude/skills/foo")
    })
    it("project skill", () => {
        expect(targetPath("project", "skill", "foo", opts)).toBe("/proj/.claude/skills/foo")
    })
    it("global agent adds .md once", () => {
        expect(targetPath("global", "agent", "rev", opts)).toBe("/home/u/.claude/agents/rev.md")
        expect(targetPath("global", "agent", "rev.md", opts)).toBe("/home/u/.claude/agents/rev.md")
    })
})

describe("parseFrontmatter", () => {
    it("reads name and description, stripping quotes", () => {
        expect(parseFrontmatter("---\nname: foo\ndescription: \"a b\"\n---\nbody")).toEqual({
            name: "foo",
            description: "a b"
        })
    })
    it("returns {} when no frontmatter", () => {
        expect(parseFrontmatter("# just markdown")).toEqual({})
    })
})
