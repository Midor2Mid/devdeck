import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, resolve, relative, sep } from "node:path"

/**
 * Why this suite exists.
 *
 * `docs/` on this repo holds beta recruiting material, seven QA reports and
 * roughly 350 screenshots, and every brainstorm and plan this project has ever
 * written down - none of it meant for a stranger. `site/` is the one thing that
 * IS meant for a stranger, and it sits beside `docs/` at repo root specifically
 * so that Pages' branch-root/`-branch:/docs` deploy shapes cannot serve both
 * from the same switch. `.github/workflows/pages.yml` instead uploads a named
 * path via `actions/upload-pages-artifact`, which means the one line that keeps
 * `docs/` off the public homepage is that step's `path:` value. Nothing else in
 * CI reads that file for meaning, so a one-line widening - `path: .`, `path:
 * docs`, a second upload step - would ship silently. This is that line, made a
 * test rather than a comment, in the shape `tests/asarUnpack.test.ts`,
 * `tests/architectureBoundaries.test.ts` and `tests/publishedIdentifiers.test.ts`
 * already use for a rule this repo cannot afford to regress by eye.
 *
 * The second half guards the other way a leak reaches the same page: `site/`
 * itself gaining a reference (an <img>, a link, a copy-pasted path) to anything
 * under `docs/`, or to any local path that escapes `site/` entirely. `site/`
 * was written to be self-contained and carries no build step, so "every local
 * reference resolves inside site/" is checkable directly against the files on
 * disk - no fixture, no mock.
 */

const ROOT = join(__dirname, "..")
const SITE = join(ROOT, "site")
const WORKFLOW = join(ROOT, ".github", "workflows", "pages.yml")

describe("Pages deploy is scoped to site/, and only site/", () => {
    const workflowText = readFileSync(WORKFLOW, "utf8")

    it("uploads via actions/upload-pages-artifact exactly once", () => {
        const uses = workflowText.match(/uses:\s*actions\/upload-pages-artifact@/g) ?? []
        expect(
            uses.length,
            "pages.yml should have exactly one upload-pages-artifact step - a second one is a second, unguarded, deploy scope"
        ).toBe(1)
    })

    it("names site as the uploaded path - not '.', not docs, not anything wider", () => {
        // Isolate the upload-pages-artifact step's own block: from its `uses:`
        // line up to the next `- ` step (or end of file), so a `path:` that
        // belongs to some other step can never be mistaken for this one.
        const stepStart = workflowText.indexOf("actions/upload-pages-artifact@")
        expect(stepStart, "no upload-pages-artifact step found in pages.yml").toBeGreaterThan(-1)
        const rest = workflowText.slice(stepStart)
        const nextStepAt = rest.slice(1).search(/\n\s*-\s/)
        const block = nextStepAt === -1 ? rest : rest.slice(0, nextStepAt + 1)

        const pathMatch = /^\s*path:\s*(.+?)\s*$/m.exec(block)
        expect(pathMatch, "upload-pages-artifact step has no explicit path: input").not.toBeNull()

        const uploadedPath = pathMatch![1].replace(/^["']|["']$/g, "")
        expect(uploadedPath).toBe("site")
    })
})

describe("site/ is genuinely self-contained", () => {
    function walk(dir: string): string[] {
        const out: string[] = []
        for (const name of readdirSync(dir)) {
            const p = join(dir, name)
            if (statSync(p).isDirectory()) out.push(...walk(p))
            else out.push(p)
        }
        return out
    }

    const files = walk(SITE)

    it("has at least one file - the suite below would pass vacuously otherwise", () => {
        expect(files.length).toBeGreaterThan(0)
    })

    it("contains no reference to docs/ anywhere in its tracked text", () => {
        for (const f of files) {
            if (/\.(png|jpe?g|gif|ico|webp|bmp|woff2?|ttf|otf)$/i.test(f)) continue
            const text = readFileSync(f, "utf8")
            const m = /docs\//.exec(text)
            expect(m, `${relative(ROOT, f)} references "docs/" at index ${m?.index}`).toBeNull()
        }
    })

    it("resolves every local src=/href= reference to a file inside site/", () => {
        const refRe = /(?:src|href)\s*=\s*["']([^"']+)["']/g
        const isExternalOrInert = (ref: string): boolean =>
            /^(https?:)?\/\//.test(ref) ||
            ref.startsWith("data:") ||
            ref.startsWith("mailto:") ||
            ref.startsWith("#")

        let checked = 0
        for (const f of files) {
            if (!/\.html?$/i.test(f)) continue
            const text = readFileSync(f, "utf8")
            let m: RegExpExecArray | null
            while ((m = refRe.exec(text))) {
                const ref = m[1]
                if (isExternalOrInert(ref)) continue

                const bare = ref.split(/[?#]/)[0]
                const resolved = resolve(join(f, "..", bare))
                const rel = relative(SITE, resolved)

                expect(
                    rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep + "..")),
                    `${relative(ROOT, f)} references "${ref}", which resolves outside site/`
                ).toBe(true)
                expect(existsSync(resolved), `${relative(ROOT, f)} references "${ref}", which does not exist`).toBe(
                    true
                )
                checked++
            }
        }
        // Guards against the regex itself silently matching nothing (e.g. after
        // a future rewrite of index.html) and this test passing for the wrong
        // reason - site/index.html embeds a real screenshot today.
        expect(checked).toBeGreaterThan(0)
    })
})
