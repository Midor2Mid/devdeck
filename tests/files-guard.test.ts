import { describe, it, expect } from "vitest"
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
