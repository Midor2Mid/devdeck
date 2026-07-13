import { identity } from "../projectIdentity"
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
    return (
        <span
            className={"project-chip project-chip-" + size + (id.isEmoji ? " is-emoji" : "")}
            style={{ background: id.bg, color: id.fg }}
            role="img"
            aria-label={project.name}
        >
            {id.label}
        </span>
    )
}
