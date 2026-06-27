import { useEffect, useRef, useState } from "react"
import { useStore, SHELL } from "../store"
import { useSettings } from "../settings"
import { firstLeaf, collectLeaves } from "../layout"
import { paneRegistry } from "../paneRegistry"
import { SplitView } from "./SplitView"
import { PromptComposer } from "./PromptComposer"
import { CanvasView } from "./CanvasView"

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
    const composerDraft = useStore((s) => (s.activeId ? s.composerDrafts[s.activeId] ?? "" : ""))
    const termLayout = useStore((s) => s.termLayout)
    const setTermLayout = useStore((s) => s.setTermLayout)
    const focusPane = useStore((s) => s.focusPane)
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

    // All terminals across the project's tabs — used by Grid + Canvas layouts.
    const allPanes = tabs.flatMap((tab) =>
        collectLeaves(tab.root).map((termId) => ({ termId, tabName: tab.name, tabId: tab.id }))
    )

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
                        className={"icon-action" + (termLayout === "tabs" ? " on" : "")}
                        onClick={() => setTermLayout("tabs")}
                        title="Tabs layout"
                    >
                        ▭
                    </button>
                    <button
                        className={"icon-action" + (termLayout === "grid" ? " on" : "")}
                        onClick={() => setTermLayout("grid")}
                        title="Dashboard grid — all this project's terminals at once"
                    >
                        ▦
                    </button>
                    <button
                        className={"icon-action" + (termLayout === "canvas" ? " on" : "")}
                        onClick={() => setTermLayout("canvas")}
                        title="Canvas — free-form board of all terminals"
                    >
                        ◇
                    </button>
                    <span className="action-sep" />
                    <button
                        className="icon-action"
                        onClick={() => splitActive("row", SHELL)}
                        title="Split right (Ctrl+Shift+\\)"
                        disabled={termLayout === "grid"}
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
                    ) : termLayout === "grid" ? (
                        <div className="term-grid">
                            {allPanes.map(({ termId, tabName, tabId }) => {
                                const isAgent = agentOf(termId) !== SHELL
                                return (
                                    <div key={termId} className="grid-card">
                                        <div className="grid-card-head">
                                            <span
                                                className={
                                                    "tab-dot " +
                                                    (isAgent
                                                        ? "claude status-" +
                                                          (agentStatus[termId] ?? "idle")
                                                        : "shell")
                                                }
                                            />
                                            <span className="grid-card-name">{tabName}</span>
                                            <span
                                                className="grid-card-open"
                                                title="Open in tabs view"
                                                onClick={() => {
                                                    setActiveTab(activeProject.id, tabId)
                                                    focusPane(activeProject.id, termId)
                                                    setTermLayout("tabs")
                                                }}
                                            >
                                                ↗
                                            </span>
                                            <span
                                                className="tab-close"
                                                title="Close"
                                                onClick={() => closePane(termId)}
                                            >
                                                ×
                                            </span>
                                        </div>
                                        <div className="grid-card-body">
                                            <SplitView
                                                node={{ kind: "leaf", termId }}
                                                projectId={activeProject.id}
                                                cwd={activeProject.path}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : termLayout === "canvas" ? (
                        <CanvasView
                            panes={allPanes}
                            projectId={activeProject.id}
                            cwd={activeProject.path}
                        />
                    ) : (
                        <SplitView
                            node={activeTab.root}
                            projectId={activeProject.id}
                            cwd={activeProject.path}
                        />
                    )}
                </div>
            </div>
            {composerOpen ? (
                <PromptComposer onClose={() => setComposerOpen(false)} />
            ) : (
                <div
                    className="composer-launcher"
                    onClick={() => setComposerOpen(true)}
                    title="Open the prompt composer (Ctrl+Shift+P)"
                >
                    <span className="cl-icon">✎</span>
                    <span className="cl-text">
                        {composerDraft.trim()
                            ? "Resume your prompt draft…"
                            : `Write a prompt${primaryAgent ? " for " + primaryAgent.name : ""}…`}
                    </span>
                    {composerDraft.trim() && <span className="cl-draft">● draft</span>}
                    <span className="cl-kbd">Ctrl+Shift+P</span>
                </div>
            )}
        </div>
    )
}
