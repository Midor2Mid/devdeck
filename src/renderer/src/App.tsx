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
    const project = activeProject()

    // Re-sync the mobile session snapshot whenever sessions/status/projects change.
    const tabsByProject = useStore((s) => s.tabsByProject)
    const claudeStatus = useStore((s) => s.claudeStatus)
    const termKinds = useStore((s) => s.termKinds)
    const projects = useStore((s) => s.projects)
    const allSessions = useStore((s) => s.allSessions)
    const newTabIn = useStore((s) => s.newTabIn)

    useEffect(() => {
        init()
        loadSettings()
    }, [init, loadSettings])

    useEffect(() => {
        window.api.mobile.syncSessions(allSessions())
    }, [tabsByProject, claudeStatus, termKinds, projects, allSessions])

    useEffect(() => {
        return window.api.mobile.onNew(({ projectId, kind }) => newTabIn(projectId, kind))
    }, [newTabIn])

    return (
        <div className="app">
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
            {settingsOpen && <SettingsModal />}
        </div>
    )
}
