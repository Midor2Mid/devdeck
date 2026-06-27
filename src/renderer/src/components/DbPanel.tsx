import { useEffect, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import { Allotment } from "allotment"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { THEMES } from "../themes"
import "../monaco-setup"
import type { ConnProfile, ConnInput, QueryResult, DbKind } from "../../../preload/index"

const DEFAULT_PORT: Record<DbKind, number> = { postgres: 5432, mysql: 3306, sqlite: 0 }

function blankInput(projectId: string): ConnInput {
    return {
        projectId,
        name: "",
        kind: "postgres",
        host: "localhost",
        port: 5432,
        database: "",
        user: "",
        password: "",
        ssl: false
    }
}

function cell(v: unknown): { text: string; isNull: boolean } {
    if (v === null || v === undefined) return { text: "NULL", isNull: true }
    if (typeof v === "object") return { text: JSON.stringify(v), isNull: false }
    return { text: String(v), isNull: false }
}

function ConnForm({
    initial,
    onCancel,
    onSaved
}: {
    initial: ConnInput
    onCancel: () => void
    onSaved: () => void
}): JSX.Element {
    const [form, setForm] = useState<ConnInput>(initial)
    const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const isEdit = Boolean(initial.id)

    const set = (patch: Partial<ConnInput>): void => setForm((f) => ({ ...f, ...patch }))

    const test = async (): Promise<void> => {
        setBusy(true)
        setTestMsg(null)
        const res = await window.api.db.test(form)
        setTestMsg(
            res.ok
                ? { ok: true, text: `Connected in ${res.timeMs} ms` }
                : { ok: false, text: res.error ?? "Failed" }
        )
        setBusy(false)
    }

    const save = async (): Promise<void> => {
        if (!form.name.trim()) return
        if (form.kind === "sqlite" ? !form.database.trim() : !form.host.trim()) return
        setBusy(true)
        await window.api.db.save(form)
        setBusy(false)
        onSaved()
    }

    return (
        <div className="modal-backdrop" onMouseDown={onCancel}>
            <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-title">{isEdit ? "Edit connection" : "New connection"}</div>
                <div className="form-grid">
                    <label>Name</label>
                    <input value={form.name} onChange={(e) => set({ name: e.target.value })} />
                    <label>Type</label>
                    <select
                        value={form.kind}
                        onChange={(e) => {
                            const kind = e.target.value as DbKind
                            set({ kind, port: DEFAULT_PORT[kind] })
                        }}
                    >
                        <option value="postgres">PostgreSQL</option>
                        <option value="mysql">MySQL</option>
                        <option value="sqlite">SQLite</option>
                    </select>
                    {form.kind === "sqlite" ? (
                        <>
                            <label>Database file</label>
                            <div className="file-pick">
                                <input
                                    value={form.database}
                                    placeholder="C:\\path\\to\\app.db"
                                    onChange={(e) => set({ database: e.target.value })}
                                />
                                <button
                                    onClick={async () => {
                                        const f = await window.api.db.pickFile()
                                        if (f) set({ database: f })
                                    }}
                                >
                                    Browse…
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <label>Host</label>
                            <input value={form.host} onChange={(e) => set({ host: e.target.value })} />
                            <label>Port</label>
                            <input
                                type="number"
                                value={form.port}
                                onChange={(e) => set({ port: Number(e.target.value) })}
                            />
                            <label>Database</label>
                            <input
                                value={form.database}
                                onChange={(e) => set({ database: e.target.value })}
                            />
                            <label>User</label>
                            <input value={form.user} onChange={(e) => set({ user: e.target.value })} />
                            <label>Password</label>
                            <input
                                type="password"
                                placeholder={isEdit ? "(leave blank to keep)" : ""}
                                value={form.password ?? ""}
                                onChange={(e) => set({ password: e.target.value })}
                            />
                            <label>SSL</label>
                            <input
                                type="checkbox"
                                className="checkbox"
                                checked={Boolean(form.ssl)}
                                onChange={(e) => set({ ssl: e.target.checked })}
                            />
                        </>
                    )}
                </div>
                {testMsg && (
                    <div className={"test-msg " + (testMsg.ok ? "ok" : "err")}>{testMsg.text}</div>
                )}
                <div className="modal-actions">
                    <button onClick={test} disabled={busy}>
                        Test
                    </button>
                    <span className="spacer" />
                    <button onClick={onCancel}>Cancel</button>
                    <button className="accent" onClick={save} disabled={busy}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}

function ResultsGrid({ result }: { result: QueryResult | null }): JSX.Element {
    if (!result) {
        return <div className="muted resp-placeholder">Run a query to see results.</div>
    }
    if (!result.ok) {
        return <div className="resp-error">{result.error}</div>
    }
    const columns = result.columns ?? []
    const rows = result.rows ?? []
    return (
        <div className="grid-wrap">
            <div className="grid-meta">
                <span className="status ok">
                    {result.command ? result.command + " · " : ""}
                    {result.rowCount ?? rows.length} row{(result.rowCount ?? rows.length) === 1 ? "" : "s"}
                </span>
                <span className="muted">{result.timeMs} ms</span>
            </div>
            <div className="grid-scroll">
                <table className="result-grid">
                    <thead>
                        <tr>
                            <th className="rownum">#</th>
                            {columns.map((c, i) => (
                                <th key={i}>{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={ri}>
                                <td className="rownum">{ri + 1}</td>
                                {columns.map((c, ci) => {
                                    const { text, isNull } = cell(row[c])
                                    return (
                                        <td key={ci} className={isNull ? "null-cell" : ""}>
                                            {text}
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export function DbPanel(): JSX.Element {
    const activeProject = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const [conns, setConns] = useState<ConnProfile[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [tables, setTables] = useState<string[]>([])
    const [tablesErr, setTablesErr] = useState<string | null>(null)
    const [editing, setEditing] = useState<ConnInput | null>(null)
    const [sql, setSql] = useState("SELECT 1;")
    const [result, setResult] = useState<QueryResult | null>(null)
    const [running, setRunning] = useState(false)
    const runRef = useRef<() => void>(() => undefined)
    const editorFontSize = useSettings((s) => s.editor.fontSize)
    const monacoTheme = useSettings((s) => THEMES[s.appearance.theme].monacoId)

    const projectId = activeProject?.id

    const reload = async (): Promise<void> => {
        if (!projectId) return
        const list = await window.api.db.list(projectId)
        setConns(list)
    }

    useEffect(() => {
        setActiveId(null)
        setTables([])
        setResult(null)
        reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId])

    const selectConn = async (id: string): Promise<void> => {
        setActiveId(id)
        setTables([])
        setTablesErr(null)
        try {
            setTables(await window.api.db.tables(id))
        } catch (e) {
            setTablesErr(e instanceof Error ? e.message : String(e))
        }
    }

    const run = async (): Promise<void> => {
        if (!activeId || !sql.trim()) return
        setRunning(true)
        setResult(await window.api.db.query(activeId, sql))
        setRunning(false)
    }
    runRef.current = run

    const openTable = (t: string): void => {
        const q = `SELECT * FROM ${t} LIMIT 100;`
        setSql(q)
        if (activeId) {
            setRunning(true)
            window.api.db.query(activeId, q).then((r) => {
                setResult(r)
                setRunning(false)
            })
        }
    }

    const removeConn = async (id: string): Promise<void> => {
        await window.api.db.remove(id)
        if (activeId === id) {
            setActiveId(null)
            setTables([])
        }
        reload()
    }

    if (!activeProject) {
        return (
            <div className="empty-state">
                <p>No project selected.</p>
            </div>
        )
    }

    return (
        <div className="db-panel">
            <Allotment proportionalLayout={false}>
                <Allotment.Pane minSize={200} preferredSize={250} maxSize={420}>
                    <div className="db-sidebar">
                        <div className="sidebar-section-title">
                            <span>CONNECTIONS</span>
                            <button
                                className="icon-btn"
                                title="New connection"
                                onClick={() => setEditing(blankInput(activeProject.id))}
                            >
                                +
                            </button>
                        </div>
                        <div className="db-conn-list">
                            {conns.length === 0 && (
                                <div className="muted sidebar-empty">
                                    No connections.
                                    <br />
                                    Click <b>+</b> to add one.
                                </div>
                            )}
                            {conns.map((c) => (
                                <div
                                    key={c.id}
                                    className={
                                        "db-conn" + (c.id === activeId ? " active" : "")
                                    }
                                    onClick={() => selectConn(c.id)}
                                    title={
                                        c.kind === "sqlite"
                                            ? c.database
                                            : `${c.user}@${c.host}:${c.port}/${c.database}`
                                    }
                                >
                                    <span className={"tab-dot " + c.kind} />
                                    <span className="db-conn-name">{c.name}</span>
                                    <span
                                        className="db-conn-edit"
                                        title="Edit"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setEditing({ ...c, password: "" })
                                        }}
                                    >
                                        ✎
                                    </span>
                                    <span
                                        className="project-remove"
                                        title="Remove"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            removeConn(c.id)
                                        }}
                                    >
                                        ×
                                    </span>
                                </div>
                            ))}
                        </div>
                        {activeId && (
                            <>
                                <div className="sidebar-section-title">
                                    <span>TABLES</span>
                                </div>
                                <div className="db-table-list">
                                    {tablesErr && <div className="resp-error">{tablesErr}</div>}
                                    {!tablesErr && tables.length === 0 && (
                                        <div className="muted sidebar-empty">No tables.</div>
                                    )}
                                    {tables.map((t) => (
                                        <div
                                            key={t}
                                            className="db-table"
                                            onClick={() => openTable(t)}
                                            title={`SELECT * FROM ${t} LIMIT 100`}
                                        >
                                            {t}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </Allotment.Pane>
                <Allotment.Pane>
                    <div className="db-main">
                        {!activeId ? (
                            <div className="empty-state">
                                <p className="muted">
                                    Select or add a connection to run SQL.
                                </p>
                                <p className="muted small">
                                    PostgreSQL, MySQL & SQLite (WASM — no native build) supported.
                                </p>
                            </div>
                        ) : (
                            <Allotment vertical proportionalLayout>
                                <Allotment.Pane minSize={80} preferredSize={180}>
                                    <div className="db-query">
                                        <div className="db-query-bar">
                                            <span className="muted small">
                                                {conns.find((c) => c.id === activeId)?.name}
                                            </span>
                                            <button
                                                className="accent"
                                                onClick={run}
                                                disabled={running}
                                                title="Run (Ctrl+Enter)"
                                            >
                                                {running ? "Running…" : "Run ▸"}
                                            </button>
                                        </div>
                                        <div className="db-editor-host">
                                            <Editor
                                                theme={monacoTheme}
                                                language="sql"
                                                value={sql}
                                                onChange={(v) => setSql(v ?? "")}
                                                onMount={(editor, monaco) => {
                                                    editor.addCommand(
                                                        monaco.KeyMod.CtrlCmd |
                                                            monaco.KeyCode.Enter,
                                                        () => runRef.current()
                                                    )
                                                }}
                                                options={{
                                                    fontFamily:
                                                        '"Cascadia Mono", Consolas, monospace',
                                                    fontSize: editorFontSize,
                                                    minimap: { enabled: false },
                                                    scrollBeyondLastLine: false,
                                                    automaticLayout: true,
                                                    padding: { top: 8 },
                                                    lineNumbers: "off",
                                                    guides: { indentation: false }
                                                }}
                                            />
                                        </div>
                                    </div>
                                </Allotment.Pane>
                                <Allotment.Pane>
                                    <div className="db-results">
                                        <ResultsGrid result={result} />
                                    </div>
                                </Allotment.Pane>
                            </Allotment>
                        )}
                    </div>
                </Allotment.Pane>
            </Allotment>

            {editing && (
                <ConnForm
                    initial={editing}
                    onCancel={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null)
                        reload()
                    }}
                />
            )}
        </div>
    )
}
