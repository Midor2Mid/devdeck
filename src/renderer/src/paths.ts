/**
 * Do two paths refer to the same directory? Deliberately string-only: the two
 * sources being compared here are `git worktree list` (forward slashes) and
 * path.join (backslashes on Windows), and treating them as unequal silently
 * disables the whole race — no commit is ever noticed. Case-folded because
 * DevDeck is Windows-first.
 */
export function samePath(a: string, b: string): boolean {
    const n = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
    return !!a && !!b && n(a) === n(b)
}
