import type { AnySession } from "./store"
import { keyIsRunning, type DeckKeyStatus } from "./deck"

export interface TargetGroup {
    projectId: string
    projectName: string
    sessions: AnySession[]
}

export type Preset = "all" | "project" | "idle" | "none"

/**
 * Group agent sessions by project (first-seen order) for the composer's target
 * list. Non-agent sessions (plain shells) are excluded — this is a prompt
 * composer, agents only.
 */
export function groupTargets(sessions: AnySession[]): TargetGroup[] {
    const order: string[] = []
    const byId = new Map<string, TargetGroup>()
    for (const s of sessions) {
        if (!s.isAgent) continue
        let group = byId.get(s.projectId)
        if (!group) {
            group = { projectId: s.projectId, projectName: s.projectName, sessions: [] }
            byId.set(s.projectId, group)
            order.push(s.projectId)
        }
        group.sessions.push(s)
    }
    return order.map((id) => byId.get(id)!)
}

/**
 * The set of agent termIds a quick-select preset resolves to.
 *
 * `keyStatus` is the derived status (`useKeyStatus`), and every preset filters
 * on it first: a preset resolves to SEND TARGETS, and nothing is listening
 * behind a session with no process. `All` and `This project` swept restored and
 * exited sessions into the selection, and `Idle` was the worst of the three -
 * `s.status` is what the agent last did and a dead session usually reads
 * `idle`, so the button offered to select exactly the sessions that could not
 * receive anything.
 */
export function presetSelection(
    sessions: AnySession[],
    preset: Preset,
    activeProjectId: string | null,
    keyStatus: (s: AnySession) => DeckKeyStatus
): Set<string> {
    const agents = sessions.filter((s) => s.isAgent && keyIsRunning(keyStatus(s)))
    switch (preset) {
        case "all":
            return new Set(agents.map((s) => s.termId))
        case "project":
            return new Set(
                agents.filter((s) => s.projectId === activeProjectId).map((s) => s.termId)
            )
        case "idle":
            // The derived status, so this is "idle AND running" - the raw status
            // cannot tell those apart.
            return new Set(agents.filter((s) => keyStatus(s) === "idle").map((s) => s.termId))
        case "none":
            return new Set()
    }
}
