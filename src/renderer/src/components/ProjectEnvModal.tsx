import { useEffect, useState } from "react"
import { useStore } from "../store"
import { KeyValueEditor, type KvRow, emptyRow, rowsFromPairs } from "./KeyValueEditor"

/**
 * Per-project environment variables, injected into every terminal / agent
 * session spawned for the project. Values are encrypted at rest in the main
 * process (DPAPI) - the plaintext only lives here while this editor is open.
 */
export function ProjectEnvModal(): JSX.Element {
    const projectId = useStore((s) => s.envEditorProject)!
    const close = useStore((s) => s.setEnvEditorProject)
    const project = useStore((s) => s.projects.find((p) => p.id === projectId))
    const [rows, setRows] = useState<KvRow[]>([emptyRow()])
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        window.api.projectEnv.get(projectId).then((pairs) => {
            setRows(rowsFromPairs(pairs).map((r, i) => ({ ...r, enabled: pairs[i]?.enabled ?? true })))
        })
    }, [projectId])

    const save = async (): Promise<void> => {
        const pairs = rows
            .filter((r) => r.key.trim() !== "")
            .map((r) => ({ key: r.key.trim(), value: r.value, enabled: r.enabled }))
        await window.api.projectEnv.set(projectId, pairs)
        setSaved(true)
        setTimeout(() => close(null), 600)
    }

    return (
        <div className="modal-backdrop" onMouseDown={() => close(null)}>
            <div className="modal env-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <span>
                        Environment variables
                        <span className="muted small" style={{ marginLeft: 8 }}>
                            {project?.name ?? ""}
                        </span>
                    </span>
                    <button className="btn-min" onClick={() => close(null)} data-tip="Close">
                        ×
                    </button>
                </div>
                <div className="modal-body env-body">
                    <p className="muted small">
                        Injected into the environment of every terminal and agent session started
                        in this project. Encrypted at rest. Takes effect for <b>new</b> terminals.
                    </p>
                    <KeyValueEditor
                        rows={rows}
                        onChange={setRows}
                        keyPlaceholder="NAME"
                        valuePlaceholder="value"
                    />
                    <div className="env-actions">
                        <button className="accent" onClick={save}>
                            {saved ? "Saved ✓" : "Save"}
                        </button>
                        <button onClick={() => close(null)}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    )
}
