import { useStore } from "../store"
import { useSettings } from "../settings"
import { AgentKey } from "./AgentKey"
import { Icon } from "./Icon"
import { contextMenu } from "../contextmenu"
import { projectContextMenu } from "../projectMenu"
import type { DeckStrip } from "../deck"

export function ProjectStrip({ strip }: { strip: DeckStrip }): JSX.Element {
    const activeId = useStore((s) => s.activeId)
    const view = useStore((s) => s.view)
    const activePane = useStore((s) => (s.activeId ? s.activePaneByProject[s.activeId] : undefined))
    const setActiveProject = useStore((s) => s.setActiveProject)
    const newTabIn = useStore((s) => s.newTabIn)
    const projects = useStore((s) => s.projects)
    const agents = useSettings((s) => s.agents)
    const defaultAgent = agents[0]?.id ?? "claude"

    const project = projects.find((p) => p.id === strip.projectId)
    const isActive = strip.projectId === activeId

    return (
        <div className={"deck-strip" + (isActive ? " active" : "")}>
            <button
                className="deck-strip-label"
                onClick={() => setActiveProject(strip.projectId)}
                onContextMenu={(e) => contextMenu(e, projectContextMenu(strip.projectId))}
                data-tip={project?.path}
                data-tip-pos="top"
            >
                {strip.projectName}
            </button>
            <div className="deck-strip-keys">
                {strip.keys.map((k) => (
                    <AgentKey
                        key={k.termId}
                        session={k}
                        active={view === "terminal" && k.termId === activePane}
                        compressed={strip.compressed}
                    />
                ))}
                <button
                    className="deck-add"
                    data-tip={`Start a ${agents[0]?.name ?? "agent"} session`}
                    data-tip-pos="top"
                    onClick={() => newTabIn(strip.projectId, defaultAgent)}
                >
                    <Icon name="plus" size={14} />
                </button>
            </div>
        </div>
    )
}
