import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "../store"
import { orderByMru, previousProjectId } from "../projectMru"
import { contextMenu } from "../contextmenu"
import { projectContextMenu } from "../projectMenu"
import { ProjectChip } from "./ProjectChip"
import { folderMarker, useFolderStates } from "../folderStates"
import { switcherEmpty } from "../probeView"

/**
 * Full-window launchpad for switching and managing projects: a searchable grid
 * of cards with an `Open folder…` button and a per-card context menu. Type to
 * filter, arrows to move, Enter to open. Dropping a folder works anywhere in
 * the window (App.tsx), including with this picker closed.
 * Opened with Ctrl+K.
 */
export function ProjectSwitcher(): JSX.Element {
    const projects = useStore((s) => s.projects)
    const activeId = useStore((s) => s.activeId)
    const mru = useStore((s) => s.projectMru)
    const setActiveProject = useStore((s) => s.setActiveProject)
    const close = useStore((s) => s.closeSwitcher)
    const sessions = useStore((s) => s.sessions)
    const addProject = useStore((s) => s.addProject)
    // The whole map, which is a stable reference between reports (see
    // folderStates.apply) - the per-card marker is derived in the loop below,
    // never inside a selector.
    const folderStates = useFolderStates((s) => s.states)

    const [q, setQ] = useState("")
    const [sel, setSel] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const gridRef = useRef<HTMLDivElement>(null)

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

    // Most-recently-used projects first, so the ones you bounce between lead.
    const ordered = useMemo(() => {
        const rank = orderByMru(
            filtered.map((p) => p.id),
            mru
        )
        return rank.map((id) => filtered.find((p) => p.id === id)!)
    }, [filtered, mru])

    useEffect(() => {
        if (sel >= ordered.length) setSel(Math.max(0, ordered.length - 1))
    }, [ordered, sel])

    // Preselect the previously used project on open (Enter = instant flip back);
    // once the user types a query, selection resets to the top match instead.
    useEffect(() => {
        if (q !== "") return
        const prev = previousProjectId(mru, activeId)
        const idx = prev ? ordered.findIndex((p) => p.id === prev) : -1
        setSel(idx >= 0 ? idx : 0)
        // Only when the query changes (mount / cleared search) — not on MRU churn.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q])

    const open = (id: string): void => {
        setActiveProject(id)
        close()
    }

    // Column count of the rendered grid (auto-fill makes it width-dependent),
    // read at nav time so ArrowUp/Down always move by one visual row.
    const gridCols = (): number => {
        const el = gridRef.current
        if (!el) return 1
        const cols = getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length
        return cols > 0 && Number.isFinite(cols) ? cols : 1
    }

    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === "Escape") return close()
        if (!ordered.length) return
        if (e.key === "Enter") {
            e.preventDefault()
            open(ordered[sel].id)
        } else if (!q && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Jump straight to a row: two deterministic keystrokes instead of
            // type-then-arrow. ONLY while the query is empty — this handler sits
            // on the container, so it sees digits bubbling from the focused
            // search input, and a project called "api2" must stay filterable.
            // Once you are typing, digits are text and arrows+Enter are the pick.
            const n = Number(e.key) - 1
            if (n < ordered.length) {
                e.preventDefault()
                open(ordered[n].id)
            }
        } else if (e.key === "ArrowRight") {
            e.preventDefault()
            setSel((i) => Math.min(ordered.length - 1, i + 1))
        } else if (e.key === "ArrowLeft") {
            e.preventDefault()
            setSel((i) => Math.max(0, i - 1))
        } else if (e.key === "ArrowDown") {
            e.preventDefault()
            const cols = gridCols()
            setSel((i) => Math.min(ordered.length - 1, i + cols))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            const cols = gridCols()
            setSel((i) => Math.max(0, i - cols))
        }
    }

    // Folder drop is handled at the app root now (App.tsx), which is where it
    // works whether or not this picker is open - and the drop still reaches it
    // from here, because the event bubbles out of this backdrop. What used to
    // be here read `File.path`, removed in Electron 32: the dashed outline lit
    // up and the drop did nothing.
    return (
        <div className="switcher-backdrop" onMouseDown={close}>
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
                    {/* One verb for one act: this button, the palette entry, the
                        deck control, Ctrl+O and the OS dialog's own title all read
                        `Open folder`. Adding a folder always activates it -
                        `addProject` adopts main's activeId - so "add" was naming a
                        distinction the app does not have. */}
                    <button
                        className="switcher-add"
                        data-tip="Open a folder as a project (Ctrl+O)"
                        onClick={addProject}
                    >
                        Open folder…
                    </button>
                </div>
                <div className="switcher-grid" ref={gridRef}>
                    {ordered.map((p, i) => {
                        const c = counts[p.id]
                        const marker = folderMarker(folderStates[p.id])
                        return (
                            <div
                                key={p.id}
                                className={
                                    "switcher-card" +
                                    (i === sel ? " sel" : "") +
                                    (p.id === activeId ? " active" : "") +
                                    (marker?.state === "missing" ? " folder-missing" : "")
                                }
                                onMouseEnter={() => setSel(i)}
                                onClick={() => open(p.id)}
                                onContextMenu={(e) => contextMenu(e, projectContextMenu(p.id))}
                            >
                                <div className="switcher-card-head">
                                    <ProjectChip project={p} size="md" />
                                    <div className="switcher-card-name">
                                        {p.name}
                                        {c?.attention ? <span className="card-attn">●</span> : null}
                                    </div>
                                    {/* Shown only while the query is empty, which is
                                        exactly when the digit actually picks this row. */}
                                    {!q && i < 9 && (
                                        <span className="switcher-card-key">{i + 1}</span>
                                    )}
                                </div>
                                {p.group && <div className="switcher-card-group">{p.group}</div>}
                                <div className="switcher-card-path">{p.path}</div>
                                {/* The third channel of the same grammar the
                                    launcher's PATH marks use: the chip
                                    desaturates, the path takes a dashed rule,
                                    and the pill says the word - because in
                                    Washi a border is nearly invisible against
                                    --bg-2, so two channels can both vanish.
                                    Dashed pill = the reading is qualified
                                    (missing); solid = we could not read it
                                    (unchecked). A card that resolved gets
                                    nothing at all, and so does one nobody has
                                    probed yet. */}
                                {marker && (
                                    <span
                                        className={
                                            "probe-tag" + (marker.qualified ? " qualified" : "")
                                        }
                                    >
                                        {marker.pill}
                                    </span>
                                )}
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
                    {ordered.length === 0 && (
                        <div className="muted switcher-empty">{emptyText(projects.length, q)}</div>
                    )}
                </div>
                <div className="switcher-foot muted small">↑↓←→ to move · Enter to open · Esc to close</div>
            </div>
        </div>
    )
}

/**
 * An empty grid, in the three states it actually has. This was one sentence -
 * "No matching projects." - shown for a workspace with no projects at all,
 * which is absent rendered as zero: the house rule broken in the first thirty
 * seconds of a stranger's first session.
 */
function emptyText(projectCount: number, q: string): JSX.Element {
    const e = switcherEmpty(projectCount, q)
    if (e.kind === "no-projects") return <>No projects yet. Open a folder to start.</>
    if (e.kind === "none-to-show") return <>No projects to show.</>
    // The query is a machine-readable value inside a sentence, so it is mono -
    // and it wraps, so a pasted Windows path cannot widen the modal.
    return (
        <>
            No projects match <code className="switcher-empty-q">{e.query}</code>.
        </>
    )
}
