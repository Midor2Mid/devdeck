import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "../store"
import { contextMenu } from "../contextmenu"
import { projectContextMenu } from "../projectMenu"

/**
 * Full-window launchpad for switching and managing projects: a searchable grid
 * of cards with an "Add folder" button, per-card context menu, and OS
 * folder-drop to add. Type to filter, arrows to move, Enter to open.
 * Opened with Ctrl+K.
 */
export function ProjectSwitcher(): JSX.Element {
    const projects = useStore((s) => s.projects)
    const activeId = useStore((s) => s.activeId)
    const setActiveProject = useStore((s) => s.setActiveProject)
    const close = useStore((s) => s.closeSwitcher)
    const sessions = useStore((s) => s.sessions)
    const addProject = useStore((s) => s.addProject)
    const addProjectByPath = useStore((s) => s.addProjectByPath)

    const [q, setQ] = useState("")
    const [sel, setSel] = useState(0)
    const [folderOver, setFolderOver] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // Per-project session counts for the card metadata.
    const counts = useMemo(() => {
        const map: Record<string, { terms: number; agents: number; attention: number }> = {}
        for (const s of sessions()) {
            const c = (map[s.projectId] = map[s.projectId] ?? { terms: 0, agents: 0, attention: 0 })
            c.terms++
            if (s.isAgent) c.agents++
            if (s.status === "attention") c.attention++
        }
        return map
    }, [sessions])

    const filtered = useMemo(() => {
        const needle = q.toLowerCase()
        return projects.filter(
            (p) =>
                p.name.toLowerCase().includes(needle) ||
                p.path.toLowerCase().includes(needle) ||
                (p.group ?? "").toLowerCase().includes(needle)
        )
    }, [projects, q])

    useEffect(() => {
        if (sel >= filtered.length) setSel(Math.max(0, filtered.length - 1))
    }, [filtered, sel])

    const open = (id: string): void => {
        setActiveProject(id)
        close()
    }

    const COLS = 4
    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === "Escape") return close()
        if (!filtered.length) return
        if (e.key === "Enter") {
            e.preventDefault()
            open(filtered[sel].id)
        } else if (e.key === "ArrowRight") {
            e.preventDefault()
            setSel((i) => Math.min(filtered.length - 1, i + 1))
        } else if (e.key === "ArrowLeft") {
            e.preventDefault()
            setSel((i) => Math.max(0, i - 1))
        } else if (e.key === "ArrowDown") {
            e.preventDefault()
            setSel((i) => Math.min(filtered.length - 1, i + COLS))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setSel((i) => Math.max(0, i - COLS))
        }
    }

    return (
        <div
            className={"switcher-backdrop" + (folderOver ? " folder-drop" : "")}
            onMouseDown={close}
            onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                    e.preventDefault()
                    setFolderOver(true)
                }
            }}
            onDragLeave={() => setFolderOver(false)}
            onDrop={(e) => {
                if (e.dataTransfer.files.length) {
                    e.preventDefault()
                    for (const f of Array.from(e.dataTransfer.files)) {
                        const path = (f as unknown as { path?: string }).path
                        if (path) addProjectByPath(path)
                    }
                }
                setFolderOver(false)
            }}
        >
            <div className="switcher" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
                <div className="switcher-head">
                    <input
                        ref={inputRef}
                        className="switcher-search"
                        placeholder="Switch project…"
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value)
                            setSel(0)
                        }}
                    />
                    <button className="switcher-add" data-tip="Add a project folder" onClick={addProject}>
                        + Add folder
                    </button>
                </div>
                <div className="switcher-grid">
                    {filtered.map((p, i) => {
                        const c = counts[p.id]
                        return (
                            <div
                                key={p.id}
                                className={
                                    "switcher-card" +
                                    (i === sel ? " sel" : "") +
                                    (p.id === activeId ? " active" : "")
                                }
                                onMouseEnter={() => setSel(i)}
                                onClick={() => open(p.id)}
                                onContextMenu={(e) => contextMenu(e, projectContextMenu(p.id))}
                            >
                                <div className="switcher-card-name">
                                    {p.name}
                                    {c?.attention ? <span className="card-attn">●</span> : null}
                                </div>
                                {p.group && <div className="switcher-card-group">{p.group}</div>}
                                <div className="switcher-card-path">{p.path}</div>
                                <div className="switcher-card-meta">
                                    {c ? (
                                        <>
                                            {c.terms} term{c.terms === 1 ? "" : "s"}
                                            {c.agents ? ` · ${c.agents} agent${c.agents === 1 ? "" : "s"}` : ""}
                                        </>
                                    ) : (
                                        "idle"
                                    )}
                                </div>
                            </div>
                        )
                    })}
                    {filtered.length === 0 && (
                        <div className="muted switcher-empty">No matching projects.</div>
                    )}
                </div>
                <div className="switcher-foot muted small">↑↓←→ to move · Enter to open · Esc to close</div>
            </div>
        </div>
    )
}
