import { useEffect, useRef, useState } from "react"
import { useStore, SHELL } from "../store"
import { useSettings, sshCommand, isUnsafeAgent, type ShellKind } from "../settings"
import { firstLeaf, collectLeaves } from "../layout"
import { sessionIndexOrder, validZoom } from "../paneNav"
import { isRunnable } from "../pipeline"
import { confirm } from "../confirm"
import { contextMenu } from "../contextmenu"
import { paneRegistry } from "../paneRegistry"
import type { Tab } from "../store"
import { SplitView } from "./SplitView"
import { PromptComposer } from "./PromptComposer"
import { CanvasView } from "./CanvasView"
import { OverviewView } from "./OverviewView"
import { CommandLauncher } from "./CommandLauncher"
import { LaunchOptions } from "./LaunchOptions"
import { Icon } from "./Icon"

// Shell choices offered in the "new terminal" menu (overrides the global default
// for that one terminal). "custom" is configured in Settings → Terminal.
const SHELL_OPTIONS: { kind: ShellKind; label: string }[] = [
    { kind: "powershell", label: "PowerShell" },
    { kind: "cmd", label: "Command Prompt" },
    { kind: "gitbash", label: "Git Bash" },
    { kind: "wsl", label: "WSL" },
    { kind: "custom", label: "Custom shell" }
]

export function TerminalView(): JSX.Element {
    const projects = useStore((s) => s.projects)
    const activeId = useStore((s) => s.activeId)
    const tabsByProject = useStore((s) => s.tabsByProject)
    const activeTabByProject = useStore((s) => s.activeTabByProject)
    const agentOf = useStore((s) => s.agentOf)
    const agentStatus = useStore((s) => s.agentStatus)
    const newTab = useStore((s) => s.newTab)
    const splitActive = useStore((s) => s.splitActive)
    const closePaneSilent = useStore((s) => s.closePaneSilent)
    const renameTab = useStore((s) => s.renameTab)
    const setActiveTab = useStore((s) => s.setActiveTab)
    const composerDraft = useStore((s) => (s.activeId ? s.composerDrafts[s.activeId] ?? "" : ""))
    const termLayout = useStore((s) => s.termLayout)
    const setTermLayout = useStore((s) => s.setTermLayout)
    // Layout modes cycle behind one control instead of separate buttons. The
    // first three are per-project; Overview is the cross-project board.
    const LAYOUTS = [
        { id: "tabs", icon: "tabs", label: "Tabs" },
        { id: "grid", icon: "grid", label: "Grid" },
        { id: "canvas", icon: "canvas", label: "Canvas" },
        { id: "overview", icon: "layers", label: "Overview (all projects)" }
    ] as const
    const layoutIdx = Math.max(
        0,
        LAYOUTS.findIndex((l) => l.id === termLayout)
    )
    const nextLayout = LAYOUTS[(layoutIdx + 1) % LAYOUTS.length]
    const focusPane = useStore((s) => s.focusPane)
    const agents = useSettings((s) => s.agents)
    const sshProfiles = useSettings((s) => s.sshProfiles)
    const pipelines = useSettings((s) => s.pipelines)
    const runPipeline = useStore((s) => s.runPipeline)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [draft, setDraft] = useState("")
    const [findOpen, setFindOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [menuOpen, setMenuOpen] = useState(false)
    const [toolsOpen, setToolsOpen] = useState(false)
    const [overTabId, setOverTabId] = useState<string | null>(null)
    const reorderTabs = useStore((s) => s.reorderTabs)
    const setDraggingTabId = useStore((s) => s.setDraggingTabId)
    const draggingTabId = useStore((s) => s.draggingTabId)
    const composerOpen = useStore((s) => s.composerOpen)
    const setComposerOpen = useStore((s) => s.setComposerOpen)
    // The prompt composer only sends into agent sessions, so there is nothing to
    // resume into without one. This is a necessary but no longer sufficient
    // condition for the launcher bar — see the draft check at its render site.
    const hasAgentSession = useStore((s) => s.agentSessions().length > 0)
    const recordingTermId = useStore((s) => s.recordingTermId)
    const setRecordingTermId = useStore((s) => s.setRecordingTermId)
    const setRecordingsOpen = useStore((s) => s.setRecordingsOpen)
    const setWorktreesOpen = useStore((s) => s.setWorktreesOpen)
    const newAgentInWorktree = useStore((s) => s.newAgentInWorktree)
    const [launchOptsOpen, setLaunchOptsOpen] = useState(false)
    const launchCaretRef = useRef<HTMLButtonElement>(null)
    const openChanges = useStore((s) => s.openChanges)
    const noteRecording = useStore((s) => s.noteRecording)
    const activePaneId = useStore((s) => (s.activeId ? s.activePaneByProject[s.activeId] : undefined))
    const zoomedPane = useStore((s) => s.zoomedPane)
    const toggleZoomPane = useStore((s) => s.toggleZoomPane)
    const closePane = useStore((s) => s.closePane)
    // Holding Alt reveals each tab's jump number, so Alt+N teaches itself
    // instead of living only in the shortcuts sheet.
    const [altHeld, setAltHeld] = useState(false)
    const findInputRef = useRef<HTMLInputElement>(null)

    const activeProject = projects.find((p) => p.id === activeId)
    const tabs = activeId ? tabsByProject[activeId] ?? [] : []
    const activeTabId = activeId ? activeTabByProject[activeId] : undefined
    const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
    // The one-click "+" button is the first AI-agent preset; normal-mode startup
    // commands live in the ▾ menu only.
    const primaryAgent = agents.find((a) => a.runMode !== "normal") ?? agents[0]

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
                KeyF: () => setFindOpen((v) => !v)
                // Ctrl+Shift+I (composer) lives in App.tsx instead: this handler
                // early-returns outside Terminal view, which made the chord dead
                // everywhere else even though the launcher, shortcuts overlay and
                // palette all advertise it unconditionally.
            }
            const action = map[e.code]
            if (action) {
                e.preventDefault()
                // stopImmediatePropagation: App.tsx also listens on window in the
                // capture phase; stopPropagation() would not stop that sibling
                // listener, so chords like Ctrl+Shift+F would fire twice.
                e.stopImmediatePropagation()
                action()
            }
        }
        window.addEventListener("keydown", handler, true)
        return () => window.removeEventListener("keydown", handler, true)
    }, [findOpen])

    useEffect(() => {
        if (findOpen) findInputRef.current?.focus()
    }, [findOpen])

    // Alt down/up only - blur clears it too, or the numbers would stay up after
    // an Alt+Tab away from the window.
    useEffect(() => {
        const down = (e: KeyboardEvent): void => {
            if (e.key === "Alt" && !e.ctrlKey) setAltHeld(true)
        }
        const up = (e: KeyboardEvent): void => {
            if (e.key === "Alt") setAltHeld(false)
        }
        const clear = (): void => setAltHeld(false)
        window.addEventListener("keydown", down)
        window.addEventListener("keyup", up)
        window.addEventListener("blur", clear)
        return () => {
            window.removeEventListener("keydown", down)
            window.removeEventListener("keyup", up)
            window.removeEventListener("blur", clear)
        }
    }, [])

    if (!activeProject) {
        // An empty workspace never reaches here: App routes all eight views to
        // <NoProjects/> while there are no projects. This is the narrow case of
        // a workspace that HAS projects with none of them active, where the
        // switcher is the entire answer - so it says that once, and teaches
        // nothing else (F1 already lists every shortcut).
        return (
            <div className="empty-state">
                <p className="muted">No project is open. Press Ctrl+K to pick one.</p>
            </div>
        )
    }

    const recordingActive = !!activePaneId && recordingTermId === activePaneId

    const toggleRecord = async (): Promise<void> => {
        const s = useStore.getState()
        if (!activeId) return
        const pane = s.activePane(activeId) ?? (activeTab ? firstLeaf(activeTab.root) : undefined)
        if (!pane) return
        const label = activeTab?.name ?? "session"
        if (recordingTermId === pane) {
            // Clear the indicator only once the file exists. A rejected stop now
            // leaves the events in main and the pane still marked as recording,
            // which is the truth - the alternative told the user it was saved.
            try {
                const meta = await window.api.rec.stop(pane, label)
                setRecordingTermId(null)
                if (meta) noteRecording(pane, `${label} · recorded (${meta.events} frames)`)
            } catch (e) {
                noteRecording(pane, `${label} · not saved: ${(e as Error).message}`)
            }
        } else if (!recordingTermId) {
            await window.api.rec.start(pane, activeProject.path)
            setRecordingTermId(pane)
        }
    }

    const commitRename = (): void => {
        if (editingId) renameTab(activeProject.id, editingId, draft.trim())
        setEditingId(null)
    }

    // Close a whole tab. One session closes straight away and offers Undo, which
    // is a better answer than a dialog: nothing to read, and it survives the
    // mis-click. Several panes still ask first, because undo restores ONE
    // session and an Undo that quietly brought back one of three would lie.
    const closeTab = async (tab: Tab): Promise<void> => {
        const panes = [...new Set(collectLeaves(tab.root))]
        if (panes.length === 1) {
            closePane(panes[0])
            return
        }
        const ok = await confirm({
            title: "Close tab",
            message: `Close "${tab.name}" and its ${panes.length} panes?`,
            confirmLabel: "Close",
            danger: true
        })
        if (!ok) return
        panes.forEach(closePaneSilent)
    }

    // The Alt+1..9 order, and the zoom that survives the current stage.
    const indexOrder = sessionIndexOrder(tabs)
    const effectiveZoom = validZoom(
        zoomedPane,
        termLayout,
        activeTab ? collectLeaves(activeTab.root) : []
    )

    // All terminals across the project's tabs - used by Grid + Canvas layouts.
    const allPanes = tabs.flatMap((tab) =>
        collectLeaves(tab.root).map((termId) => ({ termId, tabName: tab.name, tabId: tab.id }))
    )

    return (
        <div className={"terminal-view" + (termLayout === "overview" ? " overview-mode" : "")}>
            <div className="term-tabbar">
                <div className="term-tabs" role="tablist">
                    {tabs.map((tab) => {
                        const isActive = tab.id === activeTab?.id
                        // Where this tab's first pane sits in the Alt+N order. A
                        // tab past the ninth shows nothing rather than a number
                        // that would jump somewhere else.
                        const jumpIndex = indexOrder.indexOf(firstLeaf(tab.root)) + 1
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
                                className={
                                    "term-tab" +
                                    (isActive ? " active" : "") +
                                    (overTabId === tab.id ? " tab-over" : "") +
                                    (draggingTabId === tab.id ? " tab-dragging" : "")
                                }
                                onClick={() => setActiveTab(activeProject.id, tab.id)}
                                // Middle-click closes, as it does on the Overview
                                // rail. preventDefault on mousedown stops the
                                // browser's autoscroll cursor appearing first.
                                onMouseDown={(e) => {
                                    if (e.button === 1) e.preventDefault()
                                }}
                                onAuxClick={(e) => {
                                    if (e.button === 1) {
                                        e.stopPropagation()
                                        void closeTab(tab)
                                    }
                                }}
                                onDoubleClick={() => {
                                    setEditingId(tab.id)
                                    setDraft(tab.name)
                                }}
                                data-tip="Drag to reorder, or onto a pane to split. Double-click to rename."
                                onContextMenu={(e) =>
                                    contextMenu(e, [
                                        {
                                            label: "Rename",
                                            onClick: () => {
                                                setEditingId(tab.id)
                                                setDraft(tab.name)
                                            }
                                        },
                                        {
                                            label: "Split right",
                                            onClick: () => {
                                                setActiveTab(activeProject.id, tab.id)
                                                splitActive("row", SHELL)
                                            }
                                        },
                                        {
                                            label: "Split down",
                                            onClick: () => {
                                                setActiveTab(activeProject.id, tab.id)
                                                splitActive("col", SHELL)
                                            }
                                        },
                                        { separator: true },
                                        { label: "Close", danger: true, onClick: () => closeTab(tab) }
                                    ])
                                }
                                draggable={editingId !== tab.id}
                                onDragStart={(e) => {
                                    setDraggingTabId(tab.id)
                                    e.dataTransfer.effectAllowed = "move"
                                    e.dataTransfer.setData("text/devdeck-tab", tab.id)
                                }}
                                onDragEnd={() => {
                                    setDraggingTabId(null)
                                    setOverTabId(null)
                                }}
                                onDragOver={(e) => {
                                    if (draggingTabId && draggingTabId !== tab.id) {
                                        e.preventDefault()
                                        setOverTabId(tab.id)
                                    }
                                }}
                                onDragLeave={() => setOverTabId((o) => (o === tab.id ? null : o))}
                                onDrop={(e) => {
                                    if (draggingTabId && draggingTabId !== tab.id) {
                                        e.preventDefault()
                                        reorderTabs(activeProject.id, draggingTabId, tab.id)
                                    }
                                    setOverTabId(null)
                                }}
                            >
                                {altHeld && jumpIndex >= 1 && jumpIndex <= 9 && (
                                    <span className="tab-index">{jumpIndex}</span>
                                )}
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
                                    // Real button = keyboard focus + activation; its
                                    // click bubbles to the container's select handler.
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        className="term-tab-hit"
                                    >
                                        <span className="tab-title">{tab.name}</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="tab-close"
                                    aria-label="Close tab"
                                    data-tip="Close"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        closeTab(tab)
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        )
                    })}
                </div>
                <div className="term-actions">
                    <button onClick={() => newTab(SHELL)} data-tip="New shell tab (Ctrl+Shift+T)">
                        + Terminal
                    </button>
                    {primaryAgent && (
                        <span className="term-launch">
                            <button
                                className="accent term-launch-new"
                                onClick={() => newTab(primaryAgent.id)}
                                data-tip={`New ${primaryAgent.name} session (Ctrl+Shift+Enter)`}
                            >
                                + {primaryAgent.name}
                            </button>
                            {/* Split button: the body above launches instantly, this
                                caret opens options for one launch. Deliberately not a
                                dialog in front of the click — that action is bound to
                                Ctrl+Shift+Enter and should stay one keystroke. */}
                            <button
                                ref={launchCaretRef}
                                className="term-launch-caret"
                                aria-label={`${primaryAgent.name} launch options`}
                                data-tip="Launch options — worktree"
                                onClick={() => setLaunchOptsOpen((v) => !v)}
                            >
                                <Icon name="chevronDown" size={11} />
                            </button>
                            {launchOptsOpen && (
                                <LaunchOptions
                                    anchor={launchCaretRef.current}
                                    agents={[primaryAgent]}
                                    allowWorktree
                                    cwd={activeProject.path}
                                    onLaunch={(agentId, opts) => {
                                        if (opts.worktree) void newAgentInWorktree(agentId, opts.branch)
                                        else newTab(agentId)
                                    }}
                                    onClose={() => setLaunchOptsOpen(false)}
                                />
                            )}
                            {primaryAgent.resumeArgs && (
                                <button
                                    className="term-launch-resume"
                                    onClick={() =>
                                        newTab(
                                            primaryAgent.id,
                                            `${primaryAgent.command} ${primaryAgent.resumeArgs}`
                                        )
                                    }
                                    data-tip={`Resume ${primaryAgent.name} — continues your last session (${primaryAgent.command} ${primaryAgent.resumeArgs})`}
                                >
                                    <span className="term-launch-glyph">↻</span> Resume
                                </button>
                            )}
                        </span>
                    )}
                    <div className="agent-menu-wrap">
                        <button
                            className="icon-action"
                            onClick={() => setMenuOpen((v) => !v)}
                            data-tip="More agents & SSH hosts"
                        >
                            <Icon name="chevronDown" />
                        </button>
                        {menuOpen && (
                            <>
                                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                                <div className="agent-menu">
                                    {agents.map((a) => {
                                        const normal = a.runMode === "normal"
                                        return (
                                        <div
                                            key={a.id}
                                            className={
                                                "agent-menu-row" +
                                                (isUnsafeAgent(a.command) ? " agent-menu-unsafe" : "")
                                            }
                                        >
                                            {/* A real button, not a span: menu rows have to be
                                                reachable by keyboard as well as by mouse. */}
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className="agent-menu-name"
                                                data-tip={
                                                    isUnsafeAgent(a.command)
                                                        ? "Skips permission prompts — can edit and run anything here without asking"
                                                        : undefined
                                                }
                                                onClick={() => {
                                                    // Agent mode → an AI session; normal mode → a
                                                    // plain shell that auto-runs the command.
                                                    if (normal)
                                                        newTab(SHELL, a.command || undefined, a.name)
                                                    else newTab(a.id)
                                                    setMenuOpen(false)
                                                }}
                                            >
                                                {normal ? (
                                                    <span className="agent-badge cmd-badge">
                                                        {a.icon || "❯"}
                                                    </span>
                                                ) : (
                                                    <span className="agent-badge">{a.badge}</span>
                                                )}
                                                {a.name}
                                            </button>
                                            {!normal && a.resumeArgs && (
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    className="agent-menu-resume"
                                                    data-tip={`Resume (${a.command} ${a.resumeArgs})`}
                                                    onClick={() => {
                                                        newTab(a.id, `${a.command} ${a.resumeArgs}`)
                                                        setMenuOpen(false)
                                                    }}
                                                >
                                                    <span className="term-launch-glyph">↻</span>
                                                </button>
                                            )}
                                        </div>
                                        )
                                    })}
                                    {sshProfiles.length > 0 && (
                                        <div className="agent-menu-divider">SSH</div>
                                    )}
                                    {sshProfiles.map((p) => (
                                        <div key={p.id} className="agent-menu-row">
                                            <span
                                                className="agent-menu-name"
                                                onClick={() => {
                                                    newTab(SHELL, sshCommand(p), p.label)
                                                    setMenuOpen(false)
                                                }}
                                            >
                                                <span className="agent-badge">SSH</span>
                                                {p.label}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="agent-menu-divider">SHELLS</div>
                                    {SHELL_OPTIONS.map((opt) => (
                                        <div key={opt.kind} className="agent-menu-row">
                                            <span
                                                className="agent-menu-name"
                                                onClick={() => {
                                                    newTab(SHELL, undefined, opt.label, undefined, opt.kind)
                                                    setMenuOpen(false)
                                                }}
                                            >
                                                <span className="agent-badge">SH</span>
                                                {opt.label}
                                            </span>
                                        </div>
                                    ))}
                                    {pipelines.some(isRunnable) && (
                                        <div className="agent-menu-divider">PIPELINES</div>
                                    )}
                                    {pipelines.filter(isRunnable).map((p) => (
                                        <div key={p.id} className="agent-menu-row">
                                            <span
                                                className="agent-menu-name"
                                                onClick={() => {
                                                    runPipeline(p.id)
                                                    setMenuOpen(false)
                                                }}
                                                data-tip={`Run the "${p.name}" pipeline`}
                                            >
                                                <span className="agent-badge">⇥</span>
                                                {p.name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <span className="action-sep" />
                    <button
                        className="icon-action"
                        onClick={() => setTermLayout(nextLayout.id)}
                        data-tip={`Layout: ${LAYOUTS[layoutIdx].label} — click for ${nextLayout.label}`}
                    >
                        <Icon name={LAYOUTS[layoutIdx].icon} />
                    </button>
                    <span className="action-sep" />
                    <button
                        className="icon-action"
                        onClick={() => splitActive("row", SHELL)}
                        data-tip="Split right (Ctrl+Shift+\\)"
                        disabled={termLayout === "grid"}
                    >
                        <Icon name="splitH" />
                    </button>
                    <button
                        className="icon-action"
                        onClick={() => splitActive("col", SHELL)}
                        data-tip="Split down (Ctrl+Shift+-)"
                    >
                        <Icon name="splitV" />
                    </button>
                    <button
                        className={"icon-action" + (effectiveZoom ? " on" : "")}
                        onClick={() => toggleZoomPane()}
                        data-tip={
                            effectiveZoom
                                ? "Back to the split (Ctrl+Shift+Z)"
                                : "Zoom this pane (Ctrl+Shift+Z)"
                        }
                        disabled={termLayout !== "tabs" || !activeTab || collectLeaves(activeTab.root).length < 2}
                    >
                        <Icon name={effectiveZoom ? "collapse" : "expand"} />
                    </button>
                    <button
                        className="icon-action"
                        onClick={() => setFindOpen((v) => !v)}
                        data-tip="Find in terminal (Ctrl+Shift+F)"
                    >
                        <Icon name="search" />
                    </button>
                    <span className="action-sep" />
                    <div className="agent-menu-wrap">
                        <button
                            className="icon-action"
                            onClick={() => setToolsOpen((v) => !v)}
                            data-tip="More - record, recordings, worktrees, review changes"
                        >
                            <Icon name="more" />
                        </button>
                        {toolsOpen && (
                            <>
                                <div className="menu-backdrop" onClick={() => setToolsOpen(false)} />
                                <div className="agent-menu">
                                    <div className="agent-menu-row">
                                        <span
                                            className={
                                                "agent-menu-name" +
                                                (!!recordingTermId && !recordingActive
                                                    ? " disabled"
                                                    : "")
                                            }
                                            onClick={() => {
                                                if (!!recordingTermId && !recordingActive) return
                                                toggleRecord()
                                                setToolsOpen(false)
                                            }}
                                        >
                                            <Icon name="record" size={13} />
                                            {recordingActive ? "Stop recording" : "Record terminal"}
                                        </span>
                                    </div>
                                    <div className="agent-menu-row">
                                        <span
                                            className="agent-menu-name"
                                            onClick={() => {
                                                setRecordingsOpen(true)
                                                setToolsOpen(false)
                                            }}
                                        >
                                            <Icon name="play" size={14} />
                                            Recordings
                                        </span>
                                    </div>
                                    <div className="agent-menu-row">
                                        <span
                                            className="agent-menu-name"
                                            onClick={() => {
                                                setWorktreesOpen(true)
                                                setToolsOpen(false)
                                            }}
                                        >
                                            <Icon name="gitBranch" size={14} />
                                            Worktrees
                                        </span>
                                    </div>
                                    <div className="agent-menu-row">
                                        <span
                                            className="agent-menu-name"
                                            onClick={() => {
                                                openChanges(activeProject.path, activeProject.name)
                                                setToolsOpen(false)
                                            }}
                                        >
                                            <Icon name="check" size={14} />
                                            Review changes
                                        </span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
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
                        <button onClick={() => runFind(false)} data-tip="Previous">
                            ↑
                        </button>
                        <button onClick={() => runFind(true)} data-tip="Next">
                            ↓
                        </button>
                        <button onClick={() => setFindOpen(false)} data-tip="Close">
                            ×
                        </button>
                    </div>
                )}
                <div className={"stage-body" + (effectiveZoom ? " zooming" : "")}>
                    {termLayout === "overview" ? (
                        <OverviewView />
                    ) : tabs.length === 0 || !activeTab ? (
                        <CommandLauncher projectName={activeProject.name} />
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
                                                data-tip="Open in tabs view"
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
                                                data-tip="Close"
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
                            tabId={activeTab.id}
                            zoomedPane={effectiveZoom}
                        />
                    )}
                </div>
            </div>
            {composerOpen ? (
                <PromptComposer onClose={() => setComposerOpen(false)} />
            ) : hasAgentSession && composerDraft.trim() ? (
                // Only an UNSENT DRAFT earns a bar here. Talking to the agent in
                // front of you is what the terminal is for, so a permanent
                // "Write a prompt…" strip spent fixed height, and the frame's one
                // accent, advertising a composer whose real value (fan-out to
                // several sessions, @file, /snippet, image paste) is occasional.
                // A draft is different: it is state you would otherwise lose track
                // of, so its presence is the signal. Ctrl+Shift+I opens the
                // composer whether or not this bar is showing.
                <div
                    className="composer-launcher"
                    onClick={() => setComposerOpen(true)}
                    data-tip="Resume your prompt draft (Ctrl+Shift+I)"
                >
                    <span className="cl-icon"><Icon name="pencil" size={14} /></span>
                    <span className="cl-text">Resume your prompt draft…</span>
                    <span className="cl-draft">● draft</span>
                    <span className="cl-kbd">Ctrl+Shift+I</span>
                </div>
            ) : null}
        </div>
    )
}
