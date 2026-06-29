import { useEffect, useState } from "react"
import { useStore, SHELL } from "../store"

// A per-project task launcher: reads the active project's package.json scripts and
// runs the chosen one (`npm run <script>`) in a fresh terminal. Hidden when the
// project has no package.json / scripts.
export function TaskRunner(): JSX.Element | null {
    const project = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const newTab = useStore((s) => s.newTab)
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
            .then((txt) => {
                if (!alive) return
                try {
                    const s = (JSON.parse(txt) as { scripts?: Record<string, string> }).scripts
                    setScripts(s ? Object.keys(s) : [])
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

    if (!path || scripts.length === 0) return null

    return (
        <>
            <div className="sidebar-section-title">
                <span>TASKS</span>
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
    )
}
