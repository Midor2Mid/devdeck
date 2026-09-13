import { useEffect, useRef, useState } from "react"
import { useStore } from "../store"
import { ModalBoundary } from "./Modal"
import { pointerStep, type PointerAt } from "../hoverSelect"
import type { SearchHit } from "../../../preload/index"

/**
 * Full-window cross-project search: type a query, see matches grouped by project,
 * Enter/click to open the file at its line in the editor. Opened with Ctrl+Shift+F.
 */
export function SearchModal(): JSX.Element {
    const close = useStore((s) => s.setSearchOpen)
    return (
        <ModalBoundary
            title="Search hit an error"
            description="No file was opened and nothing was changed. Your terminals and agent sessions are still running, and the view behind this window still works."
            onClose={() => close(false)}
        >
            <SearchBody />
        </ModalBoundary>
    )
}

function SearchBody(): JSX.Element {
    const close = useStore((s) => s.setSearchOpen)
    const openInEditor = useStore((s) => s.openInEditor)

    const [q, setQ] = useState("")
    const [hits, setHits] = useState<SearchHit[]>([])
    const [sel, setSel] = useState(0)
    const [loading, setLoading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    // Same rule as the palette: a hit list that scrolls under a still cursor
    // fires mouse events the user did not cause, and an ungated hover then
    // fights the arrow keys for the selection. See hoverSelect.ts.
    const pointer = useRef<PointerAt | null>(null)

    /** Hover may take the cursor only when the pointer itself moved. */
    const hover = (i: number, e: { clientX: number; clientY: number }): void => {
        const step = pointerStep(pointer.current, { x: e.clientX, y: e.clientY })
        pointer.current = step.at
        if (step.moved) setSel(i)
    }

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // Debounced content search; queries shorter than 2 chars never hit the backend.
    useEffect(() => {
        const query = q.trim()
        if (query.length < 2) {
            setHits([])
            setLoading(false)
            return
        }
        setLoading(true)
        const t = setTimeout(() => {
            window.api.search
                .code(query)
                .then((h) => {
                    setHits(h)
                    setSel(0)
                })
                .catch(() => setHits([]))
                .finally(() => setLoading(false))
        }, 180)
        return () => clearTimeout(t)
    }, [q])

    const open = (hit: SearchHit): void => {
        openInEditor(hit.projectId, hit.absPath, hit.line)
        close(false)
    }

    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === "Escape") return close(false)
        if (!hits.length) return
        if (e.key === "Enter") {
            e.preventDefault()
            open(hits[sel])
        } else if (e.key === "ArrowDown") {
            e.preventDefault()
            setSel((i) => Math.min(hits.length - 1, i + 1))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setSel((i) => Math.max(0, i - 1))
        }
    }

    let lastProject: string | null = null

    return (
        <div className="switcher-backdrop" onMouseDown={() => close(false)}>
            <div
                className="search-modal"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={onKeyDown}
            >
                <input
                    ref={inputRef}
                    className="switcher-search"
                    placeholder="Search across all projects…"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value)
                        setSel(0)
                    }}
                />
                <div className="search-results">
                    {q.trim().length < 2 ? (
                        <div className="muted switcher-empty">
                            Type at least 2 characters to search file contents across every project.
                        </div>
                    ) : loading ? (
                        <div className="muted switcher-empty">Searching…</div>
                    ) : hits.length === 0 ? (
                        <div className="muted switcher-empty">No matches.</div>
                    ) : (
                        hits.map((hit, i) => {
                            const header = hit.projectId !== lastProject ? hit.projectName : null
                            lastProject = hit.projectId
                            return (
                                <div key={i}>
                                    {header && <div className="search-group">{header}</div>}
                                    <div
                                        className={"search-hit" + (i === sel ? " sel" : "")}
                                        onMouseMove={(e) => hover(i, e)}
                                        onClick={() => open(hit)}
                                    >
                                        <span className="search-loc">
                                            {hit.file}:{hit.line}
                                        </span>
                                        <span className="search-text">{hit.text.trim()}</span>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
                <div className="overlay-foot muted small">
                    {hits.length >= 300 ? "showing first 300 · " : ""}↑↓ move · Enter open · Esc close
                </div>
            </div>
        </div>
    )
}
