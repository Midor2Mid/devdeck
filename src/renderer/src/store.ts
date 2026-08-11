import { create } from "zustand"
import type { Project, WorkItem, CheckResult } from "../../preload/index"
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
import { runnableSteps, sessionPlan, resolveTarget, failTarget, RUN_STEP_CAP } from "./pipeline"
import { gateActive, evaluateGate, maxAttempts, isCommandGate, commandGatePasses } from "./gate"
import { diffPrompt, type DiffAiKind } from "./diffai"
import { LENSES, reviewPrompt, type Lens } from "./reviewLenses"
import { recordTail, forgetTail, recordRate } from "./missionTail"
import { holdersOf, holdersSummary, type CwdHolder } from "./ownership"
import { recordMru, previousProjectId } from "./projectMru"
import { parseChecklist, costWindow, type BoardTask, type BoardColumn } from "./board"
import { confirm } from "./confirm"
import {
    RACE_TIMEOUT_MS,
    RACE_POLL_MS,
    parseShortstat,
    entrantBranch,
    raceSettled,
    samePath,
    type Entrant,
    type Race
} from "./race"

/** An agent id is a preset id (e.g. "claude", "codex") or the literal "shell". */
export const SHELL = "shell"
export type MainView = "mission" | "tasks" | "terminal" | "editor" | "api" | "database" | "browser" | "network"
// working = producing output; waiting = finished a turn, your move (soft);
// attention = rang the bell / blocked on input, needs you now (loud); idle = quiet.
export type AgentStatus = "working" | "idle" | "attention" | "waiting"

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

export type TermLayout = "tabs" | "grid" | "canvas" | "overview"

export interface CanvasPos {
    x: number
    y: number
}

interface AppState extends Persisted {
    /** Agent terminals restored from a previous run, awaiting a resume/fresh choice (runtime-only). */
    agentResumePending: Record<string, boolean>
    /** Clear a terminal's pending-resume flag (after the user picks resume or fresh). */
    clearAgentResume: (termId: string) => void
    projects: Project[]
    activeId: string | null
    /** Project ids, most recently used first (persisted to localStorage). */
    projectMru: string[]
    switchToPreviousProject: () => void
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
    /**
     * Price a dispatched card from the transcripts and cache it on the card. Reads
     * files on disk, so it's called on demand (board mount, card finishing) rather
     * than during render.
     */
    refreshTaskCost: (id: string) => Promise<void>
    dispatchBoardTask: (id: string, opts: { worktree: boolean }) => Promise<void>
    /**
     * Agents already holding uncommitted changes in `cwd` — the "who is in here
     * already" question, asked before a second agent joins them rather than after
     * they have both written. Hits git per live session, so call it on demand.
     */
    holdersIn: (cwd: string) => Promise<CwdHolder[]>

    // Agent bake-off: race two or three agents on one card, each in its own
    // worktree (runtime-only — the worktrees themselves are the recovery story
    // across a restart, so races are never persisted to workspace.json).
    races: Record<string, Race>
    /** Card id whose race modal is open, or null. */
    raceCardId: string | null
    openRace: (cardId: string) => void
    closeRace: () => void
    startRace: (cardId: string, agentIds: string[], gateCommand: string) => Promise<void>
    landRaceWinner: (cardId: string, agentId: string) => Promise<void>
    abandonRace: (cardId: string) => Promise<void>

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

    // Per-project appearance editor (holds the project id being edited, or null)
    identityEditorProject: string | null
    setIdentityEditorProject: (projectId: string | null) => void

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
    /** `agentId` hands the diff to a specific agent — omit for your default one. */
    aiOnDiff: (cwd: string, kind: DiffAiKind, agentId?: string) => Promise<void>

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
    /** Transient signal: set by resumePipeline to release a paused checkpoint. */
    pipelineResume: boolean
    /** `viaTrigger` skips the pre-flight confirm — a file trigger is pre-authorized. */
    runPipeline: (pipelineId: string, viaTrigger?: boolean) => void
    stopPipeline: () => void
    /** Continue a run paused at a checkpoint step. */
    resumePipeline: () => void
    fireTrigger: (triggerId: string) => void

    // Overlays / panels (runtime-only)
    switcherOpen: boolean
    openSwitcher: () => void
    closeSwitcher: () => void
    composerOpen: boolean
    setComposerOpen: (open: boolean) => void
    paletteOpen: boolean
    setPaletteOpen: (open: boolean) => void
    extendOpen: boolean
    setExtendOpen: (open: boolean) => void
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
    /** Send a raw keystroke sequence to one agent (e.g. answering a permission prompt). */
    respondApproval: (termId: string, keys: string) => void
    setComposerDraft: (projectId: string, text: string) => void
    jumpToTerm: (termId: string) => void
    /** Jump to the oldest agent session that wants you (waiting or attention). */
    jumpToPending: () => void
    newTabIn: (projectId: string, agentId: string, initialCommand?: string) => void

    tabsFor: (projectId: string) => Tab[]
    activeTab: (projectId: string) => Tab | undefined
    activePane: (projectId: string) => string | undefined
    agentOf: (termId: string) => string
    /** The project a terminal belongs to (by its tab), or undefined. */
    projectIdOfTerm: (termId: string) => string | undefined

    newTab: (agentId: string, initialCommand?: string, label?: string, cwd?: string, shellKind?: ShellKind) => string | undefined
    /** Run a fixed command in a shell tab, focusing an existing one if it's already running it. */
    runCommandTab: (command: string, label?: string) => void
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
// One poll interval per in-flight race, keyed by card id. Held here rather than
// on the store: a timer handle in state would trigger a render on every tick.
const racePolls = new Map<string, ReturnType<typeof setInterval>>()
// Card ids with a startRace start-loop in flight but not yet written to the
// store — races[cardId] alone can't guard a double-start, since the race
// object isn't stored until ~3s x N (the sequential dispatch loop) after the
// user confirms.
const startingRaces = new Set<string>()
// A tick suspended in an await cannot be cancelled — stopPoll clears the
// interval, but checks.run can still be 120s from returning. Every write and
// every spend inside a tick re-checks the generation it started under; bumping
// it (stopPoll, or a fresh startPoll) makes any in-flight tick a no-op from
// that instant on. Same device as pipelineToken above, for the same reason.
//
// Entries are NEVER deleted, including on teardown — one integer per card,
// bounded by the number of cards that have ever raced, is a cost worth paying.
// Deleting it on land/abandon would let bumpGen restart at 1 next time that
// card races, which a still-suspended tick from the OLD race could also be
// carrying (startPoll's stopPoll-bump-plus-bumpGen lands on the same small
// number every time from a fresh 0). That tick would then read as current,
// write its verdict into the new race, and call checks.run inside a worktree
// that no longer exists — precisely what this counter exists to prevent.
const raceGen = new Map<string, number>()
const bumpGen = (cardId: string): number => {
    const next = (raceGen.get(cardId) ?? 0) + 1
    raceGen.set(cardId, next)
    return next
}
// When each agent entered a wants-you state (waiting/attention), for "jump to
// the oldest one that wants you".
const pendingSince = new Map<string, number>()
let dataSubscribed = false
// Bumped on stop / new run; the async runner aborts when its token goes stale.
let pipelineToken = 0
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const MRU_KEY = "devdeck.projectMru"

/** Load the persisted project MRU list (best-effort — [] on any failure). */
function loadMru(): string[] {
    try {
        const raw = localStorage.getItem(MRU_KEY)
        const parsed: unknown = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
    } catch {
        return []
    }
}

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
        // Stamp / clear when a session enters or leaves a wants-you state.
        if (status === "waiting" || status === "attention") {
            if (!pendingSince.has(termId)) pendingSince.set(termId, Date.now())
        } else {
            pendingSince.delete(termId)
        }
        set((s) => ({ agentStatus: { ...s.agentStatus, [termId]: status } }))
    }

    const ack = (termId?: string): void => {
        if (!termId || !isAgentId(get().agentOf(termId))) return
        pendingSince.delete(termId)
        set((s) => ({
            lastAgentTermId: termId,
            agentStatus:
                s.agentStatus[termId] === "attention" || s.agentStatus[termId] === "waiting"
                    ? { ...s.agentStatus, [termId]: "idle" }
                    : s.agentStatus,
            // Acknowledging a session clears its pending notification.
            notifications: s.notifications.filter((n) => n.termId !== termId)
        }))
    }

    const isVisible = (termId: string): boolean => {
        // "Looking at this pane" requires the window to be focused too — otherwise
        // an agent finishing while you've alt-tabbed away would be silently marked
        // idle instead of raising a waiting/attention signal.
        if (typeof document !== "undefined" && !document.hasFocus()) return false
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

    // Soft signal when an agent finishes a turn and is waiting on you (no bell).
    // Quieter than attention: an optional beep only — the deck-key ring + inbox
    // count carry it. No desktop notification (that's reserved for the loud tier).
    const notifyWaiting = (): void => {
        if (useSettings.getState().notifications.waitingSound) beep()
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
        // …and its committed-output rate, for the tile's trace.
        recordRate(id, data)
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
                        // Finished a turn. If you're watching this pane there's nothing
                        // to flag (idle); if it's a background session, mark it "waiting
                        // for you" and give the soft signal so you don't have to babysit.
                        const away = !isVisible(id)
                        setStatus(id, away ? "waiting" : "idle")
                        if (away) notifyWaiting()
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
        pendingSince.delete(termId)
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
            const agentResumePending = { ...s.agentResumePending }
            delete agentResumePending[termId]
            return {
                agentStatus,
                termInit,
                termAgents,
                agentResumePending,
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

    /** Rewrite one entrant immutably. Never trusts a captured race — always reads current state. */
    const setEntrant = (cardId: string, agentId: string, patch: Partial<Entrant>): void => {
        set((s) => {
            const race = s.races[cardId]
            if (!race) return {}
            return {
                races: {
                    ...s.races,
                    [cardId]: {
                        ...race,
                        entrants: race.entrants.map((e) =>
                            e.agentId === agentId ? { ...e, ...patch } : e
                        )
                    }
                }
            }
        })
    }

    const stopPoll = (cardId: string): void => {
        const t = racePolls.get(cardId)
        if (t) clearInterval(t)
        racePolls.delete(cardId)
        // A tick already suspended in an await cannot be cancelled — bump the
        // generation so it reads as stale the moment it wakes up, however long
        // that takes (checks.run alone can block for 120s).
        bumpGen(cardId)
    }

    const raceTick = async (cardId: string, gen: number): Promise<void> => {
        if (document.hidden) return
        // Re-checked after every await below: stopPoll can bump this while this
        // very tick is suspended, and a stale tick must spend nothing and write
        // nothing — not a verdict for a race being torn down, and not a fresh
        // gate command inside a worktree that's mid-deletion.
        const stale = (): boolean => raceGen.get(cardId) !== gen
        const r = get().races[cardId]
        if (!r) return
        // ONE call for the whole race: parseWorktreeList already returns every
        // worktree with its head, so polling cost does not grow with entrant count.
        const wts = await window.api.git.worktrees(r.projectPath).catch(() => [])
        if (stale()) return

        for (const e of r.entrants) {
            // Narrow to "working" deliberately — do not widen this again. Every
            // one of checks.run/usage.window/git.shortstat below is wrapped in a
            // .catch, so a rejection always resolves an entrant to a terminal
            // status instead of stranding it in "gating"; and checks.run caps
            // itself at 120s, so "gating" cannot legitimately last the 20-minute
            // timeout. Applying the timeout to "gating" too can flip an entrant
            // that is genuinely mid-gate to nocommit, and if that happens to
            // settle the race, stopPoll bumps the generation and the real
            // verdict — which is still in flight — gets discarded as stale.
            if (e.status !== "working") continue
            // samePath, not ===: worktreeAdd's path.join result (backslashes on
            // Windows) and git worktree list's own output (forward slashes)
            // otherwise never compare equal, and no commit is ever detected.
            const head = wts.find((w) => samePath(w.path, e.worktree))?.head
            if (head && head !== e.baseHead) {
                // The loop's snapshot may be many ticks old — checks.run can
                // block for 120s against a 5s poll. Re-read before spending
                // anything, so a tick that's behind can't re-gate an entrant a
                // newer tick already resolved.
                const live = get().races[cardId]?.entrants.find((x) => x.agentId === e.agentId)
                if (!live || live.status !== "working") continue
                if (stale()) return
                setEntrant(cardId, e.agentId, { status: "gating", head })
                // The ENTRANT'S worktree, never r.projectPath. Running the gate
                // at the project root verifies the user's tree instead of this
                // entrant's and scores every entrant identically — the single
                // most damaging thing to get wrong here.
                const res = await window.api.checks
                    .run(e.worktree, r.gateCommand)
                    .catch(
                        (err): CheckResult => ({
                            exitCode: -1,
                            output: err instanceof Error ? err.message : String(err),
                            timedOut: false,
                            ms: 0
                        })
                    )
                if (stale()) return
                setEntrant(cardId, e.agentId, {
                    status: res.exitCode === 0 ? "passed" : "failed",
                    gateExit: res.exitCode,
                    gateMs: res.ms,
                    gateOutput: (res.output || "").slice(0, 400)
                })
                const [usage, stat] = await Promise.all([
                    window.api.usage.window(e.worktree, r.startedAt, Date.now()).catch(() => null),
                    window.api.git.shortstat(e.worktree, e.baseHead).catch(() => "")
                ])
                if (stale()) return
                setEntrant(cardId, e.agentId, {
                    cost: usage?.cost,
                    costTokens: usage?.tokens,
                    ...parseShortstat(stat)
                })
                continue
            }
            if (Date.now() - r.startedAt > RACE_TIMEOUT_MS) {
                // Re-read before writing, same reason as the gate path above: a
                // lagging tick must not overwrite a newer verdict with nocommit.
                const live = get().races[cardId]?.entrants.find((x) => x.agentId === e.agentId)
                if (!live || live.status !== "working") continue
                if (stale()) return
                setEntrant(cardId, e.agentId, { status: "nocommit" })
            }
        }
        if (stale()) return
        const cur = get().races[cardId]
        if (cur && raceSettled(cur)) stopPoll(cardId)
    }

    const startPoll = (cardId: string): void => {
        stopPoll(cardId)
        const gen = bumpGen(cardId)
        racePolls.set(
            cardId,
            setInterval(() => {
                void raceTick(cardId, gen)
            }, RACE_POLL_MS)
        )
    }

    return {
        projects: [],
        activeId: null,
        projectMru: loadMru(),
        termAgents: {},
        termInit: {},
        agentResumePending: {},
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
        races: {},
        raceCardId: null,
        activity: [],
        activityOpen: false,
        inboxOpen: false,
        usageOpen: false,
        envEditorProject: null,
        commandsEditorProject: null,
        identityEditorProject: null,
        recordingTermId: null,
        recordingsOpen: false,
        worktreesOpen: false,
        changesTarget: null,
        prTarget: null,
        workOpen: false,
        releaseOpen: false,
        standupOpen: false,
        pipelineRun: null,
        pipelineResume: false,
        switcherOpen: false,
        composerOpen: false,
        paletteOpen: false,
        extendOpen: false,
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
            // Seed the MRU with the restored active project so "previous project"
            // (Ctrl+Shift+K / switcher preselect) works from launch, using the
            // persisted history with the active project moved to the front.
            const seededMru = store.activeId
                ? recordMru(get().projectMru, store.activeId)
                : get().projectMru
            try {
                localStorage.setItem(MRU_KEY, JSON.stringify(seededMru))
            } catch {
                /* storage unavailable - ignore */
            }
            // Migrate the old termKinds → termAgents if present.
            const termAgents = w.termAgents ?? w.termKinds ?? {}
            const tabsByProject = w.tabsByProject ?? {}
            // Agent sessions from the previous run come back needing a resume/fresh
            // choice — their ptys died with the old process, so cold-relaunching
            // would silently drop each conversation.
            const agentResumePending: Record<string, boolean> = {}
            for (const tabs of Object.values(tabsByProject) as Tab[][]) {
                for (const tab of tabs) {
                    for (const id of collectLeaves(tab.root)) {
                        if (isAgentId(termAgents[id])) agentResumePending[id] = true
                    }
                }
            }
            set({
                projects: store.projects,
                activeId: store.activeId,
                projectMru: seededMru,
                termAgents,
                termInit: w.termInit ?? {},
                agentResumePending,
                termCwd: w.termCwd ?? {},
                termNames: w.termNames ?? {},
                termShells: w.termShells ?? {},
                tabsByProject,
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
            const mru = recordMru(get().projectMru, id)
            set({ activeId: id, projectMru: mru })
            try {
                localStorage.setItem(MRU_KEY, JSON.stringify(mru))
            } catch {
                /* storage unavailable - ignore */
            }
            await window.api.projects.setActive(id)
            ack(get().activePaneByProject[id])
        },

        switchToPreviousProject: () => {
            const prev = previousProjectId(get().projectMru, get().activeId)
            if (prev) void get().setActiveProject(prev)
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
        setExtendOpen: (extendOpen) => set({ extendOpen }),
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
            set((s) => ({
                boardTasks: s.boardTasks.map((t) => {
                    if (t.id !== id) return t
                    // Reaching done closes the cost window; moving back out of done
                    // reopens it, so a reopened card keeps accruing.
                    if (column === "done" && t.dispatchedAt && !t.endedAt) {
                        return { ...t, column, endedAt: Date.now() }
                    }
                    if (column !== "done" && t.endedAt) {
                        return { ...t, column, endedAt: undefined, cost: undefined, costTokens: undefined }
                    }
                    return { ...t, column }
                })
            }))
            persist()
        },
        refreshTaskCost: async (id) => {
            const st = get()
            const task = st.boardTasks.find((t) => t.id === id)
            if (!task) return
            const win = costWindow(task, Date.now())
            if (!win) return
            // A worktree has its own path, and Claude Code names transcripts by
            // directory — so an isolated card is priced from its worktree, not the
            // project it branched from.
            const path = task.worktree || st.projects.find((p) => p.id === task.projectId)?.path
            if (!path) return
            const b = await window.api.usage.window(path, win.from, win.to).catch(() => null)
            if (!b) return
            set((s) => ({
                boardTasks: s.boardTasks.map((t) =>
                    t.id === id ? { ...t, cost: b.cost, costTokens: b.tokens } : t
                )
            }))
            persist()
        },
        removeBoardTask: (id) => {
            set((s) => ({ boardTasks: s.boardTasks.filter((t) => t.id !== id) }))
            persist()
        },
        holdersIn: async (cwd) => {
            const st = get()
            const entries = await Promise.all(
                st.agentSessions().map(async (s) => {
                    const dir = st.termCwd[s.termId] ?? s.projectPath
                    return {
                        termId: s.termId,
                        sessionName: s.sessionName,
                        cwd: dir,
                        files: (await window.api.git.changes(dir).catch(() => [])).map((c) => c.path)
                    }
                })
            )
            return holdersOf(entries, cwd)
        },
        dispatchBoardTask: async (id, opts) => {
            const task = get().boardTasks.find((t) => t.id === id)
            if (!task) return
            const proj = get().projects.find((p) => p.id === task.projectId)
            if (!proj) return
            const agent = useSettings.getState().agents[0]
            const agentId = agent?.id ?? "claude"
            // One beat before spending real tokens: dispatch silently picked the
            // first agent preset, created a worktree, and pasted the card title
            // into the CLI — an accidental click cost money and left a worktree
            // behind. Name what's about to happen and let it be cancelled.
            // Without a worktree the new agent shares the project's working tree.
            // If someone is already editing it, say who and what they're holding —
            // the conflict map only tells you this after both have written.
            const clash = opts.worktree ? "" : holdersSummary(await get().holdersIn(proj.path))

            const ok = await confirm({
                title: "Dispatch to an agent",
                message:
                    `Start ${agent?.name ?? agentId} on "${task.title}" in ${proj.name}` +
                    (opts.worktree ? ", in a new git worktree" : "") +
                    "? The card title is sent as its first prompt." +
                    (clash ? `\n\n⚠ ${clash} Turn on "worktree" to give it its own copy.` : ""),
                confirmLabel: "Dispatch",
                danger: !!clash
            })
            if (!ok) return
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
                    t.id === id
                        ? {
                              ...t,
                              column: "doing",
                              termId,
                              worktree: worktreePath,
                              // Opens the cost window; closed when the card hits done.
                              dispatchedAt: Date.now(),
                              endedAt: undefined,
                              cost: undefined,
                              costTokens: undefined
                          }
                        : t
                )
            }))
            persist()
            // Let the agent CLI boot, then send the task as its first prompt.
            await sleep(2800)
            window.api.pty.input(termId, task.title + "\r")
            set({ lastAgentTermId: termId })
        },

        openRace: (cardId) => set({ raceCardId: cardId }),
        closeRace: () => set({ raceCardId: null }),

        startRace: async (cardId, agentIds, gateCommand) => {
            // races[cardId] alone can't guard a double-start: the race object isn't
            // written until ~3s x N (the sequential dispatch loop) after the user
            // confirms, so a second click in that window would see no race yet and
            // overwrite the first one's tracking once both finish.
            if (get().races[cardId] || startingRaces.has(cardId)) return
            const task = get().boardTasks.find((t) => t.id === cardId)
            if (!task) return
            const proj = get().projects.find((p) => p.id === task.projectId)
            if (!proj) return

            // Dedupe: the same agent twice would double the confirm's spend count
            // and race an entrant against itself in a shared branch/worktree.
            const ids = Array.from(new Set(agentIds))
            const names = ids.map((id) => useSettings.getState().agentById(id)?.name ?? id)
            // A race spends money once per entrant — several times what a normal
            // dispatch costs — so name every entrant and the gate before an
            // accidental click pays for all of them.
            const ok = await confirm({
                title: "Start a race",
                message:
                    `Race ${names.join(", ")} on "${task.title}" in ${proj.name}, each in its ` +
                    `own worktree, then gate each with:\n\n${gateCommand}\n\n` +
                    `This spends money ${ids.length} times — once per entrant.`,
                confirmLabel: "Start race",
                danger: true
            })
            if (!ok) return

            startingRaces.add(cardId)
            try {
                // newTab spawns into the active project. Entrants are started
                // sequentially (never Promise.all) for exactly that reason: the
                // active project must stay this task's project for the whole loop.
                await get().setActiveProject(proj.id)

                const startedAt = Date.now()
                const entrants: Entrant[] = []

                for (const agentId of ids) {
                    const agentName = useSettings.getState().agentById(agentId)?.name ?? agentId
                    try {
                        const branch = entrantBranch(task.title, agentName, agentId)
                        const res = await window.api.git.worktreeAdd(proj.path, branch)
                        if (!res.ok || !res.path || !res.branch) {
                            entrants.push({
                                agentId,
                                agentName,
                                worktree: "",
                                branch,
                                baseHead: "",
                                status: "nocommit",
                                gateOutput: res.error ?? "worktree failed"
                            })
                            continue
                        }
                        const worktreePath = res.path
                        const wts = await window.api.git.worktrees(proj.path).catch(() => [])
                        const baseHead = wts.find((w) => samePath(w.path, worktreePath))?.head ?? ""
                        if (!baseHead) {
                            // A transient read failure here must not be silently
                            // treated as "already finished": any later head would
                            // differ from "", gating the entrant on an empty diff
                            // seconds after dispatch. Same treatment as a failed
                            // worktreeAdd, but the worktree itself still exists, so
                            // it's kept on the entrant for land/abandon to clean up.
                            entrants.push({
                                agentId,
                                agentName,
                                worktree: worktreePath,
                                branch: res.branch,
                                baseHead: "",
                                status: "nocommit",
                                gateOutput: "could not read the new worktree's head"
                            })
                            continue
                        }
                        const termId = get().newTab(agentId, undefined, "race " + agentName, worktreePath)
                        if (!termId) {
                            entrants.push({
                                agentId,
                                agentName,
                                worktree: worktreePath,
                                branch: res.branch,
                                baseHead,
                                status: "nocommit",
                                gateOutput: "could not spawn a session for this entrant"
                            })
                            continue
                        }
                        // Let the agent CLI boot before sending the prompt.
                        await sleep(2800)
                        const prompt =
                            task.title +
                            "\n\nWhen you are finished, commit all your work in this worktree with a short message. Do not push."
                        window.api.pty.input(termId, prompt + "\r")
                        entrants.push({
                            agentId,
                            agentName,
                            termId,
                            worktree: worktreePath,
                            branch: res.branch,
                            baseHead,
                            status: "working"
                        })
                    } catch (err) {
                        // A rejection here (rather than an { ok: false }) must not
                        // abort the loop before the race object exists — that would
                        // orphan whatever earlier entrants already created, with
                        // nothing left to track their worktrees or billing.
                        entrants.push({
                            agentId,
                            agentName,
                            worktree: "",
                            branch: "",
                            baseHead: "",
                            status: "nocommit",
                            gateOutput: err instanceof Error ? err.message : String(err)
                        })
                    }
                }

                const race: Race = {
                    cardId,
                    projectId: proj.id,
                    projectPath: proj.path,
                    title: task.title,
                    gateCommand,
                    startedAt,
                    entrants
                }
                set((s) => ({ races: { ...s.races, [cardId]: race } }))
                startPoll(cardId)
            } finally {
                startingRaces.delete(cardId)
            }
        },

        landRaceWinner: async (cardId, agentId) => {
            const race = get().races[cardId]
            if (!race) return
            const winner = race.entrants.find((e) => e.agentId === agentId)
            if (!winner) return
            if (winner.status !== "passed") {
                pushActivity("attention", "", "Only a passed entrant can be landed")
                return
            }

            // Belt-and-braces: landFrom enforces the clean-tree rule itself and is
            // the authority, but checking first lets the UI disable the button with
            // a reason instead of firing and finding out.
            const status = await window.api.git.status(race.projectPath).catch(() => null)
            if (!status || status.changes > 0) {
                pushActivity("attention", "", "Can't land: the project has uncommitted changes")
                return
            }

            // Stop polling before touching anything a tick reads or writes — one
            // landing mid-teardown would run a gate command inside a worktree the
            // removal loop below is about to delete.
            stopPoll(cardId)

            const res = await window.api.git.landFrom(winner.worktree, winner.baseHead, race.projectPath)
            if (!res.ok) {
                // Leave every worktree in place — nothing is lost, the user can
                // retry or land by hand. But the race object is still here and
                // startRace would refuse to touch it, so without restarting the
                // poll the remaining entrants would never gate, never time out,
                // and raceSettled would never go true — agents left running and
                // billing with nothing watching them.
                startPoll(cardId)
                pushActivity("attention", "", `Land failed: ${res.error ?? "unknown error"}`)
                return
            }

            // Close every pane BEFORE removing its worktree: a live process still
            // cwd'd into a directory can make the removal fail on Windows, and a
            // discarded failure there orphans the worktree, its branch, and a
            // still-running, still-billing agent.
            for (const e of race.entrants) {
                if (e.termId) get().closePane(e.termId)
            }
            for (const e of race.entrants) {
                if (!e.worktree) continue
                const rm = await window.api.git
                    .worktreeRemove(race.projectPath, e.worktree, e.branch)
                    .catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }))
                if (!rm.ok) {
                    pushActivity(
                        "attention",
                        "",
                        `Landed, but couldn't remove ${e.agentName}'s worktree: ${rm.error ?? "unknown error"}`
                    )
                }
            }
            // Deliberately not raceGen.delete(cardId): the map is one integer per
            // card, bounded by the number of cards that have ever raced, and its
            // whole point is to be monotonic for the app's lifetime. Deleting it
            // lets bumpGen restart at 1 next time this card races — the same
            // generation an old, still-suspended tick from THIS race may be
            // carrying — which reopens exactly the spend-in-a-deleted-worktree
            // hole the counter exists to close. Leave it be.
            set((s) => {
                const rest = { ...s.races }
                delete rest[cardId]
                return { races: rest }
            })
            get().moveBoardTask(cardId, "review")
            const projectName = get().projects.find((p) => p.id === race.projectId)?.name ?? race.title
            get().openChanges(race.projectPath, projectName)
        },

        abandonRace: async (cardId) => {
            const race = get().races[cardId]
            if (!race) return
            // Only count entrants that actually got a worktree — a failed
            // worktreeAdd or a start-time head-read failure never leaves anything
            // on disk to delete.
            const started = race.entrants.filter((e) => e.worktree)
            const ok = await confirm({
                title: "Abandon race",
                message:
                    `Abandon the race for "${race.title}"? This deletes ${started.length} ` +
                    `worktree${started.length === 1 ? "" : "s"} and discards every entrant's ` +
                    "work. This is the only exit that discards work.",
                confirmLabel: "Abandon",
                danger: true
            })
            if (!ok) return

            // The confirm above can sit open for minutes; stop polling the instant
            // it resolves so a tick can't land mid-teardown and run a gate command
            // inside a worktree this action is about to delete.
            stopPoll(cardId)

            for (const e of race.entrants) {
                if (e.termId) get().closePane(e.termId)
            }
            for (const e of race.entrants) {
                if (!e.worktree) continue
                const rm = await window.api.git
                    .worktreeRemove(race.projectPath, e.worktree, e.branch)
                    .catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }))
                if (!rm.ok) {
                    pushActivity(
                        "attention",
                        "",
                        `Couldn't remove ${e.agentName}'s worktree: ${rm.error ?? "unknown error"}`
                    )
                }
            }
            // See the comment in landRaceWinner: raceGen is deliberately never
            // deleted, only ever bumped.
            set((s) => {
                const rest = { ...s.races }
                delete rest[cardId]
                return { races: rest }
            })
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
        setIdentityEditorProject: (identityEditorProject) => set({ identityEditorProject }),

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

        aiOnDiff: async (cwd, kind, pickedAgentId) => {
            const agentId = pickedAgentId || useSettings.getState().agents[0]?.id || "claude"
            // Hand-off detection: if the agent about to review isn't the one that
            // last worked here, tell it so — an independent reviewer that knows it
            // didn't write the code reviews it more honestly than one that assumes
            // it did. Unknown provenance is treated as self-review (no claim made).
            const lastId = get().lastAgentTermId
            const lastAgent = lastId ? get().agentOf(lastId) : ""
            const independent = !!lastAgent && lastAgent !== agentId

            const diff = await window.api.git.fullDiff(cwd)
            const prompt = diffPrompt(kind, diff, { independent })
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
            get().runPipeline(trig.pipelineId, true)
        },

        stopPipeline: () => {
            pipelineToken += 1
            set((s) => (s.pipelineRun ? { pipelineRun: { ...s.pipelineRun, status: "stopped" } } : {}))
            setTimeout(() => {
                if (get().pipelineRun?.status === "stopped") set({ pipelineRun: null })
            }, 2500)
        },

        resumePipeline: () => set({ pipelineResume: true }),

        runPipeline: async (pipelineId, viaTrigger) => {
            const pipeline = useSettings.getState().pipelines.find((p) => p.id === pipelineId)
            if (!pipeline || !get().activeId) return
            const steps = runnableSteps(pipeline)
            if (steps.length === 0) return

            // A run spawns an agent session per step in whatever project is
            // *currently* active, which isn't always the one you think. Name both
            // before spending tokens. File triggers are already opted into, so
            // they bypass this.
            if (!viaTrigger) {
                const where = get().activeProject()?.name ?? "this project"
                const ok = await confirm({
                    title: "Run pipeline",
                    message:
                        `Run "${pipeline.name}" (${steps.length} step${steps.length === 1 ? "" : "s"}) in ${where}? ` +
                        `Each step starts an agent session.`,
                    confirmLabel: "Run"
                })
                if (!ok) return
            }

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

            // Sleep in short slices so Stop (which bumps the token) interrupts a delay.
            const delay = async (ms: number): Promise<void> => {
                const until = Date.now() + ms
                while (Date.now() < until) {
                    if (stale()) return
                    await sleep(Math.min(200, until - Date.now()))
                }
            }

            // Block a checkpoint until the user hits Continue (resume) or Stop (stale).
            const waitForResume = async (): Promise<boolean> => {
                set({ pipelineResume: false })
                for (;;) {
                    if (stale()) return false
                    if (get().pipelineResume) {
                        set({ pipelineResume: false })
                        return true
                    }
                    await sleep(200)
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
                    // Opens the run's cost window; the bar prices it from here.
                    startedAt: Date.now(),
                    projectPath: get().activeProject()?.path ?? "",
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
                let i = 0
                let execCount = 0
                while (i >= 0 && i < steps.length) {
                    if (stale()) return
                    if (++execCount > RUN_STEP_CAP) {
                        setRun({ status: "error", gateMsg: `stopped: step cap (${RUN_STEP_CAP}) reached` })
                        return
                    }
                    const step = steps[i]

                    // Optional pre-step delay (interruptible by Stop). Stays
                    // "running" — a timer wait isn't blocked on the user, so it must
                    // not read as "needs you" (the run's "waiting" status).
                    if (step.delayMs && step.delayMs > 0) {
                        setRun({
                            stepIndex: i,
                            stepTitle: step.title,
                            status: "running",
                            gateMsg: `waiting ${Math.round(step.delayMs / 1000)}s`
                        })
                        await delay(step.delayMs)
                        if (stale()) return
                    }

                    // Optional manual checkpoint — pause until Continue (or Stop).
                    if (step.checkpoint) {
                        setRun({
                            stepIndex: i,
                            stepTitle: step.title,
                            status: "paused",
                            gateMsg: "paused — Continue to proceed"
                        })
                        const go = await waitForResume()
                        if (!go) return
                    }

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
                        // A command gate asks the machine, not the agent: run it in
                        // the project and let the exit code decide. A text gate reads
                        // what the agent claimed.
                        let gateNote = ""
                        if (isCommandGate(step.gate)) {
                            const cwd = get().activeProject()?.path ?? ""
                            if (!cwd) {
                                passed = false
                                gateNote = "no project directory to run the check in"
                            } else {
                                setRun({ gateMsg: `running check: ${step.gate!.pattern}` })
                                const r = await window.api.checks.run(cwd, step.gate!.pattern.trim())
                                if (stale()) return
                                passed = commandGatePasses(step.gate!.mode, r.exitCode)
                                gateNote = r.timedOut
                                    ? (r.error ?? "timed out")
                                    : r.error
                                      ? r.error
                                      : `exit ${r.exitCode} in ${r.ms} ms`
                            }
                        } else {
                            passed = evaluateGate(step.gate, buf)
                        }
                        if (passed) {
                            const msg = gateNote ? `✓ gate passed · ${gateNote}` : "✓ gate passed"
                            setRun({ gateMsg: msg })
                            setStep(i, { status: "done", gateMsg: msg })
                            pushActivity("pipeline", termId, `${step.title} · gate passed`)
                            break
                        }
                        if (gateNote) setStep(i, { gateMsg: `✗ ${gateNote}` })
                        if (attempt < attempts) {
                            setRun({ gateMsg: `✗ gate failed - retrying (${attempt}/${attempts - 1})` })
                            pushActivity("pipeline", termId, `${step.title} · gate failed, retrying`)
                            await sleep(800)
                        }
                    }

                    // ---- Routing: pick the next step from the pass/fail outcome ----
                    if (stale()) return
                    let nextI: number
                    if (passed) {
                        nextI = resolveTarget(step.onPass, i, steps, "next")
                        // A goto whose target id no longer exists resolves to -1;
                        // surface that as an error instead of a success-looking "done".
                        if (nextI < 0 && typeof step.onPass === "object") {
                            setStep(i, { status: "done", gateMsg: "goto target missing" })
                            skipFrom(i + 1)
                            setRun({ status: "error", gateMsg: "goto target missing" })
                            return
                        }
                    } else {
                        pushActivity("pipeline", termId, `${step.title} · gate failed`)
                        nextI = resolveTarget(failTarget(step), i, steps, "stop")
                        if (nextI < 0) {
                            setStep(i, { status: "failed", gateMsg: "✗ gate failed - stopped" })
                            skipFrom(i + 1)
                            setRun({ status: "error", gateMsg: "✗ gate failed - stopped" })
                            return
                        }
                        setStep(i, { status: "failed", gateMsg: "✗ gate failed - routed" })
                        setRun({ gateMsg: "✗ gate failed - routed" })
                    }
                    // A goto landing at or before this step resets those steps to
                    // pending, so a loop shows fresh state on re-entry.
                    if (nextI <= i) {
                        set((s) =>
                            s.pipelineRun
                                ? {
                                      pipelineRun: {
                                          ...s.pipelineRun,
                                          steps: s.pipelineRun.steps.map((st, idx) =>
                                              idx >= nextI
                                                  ? { ...st, status: "pending", gateMsg: undefined }
                                                  : st
                                          )
                                      }
                                  }
                                : s
                        )
                    } else if (nextI > i + 1) {
                        // A forward goto jumped over steps — mark them skipped so the
                        // timeline reflects what actually ran (not stuck "pending").
                        set((s) =>
                            s.pipelineRun
                                ? {
                                      pipelineRun: {
                                          ...s.pipelineRun,
                                          steps: s.pipelineRun.steps.map((st, idx) =>
                                              idx > i && idx < nextI && st.status === "pending"
                                                  ? { ...st, status: "skipped" }
                                                  : st
                                          )
                                      }
                                  }
                                : s
                        )
                    }
                    i = nextI
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

        respondApproval: (termId, keys) => {
            window.api.pty.input(termId, keys)
            pushActivity("attention", termId, "answered prompt")
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

        jumpToPending: () => {
            const status = get().agentStatus
            const pending = Object.keys(status).filter(
                (id) => status[id] === "waiting" || status[id] === "attention"
            )
            if (!pending.length) return
            // Oldest first; attention outranks waiting at an equal age.
            pending.sort((a, b) => {
                const rank = (id: string): number => (status[id] === "attention" ? 0 : 1)
                if (rank(a) !== rank(b)) return rank(a) - rank(b)
                return (pendingSince.get(a) ?? 0) - (pendingSince.get(b) ?? 0)
            })
            get().jumpToTerm(pending[0])
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

        runCommandTab: (command, label) => {
            const s = get()
            const pid = s.activeId
            if (!pid) return
            // Reuse a shell tab already launched with this exact command, so hitting
            // Run/Watch twice focuses the running one instead of spawning a rival.
            for (const tab of s.tabsByProject[pid] ?? []) {
                for (const termId of collectLeaves(tab.root)) {
                    const agentId = s.termAgents[termId] ?? SHELL
                    if (!isAgentId(agentId) && s.termInit[termId] === command) {
                        s.jumpToTerm(termId)
                        return
                    }
                }
            }
            get().newTab(SHELL, command, label ?? command)
        },

        clearAgentResume: (termId) =>
            set((s) => {
                if (!(termId in s.agentResumePending)) return s
                const agentResumePending = { ...s.agentResumePending }
                delete agentResumePending[termId]
                return { agentResumePending }
            }),

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
