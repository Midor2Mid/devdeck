import { useEffect, useRef, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { firstLeaf, collectLeaves } from "../layout"
import { paneRegistry } from "../paneRegistry"
import { SplitView } from "./SplitView"

export function TerminalView(): JSX.Element {
    const projects = useStore((s) => s.projects)
    const activeId = useStore((s) => s.activeId)
    const tabsByProject = useStore((s) => s.tabsByProject)
    const activeTabByProject = useStore((s) => s.activeTabByProject)
    const kindOf = useStore((s) => s.kindOf)
    const claudeStatus = useStore((s) => s.claudeStatus)
    const newTab = useStore((s) => s.newTab)
    const splitActive = useStore((s) => s.splitActive)
    const closePane = useStore((s) => s.closePane)
    const renameTab = useStore((s) => s.renameTab)
    const setActiveTab = useStore((s) => s.setActiveTab)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [draft, setDraft] = useState("")
    const [findOpen, setFindOpen] = useState(false)
    const [query, setQuery] = useState("")
    const findInputRef = useRef<HTMLInputElement>(null)

    const activeProject = projects.find((p) => p.id === activeId)
    const tabs = activeId ? tabsByProject[activeId] ?? [] : []
    const activeTabId = activeId ? activeTabByProject[activeId] : undefined
    const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

    const runFind = (forward: boolean): void => {
        const s = useStore.getState()
        if (!activeId) return
        const paneId = s.activePane(activeId) ?? (activeTab ? firstLeaf(activeTab.root) : undefined)
        if (!paneId || !query) return
        const handle = paneRegistry.get(paneId)
        if (forward) handle?.search.findNext(query)
        else handle?.search.findPrevious(query)
    }

    // Terminal-scoped keyboard shortcuts (Ctrl+Shift+…), captured before xterm.
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
                KeyT: () => s.newTab("shell"),
                Enter: () => s.newTab("claude"),
                KeyW: () => s.closeActivePane(),
                Backslash: () => s.splitActive("row", "shell"),
                Minus: () => s.splitActive("col", "shell"),
                BracketRight: () => s.cycleTab(1),
                BracketLeft: () => s.cycleTab(-1),
                KeyF: () => setFindOpen((v) => !v)
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
                        const kind = kindOf(firstLeaf(tab.root))
                        const isActive = tab.id === activeTab?.id
                        // Tab status = worst status among its Claude panes.
                        const claudeLeaves = collectLeaves(tab.root).filter(
                            (id) => kindOf(id) === "claude"
                        )
                        const statuses = claudeLeaves.map((id) => claudeStatus[id] ?? "idle")
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
                                        kind +
                                        (kind === "claude" ? " status-" + tabStatus : "")
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
                                        // Close every pane in this tab.
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
                    <button onClick={() => newTab("shell")} title="New shell tab (Ctrl+Shift+T)">
                        + Terminal
                    </button>
                    <button
                        className="accent"
                        onClick={() => newTab("claude")}
                        title="New Claude session (Ctrl+Shift+Enter)"
                    >
                        + Claude
                    </button>
                    <button
                        className="icon-action"
                        onClick={() => {
                            const c = useSettings.getState().claude
                            newTab("claude", `${c.command} ${c.continueArgs}`)
                        }}
                        title="Resume last Claude conversation (claude --continue)"
                    >
                        ↻
                    </button>
                    <span className="action-sep" />
                    <button
                        className="icon-action"
                        onClick={() => splitActive("row", "shell")}
                        title="Split right (Ctrl+Shift+\\)"
                    >
                        ⇆
                    </button>
                    <button
                        className="icon-action"
                        onClick={() => splitActive("col", "shell")}
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
                                <b>+ Terminal</b> for a shell, <b>+ Claude</b> for a Claude
                                session. Split with the ⇆ / ⇅ buttons.
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
        </div>
    )
}
