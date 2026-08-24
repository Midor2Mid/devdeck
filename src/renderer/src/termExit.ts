// Turns a pty exit code into the notice shown inside the dead terminal. A bare
// "[process exited]" hides *why* a shell died — most painfully on Windows, where
// antivirus (e.g. Avast Behavior Shield) force-kills powershell.exe on spawn and
// the whole session vanishes with no explanation.

/**
 * Windows __fastfail / security-cookie abort (STATUS_STACK_BUFFER_OVERRUN,
 * 0xC0000409) as a signed int32 — the code a process reports when it is
 * force-terminated by security software before it can run.
 */
export const FASTFAIL = -1073740791

/**
 * Notice written to the terminal when its process exits. Clean exits stay quiet;
 * abnormal exits report the code (decimal + hex), and the Windows fast-fail code
 * gets an actionable antivirus hint. Returns plain text (with CRLFs); the caller
 * applies terminal styling.
 */
export function exitNotice(exitCode: number, isWindows: boolean): string {
    if (exitCode === 0) return "[process exited]"
    const hex = "0x" + (exitCode >>> 0).toString(16).toUpperCase()
    if (isWindows && exitCode === FASTFAIL) {
        return (
            `[process exited: ${exitCode} (${hex})]\r\n` +
            "The shell was killed before it could start — on Windows this is usually\r\n" +
            "antivirus (e.g. Avast Behavior Shield) terminating powershell.exe.\r\n" +
            "Fix: allow powershell.exe in your antivirus, or switch shells in\r\n" +
            "Settings → Terminal (Command Prompt and Git Bash are unaffected)."
        )
    }
    return `[process exited: ${exitCode} (${hex})]`
}

/**
 * The code each session's process exited with, if it has exited.
 *
 * The notice above is written into the dead pane and then gone — nothing stored
 * it, so no surface outside that terminal could tell a dead session from a
 * silent one. `isStalled`'s `alive` argument is `!!termAgents[id]`, which stays
 * true for a pane whose process died but whose tab is still open, so without
 * this every corpse also read as stalled.
 *
 * A module Map, like missionTail's tails: written from the pty stream, read by
 * a polling consumer, never React state.
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
