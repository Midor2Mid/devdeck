import { cleanTail, lastLines } from "../../shared/tail"

/**
 * Did a pty chunk put characters on the screen that were not already there, or
 * did it repaint what was showing?
 *
 * THE DEFECT THIS ANSWERS. Re-entering an agent's tab flipped a `waiting`
 * session to `WORKING` for the whole idle window (~6s), and switching layout did
 * the same; a window resize was clean. That difference is the whole diagnosis.
 * The hand-back gate's bar is that output CONTINUES — one chunk is what a
 * repaint is, two is a resumed turn (see `spokeSinceHandback` in store.ts) — and
 * a remount delivers exactly two chunks with no agent behind either of them:
 * the pane unmounts, so main replays the entire kept buffer when it re-attaches
 * (`pty:create` → `getBuffer`, main/index.ts), and the remounted xterm then
 * refits, which resizes the pty, which makes the far end redraw. A resize
 * produces the second of those and not the first, which is why it never blipped.
 *
 * THE DISCRIMINATOR. qa observed that across the remount the pane's characters
 * do not change. Both chunks paint the screen that was already there. So the
 * bar stays "output continues" — the reason for it is unchanged and load-bearing
 * (`waiting` is DevDeck's own inference from 6s of silence, and agents pause
 * longer than that mid-turn constantly, so gating it on an act alone would trade
 * a short false `WORKING` for a false "your move" lasting a whole turn) — and
 * this only stops counting characters the session had already shown.
 *
 * THE BAR, STATED SO IT CANNOT BE MISREAD. A chunk is news unless the lines it
 * paints agree with the tail of the screen where the two overlap. It is
 * deliberately NOT "the chunk appears somewhere in the tail": that is also true
 * of a resumed agent repeating a line it printed earlier, and swallowing a
 * resume would be the worse failure of the two — a session that says "your move"
 * for as long as the turn lasts, with nothing to self-heal it. A genuinely
 * resuming agent prints characters that were not on screen, in its first chunk,
 * and that chunk is news here.
 */

/**
 * Lines of screen kept for the comparison.
 *
 * Long enough that a replayed buffer and a full-screen repaint both have to
 * reproduce a substantial run of real lines to be dismissed, and short enough
 * to compare on every pty chunk of every session.
 */
export const ECHO_LINES = 40

/** The window `recordTail` keeps, so the two read the same amount of screen. */
const PAINT_MAX = 4000

/**
 * The lines a chunk paints, cleaned of terminal control noise. `""` when it
 * paints none — a bare resize sequence, an OSC title set, a lone BEL.
 */
export function paintedTail(chunk: string): string {
    return lastLines(cleanTail("", chunk, PAINT_MAX), ECHO_LINES)
}

/**
 * Does `chunk` paint any character the screen was not already showing?
 *
 * `screen` is the same shape `paintedTail` returns and `getFullTail` produces:
 * trimmed, non-empty lines, newline-joined, oldest first.
 */
export function paintsNewText(screen: string, chunk: string): boolean {
    const painted = paintedTail(chunk)
    // No printable characters at all, so nothing on screen changed and there is
    // no evidence here to classify from. The BELL is deliberately NOT gated on
    // this: `hasBell` reads the raw chunk, because a real question could in
    // principle arrive as a bell with no text of its own, and swallowing that is
    // the one outcome this app must never produce.
    if (!painted) return false
    const paintedLines = painted.split("\n")
    const screenLines = screen ? screen.split("\n") : []
    // Nothing known to be on screen yet: the first characters of a session are
    // always news. Without this, a session whose screen record is still empty
    // could never start one.
    if (screenLines.length === 0) return true
    // Over the overlap only. A replayed buffer is longer than the screen record
    // (main's buffer cap is far above the tail's) and a partial repaint is
    // shorter, so neither can be compared end to end. The question either way is
    // whether the two agree where they meet: if they do, every character this
    // chunk painted was already showing at the bottom of the screen.
    const n = Math.min(paintedLines.length, screenLines.length)
    return paintedLines.slice(-n).join("\n") !== screenLines.slice(-n).join("\n")
}
