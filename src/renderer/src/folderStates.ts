import { create } from "zustand"
import type { FolderState } from "../../preload/index"

/**
 * What the folder probe last reported, by project id.
 *
 * Its own store rather than a slice of the app store, for the same reason
 * `toast.ts` and `confirm.ts` are: nothing here is persisted, nothing here is
 * part of the workspace, and a poll that fired every fifteen seconds into the
 * main store would re-render everything subscribed to it.
 *
 * A project ABSENT from `states` has not been probed. That is not `ok` and must
 * not render like it - see `folderMarker`.
 */
interface FolderStatesState {
    states: Record<string, FolderState>
    apply: (next: Record<string, FolderState>) => void
}

/** Same answer as last time? Then keep the old object so nothing re-renders. */
export function sameStates(
    a: Record<string, FolderState>,
    b: Record<string, FolderState>
): boolean {
    const ka = Object.keys(a)
    if (ka.length !== Object.keys(b).length) return false
    return ka.every((k) => a[k] === b[k])
}

export const useFolderStates = create<FolderStatesState>((set) => ({
    states: {},
    apply: (next) => set((s) => (sameStates(s.states, next) ? s : { states: next }))
}))

/**
 * Re-read every project's folder state now.
 *
 * On an IPC failure the map is CLEARED rather than kept. Keeping it would go on
 * asserting a reading we can no longer refresh; clearing it returns the UI to
 * the honest pre-probe state, which is no marker at all.
 */
export async function refreshFolderStates(): Promise<void> {
    try {
        useFolderStates.getState().apply(await window.api.projects.probe())
    } catch {
        useFolderStates.getState().apply({})
    }
}

/**
 * The marker a project's folder has earned, or `null` for "put nothing on
 * screen" - which covers both a folder that resolved and one nobody has
 * checked yet. A healthy project does not grow by a pixel, and neither does an
 * unexamined one.
 *
 * `qualified` follows the command-presence grammar exactly (DESIGN.md): a
 * DASHED pill and a desaturated chip mean "this reading is qualified", and
 * `unchecked` takes neither, because nothing about the project is qualified -
 * only our knowledge of it. A solid pill saying the word is all it gets.
 */
export interface FolderMarker {
    state: "missing" | "unchecked"
    pill: "FOLDER MISSING" | "UNCHECKED"
    qualified: boolean
}

export function folderMarker(state: FolderState | undefined): FolderMarker | null {
    if (state === "missing") return { state, pill: "FOLDER MISSING", qualified: true }
    if (state === "unchecked") return { state, pill: "UNCHECKED", qualified: false }
    return null
}
