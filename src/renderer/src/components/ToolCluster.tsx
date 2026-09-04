import { useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { Icon } from "./Icon"
import { IconButton } from "./IconButton"
import { contextMenu } from "../contextmenu"
import { TaskRunner } from "./TaskRunner"
import { ContextIndex } from "./ContextIndex"

export function ToolCluster(): JSX.Element {
    const setUsageOpen = useStore((s) => s.setUsageOpen)
    const openSettings = useSettings((s) => s.openSettings)
    const [tasksOpen, setTasksOpen] = useState(false)
    const [contextOpen, setContextOpen] = useState(false)

    const overflow = (e: React.MouseEvent): void => {
        const s = useStore.getState()
        contextMenu(e, [
            { label: "Work", onClick: () => s.setWorkOpen(true) },
            { label: "Activity", onClick: () => s.setActivityOpen(true) },
            { separator: true },
            { label: "Keyboard shortcuts (F1)", onClick: () => s.setShortcutsOpen(true) }
        ])
    }

    return (
        <div className="deck-tools">
            <div className="deck-tasks-wrap">
                {/* "Scripts", not "Tasks": this popover runs package.json scripts
                    and saved shell commands, while the Tasks deck view is the agent
                    task board. They sat on the SAME bar under the same word and the
                    same `list` icon, ~250px apart, meaning two unrelated things. */}
                <IconButton
                    className="deck-tool"
                    tip="Scripts & saved commands"
                    tipPos="top"
                    onClick={() => setTasksOpen((v) => !v)}
                >
                    <Icon name="play" size={16} />
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
