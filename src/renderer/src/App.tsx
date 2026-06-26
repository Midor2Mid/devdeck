import { useEffect } from "react"
import { Allotment } from "allotment"
import { useStore, type MainView } from "./store"
import { Sidebar } from "./components/Sidebar"
import { TerminalView } from "./components/TerminalView"
import { ApiPanel } from "./components/ApiPanel"
import { EditorPanel } from "./components/EditorPanel"

const VIEWS: { key: MainView; label: string }[] = [
    { key: "terminal", label: "Terminal" },
    { key: "editor", label: "Editor" },
    { key: "api", label: "API" }
]

export function App(): JSX.Element {
    const { init, view, setView, activeProject } = useStore()
    const project = activeProject()

    useEffect(() => {
        init()
    }, [init])

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
                        </div>
                    </div>
                </Allotment.Pane>
            </Allotment>
        </div>
    )
}
