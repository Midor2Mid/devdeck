import { useEffect, useState } from "react"
import { useStore, SHELL } from "../store"
import { useSettings } from "../settings"

// A script name is interpolated into a shell command (`npm run <name>`), so a
// hostile package.json (e.g. a cloned repo) could smuggle metacharacters like
// `build; rm -rf ~`. Only surface names that match npm's conventional charset —
// letters, digits, and `:_.-` — which can't break out of the command line.
const SAFE_SCRIPT = /^[A-Za-z0-9:._-]+$/

// A per-project task launcher: reads the active project's package.json scripts and
// runs the chosen one (`npm run <script>`) in a fresh terminal. Hidden when the
// project has no package.json / scripts.
export function TaskRunner(): JSX.Element | null {
    const project = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const newTab = useStore((s) => s.newTab)
    const editCommands = useStore((s) => s.setCommandsEditorProject)
    // Select the stable map, derive the per-project list outside the selector -
    // returning a fresh `[]` from the selector trips React's getSnapshot loop.
    const projectCommands = useSettings((s) => s.projectCommands)
    const commands = project ? projectCommands[project.id] ?? [] : []
    const [scripts, setScripts] = useState<string[]>([])
    const path = project?.path

    useEffect(() => {
        let alive = true
        if (!path) {
            setScripts([])
            return
        }
        window.api.fs
            .read(path + "/package.json")
            .then(({ content }) => {
                if (!alive) return
                try {
                    const s = (JSON.parse(content) as { scripts?: Record<string, string> }).scripts
                    setScripts(s ? Object.keys(s).filter((n) => SAFE_SCRIPT.test(n)) : [])
                } catch {
                    setScripts([])
                }
            })
            .catch(() => {
                if (alive) setScripts([])
            })
        return () => {
            alive = false
        }
    }, [path])

    if (!project) return null
    if (scripts.length === 0 && commands.length === 0) {
        // Still offer a way in to add the first saved command.
        return (
            <>
                <div className="sidebar-section-title">
                    <span>COMMANDS</span>
                    <button
                        className="section-add"
                        data-tip="Add a saved command"
                        onClick={() => editCommands(project.id)}
                    >
                        +
                    </button>
                </div>
            </>
        )
    }

    return (
        <>
            {scripts.length > 0 && (
                <>
                    <div className="sidebar-section-title">
                        <span>SCRIPTS</span>
                    </div>
                    <div className="task-list">
                        {scripts.map((name) => (
                            <button
                                key={name}
                                className="task-chip"
                                data-tip={`Run "npm run ${name}" in a new terminal`}
                                onClick={() => newTab(SHELL, `npm run ${name}`, name)}
                            >
                                ▸ {name}
                            </button>
                        ))}
                    </div>
                </>
            )}
            <div className="sidebar-section-title">
                <span>COMMANDS</span>
                <button
                    className="section-add"
                    data-tip="Manage saved commands"
                    onClick={() => editCommands(project.id)}
                >
                    +
                </button>
            </div>
            <div className="task-list">
                {commands.map((c) => (
                    <button
                        key={c.id}
                        className="task-chip"
                        data-tip={`Run "${c.command}" in a new terminal`}
                        onClick={() => newTab(SHELL, c.command, c.name)}
                    >
                        ▸ {c.name}
                    </button>
                ))}
            </div>
        </>
    )
}
