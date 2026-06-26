import { create } from "zustand"
import type { Project } from "../../preload/index"
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

export type TermKind = "shell" | "claude"
export type MainView = "terminal" | "editor" | "api" | "database"
export type ClaudeStatus = "working" | "idle" | "attention"

export interface Tab {
    id: string
    name: string
    root: LayoutNode
}

export interface ClaudeSession {
    termId: string
    projectId: string
    projectName: string
    tabName: string
    status: ClaudeStatus
}

/** The serializable slice persisted to workspace.json. */
interface Persisted {
    termKinds: Record<string, TermKind>
    termInit: Record<string, string>
    tabsByProject: Record<string, Tab[]>
    activeTabByProject: Record<string, string | undefined>
    activePaneByProject: Record<string, string | undefined>
}

interface AppState extends Persisted {
    // Projects
    projects: Project[]
    activeId: string | null
    init: () => Promise<void>
    addProject: () => Promise<void>
    removeProject: (id: string) => Promise<void>
    setActiveProject: (id: string) => Promise<void>
    activeProject: () => Project | undefined

    // Main view
    view: MainView
    setView: (view: MainView) => void

    // Claude session awareness (runtime-only, not persisted)
    claudeStatus: Record<string, ClaudeStatus>
    lastClaudeTermId: string | null
    claudeSessions: () => ClaudeSession[]
    sendToClaude: (text: string) => boolean
    jumpToTerm: (termId: string) => void

    // Terminal selectors
    tabsFor: (projectId: string) => Tab[]
    activeTab: (projectId: string) => Tab | undefined
    activePane: (projectId: string) => string | undefined
    kindOf: (termId: string) => TermKind

    // Terminal actions
    newTab: (kind: TermKind, initialCommand?: string) => void
    splitActive: (dir: SplitDir, kind: TermKind) => void
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

// Idle-debounce timers per claude session (module scope; renderer-lifetime).
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
let dataSubscribed = false

export const useStore = create<AppState>((set, get) => {
    const persist = (): void => {
        const s = get()
        window.api.workspace.save({
            termKinds: s.termKinds,
            termInit: s.termInit,
            tabsByProject: s.tabsByProject,
            activeTabByProject: s.activeTabByProject,
            activePaneByProject: s.activePaneByProject
        } satisfies Persisted)
    }

    const setStatus = (termId: string, status: ClaudeStatus): void => {
        if (get().claudeStatus[termId] === status) return
        set((s) => ({ claudeStatus: { ...s.claudeStatus, [termId]: status } }))
    }

    // Acknowledge a session becoming visible: it's the last-focused Claude, and
    // any pending "attention" is cleared.
    const ack = (termId?: string): void => {
        if (!termId || get().kindOf(termId) !== "claude") return
        set((s) => ({
            lastClaudeTermId: termId,
            claudeStatus:
                s.claudeStatus[termId] === "attention"
                    ? { ...s.claudeStatus, [termId]: "idle" }
                    : s.claudeStatus
        }))
    }

    const isVisible = (termId: string): boolean => {
        const s = get()
        return s.view === "terminal" && !!s.activeId && s.activePaneByProject[s.activeId] === termId
    }

    // Format-independent status: bell => attention (for hidden sessions),
    // any output => working, then idle after a quiet period.
    const onPtyData = ({ id, data }: { id: string; data: string }): void => {
        if (get().kindOf(id) !== "claude") return
        const visible = isVisible(id)
        if (data.includes("\x07") && !visible) {
            setStatus(id, "attention")
            return
        }
        if (get().claudeStatus[id] !== "attention" || visible) {
            setStatus(id, "working")
        }
        const existing = idleTimers.get(id)
        if (existing) clearTimeout(existing)
        idleTimers.set(
            id,
            setTimeout(
                () => {
                    if (get().claudeStatus[id] === "working") setStatus(id, "idle")
                },
                useSettings.getState().claude.attentionIdleMs
            )
        )
    }

    const forget = (termId: string): void => {
        const t = idleTimers.get(termId)
        if (t) clearTimeout(t)
        idleTimers.delete(termId)
        set((s) => {
            if (!(termId in s.claudeStatus) && !(termId in s.termInit)) return {}
            const claudeStatus = { ...s.claudeStatus }
            delete claudeStatus[termId]
            const termInit = { ...s.termInit }
            delete termInit[termId]
            return {
                claudeStatus,
                termInit,
                lastClaudeTermId: s.lastClaudeTermId === termId ? null : s.lastClaudeTermId
            }
        })
    }

    return {
        projects: [],
        activeId: null,
        termKinds: {},
        termInit: {},
        tabsByProject: {},
        activeTabByProject: {},
        activePaneByProject: {},
        view: "terminal",
        claudeStatus: {},
        lastClaudeTermId: null,

        init: async () => {
            if (!dataSubscribed) {
                window.api.pty.onData(onPtyData)
                dataSubscribed = true
            }
            const [store, ws] = await Promise.all([
                window.api.projects.list(),
                window.api.workspace.load()
            ])
            const w = (ws as Partial<Persisted> | null) ?? {}
            set({
                projects: store.projects,
                activeId: store.activeId,
                termKinds: w.termKinds ?? {},
                termInit: w.termInit ?? {},
                tabsByProject: w.tabsByProject ?? {},
                activeTabByProject: w.activeTabByProject ?? {},
                activePaneByProject: w.activePaneByProject ?? {}
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

        activeProject: () => get().projects.find((p) => p.id === get().activeId),

        setView: (view) => {
            set({ view })
            if (view === "terminal" && get().activeId) {
                ack(get().activePaneByProject[get().activeId as string])
            }
        },

        claudeSessions: () => {
            const s = get()
            const out: ClaudeSession[] = []
            for (const [pid, tabs] of Object.entries(s.tabsByProject)) {
                const project = s.projects.find((p) => p.id === pid)
                for (const tab of tabs) {
                    for (const termId of collectLeaves(tab.root)) {
                        if (s.termKinds[termId] === "claude") {
                            out.push({
                                termId,
                                projectId: pid,
                                projectName: project?.name ?? "—",
                                tabName: tab.name,
                                status: s.claudeStatus[termId] ?? "idle"
                            })
                        }
                    }
                }
            }
            return out
        },

        sendToClaude: (text) => {
            const id = get().lastClaudeTermId
            if (!id) return false
            window.api.pty.input(id, text)
            return true
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

        tabsFor: (projectId) => get().tabsByProject[projectId] ?? [],
        activeTab: (projectId) => {
            const tabs = get().tabsByProject[projectId] ?? []
            const activeId = get().activeTabByProject[projectId]
            return tabs.find((t) => t.id === activeId) ?? tabs[0]
        },
        activePane: (projectId) => get().activePaneByProject[projectId],
        kindOf: (termId) => get().termKinds[termId] ?? "shell",

        newTab: (kind, initialCommand) => {
            const projectId = get().activeId
            if (!projectId) return
            const termId = newId()
            const tabId = newId()
            const count = (get().tabsByProject[projectId] ?? []).length + 1
            const init =
                kind === "claude"
                    ? (initialCommand ?? useSettings.getState().claude.command)
                    : undefined
            const tab: Tab = {
                id: tabId,
                name: `${kind === "claude" ? "claude" : "shell"} ${count}`,
                root: leaf(termId)
            }
            set((s) => ({
                termKinds: { ...s.termKinds, [termId]: kind },
                termInit: init ? { ...s.termInit, [termId]: init } : s.termInit,
                claudeStatus:
                    kind === "claude" ? { ...s.claudeStatus, [termId]: "working" } : s.claudeStatus,
                tabsByProject: {
                    ...s.tabsByProject,
                    [projectId]: [...(s.tabsByProject[projectId] ?? []), tab]
                },
                activeTabByProject: { ...s.activeTabByProject, [projectId]: tabId },
                activePaneByProject: { ...s.activePaneByProject, [projectId]: termId },
                lastClaudeTermId: kind === "claude" ? termId : s.lastClaudeTermId,
                view: "terminal"
            }))
            persist()
        },

        splitActive: (dir, kind) => {
            const s = get()
            const projectId = s.activeId
            if (!projectId) return
            const tab = s.activeTab(projectId)
            if (!tab) return
            const target = s.activePane(projectId) ?? firstLeaf(tab.root)
            const newTermId = newId()
            const root = splitLeaf(tab.root, target, dir, newTermId)
            const tabs = (s.tabsByProject[projectId] ?? []).map((t) =>
                t.id === tab.id ? { ...t, root } : t
            )
            set({
                termKinds: { ...s.termKinds, [newTermId]: kind },
                termInit:
                    kind === "claude"
                        ? { ...s.termInit, [newTermId]: useSettings.getState().claude.command }
                        : s.termInit,
                claudeStatus:
                    kind === "claude"
                        ? { ...s.claudeStatus, [newTermId]: "working" }
                        : s.claudeStatus,
                tabsByProject: { ...s.tabsByProject, [projectId]: tabs },
                activePaneByProject: { ...s.activePaneByProject, [projectId]: newTermId },
                lastClaudeTermId: kind === "claude" ? newTermId : s.lastClaudeTermId
            })
            persist()
        },

        closePane: (termId) => {
            const s = get()
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
