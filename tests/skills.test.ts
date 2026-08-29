import { describe, it, expect, vi } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() } }))

// A scratch HOME, so the "can a global item still be removed" test never points
// a recursive rmSync at the real ~/.claude.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path")
    return { home: fs.mkdtempSync(path.join(os.tmpdir(), "ext-home-")) }
})
vi.mock("os", async (orig) => {
    const actual = await orig<typeof import("os")>()
    return { ...actual, homedir: () => h.home }
})

import { listInstalled, remove } from "../src/main/skills"

function seed(): string {
    const proj = mkdtempSync(join(tmpdir(), "ext-proj-"))
    mkdirSync(join(proj, ".claude", "skills", "foo"), { recursive: true })
    writeFileSync(join(proj, ".claude", "skills", "foo", "SKILL.md"), "---\nname: foo\n---\n")
    mkdirSync(join(proj, ".claude", "agents"), { recursive: true })
    writeFileSync(join(proj, ".claude", "agents", "rev.md"), "---\nname: rev\n---\n")
    return proj
}

describe("listInstalled (project side)", () => {
    it("lists installed skills and agents in a project", () => {
        const proj = seed()
        const { project } = listInstalled(proj)
        expect(project.find((i) => i.kind === "skill" && i.name === "foo")).toBeTruthy()
        expect(project.find((i) => i.kind === "agent" && i.name === "rev")).toBeTruthy()
    })
})

describe("remove", () => {
    it("deletes an installed item under a .claude root", () => {
        const proj = seed()
        const item = listInstalled(proj).project.find((i) => i.name === "foo")!
        remove(item, proj)
        expect(existsSync(join(proj, ".claude", "skills", "foo"))).toBe(false)
    })
    it("removes a global item using the home root, not the project one", () => {
        // homedir() must remain a valid root, or nobody can uninstall a global skill.
        mkdirSync(join(h.home, ".claude", "skills", "glob"), { recursive: true })
        writeFileSync(join(h.home, ".claude", "skills", "glob", "SKILL.md"), "---\nname: glob\n---\n")
        const item = listInstalled("").global.find((i) => i.name === "glob")!
        remove(item, "")
        expect(existsSync(join(h.home, ".claude", "skills", "glob"))).toBe(false)
    })
    it("refuses a .claude leaf that belongs to a DIFFERENT project", () => {
        // The regex this replaced was root-agnostic: any path whose middle looked
        // like /.claude/skills/<leaf> passed, wherever it lived. That is a
        // recursive rmSync outside every project the user has open.
        const mine = seed()
        const other = seed()
        const item = listInstalled(other).project.find((i) => i.name === "foo")!
        expect(() => remove(item, mine)).toThrow()
        expect(existsSync(join(other, ".claude", "skills", "foo"))).toBe(true)
    })
    it("refuses to remove a path outside .claude", () => {
        const proj = seed()
        expect(() => remove({ kind: "skill", name: "x", scope: "project", path: join(tmpdir(), "evil") }, proj)).toThrow()
    })
    it("refuses a .. traversal path that resolves outside .claude", () => {
        const proj = seed()
        const evil = { kind: "skill" as const, name: "x", scope: "project" as const, path: join(proj, ".claude", "skills", "..", "..", "..", "target") }
        expect(() => remove(evil, proj)).toThrow()
    })
    it("refuses a name that is not a single leaf", () => {
        const proj = seed()
        const evil = { kind: "skill" as const, name: "../../..", scope: "project" as const, path: join(proj, "..", "..", "..") }
        expect(() => remove(evil, proj)).toThrow()
    })
    it("refuses the bare skills root (no leaf)", () => {
        const proj = seed()
        expect(() => remove({ kind: "skill", name: "x", scope: "project", path: join(proj, ".claude", "skills") }, proj)).toThrow()
    })
    it("refuses a project-scoped remove with no project root at all", () => {
        expect(() => remove({ kind: "skill", name: "foo", scope: "project", path: "/anything" }, "")).toThrow()
    })
})
