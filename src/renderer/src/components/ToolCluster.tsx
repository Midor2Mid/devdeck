import { useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { Icon } from "./Icon"
import { IconButton } from "./IconButton"
import { contextMenu } from "../contextmenu"
import { TaskRunner } from "./TaskRunner"
import { ContextIndex } from "./ContextIndex"
import { viewKeysLive } from "./ViewKeys"

/**
 * The deck bar's tools: Scripts, Settings, More.
 *
 * Five became three with D1. `Agent context files` and `AI usage` moved into
 * More because they are visits, not glances — a 16px glyph each was two more
 * unnamed buttons on a bar whose whole job is to be scanned, and neither
 * answers a question you ask while working. They keep their popovers; only the
 * trigger moved.
 *
 * Tasks is in More for a different reason: it was a deck VIEW on `Ctrl+2`, and
 * `Ctrl+2` is now Terminal. A demoted view does not keep a top-row chord, so
 * Tasks is reached from here and from the palette (`Go to Tasks`) and has no
 * keystroke at all — which is honest, rather than a chord that lands somewhere
 * else than the reference says.
 */
export function ToolCluster(): JSX.Element {
    const openSettings = useSettings((s) => s.openSettings)
    const [scriptsOpen, setScriptsOpen] = useState(false)
    const [contextOpen, setContextOpen] = useState(false)

    const overflow = (e: React.MouseEvent): void => {
        const s = useStore.getState()
        contextMenu(e, [
            // Offered only when it can act. With no project open every view
            // resolves to the first-run panel, so this row would change `view`
            // and paint nothing - a menu item that answers a click with silence.
            // The view keys solve the same problem with a toast because they are
            // always visible; a menu can simply not offer the row.
            ...(viewKeysLive(s.projects)
                ? [{ label: "Tasks", onClick: (): void => s.setView("tasks") }]
                : []),
            { label: "Agent context files", onClick: () => setContextOpen(true) },
            { label: "AI usage", onClick: () => s.setUsageOpen(true) },
            { label: "Activity", onClick: () => s.setActivityOpen(true) },
            { separator: true },
            { label: "Keyboard shortcuts (F1)", onClick: () => s.setShortcutsOpen(true) }
        ])
    }

    return (
        <div className="deck-tools">
            <div className="deck-tasks-wrap">
                {/* "Scripts", not "Tasks": this popover runs package.json scripts
                    and saved shell commands, while the Tasks view is the agent
                    task board. They sat on the SAME bar under the same word and
                    the same `list` icon, ~250px apart, meaning two unrelated
                    things. The glyph moved off `play` for the same reason: that
                    triangle is "Run project" on the topbar, and no glyph carries
                    two meanings. */}
                <IconButton
                    className="deck-tool"
                    tip="Scripts & saved commands"
                    tipPos="top"
                    onClick={() => setScriptsOpen((v) => !v)}
                >
                    <Icon name="scrollText" size={16} />
                </IconButton>
                {scriptsOpen && (
                    <>
                        <div className="menu-backdrop" onClick={() => setScriptsOpen(false)} />
                        <div className="deck-popover" onClick={(e) => e.stopPropagation()}>
                            <TaskRunner />
                        </div>
                    </>
                )}
            </div>
            <IconButton
                className="deck-tool"
                tip="Settings"
                tipPos="top"
                onClick={() => openSettings()}
            >
                <Icon name="settings" size={16} />
            </IconButton>
            {/* The context-files popover is anchored to this cluster rather than
                to the row of the menu that opened it: the menu is gone by the
                time the popover paints, and a popover with no anchor would have
                nothing to hang off. Kept on the More button so it opens where
                the click was. */}
            <div className="deck-tasks-wrap">
                <IconButton className="deck-tool" tip="More" tipPos="top" onClick={overflow}>
                    <Icon name="more" size={16} />
                </IconButton>
                {contextOpen && (
                    <>
                        <div className="menu-backdrop" onClick={() => setContextOpen(false)} />
                        <div className="deck-popover deck-popover-right" onClick={(e) => e.stopPropagation()}>
                            <ContextIndex onClose={() => setContextOpen(false)} />
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
