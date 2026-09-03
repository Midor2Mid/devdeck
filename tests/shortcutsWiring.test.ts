import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { shortcutGroups } from "../src/renderer/src/shortcuts"

/**
 * The shortcut reference against the handlers it describes.
 *
 * tests/shortcuts.test.ts checks the list is internally consistent - no chord
 * twice, every row described, the view range derived from the deck. All of that
 * was true of the two arrays it replaced, and both were still wrong: the overlay
 * called Ctrl+Shift+J "Agents inbox" for weeks after that drawer was deleted,
 * and Settings had fallen ten bindings behind. Internal consistency cannot catch
 * either, because neither list ever mentioned App.tsx.
 *
 * So this file pins the list to the source. Both directions matter and they
 * catch different bugs:
 *
 *   - forward: a documented chord whose handler is gone or renamed. The
 *     "Agents inbox" shape - the reference promising a keystroke that does
 *     nothing.
 *   - reverse: a bound chord nobody documented. The "ten bindings behind" shape
 *     - the app growing a keystroke the reference never learned about.
 *
 * Deliberately crude, in the manner of tests/signalSites.test.ts: it looks for
 * the literal guard text, and it is not a parser. What it buys is that the two
 * halves cannot both be edited by accident - moving a binding means moving its
 * row in WIRING, which means reading the doc row next to it.
 */

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))
const APP = src("../src/renderer/src/App.tsx")
const TERMINAL = src("../src/renderer/src/components/TerminalView.tsx")
const EDITOR = src("../src/renderer/src/components/EditorPanel.tsx")
const DB = src("../src/renderer/src/components/DbPanel.tsx")

/**
 * A file's executable text: line and block comments blanked, newlines kept.
 *
 * Commenting a handler out is the cheapest way to break a documented chord, and
 * a scan that a `//` can satisfy reports a confidence it does not have.
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
            // Block comments opened and closed on this line, repeatedly.
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

const code = (path: string): string => stripComments(readFileSync(path, "utf8"))

/** The `e.code` a Ctrl+Shift chord arrives as, for the printable-key family. */
const CODE_FOR: Record<string, string> = {
    Enter: "Enter",
    "\\": "Backslash",
    "-": "Minus",
    "]": "BracketRight",
    "[": "BracketLeft"
}

const codeOf = (key: string): string | undefined =>
    CODE_FOR[key] ?? (/^[A-Za-z]$/.test(key) ? `Key${key.toUpperCase()}` : undefined)

/**
 * Every documented chord, and the guard in source that makes it real.
 *
 * Ctrl+Shift+<key> rows are derived rather than typed, so the common case
 * cannot be mistyped; everything with a shape of its own is spelled out. A row
 * here is a claim about a file, which is why the file is named next to it.
 */
function wiringFor(keys: string): { file: string; needle: string } | undefined {
    // The shapes of their own come first: Ctrl+Shift+Tab reads as a Ctrl+Shift
    // chord but is bound by the Tab guard, not by an `e.code === "KeyTab"` that
    // does not exist.
    const special = specialWiring(keys)
    if (special) return special
    const shift = keys.match(/^Ctrl \+ Shift \+ (.+)$/)
    if (shift) {
        const c = codeOf(shift[1])
        if (!c) return undefined
        // Ctrl+Shift+I and Ctrl+Shift+Z sit with the global handler on purpose:
        // TerminalView's handler early-returns outside Terminal view, which once
        // made the composer chord dead everywhere the launcher advertised it.
        const global = ["KeyP", "KeyF", "KeyB", "KeyR", "KeyI", "KeyK", "KeyJ", "KeyZ"]
        if (global.includes(c)) return { file: APP, needle: `e.shiftKey && e.code === "${c}"` }
        return { file: TERMINAL, needle: `${c}: () =>` }
    }
    return undefined
}

function specialWiring(keys: string): { file: string; needle: string } | undefined {
    switch (keys) {
        case "Ctrl + K":
            return { file: APP, needle: `!e.shiftKey && e.key.toLowerCase() === "k"` }
        case "Ctrl + Tab":
        case "Ctrl + Shift + Tab":
            return { file: APP, needle: `mod && e.code === "Tab"` }
        case "F1":
            return { file: APP, needle: `e.code === "F1"` }
        case "Alt + arrows":
            return { file: APP, needle: `e.altKey && !mod && PANE_DIRS[e.code]` }
        case "Alt + 1 … 9":
            return { file: APP, needle: `e.altKey && !mod && /^Digit[1-9]$/.test(e.code)` }
        case "Ctrl + S":
            return { file: EDITOR, needle: `monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS` }
        case "Ctrl + Enter":
            return { file: DB, needle: `monaco.KeyCode.Enter` }
        default:
            // The Ctrl+1…N row carries the deck's own length, so it is matched
            // by shape rather than by text.
            if (/^Ctrl \+ 1 … \d+$/.test(keys))
                return { file: APP, needle: `mod && !e.shiftKey && /^Digit[1-9]$/.test(e.code)` }
            return undefined
    }
}

const DECK = ["Mission", "Tasks", "Terminal", "API", "Database", "Browser", "Network", "Editor"]
const documented = shortcutGroups(DECK).flatMap((g) => g.items.map(([keys]) => keys))

describe("the shortcut reference against the handlers", () => {
    it("knows where every documented chord is bound", () => {
        // A doc row with no wiring row is a promise nobody checked. Adding a
        // chord to shortcuts.ts fails here until it names its handler.
        const unmapped = documented.filter((keys) => !wiringFor(keys))
        expect(unmapped).toEqual([])
    })

    it("finds every documented chord's handler in source", () => {
        const missing: string[] = []
        for (const keys of documented) {
            const w = wiringFor(keys)
            if (!w) continue
            if (!code(w.file).includes(w.needle)) missing.push(`${keys} → ${w.needle}`)
        }
        expect(missing).toEqual([])
    })

    it("documents every global Ctrl+Shift chord App.tsx binds", () => {
        // The reverse direction: the app growing a keystroke the reference never
        // learned about, which is how Settings fell ten bindings behind.
        const bound = [...code(APP).matchAll(/e\.shiftKey && e\.code === "(\w+)"/g)].map(
            (m) => m[1]
        )
        expect(bound.length, "the global handler's shape changed - update the scan").toBeGreaterThan(
            5
        )
        const documentedCodes = new Set(
            documented.map((k) => wiringFor(k)?.needle.match(/"(Key\w+)"/)?.[1]).filter(Boolean)
        )
        expect(bound.filter((c) => !documentedCodes.has(c))).toEqual([])
    })

    it("documents every chord in TerminalView's map", () => {
        const map = code(TERMINAL).match(/const map: Record<string, \(\) => void> = \{([^}]*)\}/s)
        expect(map, "TerminalView's keymap shape changed - update the scan").not.toBeNull()
        const bound = [...map![1].matchAll(/^\s*(\w+): \(\) =>/gm)].map((m) => m[1])
        expect(bound.length).toBeGreaterThan(5)
        const documentedCodes = new Set(
            shortcutGroups(DECK)
                .find((g) => g.title === "Terminal")!
                .items.map(([keys]) => codeOf(keys.replace(/^Ctrl \+ Shift \+ /, "")))
        )
        expect(bound.filter((c) => !documentedCodes.has(c))).toEqual([])
    })
})
