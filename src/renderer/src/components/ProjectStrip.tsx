import { useMemo, useRef, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { AgentKey } from "./AgentKey"
import { Icon } from "./Icon"
import { LaunchOptions } from "./LaunchOptions"
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
    // Filter in a memo, not in the selector — a fresh array from a zustand
    // selector re-renders forever (React #185).
    const aiAgents = useMemo(() => agents.filter((a) => a.runMode !== "normal"), [agents])
    const [pickOpen, setPickOpen] = useState(false)
    const addRef = useRef<HTMLButtonElement>(null)

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
                {/* Unlike the terminal bar's "+ <agent>", this button names no
                    agent — so firing a paid CLI straight off it was a guess at
                    what you meant. It asks instead. Worktrees aren't offered:
                    they need the active project and this targets any strip. */}
                <span className="deck-add-wrap">
                    <button
                        ref={addRef}
                        className="deck-add"
                        data-tip="Start an agent session here…"
                        data-tip-pos="top"
                        onClick={() => setPickOpen((v) => !v)}
                    >
                        <Icon name="plus" size={14} />
                    </button>
                    {pickOpen && (
                        <LaunchOptions
                            anchor={addRef.current}
                            agents={aiAgents.length ? aiAgents : agents}
                            allowWorktree={false}
                            onLaunch={(agentId) => newTabIn(strip.projectId, agentId)}
                            onClose={() => setPickOpen(false)}
                        />
                    )}
                </span>
            </div>
        </div>
    )
}
