import { sameDir } from "../../shared/paths"

/**
 * Where a session actually is, and what to call it when that is not the project
 * root.
 *
 * Pure, and out of the components on purpose: three surfaces ask this question
 * (the deck bar's status region, the deck key's tooltip, the palette's session
 * rows) and this repo has no component tests, so a copy living in any one of
 * them is a copy no unit test can reach. It is the same argument `wantsYouLabel`
 * and `projectSessionCounts` are in `deck.ts` for.
 *
 * A worktree is not an entity anywhere in the renderer: `AnySession` carries
 * `projectId` / `projectName` / `projectPath` and no branch, no worktree path,
 * no worktree id. It is modelled as a cwd override — `Persisted.termCwd`, "per
 * -terminal working-dir override (e.g. a git worktree path)" — and that is
 * deliberately all it is here too. Nothing below mints a third identity axis on
 * top of `projectId` and the normalised directory.
 */

/**
 * The directory a session STARTED in: its own override, else the project root.
 *
 * `||`, not `??`: a dispatch with the worktree box off records no override at
 * all, and an empty-string entry must fall through to the project path rather
 * than being kept — the same reasoning `store.sessionCwd` carries.
 */
export function sessionDir(termCwd: string | undefined, projectPath: string): string {
    return termCwd || projectPath
}

/**
 * The worktree's leaf directory name, or `null` when the session sits in the
 * project's own tree.
 *
 * `null` is "no marker", and the marker only ever ADDS — the rule the wants-you
 * control and the command-presence marker both already keep. There is no
 * "project root" badge to learn to ignore.
 *
 * The LEAF, not a branch read from git. `newAgentInWorktree` creates the
 * directory as `safeBranch(name)` under `<project>.worktrees/`, so for a
 * DevDeck-made worktree the leaf IS the branch, and for any other directory the
 * leaf is a true statement about where the session is while a branch name would
 * be a guess. Nothing here calls git; a surface that needs the real branch polls
 * for it and hands it in.
 */
export function worktreeLeaf(dir: string, projectPath: string): string | null {
    if (!dir || !projectPath || sameDir(dir, projectPath)) return null
    return dir.split(/[\\/]/).filter(Boolean).pop() ?? null
}

/**
 * Is this session's directory something other than the project root?
 *
 * Reads `sameDir` — the one normaliser (`src/shared/paths.ts`) — rather than
 * `!==`, because the two sides arrive in different shapes: `git worktree add`
 * hands back forward slashes and a project path is however the user typed it.
 * Comparing with `!==` marks the project's own tree as a worktree and puts a
 * WORKTREE label on every session in the app.
 */
export function inWorktree(dir: string, projectPath: string): boolean {
    return worktreeLeaf(dir, projectPath) !== null
}
