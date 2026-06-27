import { writeFileSync, renameSync } from "fs"

/**
 * Write a file atomically: write to a temp sibling, then rename over the target.
 * A crash mid-write leaves the previous file intact instead of a truncated/corrupt one.
 */
export function atomicWrite(file: string, data: string): void {
    const tmp = file + ".tmp"
    writeFileSync(tmp, data, "utf8")
    renameSync(tmp, file)
}
