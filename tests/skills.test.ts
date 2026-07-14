import { describe, it, expect, vi } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() } }))

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
        remove(item)
        expect(existsSync(join(proj, ".claude", "skills", "foo"))).toBe(false)
    })
    it("refuses to remove a path outside .claude", () => {
        expect(() => remove({ kind: "skill", name: "x", scope: "project", path: join(tmpdir(), "evil") })).toThrow()
    })
})
