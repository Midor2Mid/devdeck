import { useState } from "react"
import { useStore } from "../store"

// One-time, dismissible orientation card for first-time users. The "seen" flag
// lives in localStorage (decoupled from the settings store) so it persists across
// restarts and never nags again.
const SEEN_KEY = "devdeck.seenIntro"

export function IntroTip(): JSX.Element | null {
    const [seen, setSeen] = useState(() => {
        try {
            return localStorage.getItem(SEEN_KEY) === "1"
        } catch {
            return false
        }
    })
    const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)

    if (seen) return null

    const dismiss = (): void => {
        try {
            localStorage.setItem(SEEN_KEY, "1")
        } catch {
            /* ignore */
        }
        setSeen(true)
    }

    return (
        <div className="intro-tip">
            <div className="intro-tip-body">
                <div className="intro-tip-title">Welcome to DevDeck 👋</div>
                <div className="intro-tip-text">
                    <kbd>Ctrl + K</kbd> switch projects · <kbd>Ctrl + Shift + P</kbd> run any command ·{" "}
                    <kbd>F1</kbd> all shortcuts
                </div>
            </div>
            <div className="intro-tip-actions">
                <button
                    onClick={() => {
                        setShortcutsOpen(true)
                        dismiss()
                    }}
                >
                    Show shortcuts
                </button>
                <button className="accent" onClick={dismiss}>
                    Got it
                </button>
            </div>
        </div>
    )
}
