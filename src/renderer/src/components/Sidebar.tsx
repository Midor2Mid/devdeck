import { useStore } from "../store"

export function Sidebar(): JSX.Element {
    const { projects, activeId, addProject, removeProject, setActiveProject } = useStore()

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span className="brand">DevDeck</span>
            </div>

            <div className="sidebar-section-title">
                <span>PROJECTS</span>
                <button className="icon-btn" title="Add a project folder" onClick={addProject}>
                    +
                </button>
            </div>

            <div className="project-list">
                {projects.length === 0 && (
                    <div className="muted sidebar-empty">
                        No projects yet.
                        <br />
                        Click <b>+</b> to add a folder.
                    </div>
                )}
                {projects.map((p) => (
                    <div
                        key={p.id}
                        className={"project-item" + (p.id === activeId ? " active" : "")}
                        onClick={() => setActiveProject(p.id)}
                        title={p.path}
                    >
                        <span className="project-name">{p.name}</span>
                        <span
                            className="project-remove"
                            title="Remove project"
                            onClick={(e) => {
                                e.stopPropagation()
                                removeProject(p.id)
                            }}
                        >
                            ×
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
