import { openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from "fs"
import { dirname } from "path"
import { randomBytes } from "crypto"

/**
 * Write a file atomically: write to a temp sibling, flush it to the platter,
 * then rename over the target. A crash mid-write leaves the previous file
 * intact instead of a truncated or zero-length one.
 *
 * Two details make that claim true rather than aspirational, and both were
 * missing:
 *
 * - **The fsync.** A rename is atomic against a *process* crash on its own, but
 *   not against a machine crash: the rename can reach the disk before the data
 *   it points at, leaving a zero-length file where the previous contents were.
 *   That is precisely the corrupt store the loaders now have to defend against,
 *   so the write that produces it is worth fixing at the source. The directory
 *   fsync is best-effort - Windows refuses a directory handle - and the file
 *   fsync is the part that matters.
 *
 * - **A unique temp name.** A fixed `<file>.tmp` meant two instances of the app
 *   writing the same store would use the same path and rename each other's bytes
 *   into place. The pid plus random suffix makes collision impossible even
 *   without the single-instance lock.
 *
 * On failure the temp file is removed, so a failed write never leaves debris
 * next to the user's data.
 */
export function atomicWrite(file: string, data: string | Buffer): void {
    const tmp = file + "." + process.pid + "." + randomBytes(4).toString("hex") + ".tmp"
    let fd: number | null = null
    try {
        fd = openSync(tmp, "w")
        writeFileSync(fd, data)
        fsyncSync(fd)
        closeSync(fd)
        fd = null
        renameSync(tmp, file)
    } catch (err) {
        if (fd !== null) {
            try {
                closeSync(fd)
            } catch {
                /* already closed / never opened */
            }
        }
        try {
            unlinkSync(tmp)
        } catch {
            /* nothing to clean up */
        }
        throw err
    }
    // Best-effort: makes the rename itself durable. Fails on Windows, which will
    // not open a directory for reading - the file fsync above is what protects
    // the contents, so this is an improvement where available, not a requirement.
    try {
        const dfd = openSync(dirname(file), "r")
        try {
            fsyncSync(dfd)
        } finally {
            closeSync(dfd)
        }
    } catch {
        /* platform does not allow it */
    }
}
