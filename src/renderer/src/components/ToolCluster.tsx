import { useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { Icon } from "./Icon"
import { IconButton } from "./IconButton"
import { contextMenu } from "../contextmenu"
import { TaskRunner } from "./TaskRunner"
import { ContextIndex } from "./ContextIndex"

export function ToolCluster(): JSX.Element {
    const setInboxOpen = useStore((s) => s.setInboxOpen)
    const setUsageOpen = useStore((s) => s.setUsageOpen)
    const openSettings = useSettings((s) => s.openSettings)
    const [tasksOpen, setTasksOpen] = useState(false)
    const [contextOpen, setContextOpen] = useState(false)

    const overflow = (e: React.MouseEvent): void => {
        const s = useStore.getState()
        contextMenu(e, [
            { label: "Work", onClick: () => s.setWorkOpen(true) },
            { label: "Activity", onClick: () => s.setActivityOpen(true) },
            { label: "Standup", onClick: () => s.setStandupOpen(true) },
            { label: "Release", onClick: () => s.setReleaseOpen(true) },
            { separator: true },
            { label: "Keyboard shortcuts (F1)", onClick: () => s.setShortcutsOpen(true) }
        ])
    }

    return (
        <div className="deck-tools">
            <div className="deck-tasks-wrap">
                <IconButton
                    className="deck-tool"
                    tip="Tasks & saved commands"
                    tipPos="top"
                    onClick={() => setTasksOpen((v) => !v)}
                >
                    <Icon name="list" size={16} />
                </IconButton>
                {tasksOpen && (
                    <>
                        <div className="menu-backdrop" onClick={() => setTasksOpen(false)} />
                        <div className="deck-popover" onClick={(e) => e.stopPropagation()}>
                            <TaskRunner />
                        </div>
                    </>
                )}
            </div>
            <div className="deck-tasks-wrap">
                <IconButton
                    className="deck-tool"
                    tip="Agent context files"
                    tipPos="top"
                    onClick={() => setContextOpen((v) => !v)}
                >
                    <Icon name="bookOpen" size={16} />
                </IconButton>
                {contextOpen && (
                    <>
                        <div className="menu-backdrop" onClick={() => setContextOpen(false)} />
                        <div className="deck-popover" onClick={(e) => e.stopPropagation()}>
                            <ContextIndex onClose={() => setContextOpen(false)} />
                        </div>
                    </>
                )}
            </div>
            <IconButton
                className="deck-tool rail-inbox"
                tip="Agents inbox"
                tipPos="top"
                onClick={() => setInboxOpen(true)}
            >
                {/* No count here. The flag in the status region on this same bar
                    is the one authoritative "who wants you" number - two badges
                    200px apart, computing different sets, taught the user to
                    trust neither. This also restores DESIGN.md's badge-tier
                    claim that the app has no filled count badge. */}
                <Icon name="inbox" size={16} />
            </IconButton>
            <IconButton
                className="deck-tool"
                tip="AI usage"
                tipPos="top"
                onClick={() => setUsageOpen(true)}
            >
                <Icon name="chart" size={16} />
            </IconButton>
            <IconButton
                className="deck-tool"
                tip="Settings"
                tipPos="top"
                onClick={() => openSettings()}
            >
                <Icon name="settings" size={16} />
            </IconButton>
            <IconButton className="deck-tool" tip="More" tipPos="top" onClick={overflow}>
                <Icon name="more" size={16} />
            </IconButton>
        </div>
    )
}
