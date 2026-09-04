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

    const active = projects.find((p) => p.id === activeId)
    const strips = deriveDeckStrips(
        agentSessions(),
        active ? { id: active.id, name: active.name } : undefined
    )

    return (
        <div className="deck">
            <div className="deck-strips">
                {strips.length === 0 ? (
                    // No strip means no active project, which has two causes and
                    // needs two different controls. The label used to say "Add or
                    // open a project" and did neither: it opened the switcher,
                    // putting the folder dialog three hops away, and on a first
                    // run that switcher is empty. With nothing to choose between,
                    // this goes straight to the dialog; with projects on file but
                    // none active, choosing is the act and the dialog would be
                    // the wrong one. Dashed, never accent-filled - the accent CTA
                    // already lives on the panel above and there is one per frame.
                    projects.length === 0 ? (
                        <button
                            className="deck-empty"
                            onClick={() => void useStore.getState().addProject()}
                        >
                            Open folder…
                        </button>
                    ) : (
                        <button
                            className="deck-empty"
                            onClick={() => useStore.getState().openSwitcher()}
                        >
                            Choose a project
                        </button>
                    )
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
