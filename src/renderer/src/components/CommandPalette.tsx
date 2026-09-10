import { useEffect, useMemo, useRef, useState } from "react"
import { useStore, SHELL, type TermLayout, type AnySession } from "../store"
import { useSettings, sshCommand } from "../settings"
import { THEMES, STYLES } from "../themes"
import { DECK_VIEWS } from "./ViewKeys"
import { useKeyStatus } from "../keyStatus"
import { followRank } from "../missionTail"

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
    // The session rows below rank and flag on this, not on `s.status`.
    const keyStatusOf = useKeyStatus()
    const close = (): void => store.setPaletteOpen(false)

    const [q, setQ] = useState("")
    const [sel, setSel] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const commands = useMemo<Command[]>(() => {
        const cmds: Command[] = []
        // Every deck view (derived from DECK_VIEWS so new views show up here),
        // carrying the chord the deck key itself advertises - the index IS
        // Ctrl+1..4, so the two cannot disagree.
        DECK_VIEWS.forEach((v, i) =>
            cmds.push({
                id: "view:" + v.view,
                section: "Go to",
                title: "Go to " + v.name,
                kbd: `Ctrl+${i + 1}`,
                run: () => store.setView(v.view)
            })
        )
        // Tasks is NOT in DECK_VIEWS any more (D1 demoted it out of the deck),
        // but it is still a view and still needs a door. No `kbd`: it has no
        // chord, and Ctrl+2 - the one it used to have - is Terminal now.
        cmds.push({ id: "view:tasks", section: "Go to", title: "Go to Tasks", run: () => store.setView("tasks") })

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

        const layouts: TermLayout[] = ["tabs", "grid"]
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
        // Overview was the one layout with no palette entry, so the only surface
        // that answers an agent's permission prompt WITHOUT opening its terminal
        // was reachable solely as the fourth state of an unlabelled cycling icon.
        // Titled for what you would actually search for - approve, deny, all
        // projects - not just "overview".
        cmds.push({
            id: "layout:overview",
            section: "Layout",
            title: "Overview - all projects, approve or deny without opening a terminal",
            run: () => {
                store.setView("terminal")
                store.setTermLayout("overview")
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

        // Every session, not only the agents: a shell running a dev server is
        // exactly the kind of pane you lose track of. Ordered so the ones that
        // want you float up, and titled with what distinguishes them - the
        // session's own name, its project, and the worktree it sits in when that
        // is not the project root - because a list of eight "claude" rows is not
        // a way to find anything. All three are searchable, so typing a branch
        // name reaches its session.
        // Ranked and flagged on the DERIVED status. `s.status` is what the
        // agent last did and outlives the process, so the palette floated dead
        // sessions to the top of the list and appended "needs you" to them -
        // the one claim this product cannot get wrong, in the one surface that
        // is a keyboard away from anywhere. A session with no process sorts
        // LAST but is still listed: jumping to it is how you start it again.
        //
        // The order itself is `followRank` (missionTail), not a copy of it.
        // This ladder was written out here and happened to agree with the one
        // Mission and Overview sort by - which is how two surfaces come to show
        // the same sessions in different orders the moment one of them is
        // edited. `not-running` sorting last is now that shared rank's own rule.
        const rankSession = (x: AnySession): number => followRank(keyStatusOf(x))
        const leaf = (path: string): string => path.split(/[\/]/).filter(Boolean).pop() ?? path
        for (const s of [...store.sessions()].sort((a, b) => rankSession(a) - rankSession(b))) {
            const cwd = store.termCwd[s.termId]
            const where = cwd && cwd !== s.projectPath ? ` · ${leaf(cwd)}` : ""
            const st = keyStatusOf(s)
            const flag =
                st === "attention"
                    ? " - needs you"
                    : st === "waiting"
                      ? " - waiting"
                      : st === "not-running"
                        ? " - not running"
                        : ""
            cmds.push({
                id: "go:" + s.termId,
                section: "Sessions",
                title: `Go to ${s.sessionName} · ${s.projectName}${where}${flag}`,
                run: () => store.jumpToTerm(s.termId)
            })
        }

        cmds.push({ id: "act:switcher", section: "Actions", title: "Switch project…", kbd: "Ctrl+K", run: () => store.openSwitcher() })
        // Searching "recent project" found nothing: the walk-back existed only as a
        // key binding. One tap here is the plain flip, which is what a palette run
        // can express - holding to cycle needs the keyboard.
        cmds.push({ id: "act:recent", section: "Actions", title: "Recent project - flip back", kbd: "Ctrl+Shift+K", run: () => store.switchToPreviousProject() })
        cmds.push({ id: "act:search", section: "Actions", title: "Search across projects", kbd: "Ctrl+Shift+F", run: () => store.setSearchOpen(true) })
        cmds.push({ id: "act:pending", section: "Actions", title: "Jump to the agent waiting longest", kbd: "Ctrl+Shift+J", run: () => store.jumpToPending() })
        cmds.push({ id: "act:review-panel", section: "Actions", title: "Review changes — agent panel", kbd: "Ctrl+Shift+R", run: () => store.setReviewOpen(true) })
        cmds.push({ id: "act:zoom", section: "Actions", title: "Zoom the focused pane", kbd: "Ctrl+Shift+Z", run: () => { store.setView("terminal"); store.toggleZoomPane() } })
        cmds.push({ id: "act:reopen", section: "Actions", title: "Reopen the last closed session", run: () => store.reopenLastClosed() })
        cmds.push({ id: "act:composer", section: "Actions", title: "Open prompt composer", kbd: "Ctrl+Shift+I", run: () => { store.setView("terminal"); store.setComposerOpen(true) } })
        // These panels existed only as unlabelled deck icons, so searching
        // "usage" / "cost" / "pipeline" in the palette found nothing.
        cmds.push({ id: "act:usage", section: "Actions", title: "AI usage — tokens & cost", run: () => store.setUsageOpen(true) })
        cmds.push({ id: "act:pipelines", section: "Actions", title: "Edit pipelines…", run: () => openSettings("pipelines") })
        cmds.push({ id: "act:settings", section: "Actions", title: "Open Settings", run: () => openSettings() })
        cmds.push({ id: "act:addproject", section: "Actions", title: "Open folder…", kbd: "Ctrl+O", run: () => store.addProject() })
        cmds.push({ id: "act:extend", section: "Actions", title: "Extend agent — skills & agents…", run: () => store.setExtendOpen(true) })
        for (const p of pipelines)
            cmds.push({
                id: "pipeline:" + p.id,
                section: "Pipelines",
                title: "Run pipeline: " + p.name,
                run: () => store.runPipeline(p.id)
            })
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
        cmds.push({ id: "act:activity", section: "Actions", title: "Open activity feed", run: () => store.setActivityOpen(true) })
        cmds.push({ id: "act:shortcuts", section: "Help", title: "Keyboard shortcuts (F1)", run: () => store.setShortcutsOpen(true) })
        return cmds
    }, [agents, sshProfiles, pipelines, store, setAppearance, openSettings, keyStatusOf])

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
