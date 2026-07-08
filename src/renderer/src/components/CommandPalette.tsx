import { useEffect, useMemo, useRef, useState } from "react"
import { useStore, SHELL, type MainView, type TermLayout } from "../store"
import { useSettings, sshCommand } from "../settings"
import type { ThemeId } from "../themes"

interface Command {
    id: string
    title: string
    section: string
    run: () => void
}

/** Fuzzy subsequence match (chars of q appear in order in text). */
function matches(text: string, q: string): boolean {
    if (!q) return true
    const t = text.toLowerCase()
    let i = 0
    for (const c of q.toLowerCase()) {
        i = t.indexOf(c, i)
        if (i === -1) return false
        i++
    }
    return true
}

export function CommandPalette(): JSX.Element {
    const store = useStore()
    const agents = useSettings((s) => s.agents)
    const sshProfiles = useSettings((s) => s.sshProfiles)
    const pipelines = useSettings((s) => s.pipelines)
    const setAppearance = useSettings((s) => s.setAppearance)
    const openSettings = useSettings((s) => s.openSettings)
    const close = (): void => store.setPaletteOpen(false)

    const [q, setQ] = useState("")
    const [sel, setSel] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const commands = useMemo<Command[]>(() => {
        const cmds: Command[] = []
        const views: MainView[] = ["terminal", "editor", "api", "database", "browser"]
        for (const v of views)
            cmds.push({
                id: "view:" + v,
                section: "Go to",
                title: "Go to " + v[0].toUpperCase() + v.slice(1),
                run: () => store.setView(v)
            })

        cmds.push({ id: "new:shell", section: "New", title: "New terminal (shell)", run: () => store.newTab(SHELL) })
        for (const a of agents) {
            cmds.push({ id: "new:" + a.id, section: "New", title: `New ${a.name} session`, run: () => store.newTab(a.id) })
            if (a.resumeArgs)
                cmds.push({
                    id: "resume:" + a.id,
                    section: "New",
                    title: `Resume ${a.name} (${a.resumeArgs})`,
                    run: () => store.newTab(a.id, `${a.command} ${a.resumeArgs}`)
                })
        }
        for (const p of sshProfiles)
            cmds.push({
                id: "ssh:" + p.id,
                section: "New",
                title: `SSH: ${p.label}`,
                run: () => store.newTab(SHELL, sshCommand(p), p.label)
            })

        const layouts: TermLayout[] = ["tabs", "grid", "canvas"]
        for (const l of layouts)
            cmds.push({
                id: "layout:" + l,
                section: "Layout",
                title: "Layout: " + l[0].toUpperCase() + l.slice(1),
                run: () => {
                    store.setView("terminal")
                    store.setTermLayout(l)
                }
            })

        const themes: { id: ThemeId; label: string }[] = [
            { id: "sumi", label: "Sumi (dark)" },
            { id: "washi", label: "Washi (light)" },
            { id: "zen", label: "Zen (dark)" }
        ]
        for (const t of themes)
            cmds.push({
                id: "theme:" + t.id,
                section: "Theme",
                title: "Theme: " + t.label,
                run: () => setAppearance({ theme: t.id })
            })

        for (const s of store.agentSessions())
            cmds.push({
                id: "go:" + s.termId,
                section: "Sessions",
                title: `Go to ${s.tabName} · ${s.projectName}`,
                run: () => store.jumpToTerm(s.termId)
            })

        cmds.push({ id: "act:switcher", section: "Actions", title: "Switch project…", run: () => store.openSwitcher() })
        cmds.push({ id: "act:search", section: "Actions", title: "Search across projects", run: () => store.setSearchOpen(true) })
        cmds.push({ id: "act:dotnet", section: "Actions", title: "Build / test (.NET)", run: () => store.setDotnetOpen(true) })
        cmds.push({ id: "act:composer", section: "Actions", title: "Open prompt composer", run: () => { store.setView("terminal"); store.setComposerOpen(true) } })
        cmds.push({ id: "act:settings", section: "Actions", title: "Open Settings", run: () => openSettings() })
        cmds.push({ id: "act:addproject", section: "Actions", title: "Add project…", run: () => store.addProject() })
        for (const p of pipelines)
            cmds.push({
                id: "pipeline:" + p.id,
                section: "Pipelines",
                title: "Run pipeline: " + p.name,
                run: () => store.runPipeline(p.id)
            })
        cmds.push({ id: "act:work", section: "Actions", title: "Work - Jira / Azure items", run: () => store.setWorkOpen(true) })
        cmds.push({ id: "act:release", section: "Actions", title: "Release board - promote Dev → UAT → PROD", run: () => store.setReleaseOpen(true) })
        cmds.push({ id: "act:standup", section: "Actions", title: "Standup - generate today's worklog", run: () => store.setStandupOpen(true) })
        cmds.push({ id: "act:worktrees", section: "Actions", title: "Worktrees - new agent in a worktree", run: () => store.setWorktreesOpen(true) })
        cmds.push({
            id: "act:review",
            section: "Actions",
            title: "Review changes (active project)",
            run: () => {
                const p = store.activeProject()
                if (p) store.openChanges(p.path, p.name)
            }
        })
        cmds.push({ id: "act:recordings", section: "Actions", title: "Recordings - replay a session", run: () => store.setRecordingsOpen(true) })
        cmds.push({ id: "act:activity", section: "Actions", title: "Open activity feed", run: () => store.setActivityOpen(true) })
        cmds.push({ id: "act:shortcuts", section: "Help", title: "Keyboard shortcuts (F1)", run: () => store.setShortcutsOpen(true) })
        return cmds
    }, [agents, sshProfiles, pipelines, store, setAppearance, openSettings])

    const filtered = useMemo(() => commands.filter((c) => matches(c.title, q)).slice(0, 50), [commands, q])

    useEffect(() => {
        if (sel >= filtered.length) setSel(0)
    }, [filtered, sel])

    const exec = (c?: Command): void => {
        if (!c) return
        c.run()
        close()
    }

    return (
        <div className="switcher-backdrop" onMouseDown={close}>
            <div
                className="palette"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === "Escape") close()
                    else if (e.key === "ArrowDown") {
                        e.preventDefault()
                        setSel((i) => Math.min(filtered.length - 1, i + 1))
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault()
                        setSel((i) => Math.max(0, i - 1))
                    } else if (e.key === "Enter") {
                        e.preventDefault()
                        exec(filtered[sel])
                    }
                }}
            >
                <input
                    ref={inputRef}
                    className="switcher-search"
                    placeholder="Run a command…"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value)
                        setSel(0)
                    }}
                />
                <div className="palette-list">
                    {filtered.map((c, i) => (
                        <div
                            key={c.id}
                            className={"palette-item" + (i === sel ? " sel" : "")}
                            onMouseEnter={() => setSel(i)}
                            onClick={() => exec(c)}
                        >
                            <span className="palette-title">{c.title}</span>
                            <span className="palette-section">{c.section}</span>
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="muted switcher-empty">No commands.</div>}
                </div>
            </div>
        </div>
    )
}
