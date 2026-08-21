import { useEffect } from "react"
import { DECK_VIEWS } from "./ViewKeys"

// A single source of truth for keyboard shortcuts, surfaced so users can discover
// the (otherwise hidden) terminal/editor/global bindings. Keep in sync with the
// handlers in App.tsx and TerminalView.tsx. The view-switch row is derived from
// DECK_VIEWS so it can never drift from the real deck order.
const GROUPS: { title: string; items: [string, string][] }[] = [
    {
        title: "Global",
        items: [
            ["Ctrl + K", "Switch project (then 1-9 to pick)"],
            ["Ctrl + Shift + K", "Recent project - hold and tap to walk back"],
            ["Ctrl + Shift + P", "Command palette"],
            [
                `Ctrl + 1 … ${DECK_VIEWS.length}`,
                `Switch view (${DECK_VIEWS[0].name} … ${DECK_VIEWS[DECK_VIEWS.length - 1].name})`
            ],
            ["Ctrl + Shift + F", "Search across projects"],
            ["Ctrl + Shift + B", "Build / test (.NET)"],
            ["Ctrl + Shift + R", "Review changes"],
            ["Ctrl + Shift + J", "Agents inbox"],
            ["Ctrl + Tab", "Next agent session"],
            ["Ctrl + Shift + Tab", "Previous agent session"],
            ["F1", "This shortcuts list"]
        ]
    },
    {
        title: "Terminal",
        items: [
            ["Ctrl + Shift + T", "New shell terminal"],
            ["Ctrl + Shift + Enter", "New agent session"],
            ["Ctrl + Shift + W", "Close active pane"],
            ["Ctrl + Shift + \\", "Split right"],
            ["Ctrl + Shift + -", "Split down"],
            ["Ctrl + Shift + ]", "Next tab"],
            ["Ctrl + Shift + [", "Previous tab"],
            ["Ctrl + Shift + F", "Find in terminal"],
            ["Ctrl + Shift + I", "Prompt composer"]
        ]
    },
    {
        title: "Editor",
        items: [["Ctrl + S", "Save file"]]
    }
]

export function ShortcutsModal({ onClose }: { onClose: () => void }): JSX.Element {
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
                <p className="muted small shortcuts-foot">
                    Terminal shortcuts apply in the Terminal view. Tip: <kbd>Ctrl + Shift + P</kbd>{" "}
                    opens the command palette for everything else.
                </p>
            </div>
        </div>
    )
}
