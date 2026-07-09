import { useEffect, useState } from "react"
import { useStore } from "../store"
import { mergeContext, template, type ContextEntry } from "../contextCatalog"
import { toast } from "../toast"
import type { DirEntry } from "../../../preload/index"

/**
 * Popover listing the active project's agent memory files (CLAUDE.md /
 * AGENTS.md / GEMINI.md). Present files open in the Monaco editor; missing
 * files are created from a seeded starter, then opened. Root-only; derived
 * fresh from a directory listing each time it opens.
 */
export function ContextIndex({ onClose }: { onClose: () => void }): JSX.Element {
    const project = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const openInEditor = useStore((s) => s.openInEditor)
    const [entries, setEntries] = useState<ContextEntry[]>([])
    const [listing, setListing] = useState<DirEntry[]>([])
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!project) return
        let live = true
        window.api.fs
            .readDir(project.path)
            .then((list) => {
                if (!live) return
                setError(false)
                setListing(list)
                setEntries(mergeContext(list.map((e) => e.name)))
            })
            .catch(() => {
                if (live) setError(true)
            })
    }, [project])

    if (!project) return <div className="context-empty muted small">No active project.</div>
    const pid = project.id
    const root = project.path

    // Open a present file by its real listing path, so the string matches what
    // the file tree opens - EditorPanel de-dupes tabs by exact path equality.
    const open = (name: string): void => {
        const entry = listing.find((e) => e.name === name)
        if (!entry) return
        openInEditor(pid, entry.path)
        onClose()
    }

    // Create a missing file, then re-list so we open it by the same canonical
    // path the file tree would produce (keeps tab de-dup working).
    const create = async (name: string): Promise<void> => {
        try {
            await window.api.fs.write(`${root}/${name}`, template(name, project.name))
            const list = await window.api.fs.readDir(root)
            const entry = list.find((e) => e.name === name)
            openInEditor(pid, entry ? entry.path : `${root}/${name}`)
            onClose()
        } catch {
            toast(`Couldn't create ${name}`)
        }
    }

    return (
        <div className="context-index">
            <div className="section-label context-title">Context · {project.name}</div>
            {error ? (
                <div className="context-empty muted small">Couldn&apos;t read project folder.</div>
            ) : (
                entries.map((e) => (
                    <div key={e.name} className="context-row">
                        <span className={"context-dot" + (e.exists ? " on" : "")} />
                        <span className="context-name">{e.name}</span>
                        <span className="context-agent muted small">{e.agent}</span>
                        {e.exists ? (
                            <button className="context-action" onClick={() => open(e.name)}>
                                Open
                            </button>
                        ) : (
                            <button className="context-action" onClick={() => void create(e.name)}>
                                + Create
                            </button>
                        )}
                    </div>
                ))
            )}
        </div>
    )
}
