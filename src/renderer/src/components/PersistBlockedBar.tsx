import type { JSX } from "react"
import { useStore } from "../store"
import { Icon } from "./Icon"

/**
 * Shown for the whole session when the workspace store could not be read and
 * persistence is therefore off.
 *
 * Deliberately not a toast: the condition lasts as long as the session, and a
 * message that fades leaves someone arranging tabs for hours against a store
 * that will never be written. There is no warning colour in this system by
 * design, so the state is carried in form - a full-width bar, a left stripe and
 * the pause glyph - and the single accent is spent on the one thing that can be
 * acted on. Reloading is safe: the same gate that stopped the save also makes
 * the reload's beforeunload flush a no-op, so nothing overwrites the file the
 * user is about to go and fix.
 */
export function PersistBlockedBar(): JSX.Element | null {
    const blocked = useStore((s) => s.persistBlocked)
    if (!blocked) return null
    return (
        <div className="notice-bar" role="status">
            <Icon name="pause" size={14} />
            <span className="notice-bar-text">
                <code>{blocked.file}</code> {blocked.message}
            </span>
            <button
                type="button"
                className="notice-bar-action"
                onClick={() => window.location.reload()}
            >
                Reload
            </button>
        </div>
    )
}
