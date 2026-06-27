import { useEffect } from "react"
import { Allotment } from "allotment"
import { useStore, type MainView } from "./store"
import { useSettings } from "./settings"
import { Sidebar } from "./components/Sidebar"
import { TerminalView } from "./components/TerminalView"
import { ApiPanel } from "./components/ApiPanel"
import { EditorPanel } from "./components/EditorPanel"
import { DbPanel } from "./components/DbPanel"
import { SettingsModal } from "./components/SettingsModal"
import { ProjectSwitcher } from "./components/ProjectSwitcher"
import { StatusBar } from "./components/StatusBar"
import { Toasts } from "./components/Toasts"

const VIEWS: { key: MainView; label: string }[] = [
    { key: "terminal", label: "Terminal" },
    { key: "editor", label: "Editor" },
    { key: "api", label: "API" },
    { key: "database", label: "Database" }
]

export function App(): JSX.Element {
    const { init, view, setView, activeProject } = useStore()
    const loadSettings = useSettings((s) => s.load)
    const settingsOpen = useSettings((s) => s.settingsOpen)
    const switcherOpen = useStore((s) => s.switcherOpen)
    const openSwitcher = useStore((s) => s.openSwitcher)
    const closeSwitcher = useStore((s) => s.closeSwitcher)
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
    }, [init, loadSettings])

    useEffect(() => {
        window.api.mobile.syncSessions(sessions())
    }, [tabsByProject, agentStatus, termAgents, projects, sessions])

    useEffect(() => {
        return window.api.mobile.onNew(({ projectId }) =>
            newTabIn(projectId, useSettings.getState().agents[0]?.id ?? "claude")
        )
    }, [newTabIn])

    // Global Ctrl+K opens the project switcher.
    useEffect(() => {
        const handler = (e: KeyboardEvent): void => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
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
                        </div>
                    </div>
                </Allotment.Pane>
            </Allotment>
            </div>
            <StatusBar />
            {settingsOpen && <SettingsModal />}
            {switcherOpen && <ProjectSwitcher />}
            <Toasts />
        </div>
    )
}
