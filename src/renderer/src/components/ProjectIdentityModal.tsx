import { useState } from "react"
import { useStore } from "../store"
import { PALETTE, PALETTE_KEYS } from "../projectIdentity"
import { ProjectChip } from "./ProjectChip"
import { Modal } from "./Modal"

/** Edit a project's optional emoji/color identity overrides. Opened from the
 *  project context menu via store.identityEditorProject (mirrors ProjectEnvModal). */
export function ProjectIdentityModal(): JSX.Element | null {
    const projectId = useStore((s) => s.identityEditorProject)
    const project = useStore((s) => s.projects.find((p) => p.id === projectId))
    const setMeta = useStore((s) => s.setProjectMeta)
    const close = useStore((s) => s.setIdentityEditorProject)
    const [emoji, setEmoji] = useState(project?.emoji ?? "")

    if (!project) return null

    return (
        <Modal onClose={() => close(null)} className="identity-modal" backdrop="switcher" labelledBy="identity-modal-title">
            <div className="modal-head">
                <ProjectChip project={project} size="md" />
                <h3 id="identity-modal-title">{project.name}</h3>
                <button onClick={() => close(null)}>Close</button>
            </div>
            <label className="identity-row">
                <span>Emoji</span>
                <input
                    className="identity-emoji-input"
                    value={emoji}
                    maxLength={4}
                    placeholder="e.g. 🚀 (blank = auto)"
                    onChange={(e) => setEmoji(e.target.value)}
                    onBlur={() => setMeta(project.id, { emoji })}
                />
            </label>
            <div className="identity-row">
                <span>Color</span>
                <div className="identity-swatches">
                    {PALETTE_KEYS.map((k) => (
                        <button
                            key={k}
                            className={"identity-swatch" + (project.color === k ? " sel" : "")}
                            style={{ background: PALETTE[k].bg }}
                            data-tip={k}
                            aria-label={k}
                            onClick={() => setMeta(project.id, { color: k })}
                        />
                    ))}
                </div>
            </div>
            <button
                className="identity-reset"
                onClick={() => {
                    setEmoji("")
                    setMeta(project.id, { emoji: "", color: undefined })
                }}
            >
                Reset to auto
            </button>
        </Modal>
    )
}
