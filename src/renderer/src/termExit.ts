// The renderer's record of which sessions have exited, plus the one door to the
// exit *notice* — `FASTFAIL` and `exitNotice` moved to src/shared so the main
// process can write the same notice onto the wire without importing anything out
// of `renderer/` (see src/shared/termExit.ts for what that import cost).
//
// Re-exported here, rather than repointed at every call site, because the
// renderer already imports them by this path — `components/TerminalPane.tsx`
// (`exitNotice`), `tileState.ts` (`FASTFAIL`) and three suites — the same reason
// `approval.ts` re-exports `shared/approval`. Importing either name from here or
// from `../../shared/termExit` reaches the identical binding
// (`tests/termExit.test.ts` asserts that); the Map below is renderer-only and has
// no counterpart in shared, deliberately.
export { FASTFAIL, exitNotice } from "../../shared/termExit"

/**
 * The code each session's process exited with, if it has exited.
 *
 * The exit notice is written into the dead pane and then gone — nothing stored
 * it, so no surface outside that terminal could tell a dead session from a
 * silent one. `isStalled`'s `alive` argument is `!!termAgents[id]`, which stays
 * true for a pane whose process died but whose tab is still open, so without
 * this every corpse also read as stalled.
 *
 * A module Map, like missionTail's tails: written from the pty stream, read by
 * a polling consumer, never React state.
 *
 * It stays in the renderer, and `shared/` must never grow a copy: main already
 * owns pty exits, so a second Map there would be filled by the next edit and
 * `exitCodeOf` would answer differently per process — the disagreement
 * 2026-09-08 spent a day removing from eleven surfaces.
 */
const exitCodes = new Map<string, number>()

/** Record the code a session's process exited with. */
export function recordExit(id: string, exitCode: number): void {
    exitCodes.set(id, exitCode)
}

/**
 * The code this session's process exited with, or undefined if it is running.
 *
 * Callers must test `!== undefined`: a clean exit is 0, which is falsy.
 */
export function exitCodeOf(id: string): number | undefined {
    return exitCodes.get(id)
}

/**
 * Forget a session's exit. Called by the store's `forget()` on close, like
 * every other per-session record, and on the first output after a respawn — a
 * pane re-run in place would otherwise read EXITED for the rest of its life.
 */
export function clearExit(id: string): void {
    exitCodes.delete(id)
}
