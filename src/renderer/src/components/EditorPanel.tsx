import { useEffect, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import "../monaco-setup"
import type { DirEntry } from "../../../preload/index"

interface OpenFile {
    path: string
    name: string
    content: string
    dirty: boolean
}

// File extension → Monaco language id.
const LANG: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    h: "cpp",
    cpp: "cpp",
    cc: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    yml: "yaml",
    yaml: "yaml",
    xml: "xml",
    sql: "sql",
    toml: "ini",
    ini: "ini",
    dockerfile: "dockerfile"
}

function langFor(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() ?? ""
    return LANG[ext] ?? "plaintext"
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
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })
    }

    return (
        <div className="tree">
            {entries.map((entry) =>
                entry.isDir ? (
                    <div key={entry.path}>
                        <div className="tree-row dir" onClick={() => toggle(entry.path)}>
                            <span className="caret">{expanded.has(entry.path) ? "▾" : "▸"}</span>
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
    const sendToClaude = useStore((s) => s.sendToAgent)
    const lastClaude = useStore((s) => s.lastAgentTermId)
    const editorSettings = useSettings((s) => s.editor)
    const [files, setFiles] = useState<OpenFile[]>([])
    const [activePath, setActivePath] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [sent, setSent] = useState(false)

    const active = files.find((f) => f.path === activePath) ?? null

    const sendActiveToClaude = (): void => {
        if (!active || !activeProject) return
        const rel = active.path.startsWith(activeProject.path)
            ? active.path.slice(activeProject.path.length).replace(/^[\\/]/, "")
            : active.path
        // Claude Code references files with @path (forward slashes).
        const ok = sendToClaude("@" + rel.replace(/\\/g, "/") + " ")
        if (ok) {
            setSent(true)
            setTimeout(() => setSent(false), 1500)
        }
    }

    // Keep a ref to the latest save fn so Monaco's Ctrl+S command isn't stale.
    const saveRef = useRef<() => void>(() => undefined)

    const open = async (entry: DirEntry): Promise<void> => {
        setError(null)
        if (files.some((f) => f.path === entry.path)) {
            setActivePath(entry.path)
            return
        }
        try {
            const content = await window.api.fs.read(entry.path)
            setFiles((prev) => [...prev, { path: entry.path, name: entry.name, content, dirty: false }])
            setActivePath(entry.path)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        }
    }

    const updateContent = (path: string, value: string): void => {
        setFiles((prev) =>
            prev.map((f) => (f.path === path ? { ...f, content: value, dirty: true } : f))
        )
    }

    const save = async (path: string): Promise<void> => {
        const file = files.find((f) => f.path === path)
        if (!file || !file.dirty) return
        await window.api.fs.write(file.path, file.content)
        setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, dirty: false } : f)))
    }

    const closeFile = (path: string): void => {
        setFiles((prev) => {
            const next = prev.filter((f) => f.path !== path)
            if (activePath === path) {
                setActivePath(next[next.length - 1]?.path ?? null)
            }
            return next
        })
    }

    saveRef.current = () => {
        if (activePath) void save(activePath)
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
                {files.length > 0 && (
                    <div className="editor-tabs">
                        <div className="editor-tabs-scroll">
                        {files.map((f) => (
                            <div
                                key={f.path}
                                className={"editor-tab" + (f.path === activePath ? " active" : "")}
                                onClick={() => setActivePath(f.path)}
                                title={f.path}
                            >
                                <span className="editor-tab-name">{f.name}</span>
                                <span className="editor-tab-state">
                                    {f.dirty ? "●" : ""}
                                    <span
                                        className="tab-close"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            closeFile(f.path)
                                        }}
                                    >
                                        ×
                                    </span>
                                </span>
                            </div>
                        ))}
                        </div>
                        <button
                            className="send-claude"
                            onClick={sendActiveToClaude}
                            disabled={!active || !lastClaude}
                            title={
                                lastClaude
                                    ? "Send @path of this file to the last-focused Claude session"
                                    : "No Claude session yet — start one with + Claude"
                            }
                        >
                            {sent ? "Sent ✓" : "→ Claude"}
                        </button>
                    </div>
                )}
                {active ? (
                    <div className="editor-host">
                        <Editor
                            theme="devdeck"
                            path={active.path}
                            language={langFor(active.name)}
                            value={active.content}
                            onChange={(v) => updateContent(active.path, v ?? "")}
                            onMount={(editor, monaco) => {
                                editor.addCommand(
                                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                                    () => saveRef.current()
                                )
                            }}
                            options={{
                                fontFamily: '"Cascadia Mono", Consolas, monospace',
                                fontSize: editorSettings.fontSize,
                                minimap: { enabled: editorSettings.minimap },
                                wordWrap: editorSettings.wordWrap ? "on" : "off",
                                smoothScrolling: true,
                                scrollBeyondLastLine: false,
                                renderWhitespace: "none",
                                tabSize: editorSettings.tabSize,
                                automaticLayout: true,
                                padding: { top: 10 },
                                guides: { indentation: false }
                            }}
                        />
                    </div>
                ) : (
                    <div className="empty-state">
                        <p className="muted">Select a file from the tree to edit it.</p>
                        <p className="muted small">Ctrl+S to save · syntax highlighting via Monaco.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
