import { create } from "zustand"
import type { Project, WorkItem, ChangeFile } from "../../preload/index"
import { useSettings, aiModeAgents } from "./settings"
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
    hasLeaf,
    isLayoutNode
} from "./layout"
import type { PipelineRun, PipelineStepState } from "./pipeline"
import { runnableSteps, sessionPlan, resolveTarget, failTarget, RUN_STEP_CAP } from "./pipeline"
import { gateActive, evaluateGate, maxAttempts, isCommandGate, commandGatePasses } from "./gate"
import { undoToast } from "./toast"
import { toggleZoom } from "./paneNav"
import {
    pushClosed,
    restorePlan,
    reopenCommand,
    type ClosedSession
} from "./closedSessions"
import { diffPrompt, type DiffAiKind } from "./diffai"
import { LENSES, reviewPrompt, type Lens } from "./reviewLenses"
import {
    recordTail,
    forgetTail,
    recordRate,
    hasBell,
    markLaunched,
    getFullTail
} from "./missionTail"
import { detectApproval } from "./approval"
import {
    captureBaseline,
    adoptBaseline,
    forgetSignals,
    newPathsSince,
    baselineOf,
    markCheckFailed,
    clearCheckFailed
} from "./agentSignals"
import { holdersOf, holdersSummary, sameDir, type CwdHolder } from "./ownership"
import { recordExit, exitCodeOf, clearExit } from "./termExit"
import { recordMru, previousProjectId, orderByMru } from "./projectMru"
import { parseChecklist, costWindow, type BoardTask, type BoardColumn } from "./board"
import { confirm } from "./confirm"
import { routeAgent } from "./routing"
import { createRunRecorder } from "./runRecorder"

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
    /**
     * Panes held un-spawned until the user says what to do, by reason.
     *
     * `"resume"` — a restored workspace: the agent's conversation is not live yet.
     * `"restart"` — this pane's process exited; spawning over the corpse without
     * asking is what used to destroy the evidence of why it died.
     *
     * One field rather than two, because the two cases want the same thing: hold
     * the mount, show why, and route the relaunch through the accounting.
     */
    paneHold: Record<string, "resume" | "restart">
    /** Release a held pane: clear the hold, and log the run if it is an agent. */
    releaseHold: (termId: string) => void
    projects: Project[]
    activeId: string | null
    /** Project ids, most recently used first (persisted to localStorage). */
    projectMru: string[]
    switchToPreviousProject: () => void
    /** Frozen MRU walk while the modifier is held; null when not cycling. */
    projectCycle: { order: string[]; index: number } | null
    cycleProject: () => void
    commitProjectCycle: () => void
    init: () => Promise<void>
    /**
     * Non-null when workspace.json exists but could not be read, so nothing is
     * being persisted this session. Held in state (not a toast) because the
     * consequence lasts as long as the session does: a message that fades leaves
     * the user working for hours against a store that will never be written.
     */
    persistBlocked: { file: string; message: string } | null
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
    dispatchBoardTask: (id: string, opts: { worktree: boolean; agentId?: string }) => Promise<void>
    /**
     * Agents already holding uncommitted changes in `cwd` — the "who is in here
     * already" question, asked before a second agent joins them rather than after
     * they have both written. Hits git per live session, so call it on demand.
     */
    /**
     * Who else is working in `cwd`, and how many sessions could not be checked.
     *
     * `unreadable` exists because the alternative was a `.catch(() => [])` that
     * turned a failed `git status` into "that session is holding nothing" — and
     * the caller renders that as "Its own checkout, so it can't collide with an
     * agent already working in this project", which is a false all-clear.
     */
    holdersIn: (cwd: string) => Promise<{ holders: CwdHolder[]; unreadable: number }>
    /**
     * The directory a session's git reads resolve against. Exposed because more
     * than one view asks the same question, and two spellings of it drifted
     * apart once already (`?? projectPath` vs `|| projectPath`, which differ for
     * an empty-string entry). One rule, one expression.
     */
    sessionCwd: (termId: string) => string

    /**
     * Resolve once a session has printed its first byte and gone quiet for a
     * beat, or `false` if nothing arrived before the deadline.
     *
     * Exposed because readiness is not only the store's business: any surface
     * that spawns a session and then types into it needs the same answer, and
     * the alternative each one reached for was a hard-coded sleep.
     */
    whenReady: (termId: string, opts?: { settleMs?: number; timeoutMs?: number }) => Promise<boolean>

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
    /** Send a line of text to a session, as if typed into its terminal. */
    replySession: (termId: string, text: string) => void
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
    /**
     * Close a pane the way a person means it: the pane goes, and an undo toast
     * offers it back.
     *
     * This is deliberately the *default* name. The split used to be by view -
     * Tabs had undo, Overview and Canvas did not - which meant the two
     * cross-project surfaces silently lost a session on a mis-click. The safe
     * closer now owns the obvious name, and losing the undo takes an explicit
     * call to `closePaneSilent`.
     */
    closePane: (termId: string) => void
    /**
     * Close a pane with no undo offered.
     *
     * For closes a person did not ask for one pane at a time: a finished
     * pipeline step tidying itself up, or the multi-pane tab close, where an
     * undo that quietly restored one of three panes would lie.
     */
    closePaneSilent: (termId: string) => void
    closeActivePane: () => void
    /** The pane blown up to fill the stage, if any. Advisory: validZoom decides if it applies. */
    zoomedPane: string | undefined
    /** Zoom the given pane (default: the active one), or unzoom if it is already zoomed. */
    toggleZoomPane: (paneId?: string) => void
    /** Sessions closed this run, newest first, for undo. Not persisted: the ptys are gone. */
    closedSessions: ClosedSession[]
    /** Reopen the most recently closed session, resuming it where the agent supports it. */
    reopenLastClosed: () => void
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

/**
 * Keep only tabs whose persisted `root` is a real layout tree.
 *
 * One tab written by an older schema (or truncated mid-write) used to throw out
 * of `init()` on the `collectLeaves` walk. `init()` is called bare from App's
 * mount effect and there is no `unhandledrejection` handler, so the throw was
 * swallowed, `set()` never ran, and the store kept its module-load defaults -
 * which `beforeunload -> flush()` then wrote over the real workspace. Dropping
 * one tab loses one tab; letting it throw lost everything.
 */
function validateTabs(raw: Record<string, Tab[]> | undefined): Record<string, Tab[]> {
    const out: Record<string, Tab[]> = {}
    for (const [projectId, tabs] of Object.entries(raw ?? {})) {
        if (!Array.isArray(tabs)) continue
        const kept = tabs.filter((t) => t && typeof t === "object" && isLayoutNode(t.root))
        if (kept.length !== tabs.length) {
            console.warn(
                "[store] dropped %d tab(s) with an unreadable layout in project %s",
                tabs.length - kept.length,
                projectId
            )
        }
        if (kept.length) out[projectId] = kept
    }
    return out
}

export const useStore = create<AppState>((set, get) => {
    // No save may run until `init()` has applied whatever workspace.json holds
    // (or confirmed there is none, on a fresh install). Same guard as
    // settings.ts' `loaded`, and for the same reason: `beforeunload -> flush()`
    // calls writeNow() unconditionally, so without this, closing the window
    // during the load round-trip - or after a load that failed - writes the
    // module-load defaults over a real workspace. No click required.
    let loaded = false
    // Debounced disk persistence - coalesces bursts (e.g. composer keystrokes).
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    const writeNow = (): void => {
        if (!loaded) return
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

    /**
     * The directory a session's git evidence is read against.
     *
     * `captureBaseline` and the idle-timer evidence read MUST resolve the SAME
     * directory, through this one expression. The two produce path sets that are
     * compared against each other, so a baseline taken in the project root and a
     * status read taken in a worktree compare nothing meaningful: every path
     * would look new, and the card would move on no evidence at all.
     *
     * `||`, not `??`: an empty-string termCwd entry falls through to the project
     * path, the same way logUsageStart resolves the same session. The activeId
     * fallback came from releaseHold and is kept deliberately: a dispatch
     * into a project whose panes are not yet registered in tabsByProject would
     * otherwise resolve no directory at all.
     *
     * Known and not engineered around: this reads live store state at call time,
     * so editing a project's path between a session's launch and a later
     * evidence read would still resolve two different directories. Pre-existing,
     * vanishingly rare, and the cost of guarding it (pinning a directory per
     * session) is not worth paying - but written down so it is not rediscovered.
     */
    const sessionCwd = (termId: string): string =>
        get().termCwd[termId] ||
        get().projects.find((p) => p.id === (get().projectIdOfTerm(termId) ?? get().activeId))
            ?.path ||
        ""

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

    // Sessions with an evidence read out right now — see the guard in the idle
    // timer below. Cleared by the read itself, and by forget() for the case
    // where a pane closes while its read is in flight.
    const evidenceInFlight = new Set<string>()

    /**
     * Callbacks waiting for a session's first byte, keyed by termId.
     *
     * Readiness was always observable and never observed: `onPtyData` below
     * already sees the first byte of every session. Five call sites instead
     * slept 2800 ms and typed blind, and `pty.input` -> `writePty` drops a write
     * to a session that is not live yet **silently** — so a slow CLI boot lost
     * the prompt with no trace, while the card that prompt was for had already
     * been marked dispatched, given a cost window, and appended to a ledger that
     * ships no way to retract a line.
     */
    const readyWaiters = new Map<string, Set<() => void>>()

    /**
     * Resolve once this session looks ready for a prompt: its first byte, then a
     * short quiet settle (the CLI has finished painting).
     *
     * `false` means no byte arrived before the deadline. The old 2800 ms lives on
     * as that deadline rather than as the plan — an agent CLI that prints nothing
     * at all before it is ready must not be reported as failed, so the settle is
     * a lower bound and the caller is expected to send anyway and warn. Never
     * silently drop.
     */
    const whenReady = (
        termId: string,
        opts?: { settleMs?: number; timeoutMs?: number }
    ): Promise<boolean> => {
        const settleMs = opts?.settleMs ?? 300
        const timeoutMs = opts?.timeoutMs ?? 2800
        return new Promise((resolve) => {
            let sawByte = false
            let settle: ReturnType<typeof setTimeout> | undefined
            const finish = (ok: boolean): void => {
                clearTimeout(deadline)
                if (settle) clearTimeout(settle)
                const set = readyWaiters.get(termId)
                if (set) {
                    set.delete(onByte)
                    if (set.size === 0) readyWaiters.delete(termId)
                }
                resolve(ok)
            }
            const onByte = (): void => {
                sawByte = true
                if (settle) clearTimeout(settle)
                settle = setTimeout(() => finish(true), settleMs)
            }
            const deadline = setTimeout(() => {
                if (sawByte) {
                    // It spoke and never stopped — a CLI that streams continuously
                    // is ready, not absent.
                    finish(true)
                    return
                }
                // Nothing arrived through the stream, but the session may have
                // printed before this promise existed (a re-attach, or a spawn
                // that beat the subscription). Ask main once, on the failure
                // path only, rather than reporting a false negative.
                try {
                    window.api.pty
                        .buffer(termId)
                        .then((b) => finish(b.buffer.length > 0))
                        .catch(() => finish(false))
                } catch {
                    // A torn-down preload bridge throws SYNCHRONOUSLY, so there is
                    // no promise to catch on - and an unhandled throw in a timer
                    // would leave this promise pending forever.
                    finish(false)
                }
            }, timeoutMs)
            const existing = readyWaiters.get(termId)
            if (existing) existing.add(onByte)
            else readyWaiters.set(termId, new Set([onByte]))
        })
    }

    /**
     * Wait for the session, then send `text` as its first prompt.
     *
     * One place, because five call sites had the same three lines and the same
     * blind sleep. On a deadline miss the prompt still goes — the alternative is
     * losing work over a CLI that boots quietly — but the activity feed says so,
     * which is the part that did not exist before.
     */
    const promptWhenReady = async (termId: string, text: string): Promise<boolean> => {
        const ready = await whenReady(termId)
        if (!ready) {
            pushActivity(
                "attention",
                termId,
                "printed nothing before the prompt was sent — it may not have been received"
            )
        }
        window.api.pty.input(termId, text + "\r")
        return ready
    }

    const onPtyData = ({ id, data }: { id: string; data: string }): void => {
        // Ahead of everything, including the agent gate: readiness is about the
        // shell having started, and a plain shell tab waits on it too.
        const waiting = readyWaiters.get(id)
        if (waiting) for (const w of [...waiting]) w()
        // Backstop, ahead of the agent-only gate below: any output at all means
        // this id is alive right now, whether that's an ordinary respawn-in-place
        // or a stale exit event for a session a restart already replaced (I3) -
        // a plain shell has no agent id, so if this ran only for agents a shell
        // pane would keep a "process exited" bar forever with a live pty behind
        // it, and clicking Restart would spawn nothing.
        if (exitCodeOf(id) !== undefined) clearExit(id)
        if (id in get().paneHold) {
            set((s) => {
                const paneHold = { ...s.paneHold }
                delete paneHold[id]
                return { paneHold }
            })
        }
        if (!isAgentId(get().agentOf(id))) return
        // Keep a cleaned tail of this agent's output for the Mission Control peek.
        recordTail(id, data)
        // …and its committed-output rate, for the tile's trace.
        recordRate(id, data)
        const visible = isVisible(id)
        if (hasBell(id, data) && !visible) {
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
                        // A dispatched card moves to review only on EVIDENCE the
                        // agent produced something — not because it went quiet for
                        // a second. Unawaited so the timer stays synchronous, and
                        // fully caught: failing to move a card must never break a
                        // pty handler.
                        void (async () => {
                            try {
                                // `find`, not the blanket `map` this replaced: a
                                // termId belongs to exactly one dispatched card
                                // (dispatchBoardTask stamps it on one), and the
                                // re-check below has to name the card it re-checked
                                // to mean anything.
                                const task = get().boardTasks.find(
                                    (t) => t.termId === id && t.column === "doing"
                                )
                                if (!task) return
                                // "Quiet with evidence" is also true of "blocked
                                // mid-task": an agent that writes three files and
                                // then asks `Do you want to proceed? 1. Yes 2. No`
                                // is quiet, has real evidence, and is waiting on a
                                // keystroke. Filing that as ready for review hands
                                // you a half-applied change. detectApproval is the
                                // same classifier the Overview's one-click approve
                                // uses - pure, renderer-side, and cheaper than the
                                // git read it skips, so it goes before the spawn.
                                if (detectApproval(getFullTail(id, 16))) return
                                // sessionCwd, not termCwd directly: a dispatch with
                                // the worktree box off records no termCwd entry at
                                // all, and reading termCwd alone stranded every
                                // non-isolated card in doing forever.
                                const cwd = sessionCwd(id)
                                if (!cwd) return
                                // One read per session at a time. The spawn is per
                                // PAUSE, not per turn - a turn with ten thinking
                                // pauses is ten `git status` spawns - and without
                                // this a read that outlives the next pause overlaps
                                // itself, up to the 8s execFile timeout each.
                                // Skipping is free: the next pause reads again.
                                if (evidenceInFlight.has(id)) return
                                evidenceInFlight.add(id)
                                // A finally BLOCK, not a `.finally()` chained onto
                                // the call: if `changes` throws SYNCHRONOUSLY (a
                                // torn-down preload bridge) there is no promise to
                                // chain onto, the add has already happened, and
                                // nothing would ever release it - the outer catch
                                // swallows the throw and that session is deaf for
                                // the rest of its life.
                                let files: ChangeFile[]
                                try {
                                    files = await window.api.git.changes(cwd)
                                } catch (e) {
                                    // Remember the failure so the board can say
                                    // "couldn't check" rather than leaving a card
                                    // in Doing looking indistinguishable from an
                                    // agent that simply produced nothing.
                                    markCheckFailed(id)
                                    throw e
                                } finally {
                                    evidenceInFlight.delete(id)
                                }
                                clearCheckFailed(id)
                                const paths = files.map((f) => f.path)
                                // An UNKNOWN baseline used to be permanent: this
                                // read is armed only by onPtyData and runs once per
                                // idle expiry, and an agent that has finished emits
                                // nothing more - so one transient `git status`
                                // failure at the one moment it mattered stranded
                                // that card in doing for the rest of the session,
                                // silently. Adopt what is dirty NOW as the baseline
                                // and let the next pause judge against it: unknown
                                // self-heals instead of being terminal. Nothing
                                // moves on this pass - these paths are a starting
                                // point, not evidence.
                                if (!baselineOf(id)) {
                                    // Only for a session still live: this writes
                                    // into a module Map that forget() has already
                                    // cleared if the pane closed while we awaited.
                                    if (get().termAgents[id]) adoptBaseline(id, paths)
                                    return
                                }
                                const fresh = newPathsSince(baselineOf(id), paths)
                                if (fresh.length === 0) return
                                set((s) => ({
                                    boardTasks: s.boardTasks.map((t) =>
                                        t.id === task.id && t.column === "doing"
                                            ? { ...t, column: "review" }
                                            : t
                                    )
                                }))
                            } catch {
                                // Leave the card in doing. "Still working" is the
                                // honest reading when we cannot tell.
                            }
                        })()
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
        evidenceInFlight.delete(termId)
        forgetTail(termId)
        forgetSignals(termId)
        clearExit(termId)
        const closingAgent = get().termAgents[termId] ?? SHELL
        if (isAgentId(closingAgent)) {
            // Before logUsageEnd, which stamps the event this reads its start from.
            recordSessionRun(termId, closingAgent)
            useSettings.getState().logUsageEnd(termId)
        }
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
            const paneHold = { ...s.paneHold }
            delete paneHold[termId]
            return {
                agentStatus,
                termInit,
                termAgents,
                paneHold,
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

    // ---- Run ledger -------------------------------------------------------
    // The four write sites live in ./runRecorder — they are a cohesive unit with
    // a narrow interface, and the question they exist to answer ("may this cost
    // be summed?") is about a window in the past, which is testable there
    // without driving the whole store.
    const {
        recordCardRun,
        recordPipelineRun,
        recordSessionRun,
        claimTerm
    } = createRunRecorder(get, {
        newId,
        isAgentId,
        // Persisted with the card, so the "already recorded" guard survives a
        // quit exactly as `dispatchedAt` and `termId` do.
        markCardRecorded: (taskId, dispatchedAt) => {
            set((s) => ({
                boardTasks: s.boardTasks.map((t) =>
                    t.id === taskId ? { ...t, recordedFor: dispatchedAt } : t
                )
            }))
            persist()
        }
    })

    return {
        projects: [],
        activeId: null,
        projectMru: loadMru(),
        projectCycle: null,
        termAgents: {},
        termInit: {},
        paneHold: {},
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
        closedSessions: [],
        zoomedPane: undefined,
        notifications: [],
        persistBlocked: null,
        dismissNotification: (id) =>
            set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

        init: async () => {
            if (!dataSubscribed) {
                window.api.pty.onData(onPtyData)
                // App-global, not per-pane: TerminalPane's own onExit only fires while a
                // pane is mounted, and Mission has to know about a process that died in a
                // tab you were not looking at.
                window.api.pty.onExit(({ id, exitCode, stale }) => {
                    recordExit(id, exitCode)
                    // A stale exit belongs to a process a restart already spawned
                    // over (see pty.ts) - main skipped writing its corpse for the
                    // same reason, and holding this pane would freeze a "process
                    // exited" bar over a session that is actually live. recordExit
                    // above still runs unconditionally: it is the pre-existing
                    // self-healing lie (cleared by the next output, in onPtyData),
                    // not the bug this guards.
                    if (stale) return
                    // Hold the pane. Without this, the next remount spawns a fresh
                    // shell over the corpse - the pane is unmounted whenever its tab
                    // is not the active one, so with several terminals open that is
                    // the normal path, not an edge case.
                    set((s) => ({ paneHold: { ...s.paneHold, [id]: "restart" as const } }))
                })
                window.api.triggers.onFired(({ triggerId }) => get().fireTrigger(triggerId))
                dataSubscribed = true
            }
            const [store, ws] = await Promise.all([
                window.api.projects.list(),
                window.api.workspace.load()
            ])
            // "Not there yet" is a fresh install and safe to save over. "There
            // but unreadable" is not: persisting now would replace a workspace
            // we could not read with the defaults this module started on. Only
            // the first of those unlocks writeNow().
            if (!ws.ok && ws.reason === "unreadable") {
                set({
                    persistBlocked: {
                        file: "workspace.json",
                        message:
                            "could not be read, so your tabs and layout are not being saved this session."
                    }
                })
                console.error("[store] workspace.json unreadable - persistence disabled")
                return
            }
            const w =
                (ws.ok
                    ? (ws.data as (Partial<Persisted> & { termKinds?: Record<string, string> }) | null)
                    : null) ?? {}
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
            // Validate the persisted layout at this one door. A tab whose `root`
            // is absent or from an older schema would throw in collectLeaves
            // below; drop that tab, never the project it belongs to.
            const tabsByProject = validateTabs(w.tabsByProject)
            // Agent sessions from the previous run come back needing a resume/fresh
            // choice — their ptys died with the old process, so cold-relaunching
            // would silently drop each conversation.
            const paneHold: Record<string, "resume" | "restart"> = {}
            for (const tabs of Object.values(tabsByProject) as Tab[][]) {
                for (const tab of tabs) {
                    for (const id of collectLeaves(tab.root)) {
                        if (isAgentId(termAgents[id])) paneHold[id] = "resume"
                    }
                }
            }
            set({
                projects: store.projects,
                activeId: store.activeId,
                projectMru: seededMru,
                termAgents,
                termInit: w.termInit ?? {},
                paneHold,
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
            // Only from here on does in-memory state reflect what is on disk, so
            // only from here on may a save run. Set AFTER the set() above and on
            // both the ok and the "missing" paths - a fresh install must still be
            // able to persist.
            loaded = true
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

        /**
         * Walk back through recent projects, alt-tab style: each tap goes one
         * further back, and releasing the modifier commits where you landed.
         *
         * The order is FROZEN when the cycle starts, and MRU is not recorded
         * until commit. Both matter: `setActiveProject` records MRU on every
         * call, so a naive repeat-tap re-sorts the list under itself and just
         * ping-pongs between two projects — which is exactly what
         * switchToPreviousProject does on its own, by design.
         *
         * Only `activeId` moves while cycling. The IPC write and the pane ack
         * are deferred to commit, so a fast walk across five projects is one
         * write rather than five, and there is no ordering race between them.
         */
        cycleProject: () => {
            const st = get()
            const ids = st.projects.map((p) => p.id)
            if (ids.length < 2) return
            // Current project sorts to index 0, so the first tap lands on the
            // previous one — identical to a single switchToPreviousProject.
            const cur = st.projectCycle ?? { order: orderByMru(ids, st.projectMru), index: 0 }
            const order = cur.order.filter((id) => ids.includes(id))
            if (order.length < 2) return
            const index = (cur.index + 1) % order.length
            set({ projectCycle: { order, index }, activeId: order[index] })
        },

        /** Land the cycle: record MRU, persist, ack. No-op when not cycling. */
        commitProjectCycle: () => {
            const cyc = get().projectCycle
            if (!cyc) return
            set({ projectCycle: null })
            const id = cyc.order[cyc.index]
            if (get().projects.some((p) => p.id === id)) void get().setActiveProject(id)
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
            // Read the card before the move: reaching done is what ends the run,
            // and the record describes the card as it was at that moment. One
            // `endedAt` is shared by the card and the record so the two agree.
            const before = get().boardTasks.find((t) => t.id === id)
            const endedAt = Date.now()
            const ending = !!before?.dispatchedAt && !before.endedAt && column === "done"
            set((s) => ({
                boardTasks: s.boardTasks.map((t) => {
                    if (t.id !== id) return t
                    // Reaching done closes the cost window; moving back out of done
                    // reopens it, so a reopened card keeps accruing.
                    if (column === "done" && t.dispatchedAt && !t.endedAt) {
                        return { ...t, column, endedAt }
                    }
                    if (column !== "done" && t.endedAt) {
                        return { ...t, column, endedAt: undefined, cost: undefined, costTokens: undefined }
                    }
                    return { ...t, column }
                })
            }))
            // ENTERING `doing` rebases the session's evidence. Stated as a rule
            // about the destination on purpose, not as a list of source columns:
            // a path that was fresh against the launch baseline stays fresh for
            // the session's life, so any card put back to work would be yanked
            // forward to review on the very next idle pause having produced
            // nothing - the same "moved without evidence" complaint this whole
            // fix exists to answer, one level up. review -> doing ("not done,
            // keep going") and done -> doing (reopened; reaching done never
            // closed the pane, so its baseline is still the launch-time one) are
            // the same failure, and a column added later would be too.
            // todo -> doing matches as well, which is right: a card being
            // activated should start from a fresh baseline.
            //
            // Guarded on a LIVE agent session - once the pane is gone there is
            // nothing to baseline, and captureBaseline overwrites, so from here
            // only work done after the move counts.
            const enteringDoing = column === "doing" && !!before && before.column !== column
            if (enteringDoing && before.termId && isAgentId(get().agentOf(before.termId))) {
                captureBaseline(before.termId, sessionCwd(before.termId))
            }
            persist()
            // Written after the move, so a card that fails to record still moves.
            // Moving back out of done does not retract it: it was true when written.
            if (ending && before) recordCardRun(before, endedAt)
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
        sessionCwd,
        holdersIn: async (cwd) => {
            const st = get()
            const entries = await Promise.all(
                st.agentSessions().map(async (s) => {
                    // Same one rule as the evidence read and the conflict map: an
                    // empty-string termCwd entry must fall through, not be kept.
                    const dir = sessionCwd(s.termId)
                    // null, not [] - a read that failed says nothing about
                    // whether this session is in the way.
                    const files = await window.api.git
                        .changes(dir)
                        .then((cs) => cs.map((c) => c.path) as string[] | null)
                        .catch(() => null)
                    return { termId: s.termId, sessionName: s.sessionName, cwd: dir, files }
                })
            )
            const readable = entries.filter(
                (e): e is { termId: string; sessionName: string; cwd: string; files: string[] } =>
                    e.files !== null
            )
            return {
                holders: holdersOf(readable, cwd),
                // Scoped to THIS directory, exactly as holdersOf is. Counting
                // every failed read anywhere made a session mid-rebase in project
                // B warn about a collision in project A - and, since a session
                // whose cwd is outside every open project fails the IPC guard
                // permanently, it would have latched the warning on forever.
                unreadable: entries.filter((e) => e.files === null && sameDir(e.cwd, cwd)).length
            }
        },
        dispatchBoardTask: async (id, opts) => {
            const task = get().boardTasks.find((t) => t.id === id)
            if (!task) return
            const proj = get().projects.find((p) => p.id === task.projectId)
            if (!proj) return
            const settingsState = useSettings.getState()
            // Routing only ever targets an AI-mode preset: dispatch pastes the card's
            // title into the spawned session as its first prompt, which does nothing
            // useful in a "normal" (fixed-command) preset. A rule naming a shell preset
            // is treated exactly like a rule naming a deleted agent — skipped, falling
            // through the same way a dangling reference already does.
            const aiAgents = aiModeAgents(settingsState.agents)
            // Trust the caller's agentId only if it still names a real AI-mode preset —
            // the same subset routeAgent itself chooses from, so a caller can't hand in
            // a shell preset and have it treated as routed. (Today the only caller is
            // the board's override menu, which already lists AI-mode presets only, but
            // checking the same subset here keeps this in step with routeAgent instead
            // of trusting a wider list "just in case".)
            const requestedAgentId = opts.agentId
            const agentId =
                requestedAgentId && aiAgents.some((a) => a.id === requestedAgentId)
                    ? requestedAgentId
                    : routeAgent(
                          settingsState.routingRules,
                          { title: task.title, projectId: task.projectId },
                          aiAgents,
                          settingsState.defaultAgentId
                      ).agentId
            // No AI-mode preset exists to name: refuse rather than proceed with a blank
            // agent, which used to fall through to a bare shell tab that received the
            // raw card title as a literal pasted command 2.8s later.
            if (!agentId) {
                pushActivity("attention", "", "No AI agent preset is configured — add one in Settings to dispatch")
                return
            }
            const agent = settingsState.agents.find((a) => a.id === agentId)
            // One beat before spending real tokens: dispatch silently picked the
            // first agent preset, created a worktree, and pasted the card title
            // into the CLI — an accidental click cost money and left a worktree
            // behind. Name what's about to happen and let it be cancelled.
            // Without a worktree the new agent shares the project's working tree.
            // If someone is already editing it, say who and what they're holding —
            // the conflict map only tells you this after both have written.
            // A session we could not read is not an absence of conflict, and this
            // confirm is the last beat before real tokens are spent - it says so.
            const who = opts.worktree ? null : await get().holdersIn(proj.path)
            const clash = who
                ? holdersSummary(who.holders) ||
                  (who.unreadable > 0
                      ? `Couldn't check ${who.unreadable === 1 ? "one session" : `${who.unreadable} sessions`} for changes, so this may still collide with an agent already working here.`
                      : "")
                : ""

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
            // Re-dispatching displaces the previous pane: the card stops naming it
            // below, so nothing would recognise it as owned when it eventually
            // closes, and it would write a session record over a window the
            // earlier dispatch's card record already covers. Keep it suppressed.
            // Only if it is still open — a pane already closed was recognised as
            // owned while the card still named it, and claiming it now would leave
            // an entry nothing can remove.
            const displaced = get().boardTasks.find((t) => t.id === id)?.termId
            if (displaced && displaced !== termId && get().termAgents[displaced])
                claimTerm(displaced)
            set((s) => ({
                boardTasks: s.boardTasks.map((t) =>
                    t.id === id
                        ? {
                              ...t,
                              column: "doing",
                              termId,
                              // Both stamped here because here is the last moment
                              // they are guaranteed knowable: the pane closes long
                              // before the card is filed, and the project can be
                              // removed before that. A run record built from live
                              // lookups afterwards would have a blank agent and a
                              // blank project name.
                              agentId,
                              projectName: proj.name,
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
            // The card's baseline, taken where the card starts - not where the
            // pane does. Only this path ever writes task.termId, so this and the
            // rebase in moveBoardTask are the only two captures any reader can
            // reach; capturing on every launch instead meant splitActive and
            // openWorkspacePreset each fired a `git status` for a baseline
            // nothing could ever consult (a six-pane preset fired six), and a
            // fifth launch path would have had to remember to join in.
            //
            // After the set above, so sessionCwd resolves the worktree this
            // dispatch may have just created; before the 2800ms boot wait, which
            // is orders of magnitude more than this IPC round-trip needs.
            captureBaseline(termId, sessionCwd(termId))
            persist()
            // Wait for the CLI's first byte, not for a fixed 2800ms. The card
            // above is already `doing` with a cost window open and a ledger line
            // behind it, so a prompt that never landed would leave a permanent
            // record saying it did.
            await promptWhenReady(termId, task.title)
            set({ lastAgentTermId: termId })
        },

        whenReady,

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
            await promptWhenReady(termId, prompt)
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
            // Each reviewer waits for its OWN first byte, in parallel - one slow
            // lens no longer decides when the others are typed into.
            await Promise.all(
                spawned.map(({ termId, lens }) => promptWhenReady(termId, reviewPrompt(lens)))
            )
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
            await promptWhenReady(termId, brief)
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
            // Recorded here as well as in the runner: bumping the token makes the
            // runner return without ever setting a terminal status, so this is the
            // only place a stopped run is observed ending.
            recordPipelineRun(get().pipelineRun, "stopped")
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

            // Starting a run stomps whatever is already in flight: the token bump
            // below makes the old runner return without ever setting a terminal
            // status, so its spend would never be recorded at all. Same shape as
            // stopPipeline, and for the same reason - this is the only place that
            // run is observed ending. recordPipelineRun ignores a run it has
            // already written, so a previous run that finished cleanly is not
            // recorded twice as "stopped".
            recordPipelineRun(get().pipelineRun, "stopped")
            pipelineToken += 1
            const token = pipelineToken
            const stale = (): boolean => token !== pipelineToken

            // Every terminal transition records the run, and it does so here
            // rather than at the five places that make one: the runner exits on
            // a step cap, a missing session, a dangling goto, a failed gate and
            // completion, and a sixth exit added later would otherwise be one
            // more run whose spend is silently discarded. recordPipelineRun
            // ignores repeats of the same run.
            const setRun = (patch: Partial<PipelineRun>): void => {
                set((s) => ({ pipelineRun: s.pipelineRun ? { ...s.pipelineRun, ...patch } : s.pipelineRun }))
                if (patch.status === "done" || patch.status === "error")
                    recordPipelineRun(get().pipelineRun, patch.status === "done" ? "done" : "failed")
            }

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

            /**
             * Wait until an agent term has settled: seen working, then idle for a beat.
             *
             * The result is a discriminated `ok`, not a three-way union of strings.
             * The union named "gone" — the session left the grid, killed or crashed
             * — and the dispatch below handled only "stopped", so a step whose agent
             * died fell into the SUCCESS branch: marked `done`, a ✓ in the pipeline
             * bar, and the run finishing `status: "done"` on work that never
             * happened. With `ok`, falling through on an outcome nobody enumerated
             * is impossible rather than merely wrong.
             */
            const waitForIdle = async (
                termId: string
            ): Promise<{ ok: true } | { ok: false; reason: "stopped" | "gone" }> => {
                const start = Date.now()
                let sawWork = false
                for (;;) {
                    if (stale()) return { ok: false, reason: "stopped" }
                    if (!get().termAgents[termId]) return { ok: false, reason: "gone" }
                    const st = get().agentStatus[termId]
                    if (st === "working") sawWork = true
                    if (st === "attention") setRun({ status: "waiting" })
                    else if (get().pipelineRun?.status === "waiting") setRun({ status: "running" })
                    const elapsed = Date.now() - start
                    // Require either observed work or a minimum grace, then a stable idle.
                    if (st === "idle" && (sawWork || elapsed > 4000) && elapsed > 1500)
                        return { ok: true }
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
                        // Wait for the CLI's first byte before the prompt below is
                        // written; a step whose prompt was dropped into a pty that
                        // was not reading yet ran nothing and still got a gate.
                        if (!(await whenReady(termId))) {
                            pushActivity(
                                "attention",
                                termId,
                                "printed nothing before its step prompt was sent"
                            )
                        }
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
                        if (!result.ok) {
                            // "stopped" is the user's Stop: the run is already being
                            // torn down, so leave quietly. "gone" is the session
                            // dying mid-step, which used to reach the success branch
                            // below and mark the step done.
                            if (result.reason === "stopped") return
                            passed = false
                            setStep(i, { status: "failed", gateMsg: "session went away mid-step" })
                            setRun({ status: "error", gateMsg: "the agent session went away mid-step" })
                            skipFrom(i + 1)
                            return
                        }

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

        /**
         * Answer an agent in a sentence, from wherever you are.
         *
         * A store action so every surface that can reply — Mission's tiles
         * included — shares what "a reply" means. Trims, and refuses to send an
         * empty line: a bare carriage return into a live agent is a keystroke
         * nobody asked for.
         */
        replySession: (termId, text) => {
            const line = text.trim()
            if (!line) return
            window.api.pty.input(termId, line + "\r")
            pushActivity("attention", termId, "replied")
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
                markLaunched(termId)
                pushActivity("start", termId, `${tab.name} · started`)
                // The directory, not just the project: an isolated session runs in
                // `cwd` (a worktree), which is its own transcript folder.
                useSettings
                    .getState()
                    .logUsageStart(
                        termId,
                        agentId,
                        projectId,
                        cwd || get().projects.find((p) => p.id === projectId)?.path
                    )
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

        releaseHold: (termId) => {
            if (!(termId in get().paneHold)) return
            // agentId is read here, before the clearing set() below: this set()
            // does not touch termAgents, but the read still has to stay on this
            // side of it, because the whole point is to decide accounting from
            // the pane's state as the caller found it, not from state a clear
            // just changed underneath the decision.
            const agentId = get().termAgents[termId]
            set((s) => {
                const paneHold = { ...s.paneHold }
                delete paneHold[termId]
                return { paneHold }
            })
            // The bail runs AFTER the clear above, not before: a plain shell's
            // hold must be released on restart the same as an agent pane's, even
            // though a plain shell gets no accounting. It still runs before
            // markLaunched/logUsageStart below, so a plain shell - which has no
            // agent id and costs nothing - never gets a usage event logged for it.
            if (!isAgentId(agentId)) return
            // Resume and restart are the only two ways an agent pane starts
            // without going through newTab, so without this the pane spends real
            // money that no usage event has ever seen. It is not only its own
            // missing record: exclusivity is answered from usageLog, so an
            // unlogged session sitting in a project directory silently lets every
            // card, pipeline and session whose window it overlaps be written as
            // an exclusive receipt over money that was partly its.
            //
            // Every mode logs. "fresh" starts a new conversation and "restart"
            // follows a crash, but each is the same agent in the same directory
            // costing the same money - the distinction matters to the user's
            // context, not to the accounting.
            const projectId = get().projectIdOfTerm(termId) ?? get().activeId ?? ""
            // `||`, not `??`: an empty-string entry in termCwd must fall through
            // to the project path the same way newTab's logUsageStart call does,
            // rather than being kept as a cwd-less event.
            const cwd = get().termCwd[termId] || get().projects.find((p) => p.id === projectId)?.path
            // Close the crashed run's event BEFORE opening this one. logUsageStart
            // appends unconditionally and nothing else ends an event when a process
            // dies, so without this a pane that crashed at T1 and got resumed at T2
            // leaves its T0 event open until the pane is finally closed at T3 -
            // stamping endedAt=T3 on both the stale event and the new one, and
            // UsagePanel sums durationOf per event, so the dead gap T1-T2 gets
            // billed twice: once as part of the stale event, once as part of the
            // new one's own runtime. logUsageEnd is a no-op for an id with no open
            // event, so this costs nothing on the ordinary "resume a restored
            // session" path.
            useSettings.getState().logUsageEnd(termId)
            markLaunched(termId)
            useSettings.getState().logUsageStart(termId, agentId, projectId, cwd)
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
            if (isAgentId(agentId)) {
                markLaunched(newTermId)
                useSettings
                    .getState()
                    .logUsageStart(
                        newTermId,
                        agentId,
                        projectId,
                        s.projects.find((p) => p.id === projectId)?.path
                    )
            }
            persist()
        },

        closePaneSilent: (termId) => {
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
            // Record what would be needed to bring this back, BEFORE forget()
            // below deletes the maps it reads (agent, cwd, shell, name).
            if (ownerProject && ownerTab) {
                const closingAgent = s.agentOf(termId)
                set({
                    closedSessions: pushClosed(s.closedSessions, {
                        termId,
                        projectId: ownerProject,
                        tabId: ownerTab.id,
                        tabName: ownerTab.name,
                        name: s.termNames[termId] ?? ownerTab.name,
                        agentId: closingAgent,
                        isAgent: isAgentId(closingAgent),
                        cwd: s.termCwd[termId],
                        shellKind: s.termShells[termId],
                        initialCommand: s.termInit[termId],
                        closedAt: Date.now()
                    })
                })
            }

            // If this pane was recording, persist the recording before it dies.
            //
            // `rec.stop` is an `ipcMain.handle` that can reject two ways, and the
            // clear used to run unconditionally on the same tick: the UI marked
            // the recording saved at the exact moment the only copy of the events
            // could be being dropped. It is sent before `pty.kill` deliberately -
            // both cross the same channel in order, so the recorder sees the stop
            // while its pty is still alive.
            if (s.recordingTermId === termId) {
                const label = ownerTab?.name ?? "session"
                void window.api.rec
                    .stop(termId, label)
                    .catch((e: Error) => {
                        // The pane is already gone, so there is nothing left to
                        // retry from: clear the indicator, but say what happened
                        // rather than claim a file exists. Main still holds the
                        // events, and `flushAll()` gets one more attempt on quit.
                        get().noteRecording(termId, `${label} · not saved: ${e.message}`)
                    })
                    .finally(() => set({ recordingTermId: null }))
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

        closePane: (termId) => {
            // The default closer, so a new call site gets the safe behaviour
            // without having to know that the other one exists. A closer that
            // must NOT offer undo - a finished pipeline step, the multi-pane tab
            // close - says so by calling `closePaneSilent`.
            const s = get()
            const label = s.termNames[termId] ?? s.activeTab(s.activeId ?? "")?.name ?? "session"
            s.closePaneSilent(termId)
            undoToast(`Closed ${label}`, () => get().reopenLastClosed())
        },

        toggleZoomPane: (paneId) => {
            const s = get()
            const target = paneId ?? (s.activeId ? s.activePane(s.activeId) : undefined)
            if (!target) return
            set({ zoomedPane: toggleZoom(s.zoomedPane, target) })
        },

        reopenLastClosed: () => {
            const s = get()
            const entry = s.closedSessions[0]
            if (!entry) return
            const rest = s.closedSessions.slice(1)
            const tabs = s.tabsByProject[entry.projectId] ?? []
            const preset = entry.isAgent
                ? useSettings.getState().agentById(entry.agentId)
                : undefined
            const command = reopenCommand(entry, preset)
            const plan = restorePlan(entry, tabs)

            // The entry is consumed either way: one undo, one reopen, so a second
            // press cannot spawn a duplicate of the same session.
            if (plan.kind === "new-tab") {
                // newTab spawns into the ACTIVE project, so point that at the
                // entry's project first - undo can be pressed after a switch.
                set({ activeId: entry.projectId, closedSessions: rest })
                get().newTab(entry.agentId, command, entry.name, entry.cwd, entry.shellKind)
                return
            }

            const tab = tabs.find((t) => t.id === plan.tabId)
            if (!tab) return
            const termId = newId()
            const root = splitLeaf(tab.root, firstLeaf(tab.root), "row", termId)
            set({
                closedSessions: rest,
                activeId: entry.projectId,
                view: "terminal",
                termAgents: { ...s.termAgents, [termId]: entry.agentId },
                termInit: command ? { ...s.termInit, [termId]: command } : s.termInit,
                termCwd: entry.cwd ? { ...s.termCwd, [termId]: entry.cwd } : s.termCwd,
                termNames: { ...s.termNames, [termId]: entry.name },
                termShells: entry.shellKind
                    ? { ...s.termShells, [termId]: entry.shellKind }
                    : s.termShells,
                agentStatus: entry.isAgent
                    ? { ...s.agentStatus, [termId]: "working" }
                    : s.agentStatus,
                tabsByProject: {
                    ...s.tabsByProject,
                    [entry.projectId]: tabs.map((t) => (t.id === tab.id ? { ...t, root } : t))
                },
                activeTabByProject: { ...s.activeTabByProject, [entry.projectId]: tab.id },
                activePaneByProject: { ...s.activePaneByProject, [entry.projectId]: termId },
                lastAgentTermId: entry.isAgent ? termId : s.lastAgentTermId
            })
            if (entry.isAgent) {
                markLaunched(termId)
                pushActivity("start", termId, `${entry.name} · reopened`)
                useSettings
                    .getState()
                    .logUsageStart(
                        termId,
                        entry.agentId,
                        entry.projectId,
                        entry.cwd || s.projects.find((p) => p.id === entry.projectId)?.path
                    )
            }
            persist()
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
            for (const termId of startedAgents) {
                markLaunched(termId)
                useSettings
                    .getState()
                    .logUsageStart(
                        termId,
                        termAgents[termId],
                        pid,
                        get().projects.find((p) => p.id === pid)?.path
                    )
            }
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
