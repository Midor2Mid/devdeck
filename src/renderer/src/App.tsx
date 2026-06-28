import { useEffect } from "react"
import { Allotment } from "allotment"
import { useStore, type MainView } from "./store"
import { useSettings } from "./settings"
import { Sidebar } from "./components/Sidebar"
import { TerminalView } from "./components/TerminalView"
import { ApiPanel } from "./components/ApiPanel"
import { EditorPanel } from "./components/EditorPanel"
import { DbPanel } from "./components/DbPanel"
import { BrowserPanel } from "./components/BrowserPanel"
import { SettingsModal } from "./components/SettingsModal"
import { ProjectSwitcher } from "./components/ProjectSwitcher"
import { CommandPalette } from "./components/CommandPalette"
import { ActivityPanel } from "./components/ActivityPanel"
import { RecordingsModal } from "./components/RecordingsModal"
import { PipelineBar } from "./components/PipelineBar"
import { WorktreesModal } from "./components/WorktreesModal"
import { ChangesModal } from "./components/ChangesModal"
import { WorkPanel } from "./components/WorkPanel"
import { ReleaseBoard } from "./components/ReleaseBoard"
import { StandupModal } from "./components/StandupModal"
import { StatusBar } from "./components/StatusBar"
import { Toasts } from "./components/Toasts"
import { ShortcutsModal } from "./components/ShortcutsModal"
import { IntroTip } from "./components/IntroTip"

const VIEWS: { key: MainView; label: string }[] = [
    { key: "terminal", label: "Terminal" },
    { key: "editor", label: "Editor" },
    { key: "api", label: "API" },
    { key: "database", label: "Database" },
    { key: "browser", label: "Browser" }
]

export function App(): JSX.Element {
    const { init, view, setView, activeProject } = useStore()
    const loadSettings = useSettings((s) => s.load)
    const settingsOpen = useSettings((s) => s.settingsOpen)
    const switcherOpen = useStore((s) => s.switcherOpen)
    const openSwitcher = useStore((s) => s.openSwitcher)
    const closeSwitcher = useStore((s) => s.closeSwitcher)
    const paletteOpen = useStore((s) => s.paletteOpen)
    const shortcutsOpen = useStore((s) => s.shortcutsOpen)
    const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
    const activityOpen = useStore((s) => s.activityOpen)
    const recordingsOpen = useStore((s) => s.recordingsOpen)
    const worktreesOpen = useStore((s) => s.worktreesOpen)
    const changesTarget = useStore((s) => s.changesTarget)
    const workOpen = useStore((s) => s.workOpen)
    const releaseOpen = useStore((s) => s.releaseOpen)
    const standupOpen = useStore((s) => s.standupOpen)
    const project = activeProject()

    // Re-sync the mobile session snapshot whenever sessions/status/projects change.
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const termAgents = useStore((s) => s.termAgents)
    const projects = useStore((s) => s.projects)
    const sessions = useStore((s) => s.sessions)
    const newTabIn = useStore((s) => s.newTabIn)

    useEffect(() => {
        init()
        loadSettings()
        // Flush any pending debounced writes before the window tears down.
        const flush = (): void => {
            useStore.getState().flush()
            useSettings.getState().flush()
        }
        window.addEventListener("beforeunload", flush)
        return () => window.removeEventListener("beforeunload", flush)
    }, [init, loadSettings])

    useEffect(() => {
        window.api.mobile.syncSessions(sessions())
    }, [tabsByProject, agentStatus, termAgents, projects, sessions])

    useEffect(() => {
        return window.api.mobile.onNew(({ projectId }) =>
            newTabIn(projectId, useSettings.getState().agents[0]?.id ?? "claude")
        )
    }, [newTabIn])

    // Global shortcuts: Ctrl+K project switcher, Ctrl+Shift+P command palette.
    useEffect(() => {
        const handler = (e: KeyboardEvent): void => {
            const mod = e.ctrlKey || e.metaKey
            if (e.code === "F1") {
                e.preventDefault()
                const s = useStore.getState()
                s.setShortcutsOpen(!s.shortcutsOpen)
            } else if (mod && e.shiftKey && e.code === "KeyP") {
                e.preventDefault()
                e.stopPropagation()
                const s = useStore.getState()
                s.setPaletteOpen(!s.paletteOpen)
            } else if (mod && !e.shiftKey && e.key.toLowerCase() === "k") {
                e.preventDefault()
                if (useStore.getState().switcherOpen) closeSwitcher()
                else openSwitcher()
            }
        }
        window.addEventListener("keydown", handler, true)
        return () => window.removeEventListener("keydown", handler, true)
    }, [openSwitcher, closeSwitcher])

    return (
        <div className="app">
            <div className="app-body">
            <Allotment proportionalLayout={false}>
                <Allotment.Pane minSize={180} preferredSize={240} maxSize={420}>
                    <Sidebar />
                </Allotment.Pane>
                <Allotment.Pane>
                    <div className="main">
                        <div className="topbar">
                            <div className="view-tabs">
                                {VIEWS.map((v) => (
                                    <button
                                        key={v.key}
                                        className={"view-tab" + (view === v.key ? " active" : "")}
                                        onClick={() => setView(v.key)}
                                    >
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                            <div className="topbar-project">
                                {project ? (
                                    <span title={project.path}>{project.path}</span>
                                ) : (
                                    <span className="muted">No project</span>
                                )}
                            </div>
                        </div>

                        <div className="panels">
                            {/* All panels stay mounted; visibility toggled so terminals keep running. */}
                            <div
                                className="panel"
                                style={{ display: view === "terminal" ? "flex" : "none" }}
                            >
                                <TerminalView />
                            </div>
                            <div
                                className="panel"
                                style={{ display: view === "editor" ? "flex" : "none" }}
                            >
                                <EditorPanel />
                            </div>
                            <div
                                className="panel"
                                style={{ display: view === "api" ? "flex" : "none" }}
                            >
                                <ApiPanel />
                            </div>
                            <div
                                className="panel"
                                style={{ display: view === "database" ? "flex" : "none" }}
                            >
                                <DbPanel />
                            </div>
                            <div
                                className="panel"
                                style={{ display: view === "browser" ? "flex" : "none" }}
                            >
                                <BrowserPanel />
                            </div>
                        </div>
                    </div>
                </Allotment.Pane>
            </Allotment>
            </div>
            <StatusBar />
            {settingsOpen && <SettingsModal />}
            {switcherOpen && <ProjectSwitcher />}
            {paletteOpen && <CommandPalette />}
            {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
            {activityOpen && <ActivityPanel />}
            {recordingsOpen && <RecordingsModal />}
            {worktreesOpen && <WorktreesModal />}
            {changesTarget && <ChangesModal />}
            {workOpen && <WorkPanel />}
            {releaseOpen && <ReleaseBoard />}
            {standupOpen && <StandupModal />}
            <PipelineBar />
            <Toasts />
            <IntroTip />
        </div>
    )
}
