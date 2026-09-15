import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Why this suite exists.
 *
 * Two deletions this month left a backend running behind a deleted UI. The
 * second was the Work panel: 0.14.0 deleted `WorkPanel.tsx` and wrote in the
 * changelog that the IPC handlers and preload channels went with it, and they
 * did not. Four `work:*` handlers and a `window.api.work` bridge shipped for a
 * release with no caller anywhere in the renderer - carrying an encrypted Jira
 * token, an Azure PAT and an insecure-TLS toggle behind them. Nothing failed,
 * because nothing checks that the door is attached to a room.
 *
 * The rule here is the narrowest one that would have caught it: **every group
 * on the preload bridge is reached by the renderer.** A group is the unit on
 * purpose - a panel's deletion orphans a whole group at once, which is the
 * failure that happened twice, while a per-method rule would fire on a method
 * that is merely unused and turn into an allowlist nobody reads.
 *
 * Two broader rules were considered and left out:
 *
 * - *A handler with no preload surface.* Currently zero offenders, but it would
 *   not have caught Work (which had a preload surface), and it is the rule most
 *   likely to fire falsely later - a handler may legitimately serve something
 *   other than the renderer.
 * - *A preload method with no renderer caller.* Too fine: it flags the normal
 *   state of a bridge method kept for a surface that is built but not yet wired.
 *
 * If a group is ever added for a non-renderer consumer, allowlist it here with
 * the reason. An empty allowlist is the honest current state.
 */
const SRC = join(__dirname, "..", "src")
const PRELOAD = join(SRC, "preload", "index.ts")
const RENDERER = join(SRC, "renderer")

/** Groups that exist for something other than the renderer. Add with a reason. */
const ALLOWED_UNREACHED: string[] = []

/**
 * Top-level groups of the object passed to `contextBridge.exposeInMainWorld`.
 * They are the only members indented exactly four spaces that open an object
 * literal, which is what this matches - the api object is the file's only
 * top-level `const … = {`, and the type declarations above it are interfaces.
 */
function bridgeGroups(): string[] {
    const text = readFileSync(PRELOAD, "utf8")
    const start = text.indexOf("const api")
    expect(start, "preload/index.ts no longer declares `const api`").toBeGreaterThan(-1)
    const body = text.slice(start)
    const out: string[] = []
    for (const line of body.split("\n")) {
        const m = /^ {4}([a-zA-Z_][a-zA-Z0-9_]*): \{$/.exec(line)
        if (m) out.push(m[1])
    }
    return out
}

function rendererFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) out.push(...rendererFiles(full))
        else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
    }
    return out
}

const GROUPS = bridgeGroups()
const RENDERER_TEXT = rendererFiles(RENDERER)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n")

/** `window.api.pty`, `api.pty`, or a destructure of `pty` off the api object. */
function reached(group: string): boolean {
    return (
        new RegExp(`\\bapi\\s*\\.\\s*${group}\\b`).test(RENDERER_TEXT) ||
        new RegExp(`\\bapi\\s*\\?\\.\\s*${group}\\b`).test(RENDERER_TEXT) ||
        new RegExp(`\\bapi\\s*\\[\\s*["'\`]${group}["'\`]\\s*\\]`).test(RENDERER_TEXT)
    )
}

describe("the preload bridge is reached by the renderer", () => {
    it("finds the bridge groups at all", () => {
        // A scanner that silently finds nothing would pass every rule below.
        expect(GROUPS.length).toBeGreaterThan(20)
        expect(GROUPS).toContain("pty")
        expect(GROUPS).toContain("projects")
    })

    it("has no group the renderer never touches", () => {
        const orphans = GROUPS.filter((g) => !ALLOWED_UNREACHED.includes(g) && !reached(g))
        expect(
            orphans,
            `window.api.${orphans.join(", window.api.")} has no renderer caller. ` +
                "Either the UI that used it was deleted and the bridge and its main-process " +
                "handlers should go too, or it serves something other than the renderer - " +
                "in which case allowlist it here with that reason."
        ).toEqual([])
    })

    it("allowlists nothing that is actually reached", () => {
        // A stale entry is a rule protecting nothing.
        expect(ALLOWED_UNREACHED.filter((g) => reached(g))).toEqual([])
    })

    it("catches the shape it exists for", () => {
        // Proves the matcher is not vacuously true: a name no bridge group has
        // and no renderer file mentions must read as unreached.
        expect(reached("workItemsThatNoLongerExist")).toBe(false)
    })
})
