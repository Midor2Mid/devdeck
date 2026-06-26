import { useEffect, useState } from "react"
import { useStore } from "../store"
import type { DirEntry } from "../../../preload/index"

interface OpenFile {
    path: string
    name: string
    content: string
    dirty: boolean
}

function FileTree({
    dir,
    onOpen
}: {
    dir: string
    onOpen: (entry: DirEntry) => void
}): JSX.Element {
    const [entries, setEntries] = useState<DirEntry[]>([])
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    useEffect(() => {
        let cancelled = false
        window.api.fs
            .readDir(dir)
            .then((e) => {
                if (!cancelled) setEntries(e)
            })
            .catch(() => setEntries([]))
        return () => {
            cancelled = true
        }
    }, [dir])

    const toggle = (path: string): void => {
        setExpanded((prev) => {
            const next = new Set(prev)
            next.has(path) ? next.delete(path) : next.add(path)
            return next
        })
    }

    return (
        <div className="tree">
            {entries.map((entry) =>
                entry.isDir ? (
                    <div key={entry.path}>
                        <div className="tree-row dir" onClick={() => toggle(entry.path)}>
                            <span className="caret">
                                {expanded.has(entry.path) ? "▾" : "▸"}
                            </span>
                            {entry.name}
                        </div>
                        {expanded.has(entry.path) && (
                            <div className="tree-children">
                                <FileTree dir={entry.path} onOpen={onOpen} />
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        key={entry.path}
                        className="tree-row file"
                        onClick={() => onOpen(entry)}
                    >
                        <span className="caret" />
                        {entry.name}
                    </div>
                )
            )}
        </div>
    )
}

export function EditorPanel(): JSX.Element {
    const activeProject = useStore((s) => s.projects.find((p) => p.id === s.activeId))
    const [file, setFile] = useState<OpenFile | null>(null)
    const [error, setError] = useState<string | null>(null)

    const open = async (entry: DirEntry): Promise<void> => {
        setError(null)
        try {
            const content = await window.api.fs.read(entry.path)
            setFile({ path: entry.path, name: entry.name, content, dirty: false })
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        }
    }

    const save = async (): Promise<void> => {
        if (!file) return
        await window.api.fs.write(file.path, file.content)
        setFile({ ...file, dirty: false })
    }

    if (!activeProject) {
        return (
            <div className="empty-state">
                <p>No project selected.</p>
            </div>
        )
    }

    return (
        <div className="editor-panel">
            <div className="editor-tree">
                <div className="tree-root-label">{activeProject.name}</div>
                <FileTree dir={activeProject.path} onOpen={open} />
            </div>
            <div className="editor-main">
                {error && <div className="resp-error">{error}</div>}
                {file ? (
                    <>
                        <div className="editor-filebar">
                            <span>
                                {file.name}
                                {file.dirty ? " ●" : ""}
                            </span>
                            <button
                                className="accent"
                                onClick={save}
                                disabled={!file.dirty}
                                title="Save (Ctrl+S)"
                            >
                                Save
                            </button>
                        </div>
                        <textarea
                            className="editor-textarea"
                            spellCheck={false}
                            value={file.content}
                            onChange={(e) =>
                                setFile({ ...file, content: e.target.value, dirty: true })
                            }
                            onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                                    e.preventDefault()
                                    save()
                                }
                            }}
                        />
                    </>
                ) : (
                    <div className="empty-state">
                        <p className="muted">
                            Select a file from the tree to edit it.
                        </p>
                        <p className="muted small">
                            Lightweight editor for now — Monaco (syntax highlighting,
                            IntelliSense) lands in Milestone 2.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
