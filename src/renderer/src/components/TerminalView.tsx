import { useEffect, useRef, useState } from "react"
import { useStore, SHELL } from "../store"
import { useSettings } from "../settings"
import { firstLeaf, collectLeaves } from "../layout"
import { paneRegistry } from "../paneRegistry"
import { SplitView } from "./SplitView"
import { PromptComposer } from "./PromptComposer"

export function TerminalView(): JSX.Element {
    const projects = useStore((s) => s.projects)
    const activeId = useStore((s) => s.activeId)
    const tabsByProject = useStore((s) => s.tabsByProject)
    const activeTabByProject = useStore((s) => s.activeTabByProject)
    const agentOf = useStore((s) => s.agentOf)
    const agentStatus = useStore((s) => s.agentStatus)
    const newTab = useStore((s) => s.newTab)
    const splitActive = useStore((s) => s.splitActive)
    const closePane = useStore((s) => s.closePane)
    const renameTab = useStore((s) => s.renameTab)
    const setActiveTab = useStore((s) => s.setActiveTab)
    const agents = useSettings((s) => s.agents)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [draft, setDraft] = useState("")
    const [findOpen, setFindOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [menuOpen, setMenuOpen] = useState(false)
    const [composerOpen, setComposerOpen] = useState(false)
    const findInputRef = useRef<HTMLInputElement>(null)

    const activeProject = projects.find((p) => p.id === activeId)
    const tabs = activeId ? tabsByProject[activeId] ?? [] : []
    const activeTabId = activeId ? activeTabByProject[activeId] : undefined
    const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
    const primaryAgent = agents[0]

    const runFind = (forward: boolean): void => {
        const s = useStore.getState()
        if (!activeId) return
        const paneId = s.activePane(activeId) ?? (activeTab ? firstLeaf(activeTab.root) : undefined)
        if (!paneId || !query) return
        const handle = paneRegistry.get(paneId)
        if (forward) handle?.search.findNext(query)
        else handle?.search.findPrevious(query)
    }

    useEffect(() => {
        const handler = (e: KeyboardEvent): void => {
            const s = useStore.getState()
            if (s.view !== "terminal" || !s.activeId) return
            if (findOpen && e.key === "Escape") {
                setFindOpen(false)
                return
            }
            if (!(e.ctrlKey && e.shiftKey)) return
            const map: Record<string, () => void> = {
                KeyT: () => s.newTab(SHELL),
                Enter: () => s.newTab(useSettings.getState().agents[0]?.id ?? "claude"),
                KeyW: () => s.closeActivePane(),
                Backslash: () => s.splitActive("row", SHELL),
                Minus: () => s.splitActive("col", SHELL),
                BracketRight: () => s.cycleTab(1),
                BracketLeft: () => s.cycleTab(-1),
                KeyF: () => setFindOpen((v) => !v),
                KeyP: () => setComposerOpen((v) => !v)
            }
            const action = map[e.code]
            if (action) {
                e.preventDefault()
                e.stopPropagation()
                action()
            }
        }
        window.addEventListener("keydown", handler, true)
        return () => window.removeEventListener("keydown", handler, true)
    }, [findOpen])

    useEffect(() => {
        if (findOpen) findInputRef.current?.focus()
    }, [findOpen])

    if (!activeProject) {
        return (
            <div className="empty-state">
                <p>No project selected.</p>
                <p className="muted">Add a project from the sidebar to start a terminal.</p>
            </div>
        )
    }

    const commitRename = (): void => {
        if (editingId) renameTab(activeProject.id, editingId, draft.trim())
        setEditingId(null)
    }

    return (
        <div className="terminal-view">
            <div className="term-tabbar">
                <div className="term-tabs">
                    {tabs.map((tab) => {
                        const isActive = tab.id === activeTab?.id
                        const agentLeaves = collectLeaves(tab.root).filter(
                            (id) => agentOf(id) !== SHELL
                        )
                        const statuses = agentLeaves.map((id) => agentStatus[id] ?? "idle")
                        const anyAgent = agentLeaves.length > 0
                        const tabStatus = statuses.includes("attention")
                            ? "attention"
                            : statuses.includes("working")
                              ? "working"
                              : "idle"
                        return (
                            <div
                                key={tab.id}
                                className={"term-tab" + (isActive ? " active" : "")}
                                onClick={() => setActiveTab(activeProject.id, tab.id)}
                                onDoubleClick={() => {
                                    setEditingId(tab.id)
                                    setDraft(tab.name)
                                }}
                                title="Double-click to rename"
                            >
                                <span
                                    className={
                                        "tab-dot " +
                                        (anyAgent ? "claude status-" + tabStatus : "shell")
                                    }
                                />
                                {editingId === tab.id ? (
                                    <input
                                        className="tab-rename"
                                        autoFocus
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onBlur={commitRename}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") commitRename()
                                            if (e.key === "Escape") setEditingId(null)
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span className="tab-title">{tab.name}</span>
                                )}
                                <span
                                    className="tab-close"
                                    title="Close"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        ;[...new Set(collectLeaves(tab.root))].forEach(closePane)
                                    }}
                                >
                                    ×
                                </span>
                            </div>
                        )
                    })}
                </div>
                <div className="term-actions">
                    <button onClick={() => newTab(SHELL)} title="New shell tab (Ctrl+Shift+T)">
                        + Terminal
                    </button>
                    {primaryAgent && (
                        <button
                            className="accent"
                            onClick={() => newTab(primaryAgent.id)}
                            title={`New ${primaryAgent.name} session (Ctrl+Shift+Enter)`}
                        >
                            + {primaryAgent.name}
                        </button>
                    )}
                    <div className="agent-menu-wrap">
                        <button
                            className="icon-action"
                            onClick={() => setMenuOpen((v) => !v)}
                            title="Other agents…"
                        >
                            ▾
                        </button>
                        {menuOpen && (
                            <>
                                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                                <div className="agent-menu">
                                    {agents.map((a) => (
                                        <div key={a.id} className="agent-menu-row">
                                            <span
                                                className="agent-menu-name"
                                                onClick={() => {
                                                    newTab(a.id)
                                                    setMenuOpen(false)
                                                }}
                                            >
                                                <span className="agent-badge">{a.badge}</span>
                                                {a.name}
                                            </span>
                                            {a.resumeArgs && (
                                                <span
                                                    className="agent-menu-resume"
                                                    title={`Resume (${a.command} ${a.resumeArgs})`}
                                                    onClick={() => {
                                                        newTab(a.id, `${a.command} ${a.resumeArgs}`)
                                                        setMenuOpen(false)
                                                    }}
                                                >
                                                    ↻
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <span className="action-sep" />
                    <button
                        className="icon-action"
                        onClick={() => splitActive("row", SHELL)}
                        title="Split right (Ctrl+Shift+\\)"
                    >
                        ⇆
                    </button>
                    <button
                        className="icon-action"
                        onClick={() => splitActive("col", SHELL)}
                        title="Split down (Ctrl+Shift+-)"
                    >
                        ⇅
                    </button>
                    <button
                        className="icon-action"
                        onClick={() => setFindOpen((v) => !v)}
                        title="Find in terminal (Ctrl+Shift+F)"
                    >
                        ⌕
                    </button>
                    <button
                        className={"icon-action" + (composerOpen ? " on" : "")}
                        onClick={() => setComposerOpen((v) => !v)}
                        title="Prompt composer (Ctrl+Shift+P)"
                    >
                        ✎
                    </button>
                </div>
            </div>

            <div className="term-stage">
                {findOpen && (
                    <div className="find-bar">
                        <input
                            ref={findInputRef}
                            placeholder="Find in terminal…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") runFind(!e.shiftKey)
                                if (e.key === "Escape") setFindOpen(false)
                            }}
                        />
                        <button onClick={() => runFind(false)} title="Previous">
                            ↑
                        </button>
                        <button onClick={() => runFind(true)} title="Next">
                            ↓
                        </button>
                        <button onClick={() => setFindOpen(false)} title="Close">
                            ×
                        </button>
                    </div>
                )}
                <div className="stage-body">
                    {tabs.length === 0 || !activeTab ? (
                        <div className="empty-state">
                            <p>No terminals yet in {activeProject.name}.</p>
                            <p className="muted">
                                <b>+ Terminal</b> for a shell, <b>+ {primaryAgent?.name ?? "agent"}</b>{" "}
                                for an AI session. Split with the ⇆ / ⇅ buttons.
                            </p>
                        </div>
                    ) : (
                        <SplitView
                            node={activeTab.root}
                            projectId={activeProject.id}
                            cwd={activeProject.path}
                        />
                    )}
                </div>
            </div>
            {composerOpen && <PromptComposer onClose={() => setComposerOpen(false)} />}
        </div>
    )
}
