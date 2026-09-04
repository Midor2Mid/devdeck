import { useStore } from "../store"
import { useRunConfig } from "../runProject"
import { Enso } from "./Enso"
import { Icon } from "./Icon"
import { DECK_VIEWS } from "./ViewKeys"
import { ProjectChip } from "./ProjectChip"
import { useFolderStates } from "../folderStates"

export function Topbar(): JSX.Element {
    const view = useStore((s) => s.view)
    const project = useStore((s) => s.activeProject())
    const openSwitcher = useStore((s) => s.openSwitcher)
    const setPaletteOpen = useStore((s) => s.setPaletteOpen)
    const runCommandTab = useStore((s) => s.runCommandTab)
    const run = useRunConfig(project?.path)
    const folder = useFolderStates((s) => (project ? s.states[project.id] : undefined))
    const viewLabel = DECK_VIEWS.find((v) => v.view === view)?.name

    /**
     * Why Run is off - and never the wrong reason.
     *
     * `useRunConfig` looks for a package.json / .sln / go.mod in the project
     * folder, so a folder that is not there produces exactly the same empty
     * answer as a folder with no start command, and this said "No runnable
     * project type detected" for both: a claim about the project's contents,
     * made about contents nobody could read. `missing` is the only state that
     * earns the folder sentence - `unchecked` means we could not look, which
     * is not evidence about the folder.
     */
    const runOff =
        folder === "missing"
            ? "This project's folder isn't there right now."
            : "No runnable project type detected"

    return (
        <div className="topbar">
            <div className="topbar-crumb">
                <span className="topbar-brand">
                    <Enso size={18} strokeWidth={2.25} />
                </span>
                {/* `aria-disabled`, not `disabled`: Chromium dispatches no
                    mouse or focus events from a disabled button, so the
                    sentence explaining why Run is off could not be read by
                    hovering, by Tab or by a screen reader - the control that
                    most needs explaining was the one that could not be asked.
                    Per DESIGN.md's disabled-controls rule, the handler is
                    guarded instead and the dimming moved to the attribute. */}
                <button
                    className="topbar-run-btn"
                    onClick={() => run && runCommandTab(run.command, run.command)}
                    aria-disabled={!run || undefined}
                    data-tip={run ? `Run project · ${run.command}` : runOff}
                    data-tip-pos="bottom"
                    aria-label={run ? `Run project (${run.command})` : "Run - " + runOff}
                >
                    <Icon name="play" size={12} />
                </button>
                <button
                    className="topbar-proj-btn"
                    onClick={openSwitcher}
                    // With a project open this used to show only its path, so the
                    // two fast paths were invisible exactly when you wanted them.
                    // One line, ` · `-separated: `.tip` is `white-space: normal`,
                    // so a newline here would collapse to a space anyway.
                    data-tip={
                        project
                            ? `${project.path} · Ctrl+K switch · Ctrl+Shift+K recent (hold to cycle)`
                            : "Choose a project (Ctrl+K)"
                    }
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
