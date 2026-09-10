import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BUNDLED_LANGUAGES, LANG, langFor } from "../src/renderer/src/monacoLanguages"

const root = join(__dirname, "..")

/**
 * monaco-editor ships 83 basic languages plus 4 language services. Bundling the
 * lot costs ~98MB of the artifact, so monaco-setup imports only the contributions
 * this app can actually ask for. The hazard that creates: adding an extension to
 * EditorPanel's LANG map without bundling its language silently degrades that file
 * type to plaintext, with no error anywhere. These tests are that guard.
 */
describe("every language the app can request is bundled", () => {
    it("covers EditorPanel's extension map", () => {
        const missing = [...new Set(Object.values(LANG))].filter(
            (lang) => lang !== "plaintext" && !BUNDLED_LANGUAGES.includes(lang)
        )
        expect(missing).toEqual([])
    })

    // The two panels that asked for a language outside LANG - ApiPanel (from the
    // response content-type) and DbPanel (hardcoded `sql`) - were deleted by D1,
    // so their half of this guard went with them. `LANG` above is now the only
    // way the app names a language, and the first test covers all of it.

    it("imports a contribution for every basic language it claims", () => {
        // A language listed with no import is a claim the other tests cannot catch,
        // so the list is checked against the file's actual import lines.
        const setup = readFileSync(join(root, "src/renderer/src/monaco-setup.ts"), "utf8")
        // Ids that arrive via a service or another language's contribution rather
        // than an import of their own.
        const derived = ["javascript", "scss", "less", "handlebars", "razor", "c"]
        const missing = BUNDLED_LANGUAGES.filter(
            (lang) =>
                !derived.includes(lang) &&
                !setup.includes(`basic-languages/${lang}/${lang}.contribution`) &&
                !setup.includes(`vs/language/${lang}/monaco.contribution`)
        )
        expect(missing).toEqual([])
    })

    it("imports all four rich services", () => {
        // Dropping one of these costs completions and diagnostics, not just colour.
        const setup = readFileSync(join(root, "src/renderer/src/monaco-setup.ts"), "utf8")
        for (const svc of ["typescript", "json", "css", "html"]) {
            expect(setup).toContain(`vs/language/${svc}/monaco.contribution`)
        }
    })

    it("does not pull in the full editor bundle, which would defeat the point", () => {
        // `from "monaco-editor"` resolves to editor.main.js, which imports every
        // language. The subset only holds while the entry is editor.api.
        const setup = readFileSync(join(root, "src/renderer/src/monaco-setup.ts"), "utf8")
        expect(setup).not.toMatch(/from "monaco-editor"/)
        expect(setup).toContain("monaco-editor/esm/vs/editor/editor.api")
    })
})

describe("langFor", () => {
    it("maps an extension to its language", () => {
        expect(langFor("main.py")).toBe("python")
        expect(langFor("Dockerfile.dockerfile")).toBe("dockerfile")
    })

    it("falls back to plaintext rather than guessing", () => {
        expect(langFor("notes.xyz")).toBe("plaintext")
        expect(langFor("noextension")).toBe("plaintext")
    })
})

describe("BUNDLED_LANGUAGES is honest about what it claims", () => {
    it("includes the ids the services register, not just the folder names", () => {
        // The css service registers scss and less too, and cpp's contribution
        // registers plain c. Those ids must be claimable even though there is no
        // "scss" or "c" import line.
        for (const id of ["scss", "less", "c", "javascript"]) {
            expect(BUNDLED_LANGUAGES).toContain(id)
        }
    })

    it("does not claim a language monaco was never asked to load", () => {
        for (const id of ["abap", "elixir", "postiats", "freemarker2", "swift"]) {
            expect(BUNDLED_LANGUAGES).not.toContain(id)
        }
    })
})
