/**
 * The sentence a rejected IPC handler was actually trying to say.
 *
 * Electron wraps a handler's thrown Error as
 * `Error invoking remote method 'db:save': Error: <the real message>`. The
 * user needs the real message; the plumbing that carried it is noise that
 * makes a legitimate refusal look like a crash.
 *
 * Extracted rather than re-typed because it is now needed in three places, and
 * the version in each of them had to be got right independently - the regex is
 * fiddly enough (two optional prefixes, one of them quoted) that a second
 * hand-written copy would eventually differ from the first.
 */
export function ipcMessage(err: unknown, fallback = "Something went wrong."): string {
    const raw = err instanceof Error ? err.message : String(err ?? "")
    const unwrapped = raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, "")
    return unwrapped.trim() || fallback
}
