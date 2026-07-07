import { useStore } from "../store"
import { Enso } from "./Enso"
import { Icon } from "./Icon"
import { DECK_VIEWS } from "./ViewKeys"

export function Topbar(): JSX.Element {
    const view = useStore((s) => s.view)
    const project = useStore((s) => s.activeProject())
    const openSwitcher = useStore((s) => s.openSwitcher)
    const setPaletteOpen = useStore((s) => s.setPaletteOpen)
    const viewLabel = DECK_VIEWS.find((v) => v.view === view)?.name

    return (
        <div className="topbar">
            <div className="topbar-crumb">
                <span className="topbar-brand">
                    <Enso size={18} strokeWidth={2.25} />
                </span>
                <button
                    className="topbar-proj-btn"
                    onClick={openSwitcher}
                    data-tip={project ? project.path : "Open a project (Ctrl+K)"}
                    data-tip-pos="bottom"
                >
                    {project ? project.name : "No project"}
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
