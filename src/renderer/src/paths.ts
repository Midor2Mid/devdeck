/**
 * Do two paths refer to the same directory? Deliberately string-only: the two
 * sources being compared arrive in different shapes — `git worktree add` hands
 * back forward slashes, a project path is however the user typed it, and
 * path.join produces backslashes on Windows — so comparing with `!==` marks the
 * same directory as two.
 *
 * It decides run cost attribution (see runRecorder's `attributionReason`), and
 * the folding is the fail-closed direction there: it can only ever mark MORE
 * runs as shared, never fewer, so a false match understates exclusivity rather
 * than billing one session's money to another. Case-folded because DevDeck is
 * Windows-first.
 */
export function samePath(a: string, b: string): boolean {
    const n = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
    return !!a && !!b && n(a) === n(b)
}
