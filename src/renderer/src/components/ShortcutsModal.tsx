import { useEffect } from "react"
import { DECK_VIEWS } from "./ViewKeys"
import { shortcutGroups } from "../shortcuts"
import { ModalBoundary } from "./Modal"

// The list itself lives in ../shortcuts.ts, shared with Settings -> Shortcuts so
// the two references cannot drift apart again. The view-switch row is derived
// from DECK_VIEWS, so it can never claim a range the deck does not have.
const GROUPS = shortcutGroups(DECK_VIEWS.map((v) => v.name))

export function ShortcutsModal({ onClose }: { onClose: () => void }): JSX.Element {
    return (
        <ModalBoundary
            title="The keyboard shortcuts window hit an error"
            description="This window is a reference only, so nothing changed. Your terminals and agent sessions are still running."
            onClose={onClose}
        >
            <ShortcutsBody onClose={onClose} />
        </ModalBoundary>
    )
}

function ShortcutsBody({ onClose }: { onClose: () => void }): JSX.Element {
    useEffect(() => {
        const h = (e: KeyboardEvent): void => {
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", h)
        return () => window.removeEventListener("keydown", h)
    }, [onClose])

    return (
        <div className="switcher-backdrop" onMouseDown={onClose}>
            <div className="shortcuts-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="shortcuts-head">
                    <h3>Keyboard shortcuts</h3>
                    <button onClick={onClose}>Close</button>
                </div>
                <div className="shortcuts-grid">
                    {GROUPS.map((g) => (
                        <div key={g.title} className="shortcuts-group">
                            <div className="shortcuts-group-title">{g.title}</div>
                            {g.items.map(([keys, desc]) => (
                                <div key={keys} className="shortcut-row">
                                    <span className="shortcut-desc">{desc}</span>
                                    <kbd className="shortcut-keys">{keys}</kbd>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                {/* Scope, and nothing else. The tip that used to sit here named
                    a second chord for the surface Ctrl+K already opens, three
                    rows above - and named it "the command palette", which is
                    half of what that surface is since the merge. Restating a
                    binding under the list of bindings is the second source of
                    truth this module was written to end; the fix is to say
                    less, not to say it twice correctly. */}
                <p className="muted small shortcuts-foot">
                    Terminal shortcuts apply in the Terminal view.
                </p>
            </div>
        </div>
    )
}
