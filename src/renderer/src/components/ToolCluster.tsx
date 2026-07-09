import { useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { Icon } from "./Icon"
import { contextMenu } from "../contextmenu"
import { TaskRunner } from "./TaskRunner"
import { ContextIndex } from "./ContextIndex"

export function ToolCluster(): JSX.Element {
    const setInboxOpen = useStore((s) => s.setInboxOpen)
    const setUsageOpen = useStore((s) => s.setUsageOpen)
    const openSettings = useSettings((s) => s.openSettings)
    const attention = useStore(
        (s) => Object.values(s.agentStatus).filter((x) => x === "attention").length
    )
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
                <button
                    className="deck-tool"
                    data-tip="Tasks & saved commands"
                    data-tip-pos="top"
                    onClick={() => setTasksOpen((v) => !v)}
                >
                    <Icon name="list" size={16} />
                </button>
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
                <button
                    className="deck-tool"
                    data-tip="Agent context files"
                    data-tip-pos="top"
                    onClick={() => setContextOpen((v) => !v)}
                >
                    <Icon name="bookOpen" size={16} />
                </button>
                {contextOpen && (
                    <>
                        <div className="menu-backdrop" onClick={() => setContextOpen(false)} />
                        <div className="deck-popover" onClick={(e) => e.stopPropagation()}>
                            <ContextIndex onClose={() => setContextOpen(false)} />
                        </div>
                    </>
                )}
            </div>
            <button
                className="deck-tool rail-inbox"
                data-tip="Agents inbox"
                data-tip-pos="top"
                onClick={() => setInboxOpen(true)}
            >
                <Icon name="inbox" size={16} />
                {attention ? <span className="rail-badge">{attention}</span> : null}
            </button>
            <button
                className="deck-tool"
                data-tip="AI usage"
                data-tip-pos="top"
                onClick={() => setUsageOpen(true)}
            >
                <Icon name="chart" size={16} />
            </button>
            <button
                className="deck-tool"
                data-tip="Settings"
                data-tip-pos="top"
                onClick={() => openSettings()}
            >
                <Icon name="settings" size={16} />
            </button>
            <button className="deck-tool" data-tip="More" data-tip-pos="top" onClick={overflow}>
                <Icon name="more" size={16} />
            </button>
        </div>
    )
}
