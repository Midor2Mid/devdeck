// Turns a pty exit code into the notice shown inside the dead terminal. A bare
// "[process exited]" hides *why* a shell died — most painfully on Windows, where
// antivirus (e.g. Avast Behavior Shield) force-kills powershell.exe on spawn and
// the whole session vanishes with no explanation.
//
// In `shared/` because BOTH processes write this notice: the renderer writes it
// into the dead pane (`components/TerminalPane.tsx`) and main writes it onto the
// wire for a paired phone (`main/server.ts`). Main used to reach it by importing
// `renderer/src/termExit` — the only value import that crossed main↔renderer in
// the whole tree.
//
// What that cost, measured rather than assumed (2026-09-10): **nothing yet**.
// Rollup tree-shook the unused exit-code Map, so `out/main/index.js` builds
// byte-for-byte identical before and after this move. The defect was the live
// edge itself, and what it invited: main already owns pty exits (`main/pty.ts`
// produces the code `server.ts` reports), so the next obvious edit is main
// calling `recordExit` — and at that moment the Map is no longer dead, there is
// one per process, and `exitCodeOf` answers differently depending on who asks.
// Every derived-status surface then disagrees about which sessions are dead,
// which is the bug class 2026-09-08 spent a day removing from eleven surfaces.
//
// So only the pure half moved here; the Map stayed in
// `renderer/src/termExit.ts`, and there is deliberately nothing process-local in
// this file for a second copy to grow out of.
// `tests/architectureBoundaries.test.ts` keeps the boundary closed.

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
