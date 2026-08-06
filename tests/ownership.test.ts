import { describe, it, expect } from "vitest"
import { buildOwnership, holdersOf, holdersSummary } from "../src/renderer/src/ownership"

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

describe("holdersOf — dispatch conflict guard", () => {
    const e = (termId: string, sessionName: string, cwd: string, files: string[]) => ({
        termId,
        sessionName,
        cwd,
        files
    })

    it("finds an agent already editing the target directory", () => {
        const h = holdersOf([e("t1", "claude 1", "C:/repos/api", ["src/a.ts"])], "C:/repos/api")
        expect(h).toHaveLength(1)
        expect(h[0].sessionName).toBe("claude 1")
    })

    it("ignores agents with no uncommitted changes", () => {
        expect(holdersOf([e("t1", "claude 1", "C:/repos/api", [])], "C:/repos/api")).toEqual([])
    })

    // The whole point of the worktree toggle: a different cwd can't collide.
    it("ignores agents working in a worktree", () => {
        const h = holdersOf(
            [e("t1", "claude 1", "C:/repos/api.worktrees/feat", ["src/a.ts"])],
            "C:/repos/api"
        )
        expect(h).toEqual([])
    })

    it("ignores a different project entirely", () => {
        expect(
            holdersOf([e("t1", "c", "C:/repos/other", ["src/a.ts"])], "C:/repos/api")
        ).toEqual([])
    })

    // A false negative silently disables the guard, so path matching is generous.
    it("matches Windows paths regardless of slash style, case, or trailing slash", () => {
        // String.raw for real backslashes; the trailing separator is appended
        // separately because a raw template can't end with one (it would escape
        // the closing backtick).
        const winPath = String.raw`C:\Repos\API` + "\\"
        const entries = [e("t1", "claude 1", winPath, ["src/a.ts"])]
        expect(holdersOf(entries, "C:/repos/api")).toHaveLength(1)
    })

    it("does not match a sibling directory that shares a prefix", () => {
        expect(
            holdersOf([e("t1", "c", "C:/repos/api-v2", ["src/a.ts"])], "C:/repos/api")
        ).toEqual([])
    })

    it("reports every agent in the directory", () => {
        const h = holdersOf(
            [
                e("t1", "claude 1", "C:/repos/api", ["src/a.ts"]),
                e("t2", "codex 1", "C:/repos/api", ["src/b.ts"])
            ],
            "C:/repos/api"
        )
        expect(h.map((x) => x.sessionName)).toEqual(["claude 1", "codex 1"])
    })
})

describe("holdersSummary", () => {
    const h = (sessionName: string, files: string[]) => ({ termId: "t", sessionName, files })

    it("is empty when nobody holds the directory", () => {
        expect(holdersSummary([])).toBe("")
    })

    it("names a single session and the tree's changes", () => {
        const s = holdersSummary([h("claude 1", ["src/a.ts"])])
        expect(s).toContain("claude 1 is already working in this tree")
        expect(s).toContain("1 uncommitted change (a.ts)")
    })

    // A repo path is long enough to wrap the popover to five lines of red, which
    // stops being read. The name is what identifies the file at a glance.
    it("shows file names rather than full paths", () => {
        const s = holdersSummary([h("claude 1", ["docs/managements/SPCSG_Recon_2026-07-29.md"])])
        expect(s).toContain("(SPCSG_Recon_2026-07-29.md)")
        expect(s).not.toContain("docs/managements")
    })

    it("handles backslash paths from Windows git output", () => {
        expect(holdersSummary([h("claude 1", ["src\\main\\db.ts"])])).toContain("(db.ts)")
    })

    it("names two sessions, and dedupes the shared file list", () => {
        const s = holdersSummary([h("claude 1", ["src/a.ts"]), h("codex 1", ["src/a.ts"])])
        expect(s).toContain("claude 1 and codex 1 are")
        expect(s.match(/a\.ts/g)).toHaveLength(1)
    })

    /**
     * The bug this wording replaced. Sessions sharing a cwd all report the same
     * dirty file list, so the old text named five agents as "already editing" a
     * single file that none of them may have touched. It must never claim who
     * changed what — only what the tree has.
     */
    it("does not attribute the tree's changes to any session", () => {
        const five = ["claude 1", "claude 2", "claude 3", "claude 5", "claude 6"].map((n) =>
            h(n, ["docs/one-file.md"])
        )
        const s = holdersSummary(five)
        expect(s).not.toMatch(/editing/)
        expect(s).toContain("5 agent sessions are already working in this tree")
        expect(s).toContain("1 uncommitted change")
    })

    it("switches from names to a count past two sessions, to stay scannable", () => {
        const s = holdersSummary([h("a", ["f"]), h("b", ["f"]), h("c", ["f"])])
        expect(s).toContain("3 agent sessions")
        expect(s).not.toContain("a, b, c")
    })

    it("pluralises the change count", () => {
        expect(holdersSummary([h("claude 1", ["a", "b"])])).toContain("2 uncommitted changes")
    })

    it("caps the file list so the warning stays readable", () => {
        const s = holdersSummary([h("claude 1", ["a", "b", "c", "d", "e"])])
        expect(s).toContain("+3 more")
        expect(s).toContain("5 uncommitted changes")
    })
})
