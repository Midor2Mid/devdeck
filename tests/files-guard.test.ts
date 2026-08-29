import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { isWithinRoots } from "../src/main/files"

const win = process.platform === "win32"
const root = win ? "C:\\proj\\app" : "/proj/app"

describe("isWithinRoots (fs confinement)", () => {
    it("allows files inside a root", () => {
        expect(isWithinRoots(win ? "C:\\proj\\app\\src\\a.ts" : "/proj/app/src/a.ts", [root])).toBe(true)
        expect(isWithinRoots(root, [root])).toBe(true)
    })
    it("rejects paths outside every root", () => {
        expect(isWithinRoots(win ? "C:\\other\\x" : "/other/x", [root])).toBe(false)
        expect(isWithinRoots(win ? "C:\\Windows\\system32" : "/etc/passwd", [root])).toBe(false)
    })
    it("rejects traversal that escapes the root", () => {
        const escape = win ? "C:\\proj\\app\\..\\secret" : "/proj/app/../secret"
        expect(isWithinRoots(escape, [root])).toBe(false)
    })
    it("is not fooled by a sibling prefix", () => {
        expect(isWithinRoots(win ? "C:\\proj\\app-evil\\x" : "/proj/app-evil/x", [root])).toBe(false)
    })
})

// --- Real filesystem: links, not strings (remedy 14) -----------------------
//
// Everything above works on path text. The guard's actual job is to answer a
// question about a file, and the two disagree the moment a link is involved -
// which on Windows needs no elevation to create.
describe("isWithinRoots dereferences links", () => {
    const dir = mkdtempSync(join(tmpdir(), "files-guard-"))
    // realpath the temp dir itself: macOS hands out /var/... which is a symlink
    // to /private/var, and the assertions below are about the guard, not about
    // whose temp directory this is.
    const tmp = realpathSync(dir)
    const proj = join(tmp, "proj")
    const secrets = join(tmp, "secrets")

    beforeAll(() => {
        mkdirSync(join(proj, "src"), { recursive: true })
        mkdirSync(secrets, { recursive: true })
        writeFileSync(join(secrets, "id_rsa"), "private")
        writeFileSync(join(proj, "src", "a.ts"), "// ok")
    })
    afterAll(() => {
        rmSync(tmp, { recursive: true, force: true })
    })

    /** A directory junction (Windows) / symlink (elsewhere); skips if unsupported. */
    const link = (from: string, to: string): boolean => {
        try {
            symlinkSync(to, from, "junction")
            return true
        } catch {
            return false
        }
    }

    it("rejects a file reached through a junction that escapes the root", () => {
        const hop = join(proj, "escape")
        if (!link(hop, secrets)) return
        // Textually this is "inside proj". It is not inside proj.
        expect(isWithinRoots(join(hop, "id_rsa"), [proj])).toBe(false)
    })

    it("rejects a not-yet-existing target under an escaping junction", () => {
        const hop = join(proj, "escape2")
        if (!link(hop, secrets)) return
        // The fs:write case: the file does not exist, but the link on the way
        // to it does, and that is what has to be resolved.
        expect(isWithinRoots(join(hop, "authorized_keys"), [proj])).toBe(false)
    })

    it("still allows an ordinary file inside the root", () => {
        expect(isWithinRoots(join(proj, "src", "a.ts"), [proj])).toBe(true)
    })

    it("still allows a file that does not exist yet inside the root", () => {
        expect(isWithinRoots(join(proj, "src", "new-file.ts"), [proj])).toBe(true)
    })

    it("allows files under a root that is itself reached through a junction", () => {
        // The regression this change was most likely to cause: dereferencing
        // the target but not the root would reject every file in a project
        // opened via a junction.
        const alias = join(tmp, "alias")
        if (!link(alias, proj)) return
        expect(isWithinRoots(join(proj, "src", "a.ts"), [alias])).toBe(true)
        expect(isWithinRoots(join(alias, "src", "a.ts"), [proj])).toBe(true)
    })
})

describe("isWithinRoots on values the type system promised could not arrive", () => {
    // Every caller is one hop from an untyped IPC payload, so "not a string"
    // is a real input. It must be an answer about the path, not a TypeError
    // from inside path.resolve.
    it("refuses a non-string target instead of throwing", () => {
        const bad = [null, undefined, 42, {}, [], ""] as unknown as string[]
        for (const t of bad) {
            expect(() => isWithinRoots(t, [root])).not.toThrow()
            expect(isWithinRoots(t, [root])).toBe(false)
        }
    })
    it("ignores a junk root rather than throwing on it", () => {
        const roots = [null, "", root] as unknown as string[]
        expect(isWithinRoots(win ? "C:\\proj\\app\\a.ts" : "/proj/app/a.ts", roots)).toBe(true)
    })
})
