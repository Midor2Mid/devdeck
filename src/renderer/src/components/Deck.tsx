import { useStore } from "../store"
import { deriveDeckStrips } from "../deck"
import { ProjectStrip } from "./ProjectStrip"
import { ViewKeys } from "./ViewKeys"
import { ToolCluster } from "./ToolCluster"
import { DeckStatus } from "./DeckStatus"

export function Deck(): JSX.Element {
    // Subscribe to the raw state the derivation reads so the deck re-renders on
    // session/status/project changes (agentSessions() is a getter, not reactive).
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const termAgents = useStore((s) => s.termAgents)
    const termNames = useStore((s) => s.termNames)
    const projects = useStore((s) => s.projects)
    const activeId = useStore((s) => s.activeId)
    const agentSessions = useStore((s) => s.agentSessions)
    void tabsByProject
    void agentStatus
    void termAgents
    void termNames
    void projects

    const active = projects.find((p) => p.id === activeId)
    const strips = deriveDeckStrips(
        agentSessions(),
        active ? { id: active.id, name: active.name } : undefined
    )

    return (
        <div className="deck">
            <div className="deck-strips">
                {strips.length === 0 ? (
                    <button
                        className="deck-empty"
                        onClick={() => useStore.getState().openSwitcher()}
                    >
                        Add or open a project
                    </button>
                ) : (
                    strips.map((s) => <ProjectStrip key={s.projectId} strip={s} />)
                )}
            </div>
            <div className="deck-bar">
                <ViewKeys />
                <ToolCluster />
                <DeckStatus />
            </div>
        </div>
    )
}
