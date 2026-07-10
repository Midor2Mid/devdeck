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
