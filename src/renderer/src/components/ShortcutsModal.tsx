import { useEffect } from "react"

// A single source of truth for keyboard shortcuts, surfaced so users can discover
// the (otherwise hidden) terminal/editor/global bindings. Keep in sync with the
// handlers in App.tsx and TerminalView.tsx.
const GROUPS: { title: string; items: [string, string][] }[] = [
    {
        title: "Global",
        items: [
            ["Ctrl + K", "Switch project"],
            ["Ctrl + Shift + P", "Command palette"],
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
