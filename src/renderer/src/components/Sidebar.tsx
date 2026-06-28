import { useMemo, useState } from "react"
import { useStore, SHELL, type AgentStatus } from "../store"
import { useSettings } from "../settings"
import { collectLeaves } from "../layout"
import type { Project } from "../../../preload/index"
import { Icon } from "./Icon"
import { confirm } from "../confirm"

interface SessionRow {
    termId: string
    projectName: string
    tabName: string
    badge: string
    status: AgentStatus
}

const UNGROUPED = "__ungrouped__"

export function Sidebar(): JSX.Element {
    const { projects, activeId, addProject, removeProject, setActiveProject, setProjectGroup } =
        useStore()
    const openSwitcher = useStore((s) => s.openSwitcher)
    const agents = useSettings((s) => s.agents)

    const tabsByProject = useStore((s) => s.tabsByProject)
    const termAgents = useStore((s) => s.termAgents)
    const agentStatus = useStore((s) => s.agentStatus)
    const jumpToTerm = useStore((s) => s.jumpToTerm)

    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
    const [menuFor, setMenuFor] = useState<string | null>(null)
    const [newGroup, setNewGroup] = useState("")

    // Group projects: named groups (sorted) with ungrouped first.
    const grouped = useMemo(() => {
        const map = new Map<string, Project[]>()
        for (const p of projects) {
            const key = p.group ?? UNGROUPED
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(p)
        }
        const names = [...map.keys()].sort((a, b) =>
            a === UNGROUPED ? -1 : b === UNGROUPED ? 1 : a.localeCompare(b)
        )
        return names.map((name) => ({ name, items: map.get(name)! }))
    }, [projects])

    const existingGroups = useMemo(
        () => [...new Set(projects.map((p) => p.group).filter(Boolean))] as string[],
        [projects]
    )

    const sessions = useMemo<SessionRow[]>(() => {
        const badgeOf = (id: string): string =>
            agents.find((a) => a.id === id)?.badge ?? id.toUpperCase()
        const out: SessionRow[] = []
        for (const [pid, tabs] of Object.entries(tabsByProject)) {
            const project = projects.find((p) => p.id === pid)
            for (const tab of tabs) {
                for (const termId of collectLeaves(tab.root)) {
                    const agentId = termAgents[termId] ?? SHELL
                    if (agentId === SHELL) continue
                    out.push({
                        termId,
                        projectName: project?.name ?? "-",
                        tabName: tab.name,
                        badge: badgeOf(agentId),
                        status: agentStatus[termId] ?? "idle"
                    })
                }
            }
        }
        return out
    }, [tabsByProject, termAgents, agentStatus, projects, agents])

    const attention = sessions.filter((s) => s.status === "attention").length

    const toggle = (g: string): void =>
        setCollapsed((prev) => {
            const next = new Set(prev)
            if (next.has(g)) next.delete(g)
            else next.add(g)
            return next
        })

    const assign = (id: string, group: string): void => {
        setProjectGroup(id, group)
        setMenuFor(null)
        setNewGroup("")
    }

    const projectRow = (p: Project): JSX.Element => (
        <div
            key={p.id}
            className={"project-item" + (p.id === activeId ? " active" : "")}
            onClick={() => setActiveProject(p.id)}
            data-tip={p.path}
        >
            <span className="project-name">{p.name}</span>
            <span
                className="project-menu-btn"
                data-tip="Move to group"
                onClick={(e) => {
                    e.stopPropagation()
                    setMenuFor(menuFor === p.id ? null : p.id)
                }}
            >
                ⋯
            </span>
            <span
                className="project-remove"
                data-tip="Remove project"
                onClick={async (e) => {
                    e.stopPropagation()
                    const ok = await confirm({
                        title: "Remove project",
                        message: `Remove "${p.name}" from DevDeck? The folder won't be deleted, but its tabs/sessions here will close.`,
                        confirmLabel: "Remove",
                        danger: true
                    })
                    if (ok) removeProject(p.id)
                }}
            >
                ×
            </span>
            {menuFor === p.id && (
                <>
                    <div className="menu-backdrop" onClick={(e) => { e.stopPropagation(); setMenuFor(null) }} />
                    <div className="group-menu" onClick={(e) => e.stopPropagation()}>
                        <div className="group-menu-title">Move to group</div>
                        {existingGroups
                            .filter((g) => g !== p.group)
                            .map((g) => (
                                <div key={g} className="group-menu-item" onClick={() => assign(p.id, g)}>
                                    {g}
                                </div>
                            ))}
                        {p.group && (
                            <div className="group-menu-item" onClick={() => assign(p.id, "")}>
                                Ungroup
                            </div>
                        )}
                        <input
                            className="group-new"
                            placeholder="New group…"
                            value={newGroup}
                            onChange={(e) => setNewGroup(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && newGroup.trim()) assign(p.id, newGroup)
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    )

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span className="brand">DevDeck</span>
                <button className="gear-btn" data-tip="Switch project (Ctrl+K)" data-tip-pos="bottom" onClick={openSwitcher}>
                    <Icon name="layers" />
                </button>
            </div>

            <div className="sidebar-section-title">
                <span>PROJECTS</span>
                <button className="icon-btn" data-tip="Add a project folder" onClick={addProject}>
                    +
                </button>
            </div>

            <div className="project-list">
                {projects.length === 0 && (
                    <div className="muted sidebar-empty">
                        No projects yet.
                        <br />
                        Click <b>+</b> to add a folder.
                    </div>
                )}
                {grouped.map((g) =>
                    g.name === UNGROUPED ? (
                        g.items.map(projectRow)
                    ) : (
                        <div key={g.name} className="project-group">
                            <div className="project-group-head" onClick={() => toggle(g.name)}>
                                <span className="caret">{collapsed.has(g.name) ? "▸" : "▾"}</span>
                                {g.name}
                                <span className="group-count">{g.items.length}</span>
                            </div>
                            {!collapsed.has(g.name) && (
                                <div className="project-group-items">{g.items.map(projectRow)}</div>
                            )}
                        </div>
                    )
                )}
            </div>

            <div className="sidebar-section-title claude-title">
                <span>AGENT SESSIONS</span>
                {attention > 0 && (
                    <span className="attention-badge" data-tip={`${attention} need attention`}>
                        {attention}
                    </span>
                )}
            </div>
            <div className="claude-list">
                {sessions.length === 0 ? (
                    <div className="muted sidebar-empty">
                        None running.
                        <br />
                        Start one with <b>+ {agents[0]?.name ?? "agent"}</b>.
                    </div>
                ) : (
                    sessions.map((s) => (
                        <div
                            key={s.termId}
                            className="claude-session"
                            onClick={() => jumpToTerm(s.termId)}
                            data-tip={`${s.tabName} · ${s.projectName} - ${s.status}`}
                        >
                            <span className={"tab-dot claude status-" + s.status} />
                            <span className="claude-session-text">
                                <span className="claude-session-tab">{s.tabName}</span>
                                <span className="claude-session-project">{s.projectName}</span>
                            </span>
                            <span className="agent-badge sm">{s.badge}</span>
                            {s.status === "attention" && <span className="claude-attn">!</span>}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
