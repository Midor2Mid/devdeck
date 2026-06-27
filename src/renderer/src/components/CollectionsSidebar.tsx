import { useState } from "react"
import { useSettings, type SavedRequest } from "../settings"
import { ImportModal } from "./ImportModal"

interface Props {
    onLoad: (req: SavedRequest) => void
    activeReqId: string | null
}

export function CollectionsSidebar({ onLoad, activeReqId }: Props): JSX.Element {
    const collections = useSettings((s) => s.collections)
    const setCollections = useSettings((s) => s.setCollections)
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
    const [editId, setEditId] = useState<string | null>(null)
    const [importOpen, setImportOpen] = useState(false)

    const toggle = (id: string): void => {
        setCollapsed((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const newCollection = (): void => {
        const col = { id: crypto.randomUUID(), name: `Collection ${collections.length + 1}`, requests: [] }
        setCollections([...collections, col])
        setEditId(col.id)
    }
    const renameCollection = (id: string, name: string): void => {
        setCollections(collections.map((c) => (c.id === id ? { ...c, name } : c)))
    }
    const deleteCollection = (id: string): void => {
        setCollections(collections.filter((c) => c.id !== id))
    }
    const deleteRequest = (colId: string, reqId: string): void => {
        setCollections(
            collections.map((c) =>
                c.id === colId ? { ...c, requests: c.requests.filter((r) => r.id !== reqId) } : c
            )
        )
    }

    return (
        <div className="col-sidebar">
            <div className="col-head">
                <span>Collections</span>
                <div className="col-head-actions">
                    <button className="col-new" onClick={() => setImportOpen(true)} title="Import (Postman / OpenAPI / curl)">
                        ↓
                    </button>
                    <button className="col-new" onClick={newCollection} title="New collection">
                        +
                    </button>
                </div>
            </div>
            {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
            <div className="col-scroll">
                {collections.length === 0 && (
                    <div className="muted small col-empty">
                        No saved requests yet. Build a request and press <strong>Save</strong>.
                    </div>
                )}
                {collections.map((col) => {
                    const open = !collapsed.has(col.id)
                    return (
                        <div className="col-group" key={col.id}>
                            <div className="col-group-head">
                                <span className="col-caret" onClick={() => toggle(col.id)}>
                                    {open ? "▾" : "▸"}
                                </span>
                                {editId === col.id ? (
                                    <input
                                        className="col-rename"
                                        autoFocus
                                        defaultValue={col.name}
                                        onBlur={(e) => {
                                            renameCollection(col.id, e.target.value.trim() || col.name)
                                            setEditId(null)
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                                        }}
                                    />
                                ) : (
                                    <span
                                        className="col-name"
                                        onClick={() => toggle(col.id)}
                                        onDoubleClick={() => setEditId(col.id)}
                                        title="Double-click to rename"
                                    >
                                        {col.name}
                                    </span>
                                )}
                                <span className="col-count">{col.requests.length}</span>
                                <button
                                    className="col-del"
                                    onClick={() => deleteCollection(col.id)}
                                    title="Delete collection"
                                >
                                    ×
                                </button>
                            </div>
                            {open &&
                                col.requests.map((r) => (
                                    <div
                                        className={"col-req" + (r.id === activeReqId ? " active" : "")}
                                        key={r.id}
                                        onClick={() => onLoad(r)}
                                        title={r.url}
                                    >
                                        <span className={"col-method m-" + r.method.toLowerCase()}>
                                            {r.method}
                                        </span>
                                        <span className="col-req-name">{r.name}</span>
                                        <button
                                            className="col-del"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                deleteRequest(col.id, r.id)
                                            }}
                                            title="Delete request"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
