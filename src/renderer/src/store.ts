import { create } from "zustand"
import type { Project } from "../../preload/index"
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

export interface Tab {
    id: string
    name: string
    root: LayoutNode
}

/** The serializable slice persisted to workspace.json. */
interface Persisted {
    termKinds: Record<string, TermKind>
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

    // Terminal selectors
    tabsFor: (projectId: string) => Tab[]
    activeTab: (projectId: string) => Tab | undefined
    activePane: (projectId: string) => string | undefined
    kindOf: (termId: string) => TermKind

    // Terminal actions
    newTab: (kind: TermKind) => void
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

export const useStore = create<AppState>((set, get) => {
    // Persist the terminal slice after any mutation.
    const persist = (): void => {
        const s = get()
        window.api.workspace.save({
            termKinds: s.termKinds,
            tabsByProject: s.tabsByProject,
            activeTabByProject: s.activeTabByProject,
            activePaneByProject: s.activePaneByProject
        } satisfies Persisted)
    }

    return {
        projects: [],
        activeId: null,
        termKinds: {},
        tabsByProject: {},
        activeTabByProject: {},
        activePaneByProject: {},
        view: "terminal",

        init: async () => {
            const [store, ws] = await Promise.all([
                window.api.projects.list(),
                window.api.workspace.load()
            ])
            const w = (ws as Partial<Persisted> | null) ?? {}
            set({
                projects: store.projects,
                activeId: store.activeId,
                termKinds: w.termKinds ?? {},
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
            // Kill every pty belonging to this project's tabs.
            for (const tab of s.tabsByProject[id] ?? []) {
                for (const termId of collectLeaves(tab.root)) {
                    window.api.pty.kill(termId)
                }
            }
            const tabsByProject = { ...s.tabsByProject }
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
        },

        activeProject: () => get().projects.find((p) => p.id === get().activeId),

        setView: (view) => set({ view }),

        tabsFor: (projectId) => get().tabsByProject[projectId] ?? [],
        activeTab: (projectId) => {
            const tabs = get().tabsByProject[projectId] ?? []
            const activeId = get().activeTabByProject[projectId]
            return tabs.find((t) => t.id === activeId) ?? tabs[0]
        },
        activePane: (projectId) => get().activePaneByProject[projectId],
        kindOf: (termId) => get().termKinds[termId] ?? "shell",

        newTab: (kind) => {
            const projectId = get().activeId
            if (!projectId) return
            const termId = newId()
            const tabId = newId()
            const count = (get().tabsByProject[projectId] ?? []).length + 1
            const tab: Tab = {
                id: tabId,
                name: `${kind === "claude" ? "claude" : "shell"} ${count}`,
                root: leaf(termId)
            }
            set((s) => ({
                termKinds: { ...s.termKinds, [termId]: kind },
                tabsByProject: {
                    ...s.tabsByProject,
                    [projectId]: [...(s.tabsByProject[projectId] ?? []), tab]
                },
                activeTabByProject: { ...s.activeTabByProject, [projectId]: tabId },
                activePaneByProject: { ...s.activePaneByProject, [projectId]: termId },
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
                tabsByProject: { ...s.tabsByProject, [projectId]: tabs },
                activePaneByProject: { ...s.activePaneByProject, [projectId]: newTermId }
            })
            persist()
        },

        closePane: (termId) => {
            const s = get()
            // Find the project + tab that owns this pane.
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
            if (!ownerProject || !ownerTab) return

            const newRoot = removeLeaf(ownerTab.root, termId)
            const tabsByProject = { ...s.tabsByProject }
            const activeTabByProject = { ...s.activeTabByProject }
            const activePaneByProject = { ...s.activePaneByProject }

            if (newRoot === null) {
                // Tab is now empty — drop it.
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
            set({
                activeTabByProject: { ...s.activeTabByProject, [projectId]: tabId },
                activePaneByProject: {
                    ...s.activePaneByProject,
                    [projectId]: tab ? firstLeaf(tab.root) : undefined
                }
            })
            persist()
        },

        focusPane: (projectId, termId) => {
            set((s) => ({
                activePaneByProject: { ...s.activePaneByProject, [projectId]: termId }
            }))
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
