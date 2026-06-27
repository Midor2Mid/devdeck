import { useState } from "react"
import { useSettings, type Environment } from "../settings"
import { KeyValueEditor, emptyRow } from "./KeyValueEditor"

export function EnvManager({ onClose }: { onClose: () => void }): JSX.Element {
    const environments = useSettings((s) => s.environments)
    const setEnvironments = useSettings((s) => s.setEnvironments)
    const activeEnvId = useSettings((s) => s.activeEnvId)
    const setActiveEnv = useSettings((s) => s.setActiveEnv)

    const [selId, setSelId] = useState<string | null>(environments[0]?.id ?? null)
    const sel = environments.find((e) => e.id === selId)

    const addEnv = (): void => {
        const env = {
            id: crypto.randomUUID(),
            name: `env ${environments.length + 1}`,
            vars: [emptyRow()]
        }
        setEnvironments([...environments, env])
        setSelId(env.id)
    }

    const updateSel = (patch: Partial<Pick<Environment, "name" | "vars">>): void => {
        if (!sel) return
        setEnvironments(environments.map((e) => (e.id === sel.id ? { ...e, ...patch } : e)))
    }

    const deleteEnv = (id: string): void => {
        const remaining = environments.filter((e) => e.id !== id)
        setEnvironments(remaining)
        if (selId === id) setSelId(remaining[0]?.id ?? null)
    }

    return (
        <div className="env-backdrop" onClick={onClose}>
            <div className="env-modal" onClick={(e) => e.stopPropagation()}>
                <div className="env-head">
                    <h3>Environments &amp; variables</h3>
                    <button onClick={onClose}>Close</button>
                </div>
                <p className="muted small env-hint">
                    Reference variables anywhere in a request as <code>{"{{name}}"}</code> (URL,
                    params, headers, body). The active environment&apos;s values are substituted when
                    you Send.
                </p>

                <div className="env-body">
                    <div className="env-list">
                        {environments.length === 0 && (
                            <div className="muted small env-empty">No environments yet.</div>
                        )}
                        {environments.map((e) => (
                            <div
                                key={e.id}
                                className={"env-list-item" + (e.id === selId ? " sel" : "")}
                                onClick={() => setSelId(e.id)}
                            >
                                <span className="env-name">{e.name || "(unnamed)"}</span>
                                {e.id === activeEnvId && <span className="env-active-dot">active</span>}
                            </div>
                        ))}
                        <button className="env-add" onClick={addEnv}>
                            + Environment
                        </button>
                    </div>

                    <div className="env-detail">
                        {!sel ? (
                            <div className="muted env-detail-empty">
                                Select or add an environment.
                            </div>
                        ) : (
                            <>
                                <div className="env-detail-head">
                                    <input
                                        className="env-name-input"
                                        value={sel.name}
                                        placeholder="Environment name"
                                        onChange={(e) => updateSel({ name: e.target.value })}
                                    />
                                    {activeEnvId === sel.id ? (
                                        <span className="env-active-badge">active</span>
                                    ) : (
                                        <button onClick={() => setActiveEnv(sel.id)}>Set active</button>
                                    )}
                                    <button className="env-del" onClick={() => deleteEnv(sel.id)}>
                                        Delete
                                    </button>
                                </div>
                                <KeyValueEditor
                                    rows={sel.vars}
                                    onChange={(vars) => updateSel({ vars })}
                                    keyPlaceholder="variable"
                                    valuePlaceholder="value"
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
