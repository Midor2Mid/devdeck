import { create } from "zustand"
import type { Project, WorkItem } from "../../preload/index"
import { useSettings } from "./settings"
import type { SavedRequest, PresetNode, PresetTab, ShellKind } from "./settings"
import {
    type LayoutNode,
    type SplitDir,
    leaf,
    splitLeaf,
    splitLeafWith,
    removeLeaf,
    collectLeaves,
    firstLeaf,
    hasLeaf
} from "./layout"
import type { PipelineRun, PipelineStepState } from "./pipeline"
import { runnableSteps, sessionPlan } from "./pipeline"
import { gateActive, evaluateGate, maxAttempts } from "./gate"
import { diffPrompt, type DiffAiKind } from "./diffai"
import { LENSES, reviewPrompt, type Lens } from "./reviewLenses"
import { recordTail, forgetTail } from "./missionTail"
import { parseChecklist, type BoardTask, type BoardColumn } from "./board"

/** An agent id is a preset id (e.g. "claude", "codex") or the literal "shell". */
export const SHELL = "shell"
export type MainView = "mission" | "tasks" | "terminal" | "editor" | "api" | "database" | "browser" | "network"
export type AgentStatus = "working" | "idle" | "attention"

export interface Tab {
    id: string
    name: string
    root: LayoutNode
}

export interface AppNotification {
    id: string
    termId: string
    text: string
}

export type ActivityKind = "start" | "attention" | "close" | "record" | "pipeline"
export interface ActivityEvent {
    id: string
    ts: number
    termId: string
    label: string
    kind: ActivityKind
}

export interface CanvasLink {
    a: string
    b: string
}

export interface AnySession {
    termId: string
    projectId: string
    projectName: string
    projectPath: string
    /** The owning tab's name. */
    tabName: string
    /** Display label for the session — a per-session rename, else the tab name. */
    sessionName: string
    agentId: string
    badge: string
    isAgent: boolean
    status: AgentStatus
}

/** The serializable slice persisted to workspace.json. */
interface Persisted {
    termAgents: Record<string, string>
    termInit: Record<string, string>
    /** Per-terminal working-dir override (e.g. a git worktree path). */
    termCwd: Record<string, string>
    /** Per-session display-name override, independent of the tab name. */
    termNames: Record<string, string>
    /** Per-terminal shell override (else the global default shell). */
    termShells: Record<string, ShellKind>
    tabsByProject: Record<string, Tab[]>
    activeTabByProject: Record<string, string | undefined>
    activePaneByProject: Record<string, string | undefined>
    composerDrafts: Record<string, string>
    view: MainView
    termLayout: TermLayout
    canvasPos: Record<string, CanvasPos>
    canvasLinks: CanvasLink[]
    boardTasks: BoardTask[]
}

export type TermLayout = "tabs" | "grid" | "canvas"

export interface CanvasPos {
    x: number
    y: number
}

interface AppState extends Persisted {
    projects: Project[]
    activeId: string | null
    init: () => Promise<void>
    addProject: () => Promise<void>
    removeProject: (id: string) => Promise<void>
    setActiveProject: (id: string) => Promise<void>
    setProjectGroup: (id: string, group: string) => Promise<void>
    setProjectMeta: (id: string, meta: { emoji?: string; color?: string }) => Promise<void>
    addProjectByPath: (path: string) => Promise<void>
    activeProject: () => Project | undefined

    view: MainView
    setView: (view: MainView) => void
    boardTasks: BoardTask[]
    addBoardTask: (projectId: string, title: string) => void
    moveBoardTask: (id: string, column: BoardColumn) => void
    removeBoardTask: (id: string) => void
    dispatchBoardTask: (id: string, opts: { worktree: boolean }) => Promise<void>
    flush: () => void
    termLayout: TermLayout
    setTermLayout: (layout: TermLayout) => void
    canvasPos: Record<string, CanvasPos>
    setCanvasPos: (termId: string, pos: CanvasPos) => void
    canvasLinks: CanvasLink[]
    toggleCanvasLink: (a: string, b: string) => void

    // Activity feed
    activity: ActivityEvent[]
    activityOpen: boolean
    setActivityOpen: (open: boolean) => void
    clearActivity: () => void

    // Agent inbox / triage drawer
    inboxOpen: boolean
    setInboxOpen: (open: boolean) => void

    // AI usage / activity dashboard
    usageOpen: boolean
    setUsageOpen: (open: boolean) => void

    // Per-project env-var editor (holds the project id being edited, or null)
    envEditorProject: string | null
    setEnvEditorProject: (projectId: string | null) => void

    // Per-project saved-commands editor (holds the project id being edited, or null)
    commandsEditorProject: string | null
    setCommandsEditorProject: (projectId: string | null) => void

    // Terminal record & replay (runtime-only)
    recordingTermId: string | null
    setRecordingTermId: (id: string | null) => void
    recordingsOpen: boolean
    setRecordingsOpen: (open: boolean) => void
    noteRecording: (termId: string, label: string) => void

    // Worktrees + change review (runtime-only)
    worktreesOpen: boolean
    setWorktreesOpen: (open: boolean) => void
    changesTarget: { cwd: string; label: string } | null
    openChanges: (cwd: string, label: string) => void
    closeChanges: () => void
    newAgentInWorktree: (agentId: string, branch: string) => Promise<string | undefined>
    aiOnDiff: (cwd: string, kind: DiffAiKind) => Promise<void>

    // Pull request composer
    prTarget: { cwd: string; label: string } | null
    openPr: (cwd: string, label: string) => void
    closePr: () => void

    // Work items (Jira / Azure DevOps)
    workOpen: boolean
    setWorkOpen: (open: boolean) => void
    startWork: (item: WorkItem, opts?: { worktree?: boolean }) => Promise<void>

    // Release board
    releaseOpen: boolean
    setReleaseOpen: (open: boolean) => void

    // Standup / worklog
    standupOpen: boolean
    setStandupOpen: (open: boolean) => void

    // Agent pipelines (runtime-only)
    pipelineRun: PipelineRun | null
    runPipeline: (pipelineId: string) => void
    stopPipeline: () => void
    fireTrigger: (triggerId: string) => void

    // Overlays / panels (runtime-only)
    switcherOpen: boolean
    openSwitcher: () => void
    closeSwitcher: () => void
    composerOpen: boolean
    setComposerOpen: (open: boolean) => void
    paletteOpen: boolean
    setPaletteOpen: (open: boolean) => void
    searchOpen: boolean
    setSearchOpen: (open: boolean) => void
    dotnetOpen: boolean
    setDotnetOpen: (open: boolean) => void
    reviewOpen: boolean
    setReviewOpen: (open: boolean) => void
    /** Spawn one agent session per lens to review the working-tree changes. */
    startReview: (lensIds: string[]) => Promise<void>
    shortcutsOpen: boolean
    setShortcutsOpen: (open: boolean) => void

    // Agent session awareness (runtime-only)
    agentStatus: Record<string, AgentStatus>
    lastAgentTermId: string | null
    notifications: AppNotification[]
    dismissNotification: (id: string) => void
    sessions: () => AnySession[]
    agentSessions: () => AnySession[]
    sendToAgent: (text: string) => boolean
    /** Send the same text to every given terminal (fire-to-many). */
    broadcast: (termIds: string[], text: string) => void
    setComposerDraft: (projectId: string, text: string) => void
    jumpToTerm: (termId: string) => void
    newTabIn: (projectId: string, agentId: string, initialCommand?: string) => void

    tabsFor: (projectId: string) => Tab[]
    activeTab: (projectId: string) => Tab | undefined
    activePane: (projectId: string) => string | undefined
    agentOf: (termId: string) => string
    /** The project a terminal belongs to (by its tab), or undefined. */
    projectIdOfTerm: (termId: string) => string | undefined

    newTab: (agentId: string, initialCommand?: string, label?: string, cwd?: string, shellKind?: ShellKind) => string | undefined
    splitActive: (dir: SplitDir, agentId: string) => void
    closePane: (termId: string) => void
    closeActivePane: () => void
    renameTab: (projectId: string, tabId: string, name: string) => void
    setActiveTab: (projectId: string, tabId: string) => void

    // Workspace presets (saved layouts) — stored in settings
    /** Rename a single session independently of its tab (empty clears the override). */
    renameSession: (termId: string, name: string) => void
    saveWorkspacePreset: (projectId: string) => void
    openWorkspacePreset: (presetId: string) => void
    deleteWorkspacePreset: (presetId: string) => void

    // Cross-panel drag (runtime-only): text a dragged file/table carries to an agent.
    dragPayload: string | null
    setDragPayload: (text: string | null) => void

    // A request handed from the Network panel to the API client to load (runtime-only).
    pendingApiRequest: SavedRequest | null
    setPendingApiRequest: (req: SavedRequest | null) => void

    // A file+line handed from cross-project search to the editor to open (runtime-only).
    pendingEditorOpen: { path: string; line?: number } | null
    openInEditor: (projectId: string, path: string, line?: number) => void
    clearPendingEditorOpen: () => void

    // Tab drag-and-drop (runtime-only)
    draggingTabId: string | null
    setDraggingTabId: (id: string | null) => void
    reorderTabs: (projectId: string, fromTabId: string, toTabId: string) => void
    moveTabToPane: (
        projectId: string,
        sourceTabId: string,
        targetPaneId: string,
        dir: SplitDir,
        side: "before" | "after"
    ) => void
    focusPane: (projectId: string, termId: string) => void
    cycleTab: (dir: 1 | -1) => void
}

function newId(): string {
    return crypto.randomUUID()
}

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
let dataSubscribed = false
// Bumped on stop / new run; the async runner aborts when its token goes stale.
let pipelineToken = 0
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function isAgentId(agentId: string): boolean {
    return !!agentId && agentId !== SHELL
}

function badgeFor(agentId: string): string {
    if (!isAgentId(agentId)) return ""
    return useSettings.getState().agentById(agentId)?.badge ?? agentId.toUpperCase()
}

export const useStore = create<AppState>((set, get) => {
    // Debounced disk persistence - coalesces bursts (e.g. composer keystrokes).
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    const writeNow = (): void => {
        const s = get()
        window.api.workspace.save({
            termAgents: s.termAgents,
            termInit: s.termInit,
            termCwd: s.termCwd,
            termNames: s.termNames,
            termShells: s.termShells,
            tabsByProject: s.tabsByProject,
            activeTabByProject: s.activeTabByProject,
            activePaneByProject: s.activePaneByProject,
            composerDrafts: s.composerDrafts,
            view: s.view,
            termLayout: s.termLayout,
            canvasPos: s.canvasPos,
            canvasLinks: s.canvasLinks,
            boardTasks: s.boardTasks
        } satisfies Persisted)
    }
    const persist = (): void => {
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(writeNow, 300)
    }

    const setStatus = (termId: string, status: AgentStatus): void => {
        if (get().agentStatus[termId] === status) return
        set((s) => ({ agentStatus: { ...s.agentStatus, [termId]: status } }))
    }

    const ack = (termId?: string): void => {
        if (!termId || !isAgentId(get().agentOf(termId))) return
        set((s) => ({
            lastAgentTermId: termId,
            agentStatus:
                s.agentStatus[termId] === "attention"
                    ? { ...s.agentStatus, [termId]: "idle" }
                    : s.agentStatus,
            // Acknowledging a session clears its pending notification.
            notifications: s.notifications.filter((n) => n.termId !== termId)
        }))
    }

    const isVisible = (termId: string): boolean => {
        const s = get()
        return s.view === "terminal" && !!s.activeId && s.activePaneByProject[s.activeId] === termId
    }

    const labelForTerm = (termId: string): string => {
        const s = get()
        for (const [pid, tabs] of Object.entries(s.tabsByProject)) {
            const tab = tabs.find((t) => hasLeaf(t.root, termId))
            if (tab) {
                const project = s.projects.find((p) => p.id === pid)
                return `${tab.name} · ${project?.name ?? "-"}`
            }
        }
        return "agent session"
    }

    // A short audible beep via Web Audio (no asset).
    const beep = (): void => {
        try {
            const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
            const ctx = new Ctx()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.value = 660
            gain.gain.value = 0.05
            osc.start()
            osc.stop(ctx.currentTime + 0.12)
            setTimeout(() => void ctx.close(), 300)
        } catch {
            /* audio unavailable - ignore */
        }
    }

    // Fire a desktop notification / sound when an agent needs attention, per settings.
    const notifyAttention = (termId: string): void => {
        const cfg = useSettings.getState().notifications
        if (cfg.desktop && typeof Notification !== "undefined") {
            try {
                const n = new Notification("DevDeck", { body: `${labelForTerm(termId)} needs attention` })
                n.onclick = () => {
                    window.focus()
                    get().jumpToTerm(termId)
                }
            } catch {
                /* notifications unavailable - ignore */
            }
        }
        if (cfg.sound) beep()
    }

    const pushNotification = (termId: string): void => {
        if (get().notifications.some((n) => n.termId === termId)) return
        set((s) => ({
            notifications: [
                ...s.notifications,
                { id: newId(), termId, text: `${labelForTerm(termId)} needs attention` }
            ]
        }))
    }

    const pushActivity = (kind: ActivityKind, termId: string, label?: string): void => {
        set((s) => ({
            activity: [
                { id: newId(), ts: Date.now(), termId, label: label ?? labelForTerm(termId), kind },
                ...s.activity
            ].slice(0, 200)
        }))
    }

    const onPtyData = ({ id, data }: { id: string; data: string }): void => {
        if (!isAgentId(get().agentOf(id))) return
        // Keep a cleaned tail of this agent's output for the Mission Control peek.
        recordTail(id, data)
        const visible = isVisible(id)
        if (data.includes("\x07") && !visible) {
            const was = get().agentStatus[id]
            setStatus(id, "attention")
            if (was !== "attention") {
                pushNotification(id)
                pushActivity("attention", id)
                notifyAttention(id)
            }
            return
        }
        if (get().agentStatus[id] !== "attention" || visible) setStatus(id, "working")
        const existing = idleTimers.get(id)
        if (existing) clearTimeout(existing)
        idleTimers.set(
            id,
            setTimeout(
                () => {
                    if (get().agentStatus[id] === "working") {
                        setStatus(id, "idle")
                        // A dispatched task whose agent just finished a turn is ready to review.
                        set((s) => ({
                            boardTasks: s.boardTasks.map((t) =>
                                t.termId === id && t.column === "doing" ? { ...t, column: "review" } : t
                            )
                        }))
                    }
                },
                useSettings.getState().agentIdleMs
            )
        )
    }

    const forget = (termId: string): void => {
        const t = idleTimers.get(termId)
        if (t) clearTimeout(t)
        idleTimers.delete(termId)
        forgetTail(termId)
        if (isAgentId(get().termAgents[termId] ?? SHELL)) useSettings.getState().logUsageEnd(termId)
        set((s) => {
            const agentStatus = { ...s.agentStatus }
            delete agentStatus[termId]
            const termInit = { ...s.termInit }
            delete termInit[termId]
            const termAgents = { ...s.termAgents }
            delete termAgents[termId]
            const termCwd = { ...s.termCwd }
            delete termCwd[termId]
            const termNames = { ...s.termNames }
            delete termNames[termId]
            const termShells = { ...s.termShells }
            delete termShells[termId]
            const canvasPos = { ...s.canvasPos }
            delete canvasPos[termId]
            return {
                agentStatus,
                termInit,
                termAgents,
                termCwd,
                termNames,
                termShells,
                canvasPos,
                canvasLinks: s.canvasLinks.filter((l) => l.a !== termId && l.b !== termId),
                lastAgentTermId: s.lastAgentTermId === termId ? null : s.lastAgentTermId
            }
        })
    }

    const buildSessions = (agentsOnly: boolean): AnySession[] => {
        const s = get()
        const out: AnySession[] = []
        for (const [pid, tabs] of Object.entries(s.tabsByProject)) {
            const project = s.projects.find((p) => p.id === pid)
            for (const tab of tabs) {
                for (const termId of collectLeaves(tab.root)) {
                    const agentId = s.termAgents[termId] ?? SHELL
                    const agent = isAgentId(agentId)
                    if (agentsOnly && !agent) continue
                    out.push({
                        termId,
                        projectId: pid,
                        projectName: project?.name ?? "-",
                        projectPath: project?.path ?? "",
                        tabName: tab.name,
                        sessionName: s.termNames[termId] ?? tab.name,
                        agentId,
                        badge: badgeFor(agentId),
                        isAgent: agent,
                        status: agent ? (s.agentStatus[termId] ?? "idle") : "idle"
                    })
                }
            }
        }
        return out
    }

    return {
        projects: [],
        activeId: null,
        termAgents: {},
        termInit: {},
        termCwd: {},
        termNames: {},
        termShells: {},
        tabsByProject: {},
        activeTabByProject: {},
        activePaneByProject: {},
        composerDrafts: {},
        view: "mission",
        termLayout: "tabs",
        canvasPos: {},
        canvasLinks: [],
        boardTasks: [],
        activity: [],
        activityOpen: false,
        inboxOpen: false,
        usageOpen: false,
        envEditorProject: null,
        commandsEditorProject: null,
        recordingTermId: null,
        recordingsOpen: false,
        worktreesOpen: false,
        changesTarget: null,
        prTarget: null,
        workOpen: false,
        releaseOpen: false,
        standupOpen: false,
        pipelineRun: null,
        switcherOpen: false,
        composerOpen: false,
        paletteOpen: false,
        searchOpen: false,
        dotnetOpen: false,
        reviewOpen: false,
        shortcutsOpen: false,
        draggingTabId: null,
        dragPayload: null,
        pendingApiRequest: null,
        pendingEditorOpen: null,
        agentStatus: {},
        lastAgentTermId: null,
        notifications: [],
        dismissNotification: (id) =>
            set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

        init: async () => {
            if (!dataSubscribed) {
                window.api.pty.onData(onPtyData)
                window.api.triggers.onFired(({ triggerId }) => get().fireTrigger(triggerId))
                dataSubscribed = true
            }
            const [store, ws] = await Promise.all([
                window.api.projects.list(),
                window.api.workspace.load()
            ])
            const w = (ws as (Partial<Persisted> & { termKinds?: Record<string, string> }) | null) ?? {}
            set({
                projects: store.projects,
                activeId: store.activeId,
                // Migrate the old termKinds → termAgents if present.
                termAgents: w.termAgents ?? w.termKinds ?? {},
                termInit: w.termInit ?? {},
                termCwd: w.termCwd ?? {},
                termNames: w.termNames ?? {},
                termShells: w.termShells ?? {},
                tabsByProject: w.tabsByProject ?? {},
                activeTabByProject: w.activeTabByProject ?? {},
                activePaneByProject: w.activePaneByProject ?? {},
                composerDrafts: w.composerDrafts ?? {},
                view: w.view ?? "mission",
                termLayout: w.termLayout ?? "tabs",
                canvasPos: w.canvasPos ?? {},
                canvasLinks: w.canvasLinks ?? [],
                boardTasks: w.boardTasks ?? []
            })
        },

        addProject: async () => {
            const store = await window.api.projects.add()
            set({ projects: store.projects, activeId: store.activeId })
        },

        removeProject: async (id) => {
            const s = get()
            for (const tab of s.tabsByProject[id] ?? []) {
                for (const termId of collectLeaves(tab.root)) {
                    window.api.pty.kill(termId)
                    forget(termId)
                }
            }
            const tabsByProject = { ...get().tabsByProject }
            delete tabsByProject[id]
            const activeTabByProject = { ...s.activeTabByProject }
            delete activeTabByProject[id]
            const activePaneByProject = { ...s.activePaneByProject }
            delete activePaneByProject[id]
            const store = await window.api.projects.remove(id)
            set({
                projects: store.projects,
                activeId: store.activeId,
                tabsByProject,
                activeTabByProject,
                activePaneByProject
            })
            persist()
        },

        setActiveProject: async (id) => {
            set({ activeId: id })
            await window.api.projects.setActive(id)
            ack(get().activePaneByProject[id])
        },

        setProjectGroup: async (id, group) => {
            const store = await window.api.projects.setGroup(id, group)
            set({ projects: store.projects })
        },

        setProjectMeta: async (id, meta) => {
            const store = await window.api.projects.setMeta(id, meta)
            set({ projects: store.projects })
        },

        addProjectByPath: async (path) => {
            const store = await window.api.projects.addPath(path)
            set({ projects: store.projects, activeId: store.activeId })
        },

        openSwitcher: () => set({ switcherOpen: true }),
        closeSwitcher: () => set({ switcherOpen: false }),
        setComposerOpen: (composerOpen) => set({ composerOpen }),
        setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
        setSearchOpen: (searchOpen) => set({ searchOpen }),
        setDotnetOpen: (dotnetOpen) => set({ dotnetOpen }),
        setReviewOpen: (reviewOpen) => set({ reviewOpen }),
        setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

        activeProject: () => get().projects.find((p) => p.id === get().activeId),

        setView: (view) => {
            set({ view })
            if (view === "terminal" && get().activeId) ack(get().activePaneByProject[get().activeId as string])
            persist()
        },

        addBoardTask: (projectId, title) => {
            const titles = parseChecklist(title)
            if (titles.length === 0) return
            const now = Date.now()
            const created: BoardTask[] = titles.map((t) => ({
                id: newId(),
                projectId,
                title: t,
                column: "todo",
                createdAt: now
            }))
            set((s) => ({ boardTasks: [...s.boardTasks, ...created] }))
            persist()
        },
        moveBoardTask: (id, column) => {
            set((s) => ({ boardTasks: s.boardTasks.map((t) => (t.id === id ? { ...t, column } : t)) }))
            persist()
        },
        removeBoardTask: (id) => {
            set((s) => ({ boardTasks: s.boardTasks.filter((t) => t.id !== id) }))
            persist()
        },
        dispatchBoardTask: async (id, opts) => {
            const task = get().boardTasks.find((t) => t.id === id)
            if (!task) return
            const proj = get().projects.find((p) => p.id === task.projectId)
            if (!proj) return
            const agentId = useSettings.getState().agents[0]?.id ?? "claude"
            // newTab spawns into the active project — make sure it's this task's.
            await get().setActiveProject(proj.id)

            let worktreePath: string | undefined
            if (opts.worktree) {
                const res = await window.api.git.worktreeAdd(proj.path, task.title)
                if (!res.ok || !res.path) {
                    pushActivity("attention", "", `worktree failed: ${res.error ?? "error"}`)
                    return
                }
                worktreePath = res.path
            }
            const label = "task " + task.title.slice(0, 24)
            const termId = get().newTab(agentId, undefined, label, worktreePath)
            if (!termId) return
            set((s) => ({
                boardTasks: s.boardTasks.map((t) =>
                    t.id === id ? { ...t, column: "doing", termId, worktree: worktreePath } : t
                )
            }))
            persist()
            // Let the agent CLI boot, then send the task as its first prompt.
            await sleep(2800)
            window.api.pty.input(termId, task.title + "\r")
            set({ lastAgentTermId: termId })
        },
        flush: () => {
            if (persistTimer) {
                clearTimeout(persistTimer)
                persistTimer = null
            }
            writeNow()
        },
        setTermLayout: (layout) => {
            set({ termLayout: layout })
            persist()
        },
        setCanvasPos: (termId, pos) => {
            set((s) => ({ canvasPos: { ...s.canvasPos, [termId]: pos } }))
            persist()
        },
        toggleCanvasLink: (a, b) => {
            if (a === b) return
            set((s) => {
                const exists = s.canvasLinks.some(
                    (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)
                )
                return {
                    canvasLinks: exists
                        ? s.canvasLinks.filter(
                              (l) => !((l.a === a && l.b === b) || (l.a === b && l.b === a))
                          )
                        : [...s.canvasLinks, { a, b }]
                }
            })
            persist()
        },
        setActivityOpen: (activityOpen) => set({ activityOpen }),
        clearActivity: () => set({ activity: [] }),
        setInboxOpen: (inboxOpen) => set({ inboxOpen }),
        setUsageOpen: (usageOpen) => set({ usageOpen }),
        setEnvEditorProject: (envEditorProject) => set({ envEditorProject }),
        setCommandsEditorProject: (commandsEditorProject) => set({ commandsEditorProject }),

        renameSession: (termId, name) => {
            const trimmed = name.trim()
            set((s) => {
                const termNames = { ...s.termNames }
                if (trimmed) termNames[termId] = trimmed
                else delete termNames[termId]
                return { termNames }
            })
            persist()
        },
        setRecordingTermId: (recordingTermId) => set({ recordingTermId }),
        setRecordingsOpen: (recordingsOpen) => set({ recordingsOpen }),
        noteRecording: (termId, label) => pushActivity("record", termId, label),

        setWorktreesOpen: (worktreesOpen) => set({ worktreesOpen }),
        openChanges: (cwd, label) => set({ changesTarget: { cwd, label } }),
        closeChanges: () => set({ changesTarget: null }),

        newAgentInWorktree: async (agentId, branch) => {
            const proj = get().activeProject()
            if (!proj) return undefined
            const res = await window.api.git.worktreeAdd(proj.path, branch)
            if (!res.ok || !res.path) {
                pushNotification(get().lastAgentTermId ?? "")
                pushActivity("close", get().lastAgentTermId ?? "", `worktree failed: ${res.error ?? "error"}`)
                return undefined
            }
            // Spawn the agent with its cwd pinned to the new worktree.
            const termId = get().newTab(agentId, undefined, res.branch, res.path)
            if (termId) pushActivity("start", termId, `${res.branch} · worktree`)
            set({ worktreesOpen: false })
            return termId
        },

        aiOnDiff: async (cwd, kind) => {
            const agentId = useSettings.getState().agents[0]?.id ?? "claude"
            const diff = await window.api.git.fullDiff(cwd)
            const prompt = diffPrompt(kind, diff)
            const label = { review: "review", explain: "explain", commit: "commit msg", pr: "PR desc" }[kind]
            const termId = get().newTab(agentId, undefined, label, cwd)
            if (!termId) return
            set({ changesTarget: null })
            await sleep(2800)
            window.api.pty.input(termId, prompt + "\r")
            set({ lastAgentTermId: termId })
        },

        openPr: (cwd, label) => set({ prTarget: { cwd, label } }),
        closePr: () => set({ prTarget: null }),

        setWorkOpen: (workOpen) => set({ workOpen }),
        setReleaseOpen: (releaseOpen) => set({ releaseOpen }),
        setStandupOpen: (standupOpen) => set({ standupOpen }),

        startReview: async (lensIds) => {
            const proj = get().activeProject()
            if (!proj) return
            const lenses = LENSES.filter((l) => lensIds.includes(l.id))
            if (lenses.length === 0) return
            const agentId = useSettings.getState().agents[0]?.id ?? "claude"
            // Grid layout so every lens reviewer is visible at once.
            get().setTermLayout("grid")
            const spawned: { termId: string; lens: Lens }[] = []
            for (const lens of lenses) {
                const termId = get().newTab(agentId, undefined, `review:${lens.id}`)
                if (termId) spawned.push({ termId, lens })
            }
            set({ reviewOpen: false, view: "terminal" })
            // Let each freshly-spawned agent CLI boot before typing its prompt.
            await sleep(2800)
            for (const { termId, lens } of spawned) {
                window.api.pty.input(termId, reviewPrompt(lens) + "\r")
            }
            if (spawned.length) set({ lastAgentTermId: spawned[spawned.length - 1].termId })
        },

        startWork: async (item, opts) => {
            const proj = get().activeProject()
            if (!proj) {
                pushActivity("attention", "", "Pick a project before starting work")
                return
            }
            const agentId = useSettings.getState().agents[0]?.id ?? "claude"
            const brief =
                `I'm starting work on ${item.key}: ${item.title}\n` +
                `Type: ${item.type}${item.status ? ` · Status: ${item.status}` : ""}\n` +
                `Link: ${item.url}\n\n` +
                (item.description ? item.description + "\n\n" : "") +
                `Please investigate this ticket first: find the relevant code and the root cause, ` +
                `then propose a short plan before changing anything. Don't edit until I confirm the plan.`

            let termId: string | undefined
            if (opts?.worktree) {
                const res = await window.api.git.worktreeAdd(proj.path, `${item.key} ${item.title}`)
                if (!res.ok || !res.path) {
                    pushActivity("attention", "", `worktree failed: ${res.error ?? "error"}`)
                    return
                }
                termId = get().newTab(agentId, undefined, item.key, res.path)
            } else {
                termId = get().newTab(agentId, undefined, item.key)
            }
            if (!termId) return
            set({ workOpen: false, composerDrafts: { ...get().composerDrafts, [proj.id]: "" } })
            pushActivity("start", termId, `${item.key} · ${item.title}`.slice(0, 80))
            // Wait for the agent CLI to boot, then send the ticket brief as its first prompt.
            await sleep(2800)
            window.api.pty.input(termId, brief + "\r")
            set({ lastAgentTermId: termId })
        },

        fireTrigger: (triggerId) => {
            const trig = useSettings.getState().triggers.find((t) => t.id === triggerId && t.enabled)
            if (!trig) return
            // Don't stomp a run already in progress.
            const run = get().pipelineRun
            if (run && (run.status === "running" || run.status === "waiting")) return
            const proj = get().projects.find((p) => p.path === trig.projectPath)
            if (!proj) return
            if (get().activeId !== proj.id) {
                set({ activeId: proj.id })
                window.api.projects.setActive(proj.id)
            }
            pushActivity("pipeline", get().lastAgentTermId ?? "", `${trig.glob || "any file"} changed · triggered`)
            get().runPipeline(trig.pipelineId)
        },

        stopPipeline: () => {
            pipelineToken += 1
            set((s) => (s.pipelineRun ? { pipelineRun: { ...s.pipelineRun, status: "stopped" } } : {}))
            setTimeout(() => {
                if (get().pipelineRun?.status === "stopped") set({ pipelineRun: null })
            }, 2500)
        },

        runPipeline: (pipelineId) => {
            const pipeline = useSettings.getState().pipelines.find((p) => p.id === pipelineId)
            if (!pipeline || !get().activeId) return
            const steps = runnableSteps(pipeline)
            if (steps.length === 0) return

            pipelineToken += 1
            const token = pipelineToken
            const stale = (): boolean => token !== pipelineToken

            const setRun = (patch: Partial<PipelineRun>): void =>
                set((s) => ({ pipelineRun: s.pipelineRun ? { ...s.pipelineRun, ...patch } : s.pipelineRun }))

            // Patch one step's state in the run timeline.
            const setStep = (i: number, patch: Partial<PipelineStepState>): void =>
                set((s) =>
                    s.pipelineRun
                        ? {
                              pipelineRun: {
                                  ...s.pipelineRun,
                                  steps: s.pipelineRun.steps.map((st, idx) =>
                                      idx === i ? { ...st, ...patch } : st
                                  )
                              }
                          }
                        : s
                )
            // Mark any still-pending steps from `from` onward as skipped (early exit).
            const skipFrom = (from: number): void =>
                set((s) =>
                    s.pipelineRun
                        ? {
                              pipelineRun: {
                                  ...s.pipelineRun,
                                  steps: s.pipelineRun.steps.map((st, idx) =>
                                      idx >= from && st.status === "pending"
                                          ? { ...st, status: "skipped" }
                                          : st
                                  )
                              }
                          }
                        : s
                )

            // Wait until an agent term has settled: seen working, then idle for a beat.
            const waitForIdle = async (termId: string): Promise<"idle" | "stopped" | "gone"> => {
                const start = Date.now()
                let sawWork = false
                for (;;) {
                    if (stale()) return "stopped"
                    if (!get().termAgents[termId]) return "gone"
                    const st = get().agentStatus[termId]
                    if (st === "working") sawWork = true
                    if (st === "attention") setRun({ status: "waiting" })
                    else if (get().pipelineRun?.status === "waiting") setRun({ status: "running" })
                    const elapsed = Date.now() - start
                    // Require either observed work or a minimum grace, then a stable idle.
                    if (st === "idle" && (sawWork || elapsed > 4000) && elapsed > 1500) return "idle"
                    await sleep(300)
                }
            }

            set({
                pipelineRun: {
                    pipelineId,
                    name: pipeline.name,
                    stepIndex: 0,
                    total: steps.length,
                    stepTitle: steps[0].title,
                    status: "running",
                    steps: steps.map((s) => ({
                        title: s.title,
                        agentId: s.agentId,
                        status: "pending" as const
                    }))
                }
            })
            pushActivity("pipeline", get().lastAgentTermId ?? "", `${pipeline.name} · started`)

            void (async () => {
                const liveByAgent: Record<string, string | undefined> = {}
                for (let i = 0; i < steps.length; i++) {
                    if (stale()) return
                    const step = steps[i]
                    setRun({ stepIndex: i, stepTitle: step.title, status: "running", gateMsg: undefined })
                    setStep(i, { status: "running" })

                    // Resolve the session once per step; retries reuse it.
                    const plan = sessionPlan(step, liveByAgent)
                    let termId = plan.termId
                    if (!plan.reuse || !termId) {
                        termId = get().newTab(step.agentId)
                        if (!termId) {
                            setStep(i, { status: "failed", gateMsg: "no session" })
                            skipFrom(i + 1)
                            setRun({ status: "error" })
                            return
                        }
                        liveByAgent[step.agentId] = termId
                        // Give the freshly-spawned agent CLI time to boot before typing.
                        await sleep(2800)
                        if (stale()) return
                    } else {
                        get().jumpToTerm(termId)
                    }
                    setStep(i, { termId })

                    const attempts = maxAttempts(step.gate)
                    let passed = true
                    for (let attempt = 1; attempt <= attempts; attempt++) {
                        if (stale()) return
                        if (attempt > 1)
                            setRun({ status: "running", gateMsg: `retry ${attempt - 1}/${attempts - 1}` })

                        // Capture this attempt's output (capped tail) for gating.
                        let buf = ""
                        const off = window.api.pty.onData(({ id, data }) => {
                            if (id !== termId) return
                            buf += data
                            if (buf.length > 200_000) buf = buf.slice(buf.length - 200_000)
                        })
                        window.api.pty.input(termId, step.prompt + "\r")
                        set({ lastAgentTermId: termId })
                        await sleep(600)
                        const result = await waitForIdle(termId)
                        off()
                        if (result === "stopped") return

                        if (!gateActive(step.gate)) {
                            passed = true
                            setStep(i, { status: "done" })
                            break
                        }
                        passed = evaluateGate(step.gate, buf)
                        if (passed) {
                            setRun({ gateMsg: "✓ gate passed" })
                            setStep(i, { status: "done", gateMsg: "✓ gate passed" })
                            pushActivity("pipeline", termId, `${step.title} · gate passed`)
                            break
                        }
                        if (attempt < attempts) {
                            setRun({ gateMsg: `✗ gate failed - retrying (${attempt}/${attempts - 1})` })
                            pushActivity("pipeline", termId, `${step.title} · gate failed, retrying`)
                            await sleep(800)
                        }
                    }

                    if (!passed) {
                        const onFail = step.gate?.onFail ?? "stop"
                        pushActivity("pipeline", termId, `${step.title} · gate failed`)
                        if (onFail === "stop") {
                            setStep(i, { status: "failed", gateMsg: "✗ gate failed - stopped" })
                            skipFrom(i + 1)
                            setRun({ status: "error", gateMsg: "✗ gate failed - stopped" })
                            return
                        }
                        setStep(i, { status: "failed", gateMsg: "✗ gate failed - continued" })
                        setRun({ gateMsg: "✗ gate failed - continued" })
                    }
                }
                if (stale()) return
                setRun({ status: "done" })
                pushActivity("pipeline", get().lastAgentTermId ?? "", `${pipeline.name} · done`)
                setTimeout(() => {
                    if (get().pipelineRun?.status === "done" && token === pipelineToken)
                        set({ pipelineRun: null })
                }, 4000)
            })()
        },

        sessions: () => buildSessions(false),
        agentSessions: () => buildSessions(true),

        sendToAgent: (text) => {
            const id = get().lastAgentTermId
            if (!id) return false
            window.api.pty.input(id, text)
            return true
        },

        broadcast: (termIds, text) => {
            for (const id of termIds) window.api.pty.input(id, text)
            // Keep the focused-agent notion coherent after a fan-out.
            if (termIds.length) set({ lastAgentTermId: termIds[termIds.length - 1] })
        },

        setComposerDraft: (projectId, text) => {
            set((s) => ({ composerDrafts: { ...s.composerDrafts, [projectId]: text } }))
            persist()
        },

        jumpToTerm: (termId) => {
            const s = get()
            for (const [pid, tabs] of Object.entries(s.tabsByProject)) {
                const tab = tabs.find((t) => hasLeaf(t.root, termId))
                if (!tab) continue
                set({
                    activeId: pid,
                    view: "terminal",
                    activeTabByProject: { ...s.activeTabByProject, [pid]: tab.id },
                    activePaneByProject: { ...s.activePaneByProject, [pid]: termId }
                })
                window.api.projects.setActive(pid)
                ack(termId)
                persist()
                return
            }
        },

        newTabIn: (projectId, agentId, initialCommand) => {
            set({ activeId: projectId })
            window.api.projects.setActive(projectId)
            get().newTab(agentId, initialCommand)
        },

        tabsFor: (projectId) => get().tabsByProject[projectId] ?? [],
        activeTab: (projectId) => {
            const tabs = get().tabsByProject[projectId] ?? []
            const activeId = get().activeTabByProject[projectId]
            return tabs.find((t) => t.id === activeId) ?? tabs[0]
        },
        activePane: (projectId) => get().activePaneByProject[projectId],
        agentOf: (termId) => get().termAgents[termId] ?? SHELL,
        projectIdOfTerm: (termId) => {
            for (const [pid, tabs] of Object.entries(get().tabsByProject))
                if (tabs.some((t) => hasLeaf(t.root, termId))) return pid
            return undefined
        },

        newTab: (agentId, initialCommand, label, cwd, shellKind) => {
            const projectId = get().activeId
            if (!projectId) return undefined
            const termId = newId()
            const tabId = newId()
            const count = (get().tabsByProject[projectId] ?? []).length + 1
            const preset = isAgentId(agentId) ? useSettings.getState().agentById(agentId) : undefined
            const baseLabel = label ?? (preset ? preset.name.toLowerCase() : "shell")
            // Agents default to their command; a shell only runs an explicit command (e.g. ssh).
            const init = isAgentId(agentId)
                ? (initialCommand ?? preset?.command ?? agentId)
                : initialCommand
            const tab: Tab = { id: tabId, name: `${baseLabel} ${count}`, root: leaf(termId) }
            set((s) => ({
                termAgents: { ...s.termAgents, [termId]: agentId },
                termInit: init ? { ...s.termInit, [termId]: init } : s.termInit,
                termCwd: cwd ? { ...s.termCwd, [termId]: cwd } : s.termCwd,
                termShells:
                    !isAgentId(agentId) && shellKind
                        ? { ...s.termShells, [termId]: shellKind }
                        : s.termShells,
                agentStatus: isAgentId(agentId)
                    ? { ...s.agentStatus, [termId]: "working" }
                    : s.agentStatus,
                tabsByProject: {
                    ...s.tabsByProject,
                    [projectId]: [...(s.tabsByProject[projectId] ?? []), tab]
                },
                activeTabByProject: { ...s.activeTabByProject, [projectId]: tabId },
                activePaneByProject: { ...s.activePaneByProject, [projectId]: termId },
                lastAgentTermId: isAgentId(agentId) ? termId : s.lastAgentTermId,
                view: "terminal"
            }))
            if (isAgentId(agentId)) {
                pushActivity("start", termId, `${tab.name} · started`)
                useSettings.getState().logUsageStart(termId, agentId, projectId)
            }
            persist()
            return termId
        },

        splitActive: (dir, agentId) => {
            const s = get()
            const projectId = s.activeId
            if (!projectId) return
            const tab = s.activeTab(projectId)
            if (!tab) return
            const target = s.activePane(projectId) ?? firstLeaf(tab.root)
            const newTermId = newId()
            const preset = isAgentId(agentId) ? useSettings.getState().agentById(agentId) : undefined
            const root = splitLeaf(tab.root, target, dir, newTermId)
            const tabs = (s.tabsByProject[projectId] ?? []).map((t) =>
                t.id === tab.id ? { ...t, root } : t
            )
            set({
                termAgents: { ...s.termAgents, [newTermId]: agentId },
                termInit: preset
                    ? { ...s.termInit, [newTermId]: preset.command }
                    : s.termInit,
                agentStatus: isAgentId(agentId)
                    ? { ...s.agentStatus, [newTermId]: "working" }
                    : s.agentStatus,
                tabsByProject: { ...s.tabsByProject, [projectId]: tabs },
                activePaneByProject: { ...s.activePaneByProject, [projectId]: newTermId },
                lastAgentTermId: isAgentId(agentId) ? newTermId : s.lastAgentTermId
            })
            if (isAgentId(agentId))
                useSettings.getState().logUsageStart(newTermId, agentId, projectId)
            persist()
        },

        closePane: (termId) => {
            const s = get()
            if (isAgentId(s.agentOf(termId))) pushActivity("close", termId)
            let ownerProject: string | undefined
            let ownerTab: Tab | undefined
            for (const [pid, tabs] of Object.entries(s.tabsByProject)) {
                const t = tabs.find((tab) => hasLeaf(tab.root, termId))
                if (t) {
                    ownerProject = pid
                    ownerTab = t
                    break
                }
            }
            // If this pane was recording, persist the recording before it dies.
            if (s.recordingTermId === termId) {
                const path = s.projects.find((p) => p.id === ownerProject)?.path
                if (path) window.api.rec.stop(termId, path, ownerTab?.name ?? "session")
                set({ recordingTermId: null })
            }
            window.api.pty.kill(termId)
            forget(termId)
            if (!ownerProject || !ownerTab) return

            const newRoot = removeLeaf(ownerTab.root, termId)
            const tabsByProject = { ...get().tabsByProject }
            const activeTabByProject = { ...s.activeTabByProject }
            const activePaneByProject = { ...s.activePaneByProject }

            if (newRoot === null) {
                const remaining = (tabsByProject[ownerProject] ?? []).filter(
                    (t) => t.id !== ownerTab!.id
                )
                tabsByProject[ownerProject] = remaining
                if (activeTabByProject[ownerProject] === ownerTab.id) {
                    const next = remaining[0]
                    activeTabByProject[ownerProject] = next?.id
                    activePaneByProject[ownerProject] = next ? firstLeaf(next.root) : undefined
                }
            } else {
                tabsByProject[ownerProject] = (tabsByProject[ownerProject] ?? []).map((t) =>
                    t.id === ownerTab!.id ? { ...t, root: newRoot } : t
                )
                if (activePaneByProject[ownerProject] === termId) {
                    activePaneByProject[ownerProject] = firstLeaf(newRoot)
                }
            }
            set({ tabsByProject, activeTabByProject, activePaneByProject })
            persist()
        },

        closeActivePane: () => {
            const s = get()
            const projectId = s.activeId
            if (!projectId) return
            const pane = s.activePane(projectId)
            if (pane) s.closePane(pane)
        },

        renameTab: (projectId, tabId, name) => {
            set((s) => ({
                tabsByProject: {
                    ...s.tabsByProject,
                    [projectId]: (s.tabsByProject[projectId] ?? []).map((t) =>
                        t.id === tabId ? { ...t, name: name || t.name } : t
                    )
                }
            }))
            persist()
        },

        setActiveTab: (projectId, tabId) => {
            const s = get()
            const tab = (s.tabsByProject[projectId] ?? []).find((t) => t.id === tabId)
            const pane = tab ? firstLeaf(tab.root) : undefined
            set({
                activeTabByProject: { ...s.activeTabByProject, [projectId]: tabId },
                activePaneByProject: { ...s.activePaneByProject, [projectId]: pane }
            })
            ack(pane)
            persist()
        },

        // Snapshot the active project's layout (tabs/splits + each pane's agent +
        // launch command) as a named preset.
        saveWorkspacePreset: (projectId) => {
            const tabs = get().tabsByProject[projectId] ?? []
            if (tabs.length === 0) return
            const s = get()
            const toPreset = (n: LayoutNode): PresetNode =>
                n.kind === "leaf"
                    ? { kind: "leaf", agentId: s.termAgents[n.termId] ?? SHELL, init: s.termInit[n.termId] }
                    : { kind: "split", dir: n.dir, children: n.children.map(toPreset) }
            const presetTabs: PresetTab[] = tabs.map((t) => ({ name: t.name, root: toPreset(t.root) }))
            const all = useSettings.getState().workspacePresets
            const count = all.filter((p) => p.projectId === projectId).length + 1
            useSettings.getState().setWorkspacePresets([
                ...all,
                { id: newId(), projectId, name: `Layout ${count}`, tabs: presetTabs }
            ])
        },

        // Re-open a saved layout as fresh tabs/sessions (new pty ids) appended to
        // the project; panes spawn on mount with their stored launch command.
        openWorkspacePreset: (presetId) => {
            const preset = useSettings.getState().workspacePresets.find((p) => p.id === presetId)
            if (!preset) return
            const pid = preset.projectId
            const termAgents = { ...get().termAgents }
            const termInit = { ...get().termInit }
            const agentStatus = { ...get().agentStatus }
            const startedAgents: string[] = []
            const toLayout = (n: PresetNode): LayoutNode => {
                if (n.kind === "leaf") {
                    const termId = newId()
                    termAgents[termId] = n.agentId
                    if (n.init) termInit[termId] = n.init
                    if (isAgentId(n.agentId)) {
                        agentStatus[termId] = "working"
                        startedAgents.push(termId)
                    }
                    return leaf(termId)
                }
                return { kind: "split", dir: n.dir, children: n.children.map(toLayout) }
            }
            const restored: Tab[] = preset.tabs.map((t) => ({
                id: newId(),
                name: t.name,
                root: toLayout(t.root)
            }))
            const first = restored[0]
            set((s) => ({
                activeId: pid,
                termAgents,
                termInit,
                agentStatus,
                tabsByProject: {
                    ...s.tabsByProject,
                    [pid]: [...(s.tabsByProject[pid] ?? []), ...restored]
                },
                activeTabByProject: { ...s.activeTabByProject, [pid]: first.id },
                activePaneByProject: { ...s.activePaneByProject, [pid]: firstLeaf(first.root) },
                view: "terminal"
            }))
            window.api.projects.setActive(pid)
            for (const termId of startedAgents)
                useSettings.getState().logUsageStart(termId, termAgents[termId], pid)
            persist()
        },

        deleteWorkspacePreset: (presetId) => {
            const all = useSettings.getState().workspacePresets
            useSettings.getState().setWorkspacePresets(all.filter((p) => p.id !== presetId))
        },

        setDraggingTabId: (draggingTabId) => set({ draggingTabId }),
        setDragPayload: (dragPayload) => set({ dragPayload }),
        setPendingApiRequest: (pendingApiRequest) => set({ pendingApiRequest }),

        openInEditor: (projectId, path, line) => {
            void get().setActiveProject(projectId)
            get().setView("editor")
            set({ pendingEditorOpen: { path, line } })
        },
        clearPendingEditorOpen: () => set({ pendingEditorOpen: null }),

        reorderTabs: (projectId, fromTabId, toTabId) => {
            const tabs = get().tabsByProject[projectId] ?? []
            const from = tabs.findIndex((t) => t.id === fromTabId)
            const to = tabs.findIndex((t) => t.id === toTabId)
            if (from < 0 || to < 0 || from === to) return
            const next = [...tabs]
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            set((s) => ({ tabsByProject: { ...s.tabsByProject, [projectId]: next } }))
            persist()
        },

        // Graft the source tab's whole layout into a pane of another tab, then
        // drop the now-empty source tab. Ptys persist (panes re-attach on remount).
        moveTabToPane: (projectId, sourceTabId, targetPaneId, dir, side) => {
            const s = get()
            const tabs = s.tabsByProject[projectId] ?? []
            const source = tabs.find((t) => t.id === sourceTabId)
            const targetTab = tabs.find((t) => hasLeaf(t.root, targetPaneId))
            if (!source || !targetTab || targetTab.id === sourceTabId) return
            const newRoot = splitLeafWith(targetTab.root, targetPaneId, dir, side, source.root)
            const next = tabs
                .filter((t) => t.id !== sourceTabId)
                .map((t) => (t.id === targetTab.id ? { ...t, root: newRoot } : t))
            set({
                tabsByProject: { ...s.tabsByProject, [projectId]: next },
                activeTabByProject: { ...s.activeTabByProject, [projectId]: targetTab.id },
                activePaneByProject: {
                    ...s.activePaneByProject,
                    [projectId]: firstLeaf(source.root)
                },
                draggingTabId: null
            })
            persist()
        },

        focusPane: (projectId, termId) => {
            set((s) => ({
                activePaneByProject: { ...s.activePaneByProject, [projectId]: termId }
            }))
            ack(termId)
            persist()
        },

        cycleTab: (dir) => {
            const s = get()
            const projectId = s.activeId
            if (!projectId) return
            const tabs = s.tabsByProject[projectId] ?? []
            if (tabs.length < 2) return
            const currentId = s.activeTabByProject[projectId]
            const idx = Math.max(
                0,
                tabs.findIndex((t) => t.id === currentId)
            )
            const next = tabs[(idx + dir + tabs.length) % tabs.length]
            s.setActiveTab(projectId, next.id)
        }
    }
})
