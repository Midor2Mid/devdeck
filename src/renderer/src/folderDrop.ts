/**
 * What a drop on the window means, decided away from the DOM so it can be
 * tested without one.
 *
 * The drop handler used to read `File.path` (removed in Electron 32; this app
 * is on 43), so the outline lit up and nothing happened. Fixing the read is
 * only half of it: a drop has three outcomes, not two, and the middle one is
 * the reason this file exists. We can know an item is a file, we can know it is
 * a folder, and Chromium can decline to tell us - and the third must not be
 * reported as either of the first two.
 */

/** One dropped item, as the drop handler can actually observe it. */
export interface DroppedItem {
    /** Absolute path from `webUtils.getPathForFile`, or "" when it resolved none. */
    path: string
    /**
     * `webkitGetAsEntry().isDirectory`, or `null` when Chromium handed us no
     * entry at all. `null` is NOT "it is a file" - it is "nobody asked yet",
     * and it goes to main, which stats the path itself.
     */
    isDirectory: boolean | null
}

export type DropVerdict =
    /** Hand these to main, which validates each one is really a directory. */
    | { kind: "open"; paths: string[] }
    /** Every droppable item was, definitively, a file. */
    | { kind: "file" }
    /** Nothing droppable arrived - no paths and nothing we could classify. */
    | { kind: "nothing" }

/**
 * Which of the three a drop was.
 *
 * Items with an unresolved path are dropped from consideration entirely: with
 * no path there is nothing to open and nothing to say about it. `isDirectory`
 * of `null` still travels, because main can answer what the renderer could not.
 */
export function classifyDrop(items: DroppedItem[]): DropVerdict {
    const openable = items.filter((i) => i.path !== "" && i.isDirectory !== false)
    if (openable.length > 0) return { kind: "open", paths: openable.map((i) => i.path) }
    // Only when something was definitively a file may we say so. A drop of one
    // file and one folder is an `open` above and says nothing about the file:
    // the act succeeded, and a toast about the half we ignored would be noise.
    if (items.some((i) => i.isDirectory === false)) return { kind: "file" }
    return { kind: "nothing" }
}
