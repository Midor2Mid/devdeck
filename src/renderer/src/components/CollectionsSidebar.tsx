import { useMemo, useState } from "react"
import { useSettings, type SavedRequest, type Collection } from "../settings"
import { ImportModal } from "./ImportModal"
import { confirm } from "../confirm"

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
    const [menuFor, setMenuFor] = useState<string | null>(null)
    const [q, setQ] = useState("")
    // Drag-and-drop: a dragged request or collection, + hovered drop targets.
    const [drag, setDrag] = useState<{ kind: "req" | "col"; colId?: string; id: string } | null>(null)
    const [overReq, setOverReq] = useState<string | null>(null)
    const [overCol, setOverCol] = useState<string | null>(null)
    const clearDrag = (): void => {
        setDrag(null)
        setOverReq(null)
        setOverCol(null)
    }

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
    const deleteCollection = async (id: string): Promise<void> => {
        const col = collections.find((c) => c.id === id)
        const n = col?.requests.length ?? 0
        const ok = await confirm({
            title: "Delete collection",
            message: `Delete "${col?.name ?? "collection"}"${n ? ` and its ${n} request${n === 1 ? "" : "s"}` : ""}? This can't be undone.`,
            confirmLabel: "Delete",
            danger: true
        })
        if (ok) setCollections(collections.filter((c) => c.id !== id))
    }
    const deleteRequest = async (colId: string, reqId: string): Promise<void> => {
        const req = collections.find((c) => c.id === colId)?.requests.find((r) => r.id === reqId)
        const ok = await confirm({
            title: "Delete request",
            message: `Delete "${req?.name ?? "request"}"?`,
            confirmLabel: "Delete",
            danger: true
        })
        if (ok)
            setCollections(
                collections.map((c) =>
                    c.id === colId ? { ...c, requests: c.requests.filter((r) => r.id !== reqId) } : c
                )
            )
    }

    const duplicateRequest = (colId: string, reqId: string): void => {
        setMenuFor(null)
        setCollections(
            collections.map((c) => {
                if (c.id !== colId) return c
                const idx = c.requests.findIndex((r) => r.id === reqId)
                if (idx === -1) return c
                const copy = { ...c.requests[idx], id: crypto.randomUUID(), name: c.requests[idx].name + " copy" }
                const requests = [...c.requests]
                requests.splice(idx + 1, 0, copy)
                return { ...c, requests }
            })
        )
    }

    const moveRequest = (fromColId: string, reqId: string, toColId: string): void => {
        setMenuFor(null)
        if (fromColId === toColId) return
        const req = collections.find((c) => c.id === fromColId)?.requests.find((r) => r.id === reqId)
        if (!req) return
        setCollections(
            collections.map((c) => {
                if (c.id === fromColId) return { ...c, requests: c.requests.filter((r) => r.id !== reqId) }
                if (c.id === toColId) return { ...c, requests: [...c.requests, req] }
                return c
            })
        )
    }

    // Move the dragged request to just before `targetReqId` in `targetColId`
    // (works within a collection or across them).
    const reorderRequest = (targetColId: string, targetReqId: string): void => {
        if (!drag || drag.kind !== "req") return
        if (drag.colId === targetColId && drag.id === targetReqId) return
        const req = collections.find((c) => c.id === drag.colId)?.requests.find((r) => r.id === drag.id)
        if (!req) return
        setCollections(
            collections.map((c) => {
                let requests = c.id === drag.colId ? c.requests.filter((r) => r.id !== drag.id) : c.requests
                if (c.id === targetColId) {
                    requests = [...requests]
                    const idx = requests.findIndex((r) => r.id === targetReqId)
                    requests.splice(idx < 0 ? requests.length : idx, 0, req)
                }
                return { ...c, requests }
            })
        )
    }
    // Move the dragged collection to just before `targetColId`.
    const reorderCollection = (targetColId: string): void => {
        if (!drag || drag.kind !== "col" || drag.id === targetColId) return
        const dragged = collections.find((c) => c.id === drag.id)
        if (!dragged) return
        const rest = collections.filter((c) => c.id !== drag.id)
        const ti = rest.findIndex((c) => c.id === targetColId)
        rest.splice(ti < 0 ? rest.length : ti, 0, dragged)
        setCollections(rest)
    }

    // Filter requests by the search query (name / method / url). Empty collections
    // are hidden while searching, and matches are force-expanded.
    const searching = q.trim() !== ""
    const view = useMemo<Collection[]>(() => {
        if (!searching) return collections
        const needle = q.trim().toLowerCase()
        return collections
            .map((c) => ({
                ...c,
                requests: c.requests.filter((r) =>
                    `${r.name} ${r.method} ${r.url}`.toLowerCase().includes(needle)
                )
            }))
            .filter((c) => c.requests.length > 0)
    }, [collections, q, searching])

    return (
        <div className="col-sidebar">
            <div className="col-head">
                <span>Collections</span>
                <div className="col-head-actions">
                    <button className="col-new" onClick={() => setImportOpen(true)} data-tip="Import (Postman / OpenAPI / curl)">
                        ↓
                    </button>
                    <button className="col-new" onClick={newCollection} data-tip="New collection">
                        +
                    </button>
                </div>
            </div>
            <div className="col-search">
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search requests…"
                />
                {searching && (
                    <span className="col-search-clear" data-tip="Clear" onClick={() => setQ("")}>
                        ×
                    </span>
                )}
            </div>
            {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
            <div className="col-scroll">
                {collections.length === 0 && (
                    <div className="muted small col-empty">
                        No saved requests yet. Build a request and press <strong>Save</strong>.
                    </div>
                )}
                {searching && view.length === 0 && (
                    <div className="muted small col-empty">No requests match “{q}”.</div>
                )}
                {view.map((col) => {
                    const open = searching || !collapsed.has(col.id)
                    return (
                        <div className="col-group" key={col.id}>
                            <div
                                className={"col-group-head" + (overCol === col.id ? " drag-over" : "")}
                                draggable={!searching && editId !== col.id}
                                onDragStart={(e) => {
                                    setDrag({ kind: "col", id: col.id })
                                    e.dataTransfer.effectAllowed = "move"
                                }}
                                onDragEnd={clearDrag}
                                onDragOver={(e) => {
                                    if (drag) {
                                        e.preventDefault()
                                        setOverCol(col.id)
                                    }
                                }}
                                onDragLeave={() => setOverCol((o) => (o === col.id ? null : o))}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    if (drag?.kind === "req") moveRequest(drag.colId!, drag.id, col.id)
                                    else if (drag?.kind === "col") reorderCollection(col.id)
                                    clearDrag()
                                }}
                            >
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
                                        data-tip="Double-click to rename"
                                    >
                                        {col.name}
                                    </span>
                                )}
                                <span className="col-count">{col.requests.length}</span>
                                <button
                                    className="col-del"
                                    onClick={() => deleteCollection(col.id)}
                                    data-tip="Delete collection"
                                >
                                    ×
                                </button>
                            </div>
                            {open &&
                                col.requests.map((r) => (
                                    <div
                                        className={
                                            "col-req" +
                                            (r.id === activeReqId ? " active" : "") +
                                            (overReq === r.id ? " drag-over" : "")
                                        }
                                        key={r.id}
                                        onClick={() => onLoad(r)}
                                        data-tip={r.url}
                                        draggable={!searching}
                                        onDragStart={(e) => {
                                            e.stopPropagation()
                                            setDrag({ kind: "req", colId: col.id, id: r.id })
                                            e.dataTransfer.effectAllowed = "move"
                                        }}
                                        onDragEnd={clearDrag}
                                        onDragOver={(e) => {
                                            if (drag?.kind === "req") {
                                                e.preventDefault()
                                                setOverReq(r.id)
                                            }
                                        }}
                                        onDragLeave={() => setOverReq((o) => (o === r.id ? null : o))}
                                        onDrop={(e) => {
                                            if (drag?.kind === "req") {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                reorderRequest(col.id, r.id)
                                            }
                                            clearDrag()
                                        }}
                                    >
                                        <span className={"col-method m-" + r.method.toLowerCase()}>
                                            {r.method}
                                        </span>
                                        <span className="col-req-name">{r.name}</span>
                                        <button
                                            className="col-del"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMenuFor(menuFor === r.id ? null : r.id)
                                            }}
                                            data-tip="More…"
                                        >
                                            ⋯
                                        </button>
                                        {menuFor === r.id && (
                                            <>
                                                <div
                                                    className="menu-backdrop"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setMenuFor(null)
                                                    }}
                                                />
                                                <div
                                                    className="req-menu"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div
                                                        className="req-menu-item"
                                                        onClick={() => duplicateRequest(col.id, r.id)}
                                                    >
                                                        Duplicate
                                                    </div>
                                                    <div
                                                        className="req-menu-item danger"
                                                        onClick={() => {
                                                            setMenuFor(null)
                                                            deleteRequest(col.id, r.id)
                                                        }}
                                                    >
                                                        Delete
                                                    </div>
                                                    {collections.length > 1 && (
                                                        <div className="req-menu-title">Move to</div>
                                                    )}
                                                    {collections
                                                        .filter((c) => c.id !== col.id)
                                                        .map((c) => (
                                                            <div
                                                                key={c.id}
                                                                className="req-menu-item"
                                                                onClick={() => moveRequest(col.id, r.id, c.id)}
                                                            >
                                                                → {c.name}
                                                            </div>
                                                        ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
