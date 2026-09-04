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
    // `null` means "we do not know" — no project, or a read that failed. The
    // nullable type was already here and then collapsed at both ends: the
    // producer caught to 0 and the consumer read `?? 0`, so an unreadable tree
    // rendered "No uncommitted changes to review" and greyed out the button.
    const [changes, setChanges] = useState<number | null>(null)
    // Loading is NOT failure. Without this the panel claims "couldn't check" for
    // the moment before the first read resolves - which is the same conflation
    // this whole change exists to remove, reintroduced one line lower down.
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (activeProject) {
            setLoading(true)
            window.api.git
                .status(activeProject.path)
                // See MissionControl: main already distinguishes 0 from unknown, and
                // the ternary discarded the null for a folder that is not there.
                .then((g) => setChanges(g.changes))
                .catch(() => setChanges(null))
                .finally(() => setLoading(false))
        } else {
            setChanges(null)
            setLoading(false)
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

    const unknown = !!activeProject && !loading && changes === null
    const hasChanges = changes !== null && changes > 0
    // An unknown count must NOT disable the button. Acting is precisely what the
    // user should still be allowed to do when the app does not know — the
    // reviewers read the tree themselves, and refusing to start on the strength
    // of a failed `git status` is the app blocking work on evidence it lacks.
    const canStart = !!activeProject && (hasChanges || unknown) && selected.size > 0

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
                    ) : loading ? (
                        <div className="muted switcher-empty">Reading the working tree…</div>
                    ) : !hasChanges && !unknown ? (
                        <div className="muted switcher-empty">No uncommitted changes to review.</div>
                    ) : (
                        <>
                            <div className="review-sub muted small">
                                {unknown
                                    ? "Couldn't check for uncommitted changes · the reviewers will read the tree themselves"
                                    : `${changes} changed file${changes === 1 ? "" : "s"} · one agent session per lens`}
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
