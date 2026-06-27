/**
 * Minimal glob matcher for pipeline file-triggers. Supports `*` (any chars
 * except `/`), `**` (any chars including `/`), and `?` (one char). Matching is
 * done against a POSIX-style relative path. Pure + dependency-free so it can be
 * unit-tested without Electron.
 */

/** Normalize a path to forward slashes, no leading "./". */
export function normalizeRel(p: string): string {
    return p.replace(/\\/g, "/").replace(/^\.\//, "")
}

function escapeRegex(s: string): string {
    return s.replace(/[.+^${}()|[\]\\]/g, "\\$&")
}

/** Convert a glob to an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
    let re = ""
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i]
        if (c === "*") {
            if (glob[i + 1] === "*") {
                // ** matches across path separators (and an optional trailing /).
                re += ".*"
                i++
                if (glob[i + 1] === "/") i++
            } else {
                re += "[^/]*"
            }
        } else if (c === "?") {
            re += "[^/]"
        } else {
            re += escapeRegex(c)
        }
    }
    return new RegExp("^" + re + "$", "i")
}

/**
 * Match a relative path against a glob. An empty glob matches everything.
 * A bare pattern with no slash (e.g. "*.cs") matches the path's basename too,
 * so "*.cs" hits "src/app/Foo.cs".
 */
export function matchGlob(glob: string, relPath: string): boolean {
    const path = normalizeRel(relPath)
    const g = glob.trim()
    if (!g) return true
    const norm = normalizeRel(g)
    if (globToRegExp(norm).test(path)) return true
    // Convenience: slash-less pattern also matches the basename.
    if (!norm.includes("/")) {
        const base = path.split("/").pop() ?? path
        return globToRegExp(norm).test(base)
    }
    return false
}
