import { useEffect, useState } from "react"
import { useStore } from "../store"
import { LENSES, DEFAULT_LENSES } from "../reviewLenses"

/**
 * Fan the active project's uncommitted changes out to a panel of agent reviewers,
 * one per selected lens (correctness / security / .NET / …), shown in the grid.
 * Opened with Ctrl+Shift+R.
 */
export function ReviewPanel(): JSX.Element {
    const close = useStore((s) => s.setReviewOpen)
    const activeProject = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const startReview = useStore((s) => s.startReview)

    const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_LENSES))
    const [changes, setChanges] = useState<number | null>(null)

    useEffect(() => {
        if (activeProject) {
            window.api.git
                .status(activeProject.path)
                .then((g) => setChanges(g.isRepo ? g.changes : 0))
                .catch(() => setChanges(0))
        } else {
            setChanges(null)
        }
        const h = (e: KeyboardEvent): void => {
            if (e.key === "Escape") close(false)
        }
        window.addEventListener("keydown", h)
        return () => window.removeEventListener("keydown", h)
    }, [activeProject, close])

    const toggle = (id: string): void =>
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    const hasChanges = (changes ?? 0) > 0
    const canStart = !!activeProject && hasChanges && selected.size > 0

    return (
        <div className="switcher-backdrop" onMouseDown={() => close(false)}>
            <div className="review-panel" onMouseDown={(e) => e.stopPropagation()}>
                <div className="review-head">
                    <span className="review-title">Review changes</span>
                    <span className="muted small">{activeProject ? activeProject.name : "No project"}</span>
                </div>
                <div className="review-body">
                    {!activeProject ? (
                        <div className="muted switcher-empty">No project selected.</div>
                    ) : !hasChanges ? (
                        <div className="muted switcher-empty">No uncommitted changes to review.</div>
                    ) : (
                        <>
                            <div className="review-sub muted small">
                                {changes} changed file{changes === 1 ? "" : "s"} · one agent session per lens
                            </div>
                            {LENSES.map((l) => (
                                <label key={l.id} className="review-lens">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(l.id)}
                                        onChange={() => toggle(l.id)}
                                    />
                                    <span className="review-lens-label">{l.label}</span>
                                    <span className="review-lens-focus muted small">{l.focus}</span>
                                </label>
                            ))}
                        </>
                    )}
                </div>
                <div className="review-foot">
                    <span className="muted small">
                        Spawns {selected.size} reviewer{selected.size === 1 ? "" : "s"} · read each in the grid
                    </span>
                    <div className="review-actions">
                        <button onClick={() => close(false)}>Cancel</button>
                        <button
                            className="accent"
                            onClick={() => startReview([...selected])}
                            disabled={!canStart}
                        >
                            Start review ▸
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
