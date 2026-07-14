import { useState } from "react"
import { useStore } from "../store"
import { useSettings, type SavedCommand } from "../settings"
import { Modal } from "./Modal"

/**
 * Per-project saved commands: arbitrary shell one-liners (e.g. `docker compose
 * up`, `ssh prod`, a build script) launchable as chips in the sidebar. Distinct
 * from package.json scripts (auto-detected) and prompt snippets (agent text).
 */
export function CommandsModal(): JSX.Element {
    const projectId = useStore((s) => s.commandsEditorProject)!
    const close = useStore((s) => s.setCommandsEditorProject)
    const project = useStore((s) => s.projects.find((p) => p.id === projectId))
    // Select the stable map; deriving a fresh `[]` inside the selector would
    // trip React's getSnapshot loop. Only used to seed initial state anyway.
    const projectCommands = useSettings((s) => s.projectCommands)
    const setProjectCommands = useSettings((s) => s.setProjectCommands)

    const [rows, setRows] = useState<SavedCommand[]>(() => projectCommands[projectId] ?? [])
    const [saved, setSaved] = useState(false)

    const update = (i: number, patch: Partial<SavedCommand>): void =>
        setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    const remove = (i: number): void => setRows(rows.filter((_, idx) => idx !== i))
    const add = (): void =>
        setRows([...rows, { id: crypto.randomUUID(), name: "", command: "" }])

    const save = (): void => {
        const clean = rows
            .filter((r) => r.name.trim() !== "" && r.command.trim() !== "")
            .map((r) => ({ id: r.id, name: r.name.trim(), command: r.command.trim() }))
        setProjectCommands(projectId, clean)
        setSaved(true)
        setTimeout(() => close(null), 600)
    }

    return (
        <Modal onClose={() => close(null)} className="env-modal" labelledBy="commands-modal-title">
            <div className="modal-head">
                <span id="commands-modal-title">
                    Saved commands
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
                    Quick-launch shell commands for this project - they appear as chips in the
                    sidebar and open in a new terminal. Project env vars apply.
                </p>
                <div className="cmd-rows">
                    {rows.length === 0 && (
                        <div className="muted small">No saved commands yet.</div>
                    )}
                    {rows.map((r, i) => (
                        <div className="cmd-row" key={r.id}>
                            <input
                                className="cmd-name"
                                value={r.name}
                                placeholder="label"
                                onChange={(e) => update(i, { name: e.target.value })}
                            />
                            <input
                                className="cmd-cmd"
                                value={r.command}
                                placeholder="e.g. docker compose up"
                                onChange={(e) => update(i, { command: e.target.value })}
                            />
                            <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                                ×
                            </button>
                        </div>
                    ))}
                </div>
                <button onClick={add} style={{ marginTop: 2 }}>
                    + Add command
                </button>
                <div className="env-actions">
                    <button className="accent" onClick={save}>
                        {saved ? "Saved ✓" : "Save"}
                    </button>
                    <button onClick={() => close(null)}>Cancel</button>
                </div>
            </div>
        </Modal>
    )
}
