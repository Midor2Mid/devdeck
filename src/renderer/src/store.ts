import { create } from "zustand"
import type { Project, WorkItem } from "../../preload/index"
import { useSettings } from "./settings"
import {
    type LayoutNode,
    type SplitDir,
    leaf,
    splitLeaf,
    removeLeaf,
    collectLeaves,
    firstLeaf,
    hasLeaf
} from "./layout"
import type { PipelineRun } from "./pipeline"
import { runnableSteps, sessionPlan } from "./pipeline"
import { gateActive, evaluateGate, maxAttempts } from "./gate"

/** An agent id is a preset id (e.g. "claude", "codex") or the literal "shell". */
export const SHELL = "shell"
export type MainView = "terminal" | "editor" | "api" | "database" | "browser"
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
    tabName: string
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
    tabsByProject: Record<string, Tab[]>
    activeTabByProject: Record<string, string | undefined>
    activePaneByProject: Record<string, string | undefined>
    composerDrafts: Record<string, string>
    view: MainView
    termLayout: TermLayout
    canvasPos: Record<string, CanvasPos>
    canvasLinks: CanvasLink[]
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
    activeProject: () => Project | undefined

    view: MainView
    setView: (view: MainView) => void
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

    // Work items (Jira / Azure DevOps)
    workOpen: boolean
    setWorkOpen: (open: boolean) => void
    startWork: (item: WorkItem, opts?: { worktree?: boolean }) => Promise<void>

    // Release board
    releaseOpen: boolean
    setReleaseOpen: (open: boolean) => void

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

    // Agent session awareness (runtime-only)
    agentStatus: Record<string, AgentStatus>
    lastAgentTermId: string | null
    notifications: AppNotification[]
    dismissNotification: (id: string) => void
    sessions: () => AnySession[]
    agentSessions: () => AnySession[]
    sendToAgent: (text: string) => boolean
    setComposerDraft: (projectId: string, text: string) => void
    jumpToTerm: (termId: string) => void
    newTabIn: (projectId: string, agentId: string, initialCommand?: string) => void

    tabsFor: (projectId: string) => Tab[]
    activeTab: (projectId: string) => Tab | undefined
    activePane: (projectId: string) => string | undefined
    agentOf: (termId: string) => string

    newTab: (agentId: string, initialCommand?: string, label?: string, cwd?: string) => string | undefined
    splitActive: (dir: SplitDir, agentId: string) => void
    closePane: (termId: string) => void
    closeActivePane: () => void
    renameTab: (projectId: string, tabId: string, name: string) => void
    setActiveTab: (projectId: string, tabId: string) => void
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
    // Debounced disk persistence — coalesces bursts (e.g. composer keystrokes).
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    const writeNow = (): void => {
        const s = get()
        window.api.workspace.save({
            termAgents: s.termAgents,
            termInit: s.termInit,
            termCwd: s.termCwd,
            tabsByProject: s.tabsByProject,
            activeTabByProject: s.activeTabByProject,
            activePaneByProject: s.activePaneByProject,
            composerDrafts: s.composerDrafts,
            view: s.view,
            termLayout: s.termLayout,
            canvasPos: s.canvasPos,
            canvasLinks: s.canvasLinks
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
                return `${tab.name} · ${project?.name ?? "—"}`
            }
        }
        return "agent session"
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
        const visible = isVisible(id)
        if (data.includes("\x07") && !visible) {
            const was = get().agentStatus[id]
            setStatus(id, "attention")
            if (was !== "attention") {
                pushNotification(id)
                pushActivity("attention", id)
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
                    if (get().agentStatus[id] === "working") setStatus(id, "idle")
                },
                useSettings.getState().agentIdleMs
            )
        )
    }

    const forget = (termId: string): void => {
        const t = idleTimers.get(termId)
        if (t) clearTimeout(t)
        idleTimers.delete(termId)
        set((s) => {
            const agentStatus = { ...s.agentStatus }
            delete agentStatus[termId]
            const termInit = { ...s.termInit }
            delete termInit[termId]
            const termAgents = { ...s.termAgents }
            delete termAgents[termId]
            const termCwd = { ...s.termCwd }
            delete termCwd[termId]
            const canvasPos = { ...s.canvasPos }
            delete canvasPos[termId]
            return {
                agentStatus,
                termInit,
                termAgents,
                termCwd,
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
                        projectName: project?.name ?? "—",
                        projectPath: project?.path ?? "",
                        tabName: tab.name,
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
        tabsByProject: {},
        activeTabByProject: {},
        activePaneByProject: {},
        composerDrafts: {},
        view: "terminal",
        termLayout: "tabs",
        canvasPos: {},
        canvasLinks: [],
        activity: [],
        activityOpen: false,
        recordingTermId: null,
        recordingsOpen: false,
        worktreesOpen: false,
        changesTarget: null,
        workOpen: false,
        releaseOpen: false,
        pipelineRun: null,
        switcherOpen: false,
        composerOpen: false,
        paletteOpen: false,
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
                tabsByProject: w.tabsByProject ?? {},
                activeTabByProject: w.activeTabByProject ?? {},
                activePaneByProject: w.activePaneByProject ?? {},
                composerDrafts: w.composerDrafts ?? {},
                view: w.view ?? "terminal",
                termLayout: w.termLayout ?? "tabs",
                canvasPos: w.canvasPos ?? {},
                canvasLinks: w.canvasLinks ?? []
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

        openSwitcher: () => set({ switcherOpen: true }),
        closeSwitcher: () => set({ switcherOpen: false }),
        setComposerOpen: (composerOpen) => set({ composerOpen }),
        setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

        activeProject: () => get().projects.find((p) => p.id === get().activeId),

        setView: (view) => {
            set({ view })
            if (view === "terminal" && get().activeId) ack(get().activePaneByProject[get().activeId as string])
            persist()
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

        setWorkOpen: (workOpen) => set({ workOpen }),
        setReleaseOpen: (releaseOpen) => set({ releaseOpen }),

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
                    status: "running"
                }
            })
            pushActivity("pipeline", get().lastAgentTermId ?? "", `${pipeline.name} · started`)

            void (async () => {
                const liveByAgent: Record<string, string | undefined> = {}
                for (let i = 0; i < steps.length; i++) {
                    if (stale()) return
                    const step = steps[i]
                    setRun({ stepIndex: i, stepTitle: step.title, status: "running", gateMsg: undefined })

                    // Resolve the session once per step; retries reuse it.
                    const plan = sessionPlan(step, liveByAgent)
                    let termId = plan.termId
                    if (!plan.reuse || !termId) {
                        termId = get().newTab(step.agentId)
                        if (!termId) {
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
                            break
                        }
                        passed = evaluateGate(step.gate, buf)
                        if (passed) {
                            setRun({ gateMsg: "✓ gate passed" })
                            pushActivity("pipeline", termId, `${step.title} · gate passed`)
                            break
                        }
                        if (attempt < attempts) {
                            setRun({ gateMsg: `✗ gate failed — retrying (${attempt}/${attempts - 1})` })
                            pushActivity("pipeline", termId, `${step.title} · gate failed, retrying`)
                            await sleep(800)
                        }
                    }

                    if (!passed) {
                        const onFail = step.gate?.onFail ?? "stop"
                        pushActivity("pipeline", termId, `${step.title} · gate failed`)
                        if (onFail === "stop") {
                            setRun({ status: "error", gateMsg: "✗ gate failed — stopped" })
                            return
                        }
                        setRun({ gateMsg: "✗ gate failed — continued" })
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

        newTab: (agentId, initialCommand, label, cwd) => {
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
            if (isAgentId(agentId)) pushActivity("start", termId, `${tab.name} · started`)
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
