import { identity } from "../projectIdentity"
import { folderMarker, useFolderStates } from "../folderStates"
import type { Project } from "../../../preload/index"

/** The per-project identity tile: a colored monogram, or the project's custom emoji. */
export function ProjectChip({
    project,
    size = "md"
}: {
    project: Project
    size?: "sm" | "md"
}): JSX.Element {
    const id = identity(project)
    // A primitive out of the selector, not a derived object: a selector that
    // builds a fresh object on every render is the getSnapshot trap that blanks
    // the component. The marker is derived below, outside the subscription.
    const folder = useFolderStates((s) => s.states[project.id])
    const marker = folderMarker(folder)
    return (
        <span
            className={
                "project-chip project-chip-" +
                size +
                (id.isEmoji ? " is-emoji" : "") +
                // Only `missing` desaturates. `unchecked` keeps full colour on
                // purpose: it qualifies our knowledge, not the project.
                (marker?.state === "missing" ? " folder-missing" : "")
            }
            style={{ background: id.bg, color: id.fg }}
            role="img"
            aria-label={
                marker?.state === "missing" ? project.name + " (folder missing)" : project.name
            }
        >
            {id.label}
        </span>
    )
}
