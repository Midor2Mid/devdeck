import { useStore, SHELL } from "../store"
import { useRunConfig } from "../runProject"
import { Enso } from "./Enso"
import { Icon } from "./Icon"
import { DECK_VIEWS } from "./ViewKeys"
import { ProjectChip } from "./ProjectChip"

export function Topbar(): JSX.Element {
    const view = useStore((s) => s.view)
    const project = useStore((s) => s.activeProject())
    const openSwitcher = useStore((s) => s.openSwitcher)
    const setPaletteOpen = useStore((s) => s.setPaletteOpen)
    const newTab = useStore((s) => s.newTab)
    const run = useRunConfig(project?.path)
    const viewLabel = DECK_VIEWS.find((v) => v.view === view)?.name

    return (
        <div className="topbar">
            <div className="topbar-crumb">
                <span className="topbar-brand">
                    <Enso size={18} strokeWidth={2.25} />
                </span>
                {run && (
                    <button
                        className="topbar-run-btn"
                        onClick={() => newTab(SHELL, run.command, run.command)}
                        data-tip={`Run project · ${run.command}`}
                        data-tip-pos="bottom"
                        aria-label={`Run project (${run.command})`}
                    >
                        <Icon name="play" size={12} />
                    </button>
                )}
                <button
                    className="topbar-proj-btn"
                    onClick={openSwitcher}
                    data-tip={project ? project.path : "Open a project (Ctrl+K)"}
                    data-tip-pos="bottom"
                >
                    {project && <ProjectChip project={project} size="sm" />}
                    <span className="topbar-proj-name">{project ? project.name : "No project"}</span>
                    <Icon name="chevronDown" size={14} className="topbar-proj-caret" />
                </button>
                <span className="crumb-sep">/</span>
                <span className="crumb-view">{viewLabel}</span>
            </div>
            <button
                className="cmd-pill"
                onClick={() => setPaletteOpen(true)}
                data-tip="Command palette (Ctrl+Shift+P)"
            >
                <Icon name="search" size={14} />
                <span>Search or run…</span>
                <span className="cmd-kbd">Ctrl+Shift+P</span>
            </button>
        </div>
    )
}
