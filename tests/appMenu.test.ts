import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * The application menu's two silent-failure invariants, pinned in source.
 *
 * Neither is reachable by a unit test: `main/index.ts` is 1300 lines of
 * side-effectful module wiring that nothing imports, and a native menu bar
 * lives outside the page, so the DevTools Protocol cannot see or click it. What
 * IS available is the pattern tests/signalSites.test.ts established - read the
 * file's executable text and pin the decision - and both decisions here fail
 * silently, which is exactly the case that pattern exists for:
 *
 *   - `autoHideMenuBar` back to `true` hides the menu until Alt is pressed,
 *     which is the state the menu was added to fix. Nothing on screen would say
 *     so; the menu would simply not be there. This one is also the user's
 *     explicit decision, made against the plan's own hesitation.
 *   - a `sendChord` item that forgets `registerAccelerator: false` lets Electron
 *     register the chord as well as the renderer, so Ctrl+O fires the menu item
 *     AND App.tsx's handler - two folder dialogs, one keystroke. A double-fire
 *     is invisible to every suite in this repo.
 *
 * Deliberately crude, like the file it borrows from: a scan, not a parser.
 */

const MAIN = fileURLToPath(new URL("../src/main/index.ts", import.meta.url))

/**
 * The file's executable text: line and block comments blanked, newlines kept.
 *
 * Commenting a line out is the cheapest way to revert either invariant, and a
 * scan a `//` can satisfy reports a confidence it does not have - this file's
 * own prose names both settings, so an unstripped scan would pass on the
 * documentation alone.
 */
function stripComments(text: string): string {
    let inBlock = false
    return text
        .split("\n")
        .map((raw) => {
            let l = raw
            if (inBlock) {
                const end = l.indexOf("*/")
                if (end === -1) return ""
                l = " ".repeat(end + 2) + l.slice(end + 2)
                inBlock = false
            }
            for (;;) {
                const open = l.indexOf("/*")
                if (open === -1) break
                const end = l.indexOf("*/", open + 2)
                if (end === -1) {
                    inBlock = true
                    l = l.slice(0, open)
                    break
                }
                l = l.slice(0, open) + " ".repeat(end + 2 - open) + l.slice(end + 2)
            }
            const line = l.indexOf("//")
            return line === -1 ? l : l.slice(0, line)
        })
        .join("\n")
}

const code = stripComments(readFileSync(MAIN, "utf8"))
const count = (needle: string): number => code.split(needle).length - 1

describe("the application menu", () => {
    it("is installed at all", () => {
        // Before this, the only occurrence of the string `Menu` in the file was
        // `autoHideMenuBar`, and Electron installed its own default menu.
        expect(code).toContain('import { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard, Menu } from "electron"')
        expect(code).toContain("Menu.setApplicationMenu(")
        expect(code).toContain("buildAppMenu()")
    })

    it("keeps the menu bar visible", () => {
        expect(code).toContain("autoHideMenuBar: false")
        expect(code).not.toContain("autoHideMenuBar: true")
    })

    it("never lets Electron register a chord the renderer owns", () => {
        // One `registerAccelerator: false` per injected-chord item. If the two
        // counts drift, some item is about to fire twice.
        const injected = count("click: () => sendChord(")
        expect(injected, "sendChord is how the menu reaches the renderer").toBeGreaterThan(2)
        expect(count("registerAccelerator: false")).toBe(injected)
    })

    it("offers Ctrl+O, which was the failing case", () => {
        expect(code).toContain('accelerator: "CmdOrCtrl+O"')
        expect(code).toContain('label: "&Open Folder..."')
    })
})
