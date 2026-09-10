import { describe, it, expect } from "vitest"
import ts from "typescript"
import { readdirSync, readFileSync } from "node:fs"
import { join, dirname, resolve, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

// Which layer may depend on which, pinned in source.
//
// The rule this file exists for was designed on 2026-08-25 and never landed, so
// the violation it was designed to stop survived a four-phase audit, sixteen
// remedy items, three releases and the flip to public:
//
//     src/main/server.ts:29   import { exitNotice } from "../renderer/src/termExit"
//
// One value import, of a module whose other half is a renderer-state Map.
//
// It had cost nothing measurable: rollup tree-shook the Map, and `out/main/`
// builds byte-identical with the import and without it (checked 2026-09-10, both
// bundles diffed). The cost was what it invited. Main already owns pty exits
// (`main/pty.ts` produces the code `server.ts` reports), so the obvious next
// change is main calling `recordExit` — at which point the Map is live in two
// processes and `exitCodeOf` answers differently depending on who asks. Every
// derived-status surface then disagrees about which sessions are dead, which is
// the bug class 2026-09-08 spent a day removing from eleven surfaces.
// `src/shared/termExit.ts` and `src/renderer/src/termExit.ts` are the fix; these
// assertions are what keeps it fixed.
//
// That is also the honest argument for having this file at all: these rules do
// not catch a bug that is biting, they keep a bug that cannot be tested for from
// becoming reachable. A green build and a zero typecheck both had nothing to say
// about the import above, for weeks, in public.
//
// **No new toolchain.** An import lint is the obvious instrument and this repo
// has no ESLint at all, so the rules are a source scan run by the suite already
// in CI — the same shape as `tests/signalSites.test.ts` and
// `tests/publishedIdentifiers.test.ts`, zero new dependencies.
//
// **Why the compiler's own parser and not a regex.** `typescript` is already a
// devDependency (it is what `npm run typecheck` runs), and the one distinction
// these rules turn on — value import versus type-only import — is a distinction
// only the parser gets right. A regex has to decide about `import type {…}`,
// `import { type A, b }`, `import { type A }` (every specifier a type, so the
// statement is erased), `export { x } from`, `export type { x } from`, a bare
// side-effect `import "…"`, a `import()` expression, and a decoy spelled inside
// a comment or a string. Each of those is one line in `refsIn` below and each is
// pinned by a test in "the scanner itself". A scan a one-line edit can fool is
// worse than no scan, because it reports a confidence it does not have.
//
// **The distinction, stated once.** A type-only edge is erased at build time: no
// module is loaded, no code is bundled, no second copy of anything exists at
// runtime. It is therefore legitimate across layers, and forbidding it would
// make these rules unbearable (the renderer reads `DevDeckApi` from preload in
// 21 places). A value edge loads the other layer's module. That is the defect,
// and R1 gives it no escape hatch.

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

/** The four layers. Anything else under `src/` is a directory nobody declared. */
const LAYERS = ["main", "preload", "renderer", "shared"] as const
type Layer = (typeof LAYERS)[number]

/**
 * Cross-layer edges that are legal only because they are named here.
 *
 * Deliberately an allowlist, like `tests/gitIdentity.test.ts`: a denylist can
 * only forbid the crossings someone has already thought of, and the crossing
 * that cost this project a boundary was one nobody listed. Every entry is
 * **type-only** — the assertion below re-checks that, so this list can never
 * launder a value import past R1.
 *
 * Entries are `<src-relative file> -> <specifier as written>`; no line numbers,
 * so moving an import inside its file is not a failure.
 *
 * The two `renderer -> main` entries are real debt: the renderer's type surface
 * is pinned to a main module's internals, and `main/ledger.ts` is the module the
 * run-ledger data-loss work is queued against. They erase at build time, so they
 * are not urgent; when they move to `shared/`, delete the two lines.
 */
const ALLOWED_TYPE_EDGES: string[] = [
    // main reads the preload's `DevDeckApi` type to keep handler payloads honest.
    "main/search.ts -> ../preload/index",
    "main/system.ts -> ../preload/index",
    "main/usage.ts -> ../preload/index",
    // The preload types its bridge against main's handler signatures. Type-only
    // on purpose: `main/decisions.ts` imports `main/pty`, and a value import
    // here would drag node-pty into the preload bundle (see preload/index.ts:50).
    "preload/index.ts -> ../main/guards",
    "preload/index.ts -> ../main/projects",
    "preload/index.ts -> ../main/index",
    "preload/index.ts -> ../main/ledger",
    "preload/index.ts -> ../main/devices",
    "preload/index.ts -> ../main/server",
    "preload/index.ts -> ../main/notify",
    // The run ledger's row shapes, read straight from main rather than through
    // `shared/`. Debt, named above.
    "renderer/src/ledgerView.ts -> ../../main/ledger",
    "renderer/src/runRecorder.ts -> ../../main/ledger"
]

/** One module reference: an import, a re-export, an `import()` or a `require()`. */
interface Ref {
    /** Src-relative path of the file holding the reference, with `/` separators. */
    file: string
    /** The specifier exactly as written. */
    spec: string
    line: number
    /** True when the whole statement is erased at build time. */
    typeOnly: boolean
}

/** A cross-layer edge: a `Ref` whose target resolves into a different layer. */
interface Edge extends Ref {
    from: Layer
    to: string
}

const posix = (p: string): string => p.split(sep).join("/")

/** Every `.ts`/`.tsx` file under `src/`, src-relative. */
function sourceFiles(): string[] {
    return readdirSync(SRC, { recursive: true, encoding: "utf8" })
        .filter((f) => /\.tsx?$/.test(f))
        .map(posix)
}

/** The layer a src-relative path belongs to, or `null` for anything else. */
function layerOf(file: string): Layer | null {
    const first = file.split("/")[0] as Layer
    return LAYERS.includes(first) ? first : null
}

/**
 * Every module reference in one file, classified value or type-only.
 *
 * Takes the text rather than reading it, so the scanner's own tests can run the
 * real function over a synthetic file — a pin that paraphrases the thing it pins
 * proves nothing (`tests/signalSites.test.ts` makes the same point).
 */
function refsIn(file: string, text: string): Ref[] {
    const sf = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.ESNext,
        /* setParentNodes */ true,
        /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    const out: Ref[] = []
    const push = (spec: string, typeOnly: boolean, node: ts.Node): void => {
        out.push({
            file,
            spec,
            typeOnly,
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
        })
    }
    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const clause = node.importClause
            let typeOnly = false
            if (clause) {
                if (clause.isTypeOnly) {
                    // `import type { A } from "x"` / `import type * as A from "x"`.
                    typeOnly = true
                } else if (
                    !clause.name &&
                    clause.namedBindings &&
                    ts.isNamedImports(clause.namedBindings)
                ) {
                    // `import { type A, type B } from "x"` — every binding a type,
                    // so the statement is erased exactly like `import type`. One
                    // unmarked binding, or a default/namespace binding, and the
                    // module is loaded at runtime.
                    const named = clause.namedBindings.elements
                    typeOnly = named.length > 0 && named.every((e) => e.isTypeOnly)
                }
            }
            // A clause-less `import "x"` is a side-effect import: the module runs.
            push(node.moduleSpecifier.text, typeOnly, node)
        } else if (
            ts.isExportDeclaration(node) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            // A re-export is an import with a wider surface: `export { x } from`
            // loads the module, `export type { x } from` does not.
            push(node.moduleSpecifier.text, node.isTypeOnly, node)
        } else if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) && node.expression.text === "require"))
        ) {
            // `await import("x")` / `require("x")`: no such call crosses a layer
            // today, and it is the first thing a future edit would reach for to
            // get around a static rule.
            const arg = node.arguments[0]
            if (arg && ts.isStringLiteral(arg)) push(arg.text, false, node)
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
    return out
}

/** The cross-layer edges among a file's refs. Relative specifiers only. */
function edgesOf(refs: Ref[]): Edge[] {
    const out: Edge[] = []
    for (const ref of refs) {
        if (!ref.spec.startsWith(".")) continue
        const from = layerOf(ref.file)
        if (!from) continue
        const target = posix(relative(SRC, resolve(join(SRC, dirname(ref.file)), ref.spec)))
        const to = target.split("/")[0]
        if (to !== from) out.push({ ...ref, from, to })
    }
    return out
}

/** Every cross-layer edge in the real tree. */
function treeEdges(): Edge[] {
    const out: Edge[] = []
    for (const file of sourceFiles()) {
        out.push(...edgesOf(refsIn(file, readFileSync(join(SRC, file), "utf8"))))
    }
    return out
}

const show = (e: Edge): string =>
    `${e.file}:${e.line} ${e.typeOnly ? "imports types from" : "VALUE-imports"} ${e.spec}`

const key = (e: Edge): string => `${e.file} -> ${e.spec}`

const crosses = (e: Edge, a: Layer, b: Layer): boolean =>
    (e.from === a && e.to === b) || (e.from === b && e.to === a)

/** R1's offenders: value imports between main and renderer, either direction. */
function mainRendererValueEdges(edges: Edge[]): Edge[] {
    return edges.filter((e) => crosses(e, "main", "renderer") && !e.typeOnly)
}

/** R2's offenders: any other cross-layer value edge not aimed at `shared/`. */
function strayValueEdges(edges: Edge[]): Edge[] {
    return edges.filter(
        (e) => !e.typeOnly && e.to !== "shared" && !crosses(e, "main", "renderer")
    )
}

/** R3's offenders: cross-layer type edges that no rule and no allowlist covers. */
function unlistedTypeEdges(edges: Edge[]): Edge[] {
    return edges.filter(
        (e) =>
            e.typeOnly &&
            e.to !== "shared" &&
            // The renderer's declared door to main: `preload/index.ts` exports
            // `DevDeckApi`, `renderer/src/global.d.ts` declares `window.api` as
            // it, and 20 renderer files read payload types from it. Allowlisting
            // those individually would be churn with no signal in it.
            !(e.from === "renderer" && e.to === "preload") &&
            !ALLOWED_TYPE_EDGES.includes(key(e))
    )
}

const ALL_EDGES = treeEdges()

describe("the scanner itself", () => {
    // Worth as much as it cannot be talked out of a finding, so the classifier is
    // exercised directly — the same function the real scan runs — against the
    // historical violation and against every form that has to stay legal.
    const MAIN = "main/server.ts"
    const RENDERER_SPEC = "../renderer/src/termExit"
    const scan = (text: string, file = MAIN): Edge[] => edgesOf(refsIn(file, text))

    it("finds the source files and the edges at all", () => {
        // Guards every assertion below: a moved directory or a renamed extension
        // would otherwise leave the whole file passing over an empty list.
        expect(sourceFiles().length).toBeGreaterThan(100)
        expect(ALL_EDGES.length).toBeGreaterThan(40)
        expect(ALL_EDGES.filter((e) => e.to === "shared").length).toBeGreaterThan(10)
    })

    it("flags the exact import this file exists to prevent", () => {
        const found = mainRendererValueEdges(
            scan(`import { exitNotice } from "${RENDERER_SPEC}"`)
        )
        expect(found).toHaveLength(1)
        expect(found[0].line).toBe(1)
    })

    it("leaves a type-only import of the same module alone", () => {
        const text = `import type { Something } from "${RENDERER_SPEC}"`
        expect(mainRendererValueEdges(scan(text))).toEqual([])
        // …and still SEES it, as a type edge R3 then rules on. A rule that
        // stopped parsing type imports could not tell "legal" from "invisible".
        expect(scan(text)).toHaveLength(1)
        expect(scan(text)[0].typeOnly).toBe(true)
    })

    it("treats an all-type named import as erased, and a mixed one as a value", () => {
        expect(
            mainRendererValueEdges(scan(`import { type A, type B } from "${RENDERER_SPEC}"`))
        ).toEqual([])
        expect(
            mainRendererValueEdges(scan(`import { type A, b } from "${RENDERER_SPEC}"`))
        ).toHaveLength(1)
        expect(
            mainRendererValueEdges(scan(`import D, { type A } from "${RENDERER_SPEC}"`))
        ).toHaveLength(1)
        expect(
            mainRendererValueEdges(scan(`import * as All from "${RENDERER_SPEC}"`))
        ).toHaveLength(1)
    })

    it("catches the forms that are not the word `import` at all", () => {
        // A side-effect import runs the module; a re-export loads it and widens
        // its surface; `import()`/`require()` are the two dynamic ways round a
        // static rule. None of these say `import {` at the start of a line.
        expect(mainRendererValueEdges(scan(`import "${RENDERER_SPEC}"`))).toHaveLength(1)
        expect(
            mainRendererValueEdges(scan(`export { exitNotice } from "${RENDERER_SPEC}"`))
        ).toHaveLength(1)
        expect(
            mainRendererValueEdges(scan(`export * from "${RENDERER_SPEC}"`))
        ).toHaveLength(1)
        expect(
            mainRendererValueEdges(
                scan(`const m = await import("${RENDERER_SPEC}")\nvoid m`)
            )
        ).toHaveLength(1)
        expect(
            mainRendererValueEdges(scan(`const m = require("${RENDERER_SPEC}")\nvoid m`))
        ).toHaveLength(1)
        // The one that must NOT be flagged: a type-only re-export erases.
        expect(
            mainRendererValueEdges(scan(`export type { A } from "${RENDERER_SPEC}"`))
        ).toEqual([])
    })

    it("cannot be fooled by a comment or a string spelling the import", () => {
        // The three mutations that got past `tests/signalSites.test.ts`'s earlier
        // scanners. The parser is immune to all three by construction; pinned so
        // that swapping it for something cheaper has to prove the same.
        expect(scan(`// import { exitNotice } from "${RENDERER_SPEC}"`)).toEqual([])
        expect(scan(`/* import { exitNotice } from "${RENDERER_SPEC}" */`)).toEqual([])
        expect(
            scan(`/*\nimport { exitNotice } from "${RENDERER_SPEC}"\n*/\nexport const x = 1`)
        ).toEqual([])
        expect(scan(`const decoy = 'import { x } from "${RENDERER_SPEC}"'`)).toEqual([])
    })

    it("ignores same-layer and package imports", () => {
        expect(scan(`import { getCert } from "./tlscert"`)).toEqual([])
        expect(scan(`import { app } from "electron"`)).toEqual([])
    })

    it("resolves the layer from the specifier's depth, not its text", () => {
        // `../../shared/x` from a component and `../shared/x` from main are the
        // same target; a rule matching on the string would miss one of them.
        expect(scan(`import { x } from "../shared/termExit"`)[0].to).toBe("shared")
        expect(
            scan(`import { x } from "../../shared/termExit"`, "renderer/src/store.ts")[0].to
        ).toBe("shared")
        expect(
            scan(`import { x } from "../../../shared/termExit"`, "renderer/src/components/A.tsx")[0]
                .to
        ).toBe("shared")
    })
})

describe("R1 — no value import crosses main and renderer", () => {
    it("has none, in either direction", () => {
        const offenders = mainRendererValueEdges(ALL_EDGES)
        expect(
            offenders.map(show),
            "A value import between main and renderer loads one process's module " +
                "into the other's bundle. There is NO allowlist for this rule: put " +
                "the shared part in src/shared/ (see src/shared/termExit.ts) and " +
                "import it from both sides."
        ).toEqual([])
    })

    it("keeps the exit notice reachable from both layers through shared/", () => {
        // Not vacuous: the reason R1 passes is that the notice moved, not that
        // main stopped needing it. Deleting either edge means someone re-copied
        // the text, which is how one exit gets described two ways.
        const byShared = (file: string): Edge[] =>
            ALL_EDGES.filter((e) => e.file === file && e.spec.endsWith("shared/termExit"))
        expect(byShared("main/server.ts")).toHaveLength(1)
        expect(byShared("renderer/src/termExit.ts")).toHaveLength(1)
    })
})

describe("R2 — a cross-layer value import may only aim at shared/", () => {
    it("has no stray value edge between any other pair of layers", () => {
        const offenders = strayValueEdges(ALL_EDGES)
        expect(
            offenders.map(show),
            "Only src/shared/ may be value-imported across layers. A value import " +
                "of preload from the renderer bundles ipcRenderer code into the " +
                "window; a value import of main from the preload drags node-pty in."
        ).toEqual([])
    })
})

describe("R3 — every other cross-layer edge is type-only and pinned", () => {
    it("has no cross-layer type edge outside the rules and the allowlist", () => {
        const offenders = unlistedTypeEdges(ALL_EDGES)
        expect(
            offenders.map(show),
            "A new cross-layer type edge. Type imports erase at build time, so " +
                "this is a deliberate-edit gate, not a bug: prefer moving the type " +
                "to src/shared/, and if the edge is right, add it to " +
                "ALLOWED_TYPE_EDGES with the reason."
        ).toEqual([])
    })

    it("has no stale allowlist entry", () => {
        // The other direction of the same gate: an entry whose edge is gone is a
        // rule protecting nothing, and this list is read as the record of what
        // debt is left.
        const live = new Set(ALL_EDGES.map(key))
        expect(ALLOWED_TYPE_EDGES.filter((k) => !live.has(k))).toEqual([])
    })

    it("allowlists nothing that is a value import", () => {
        // What stops ALLOWED_TYPE_EDGES becoming R1's escape hatch: R1 never
        // consults it, and an entry that turns into a value import fails here as
        // well as there.
        const listed = ALL_EDGES.filter((e) => ALLOWED_TYPE_EDGES.includes(key(e)))
        expect(listed.filter((e) => !e.typeOnly).map(show)).toEqual([])
        expect(listed.length).toBe(ALLOWED_TYPE_EDGES.length)
    })

    it("keeps every src/ import inside src/", () => {
        // Cheap, and it closes the gap the rules above cannot see: an edge whose
        // target resolves outside src/ has no layer, so no rule would rule on it.
        expect(ALL_EDGES.filter((e) => !layerOf(e.to)).map(show)).toEqual([])
    })
})

describe("R4 — shared/ stays importable by both processes", () => {
    const sharedFiles = sourceFiles().filter((f) => layerOf(f) === "shared")

    it("finds the shared modules at all", () => {
        expect(sharedFiles.length).toBeGreaterThan(5)
    })

    it("imports no other layer, and no runtime a renderer bundle cannot have", () => {
        // `shared/` is imported by main, preload and renderer alike, so anything
        // it pulls in has to exist in all three: `electron` and node builtins do
        // not exist in the renderer, and node-pty exists only in main.
        const offenders: string[] = []
        for (const file of sharedFiles) {
            for (const ref of refsIn(file, readFileSync(join(SRC, file), "utf8"))) {
                if (ref.spec.startsWith(".")) {
                    const to = posix(
                        relative(SRC, resolve(join(SRC, dirname(file)), ref.spec))
                    ).split("/")[0]
                    if (to !== "shared") offenders.push(`${file}:${ref.line} -> ${ref.spec}`)
                    continue
                }
                if (ref.typeOnly) continue
                if (/^(electron|node:|@lydell\/node-pty|ws)/.test(ref.spec)) {
                    offenders.push(`${file}:${ref.line} -> ${ref.spec}`)
                }
            }
        }
        expect(offenders, offenders.join("\n")).toEqual([])
    })

    it("touches no DOM global", () => {
        // An identifier-level check over the parsed source, NOT a type-level
        // guarantee: `tsconfig.json` is one project with `lib: [DOM]`, so main
        // and shared may reference `document` and typecheck clean. That is
        // deliberate (splitting the typecheck into several commands would cost
        // the one number this project defends), which is exactly why the import
        // DIRECTION is what gets a rule and this scan is the cheap backstop.
        const DOM = ["window", "document", "localStorage", "sessionStorage", "navigator"]
        const offenders: string[] = []
        for (const file of sharedFiles) {
            const text = readFileSync(join(SRC, file), "utf8")
            const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true)
            const visit = (node: ts.Node): void => {
                if (ts.isIdentifier(node) && DOM.includes(node.text)) {
                    const p = node.parent
                    const isMemberName =
                        (ts.isPropertyAccessExpression(p) && p.name === node) ||
                        (ts.isQualifiedName(p) && p.right === node) ||
                        (ts.isPropertySignature(p) && p.name === node) ||
                        (ts.isPropertyAssignment(p) && p.name === node)
                    if (!isMemberName) {
                        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
                        offenders.push(`${file}:${line} uses ${node.text}`)
                    }
                }
                ts.forEachChild(node, visit)
            }
            visit(sf)
        }
        expect(offenders, offenders.join("\n")).toEqual([])
    })
})
