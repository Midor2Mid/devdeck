import { useEffect, useMemo, useRef, useState } from "react"
import { useStore, SHELL, type TermLayout } from "../store"
import { useSettings, sshCommand } from "../settings"
import { THEMES, STYLES } from "../themes"
import { DECK_VIEWS } from "./ViewKeys"

interface Command {
    id: string
    title: string
    section: string
    /** Shown right-aligned so the palette teaches the keyboard path, not just runs it. */
    kbd?: string
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
        // Every deck view (derived from DECK_VIEWS so new views show up here).
        for (const v of DECK_VIEWS)
            cmds.push({
                id: "view:" + v.view,
                section: "Go to",
                title: "Go to " + v.name,
                run: () => store.setView(v.view)
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

        for (const t of Object.values(THEMES))
            cmds.push({
                id: "theme:" + t.id,
                section: "Theme",
                title: "Theme: " + t.label,
                run: () => setAppearance({ theme: t.id })
            })

        for (const s of Object.values(STYLES))
            cmds.push({
                id: "style:" + s.id,
                section: "Style",
                title: "Style: " + s.label,
                run: () => setAppearance({ style: s.id })
            })

        for (const s of store.agentSessions())
            cmds.push({
                id: "go:" + s.termId,
                section: "Sessions",
                title: `Go to ${s.tabName} · ${s.projectName}`,
                run: () => store.jumpToTerm(s.termId)
            })

        cmds.push({ id: "act:switcher", section: "Actions", title: "Switch project…", kbd: "Ctrl+K", run: () => store.openSwitcher() })
        cmds.push({ id: "act:search", section: "Actions", title: "Search across projects", kbd: "Ctrl+Shift+F", run: () => store.setSearchOpen(true) })
        cmds.push({ id: "act:tasks", section: "Actions", title: "Task board", kbd: "Ctrl+2", run: () => store.setView("tasks") })
        cmds.push({ id: "act:dotnet", section: "Actions", title: "Build / test (.NET)", kbd: "Ctrl+Shift+B", run: () => store.setDotnetOpen(true) })
        cmds.push({ id: "act:review-panel", section: "Actions", title: "Review changes — agent panel", kbd: "Ctrl+Shift+R", run: () => store.setReviewOpen(true) })
        cmds.push({ id: "act:composer", section: "Actions", title: "Open prompt composer", kbd: "Ctrl+Shift+I", run: () => { store.setView("terminal"); store.setComposerOpen(true) } })
        // These three panels existed only as unlabelled deck icons, so searching
        // "usage" / "cost" / "inbox" / "pipeline" in the palette found nothing.
        cmds.push({ id: "act:usage", section: "Actions", title: "AI usage — tokens & cost", run: () => store.setUsageOpen(true) })
        cmds.push({ id: "act:inbox", section: "Actions", title: "Agents inbox — triage what needs you", kbd: "Ctrl+Shift+J", run: () => store.setInboxOpen(true) })
        cmds.push({ id: "act:pipelines", section: "Actions", title: "Edit pipelines…", run: () => openSettings("pipelines") })
        cmds.push({ id: "act:settings", section: "Actions", title: "Open Settings", run: () => openSettings() })
        cmds.push({ id: "act:addproject", section: "Actions", title: "Add project…", run: () => store.addProject() })
        cmds.push({ id: "act:extend", section: "Actions", title: "Extend agent — skills & agents…", run: () => store.setExtendOpen(true) })
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
            id: "act:review-project",
            section: "Actions",
            title: "Diff working tree — active project",
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

    const filtered = useMemo(() => commands.filter((c) => matches(c.title, q)).slice(0, 100), [commands, q])

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
                            {c.kbd && <span className="palette-kbd">{c.kbd}</span>}
                            <span className="palette-section">{c.section}</span>
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="muted switcher-empty">No commands.</div>}
                </div>
            </div>
        </div>
    )
}
