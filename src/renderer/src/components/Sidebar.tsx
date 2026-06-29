import { useMemo, useState } from "react"
import { useStore, SHELL, type AgentStatus } from "../store"
import { useSettings } from "../settings"
import { collectLeaves } from "../layout"
import type { Project } from "../../../preload/index"
import { Icon } from "./Icon"
import { Enso } from "./Enso"
import { TaskRunner } from "./TaskRunner"
import { confirm } from "../confirm"
import { contextMenu } from "../contextmenu"

interface SessionRow {
    termId: string
    projectName: string
    sessionName: string
    badge: string
    status: AgentStatus
}

const UNGROUPED = "__ungrouped__"

export function Sidebar(): JSX.Element {
    const {
        projects,
        activeId,
        addProject,
        removeProject,
        setActiveProject,
        setProjectGroup,
        moveProject,
        addProjectByPath,
        saveWorkspacePreset,
        openWorkspacePreset,
        deleteWorkspacePreset
    } = useStore()
    const openSwitcher = useStore((s) => s.openSwitcher)
    const agents = useSettings((s) => s.agents)
    const presets = useSettings((s) => s.workspacePresets)

    const tabsByProject = useStore((s) => s.tabsByProject)
    const termAgents = useStore((s) => s.termAgents)
    const agentStatus = useStore((s) => s.agentStatus)
    const termNames = useStore((s) => s.termNames)
    const jumpToTerm = useStore((s) => s.jumpToTerm)
    const dragPayload = useStore((s) => s.dragPayload)
    const setDragPayload = useStore((s) => s.setDragPayload)
    const [overSession, setOverSession] = useState<string | null>(null)
    const [renamingTerm, setRenamingTerm] = useState<string | null>(null)
    const [renameText, setRenameText] = useState("")
    const renameSession = useStore((s) => s.renameSession)

    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
    const [menuFor, setMenuFor] = useState<string | null>(null)
    const [newGroup, setNewGroup] = useState("")
    // Drag-and-drop: which project is being dragged / hovered, + OS folder-drop.
    const [dragId, setDragId] = useState<string | null>(null)
    const [overId, setOverId] = useState<string | null>(null)
    const [folderOver, setFolderOver] = useState(false)

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
                        sessionName: termNames[termId] ?? tab.name,
                        badge: badgeOf(agentId),
                        status: agentStatus[termId] ?? "idle"
                    })
                }
            }
        }
        return out
    }, [tabsByProject, termAgents, agentStatus, termNames, projects, agents])

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

    const removeWithConfirm = async (p: Project): Promise<void> => {
        const ok = await confirm({
            title: "Remove project",
            message: `Remove "${p.name}" from DevDeck? The folder won't be deleted, but its tabs/sessions here will close.`,
            confirmLabel: "Remove",
            danger: true
        })
        if (ok) removeProject(p.id)
    }

    const projectMenu = (p: Project): { label?: string; onClick?: () => void; danger?: boolean; separator?: boolean }[] => {
        const projPresets = presets.filter((pr) => pr.projectId === p.id)
        const hasTabs = (tabsByProject[p.id] ?? []).length > 0
        return [
            { label: "Open", onClick: () => setActiveProject(p.id) },
            { separator: true },
            ...existingGroups
                .filter((g) => g !== p.group)
                .map((g) => ({ label: "Move to " + g, onClick: () => setProjectGroup(p.id, g) })),
            ...(p.group ? [{ label: "Ungroup", onClick: () => setProjectGroup(p.id, "") }] : []),
            { separator: true },
            ...(hasTabs
                ? [{ label: "Save layout as preset", onClick: () => saveWorkspacePreset(p.id) }]
                : []),
            ...projPresets.map((pr) => ({
                label: `Open ${pr.name}`,
                onClick: () => openWorkspacePreset(pr.id)
            })),
            ...projPresets.map((pr) => ({
                label: `Delete ${pr.name}`,
                danger: true,
                onClick: () => deleteWorkspacePreset(pr.id)
            })),
            { separator: true },
            { label: "Remove project", danger: true, onClick: () => removeWithConfirm(p) }
        ]
    }

    const projectRow = (p: Project): JSX.Element => (
        <div
            key={p.id}
            className={
                "project-item" +
                (p.id === activeId ? " active" : "") +
                (p.id === overId ? " drag-over" : "") +
                (p.id === dragId ? " dragging" : "")
            }
            onClick={() => setActiveProject(p.id)}
            data-tip={p.path}
            onContextMenu={(e) => contextMenu(e, projectMenu(p))}
            draggable
            onDragStart={(e) => {
                setDragId(p.id)
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData("text/devdeck-project", p.id)
            }}
            onDragEnd={() => {
                setDragId(null)
                setOverId(null)
            }}
            onDragOver={(e) => {
                if (dragId && dragId !== p.id) {
                    e.preventDefault()
                    setOverId(p.id)
                }
            }}
            onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
            onDrop={(e) => {
                if (!dragId || dragId === p.id) return // OS file drop / self: let it bubble
                e.preventDefault()
                e.stopPropagation()
                moveProject(dragId, p.id)
                setDragId(null)
                setOverId(null)
            }}
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
                <span className="brand">
                    <Enso size={15} strokeWidth={2.25} className="brand-enso" />
                    DevDeck
                </span>
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

            <div
                className={"project-list" + (folderOver ? " folder-drop" : "")}
                onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("Files")) {
                        e.preventDefault()
                        setFolderOver(true)
                    }
                }}
                onDragLeave={() => setFolderOver(false)}
                onDrop={(e) => {
                    if (e.dataTransfer.files.length) {
                        e.preventDefault()
                        for (const f of Array.from(e.dataTransfer.files)) {
                            const path = (f as unknown as { path?: string }).path
                            if (path) addProjectByPath(path)
                        }
                    }
                    setFolderOver(false)
                }}
            >
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
                            <div
                                className={
                                    "project-group-head" + (overId === "grp:" + g.name ? " drag-over" : "")
                                }
                                onClick={() => toggle(g.name)}
                                onDragOver={(e) => {
                                    if (dragId) {
                                        e.preventDefault()
                                        setOverId("grp:" + g.name)
                                    }
                                }}
                                onDragLeave={() =>
                                    setOverId((o) => (o === "grp:" + g.name ? null : o))
                                }
                                onDrop={(e) => {
                                    if (!dragId) return
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setProjectGroup(dragId, g.name)
                                    setDragId(null)
                                    setOverId(null)
                                }}
                            >
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

            <TaskRunner />

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
                            className={
                                "claude-session" +
                                (dragPayload ? " drop-active" : "") +
                                (overSession === s.termId ? " drag-over" : "")
                            }
                            onClick={() => jumpToTerm(s.termId)}
                            data-tip={
                                dragPayload
                                    ? "Drop to insert into this session"
                                    : `${s.sessionName} · ${s.projectName} - ${s.status}`
                            }
                            onDragOver={(e) => {
                                if (dragPayload) {
                                    e.preventDefault()
                                    setOverSession(s.termId)
                                }
                            }}
                            onDragLeave={() => setOverSession((o) => (o === s.termId ? null : o))}
                            onDrop={(e) => {
                                if (!dragPayload) return
                                e.preventDefault()
                                window.api.pty.input(s.termId, dragPayload)
                                jumpToTerm(s.termId)
                                setDragPayload(null)
                                setOverSession(null)
                            }}
                        >
                            <span className={"tab-dot claude status-" + s.status} />
                            <span className="claude-session-text">
                                {renamingTerm === s.termId ? (
                                    <input
                                        className="session-rename"
                                        autoFocus
                                        value={renameText}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setRenameText(e.target.value)}
                                        onBlur={() => {
                                            renameSession(s.termId, renameText)
                                            setRenamingTerm(null)
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                renameSession(s.termId, renameText)
                                                setRenamingTerm(null)
                                            } else if (e.key === "Escape") {
                                                setRenamingTerm(null)
                                            }
                                        }}
                                    />
                                ) : (
                                    <span
                                        className="claude-session-tab"
                                        onDoubleClick={(e) => {
                                            e.stopPropagation()
                                            setRenameText(s.sessionName)
                                            setRenamingTerm(s.termId)
                                        }}
                                        data-tip="Double-click to rename this session"
                                    >
                                        {s.sessionName}
                                    </span>
                                )}
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
