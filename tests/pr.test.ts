import { describe, it, expect } from "vitest"
import { parseRemote } from "../src/main/pr"
import { diffPrompt } from "../src/renderer/src/diffai"

describe("parseRemote — Azure DevOps", () => {
    it("parses dev.azure.com URLs", () => {
        const r = parseRemote("https://dev.azure.com/myorg/My Project/_git/my-repo", "fix/x", "main")
        expect(r.host).toBe("azure")
        expect(r.org).toBe("myorg")
        expect(r.project).toBe("My Project")
        expect(r.repo).toBe("my-repo")
        expect(r.orgUrl).toBe("https://dev.azure.com/myorg")
    })
    it("handles the org@ prefix form", () => {
        const r = parseRemote("https://myorg@dev.azure.com/myorg/Proj/_git/repo", "b", "main")
        expect(r.host).toBe("azure")
        expect(r.repo).toBe("repo")
    })
    it("parses legacy visualstudio.com URLs", () => {
        const r = parseRemote("https://myorg.visualstudio.com/Proj/_git/repo", "b", "main")
        expect(r.host).toBe("azure")
        expect(r.orgUrl).toBe("https://dev.azure.com/myorg")
    })
})

describe("parseRemote — GitHub & other", () => {
    it("parses https GitHub URLs and builds a compare URL", () => {
        const r = parseRemote("https://github.com/owner/repo.git", "feature/y", "main")
        expect(r.host).toBe("github")
        expect(r.owner).toBe("owner")
        expect(r.repo).toBe("repo")
        expect(r.webCreateUrl).toContain("/compare/main...feature%2Fy")
    })
    it("parses ssh GitHub URLs", () => {
        const r = parseRemote("git@github.com:owner/repo.git", "b", "main")
        expect(r.host).toBe("github")
        expect(r.owner).toBe("owner")
    })
    it("falls back to other for unknown hosts", () => {
        expect(parseRemote("https://gitlab.com/a/b.git", "b", "main").host).toBe("other")
    })
})

describe("diffPrompt", () => {
    it("wraps the diff in a fenced block per kind", () => {
        const p = diffPrompt("review", "diff --git a b")
        expect(p).toMatch(/^Review the following diff/)
        expect(p).toContain("```diff\ndiff --git a b\n```")
    })
    it("handles an empty diff", () => {
        expect(diffPrompt("commit", "   ")).toContain("(no changes detected)")
    })
    it("asks for markdown sections for a PR description", () => {
        expect(diffPrompt("pr", "x")).toContain("## Summary")
    })
})
