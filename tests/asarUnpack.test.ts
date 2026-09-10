import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

/**
 * Why this suite exists.
 *
 * `build.asarUnpack` names packages that must sit beside app.asar rather than
 * inside it, and nothing else in the repo compares those globs to what is
 * actually installed. So an entry outlives its dependency silently: the glob
 * matches nothing, electron-builder says nothing, and the only symptom is a
 * native module that fails to load in the packaged app - which is not reachable
 * from a dev run or from `npm test`. `node-sqlite3-wasm` sat in this list after
 * its driver was dropped, and it was the second time a stale packaging glob had
 * to be found by eye.
 *
 * The assertion is deliberately about `dependencies`, not devDependencies: only
 * production dependencies are packaged, so a glob pointing at a dev-only package
 * is the same defect.
 */
const root = join(__dirname, "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>
    build?: { asarUnpack?: string[] }
}

const deps = Object.keys(pkg.dependencies ?? {})
const globs = pkg.build?.asarUnpack ?? []

/**
 * `**\/node_modules/<name>/**` -> `<name>`. A scoped glob can name the whole
 * scope (`@lydell`) or one package in it (`@xterm/xterm`); both are the same
 * shape to electron-builder, so both are accepted here and checked differently.
 */
function packageOf(glob: string): string {
    const m = /node_modules\/(.+?)\/\*\*$/.exec(glob)
    return m ? m[1] : ""
}

/** A bare scope (`@lydell`) matches every dependency inside it. */
const isScope = (name: string): boolean => name.startsWith("@") && !name.includes("/")

describe("build.asarUnpack", () => {
    it("is not empty - the pty native module has to be unpacked", () => {
        expect(globs.length).toBeGreaterThan(0)
    })

    it("uses the one shape this test can check", () => {
        for (const g of globs) {
            expect(packageOf(g), `unrecognised asarUnpack glob: ${g}`).not.toBe("")
        }
    })

    it("names only real production dependencies", () => {
        for (const g of globs) {
            const name = packageOf(g)
            const ok = isScope(name)
                ? deps.some((d) => d.startsWith(`${name}/`))
                : deps.includes(name)
            expect(ok, `asarUnpack names ${name}, which is not in dependencies`).toBe(true)
        }
    })

    it("names only packages that are actually installed", () => {
        // The complement of the check above: a dependency can be declared and
        // still not resolve (a scope typo), and the glob would again match
        // nothing at package time.
        for (const g of globs) {
            const name = packageOf(g)
            const dir = join(root, "node_modules", name)
            expect(existsSync(dir), `asarUnpack names ${name}, missing at ${dir}`).toBe(true)
        }
    })

    it("no longer names a database driver", () => {
        // Named rather than left implicit: pg, mysql2, mssql and
        // node-sqlite3-wasm were dropped, and node-sqlite3-wasm was the entry
        // that stayed behind.
        const text = globs.join("\n")
        for (const gone of ["node-sqlite3-wasm", "pg", "mysql2", "mssql"]) {
            expect(text).not.toContain(gone)
        }
    })
})

describe("production dependencies", () => {
    it("carries no database driver", () => {
        // The drivers cost ~830 ms of every cold start (measured 2026-09-10),
        // were require()d before app.whenReady(), and brought three TLS
        // settings that could not be fixed while they were here:
        // rejectUnauthorized: false on pg and mysql, and unconditional
        // trustServerCertificate: true on mssql. If one comes back, the SSL
        // control has to come back honest.
        for (const gone of ["pg", "mysql2", "mssql", "node-sqlite3-wasm"]) {
            expect(deps).not.toContain(gone)
        }
    })
})
