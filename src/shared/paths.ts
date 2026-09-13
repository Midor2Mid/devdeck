/**
 * One spelling for one directory, for every layer that compares two paths.
 *
 * This existed **three times** before 2026-09-14 — `renderer/src/ownership.ts`
 * and `renderer/src/paths.ts` held byte-identical private copies, and
 * `main/attention.ts` held a third that also trimmed. Each decided something
 * different and none of them knew about the others: ownership decides whether
 * two agents conflict over a working tree, `paths` decides which session a run's
 * cost is attributed to, and attention decides which pane a hook belongs to.
 *
 * `buildOwnership` keyed on project NAME until a0d925a (2026-09-09), where "two
 * worktrees of one project conflicted on every shared path, defeating the
 * worktree toggle entirely" — one identity used where two were needed, invisible
 * to the typecheck and green in the suite. Three copies of the identity function
 * is the same bug one level up: when one drifts by a character (a UNC prefix, a
 * trailing dot, a drive-letter case) the surface saying "2 agents are already
 * working in this tree" disagrees with the surface that put them in different
 * rows, and nothing fails.
 *
 * So it lives here, once, and `tests/signalSites.test.ts` pins that no other
 * file under `src/` spells the normalising expression again.
 *
 * Deliberately string-only, never `realpath`: the two sides being compared are
 * strings DevDeck and a CLI each produced for the same directory (`git worktree
 * add` hands back forward slashes, a project path is however the user typed it,
 * `path.join` produces backslashes on Windows), not a decision about whether a
 * path is *allowed* — no filesystem call belongs on the hook path, and no
 * security guard may be built on this.
 *
 * Case-folded because DevDeck is Windows-first. Being generous is the
 * fail-closed direction at every caller: a false negative silently disables the
 * dispatch guard, and in run attribution a false match understates exclusivity
 * rather than billing one session's money to another.
 */
export function normDir(p: string): string {
    return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
}

/** Do two paths name the same directory? Empty on either side is never a match. */
export function sameDir(a: string, b: string): boolean {
    return !!a && !!b && normDir(a) === normDir(b)
}
