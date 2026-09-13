import { useEffect, useMemo, useRef, useState } from "react"
import { useStore, SHELL, type TermLayout, type AnySession } from "../store"
import { useSettings, sshCommand } from "../settings"
import { THEMES, STYLES } from "../themes"
import { DECK_VIEWS } from "./ViewKeys"
import { useKeyStatus } from "../keyStatus"
import { type DeckKeyStatus } from "../deck"
import { followRank } from "../missionTail"
import { orderByMru, previousProjectId } from "../projectMru"
import { projectSessionCounts, wantsYouLabel, type ProjectSessionCounts } from "../deck"
import { folderMarker, useFolderStates, type FolderMarker } from "../folderStates"
import { declaredFor } from "../declaredSignal"
import type { DeclaredSignal } from "../../../shared/attention"
import { sessionDir, worktreeLeaf } from "../worktree"
import { paletteEmpty } from "../probeView"
import { contextMenu } from "../contextmenu"
import { projectContextMenu } from "../projectMenu"
import { ProjectChip } from "./ProjectChip"
import { StatusFlag } from "./StatusFlag"
import { Icon } from "./Icon"
import type { Project } from "../../../preload/index"

/**
 * The ONE search surface: sessions, projects and commands, behind `Ctrl+K`.
 *
 * `ProjectSwitcher` was deleted into this file on 2026-09-14 — 262 lines, ~110
 * lines of CSS, a second chord, a second empty-state vocabulary and three accent
 * spends the accent budget would have had to strike anyway (the `--moss` active
 * ring, the `--accent-soft` group label, the bare accent `●` attention dot). Net
 * concept count: −1. One lookup surface instead of two, one attention vocabulary
 * instead of a card dot plus a prose suffix.
 *
 * THREE FIXED SECTIONS, NEVER RE-ORDERED BY SCORE:
 *
 *     SESSIONS      what needs me
 *     PROJECTS      where do I go
 *     COMMANDS      what can I do
 *
 * which is the deck bar's own reading order one scale up. A typed query
 * FILTERS; it does not re-rank, and it cannot move a row from one section to
 * another. Within SESSIONS the order is `followRank` — `missionTail`'s RANK, the
 * same ladder Mission and Overview sort by — before and after a query; within
 * PROJECTS it is `orderByMru`; within COMMANDS it is authored order.
 *
 * That rule is the whole reason this surface is allowed to exist. ROADMAP.md
 * forbids, in terms, "answering 'which agent needs me' a second time, in any
 * form", and a list that interleaves by match score can put a better-matching
 * idle session above an agent blocked on you — a fourth opinion about attention
 * order, arriving through the door marked "no new surface". This is a FINDER:
 * it may SHOW a session's derived status as a row decoration, and it may not
 * invent an order or a count of its own. Every number and every word on these
 * rows is read from something that already owns it:
 *
 *   - `useKeyStatus` for what a session IS — never `s.status`, never `agentStatus`.
 *   - `StatusFlag` / `blockedWord` for the blocked-on-you word.
 *   - `projectSessionCounts` (deck.ts) for the per-project counts, which already
 *     excludes dead and acknowledged sessions correctly.
 *   - `wantsYouLabel` (deck.ts) for `n want you` / `1 wants you`, the deck bar's
 *     own copy table, and nothing at zero.
 *   - `orderByMru` / `previousProjectId` for project ranking.
 *   - `matches()` below as the single matcher. Two match functions in one ranked
 *     list is how one query returns two orderings.
 *
 * There is NO loading state and none may be built: every row is in-memory store
 * state and nothing here awaits IPC.
 */

interface Command {
    id: string
    title: string
    section: string
    /** Shown right-aligned so the palette teaches the keyboard path, not just runs it. */
    kbd?: string
    run: () => void
}

/** One selectable row, of whichever kind. Headers are not rows and never here. */
type Row =
    | { kind: "session"; id: string; hay: string; session: AnySession; run: () => void }
    | { kind: "project"; id: string; hay: string; project: Project; run: () => void }
    | { kind: "command"; id: string; hay: string; command: Command; run: () => void }

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
    // Stable slices, every one of them. A selector that built an array or an
    // object here is the getSnapshot loop that neither the build nor the
    // typecheck catches; everything derived from these is derived below.
    const projects = useStore((s) => s.projects)
    const activeId = useStore((s) => s.activeId)
    const mru = useStore((s) => s.projectMru)
    const sessionsSlice = useStore((s) => s.sessions)
    const termCwd = useStore((s) => s.termCwd)
    const seen = useStore((s) => s.seen)
    const declared = useStore((s) => s.declared)
    const folderStates = useFolderStates((s) => s.states)
    const close = (): void => store.setPaletteOpen(false)

    const [q, setQ] = useState("")
    const [sel, setSel] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

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

        // `Switch project…` is gone: you cannot navigate to the surface you are
        // standing in, and the projects are rows above this section now.
        //
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
    }, [agents, sshProfiles, pipelines, store, setAppearance, openSettings])

    // Per-project session counts, derived in deck.ts. The attention count is a
    // NAG, so it excludes a session with no process behind it (`s.status`
    // outlives the process) and one you have already looked at - without either
    // of those touching what the session IS.
    const counts = useMemo(
        () => projectSessionCounts(sessionsSlice(), keyStatusOf, seen),
        [sessionsSlice, keyStatusOf, seen]
    )

    // Ranked and flagged on the DERIVED status. `s.status` is what the agent
    // last did and outlives the process, so the palette used to float dead
    // sessions to the top and append "needs you" to them - the one claim this
    // product cannot get wrong, in the one surface that is a keyboard away from
    // anywhere. A session with no process sorts LAST but is still listed and
    // still selectable: jumping to it is how you start it again.
    const sessionRows = useMemo<Row[]>(() => {
        const rank = (x: AnySession): number => followRank(keyStatusOf(x))
        return [...sessionsSlice()]
            .sort((a, b) => rank(a) - rank(b))
            .map((s) => {
                const leaf = worktreeLeaf(sessionDir(termCwd[s.termId], s.projectPath), s.projectPath)
                return {
                    kind: "session" as const,
                    id: "go:" + s.termId,
                    // Name, project and worktree leaf are all searchable, so
                    // typing a branch name reaches its session.
                    hay: `${s.sessionName} ${s.projectName} ${leaf ?? ""}`,
                    session: s,
                    run: () => store.jumpToTerm(s.termId)
                }
            })
    }, [sessionsSlice, keyStatusOf, termCwd, store])

    const projectRows = useMemo<Row[]>(() => {
        const byId = new Map(projects.map((p) => [p.id, p] as const))
        return orderByMru(
            projects.map((p) => p.id),
            mru
        )
            .map((id) => byId.get(id))
            .filter((p): p is Project => !!p)
            .map((p) => ({
                kind: "project" as const,
                id: "proj:" + p.id,
                hay: `${p.name} ${p.path} ${p.group ?? ""}`,
                project: p,
                run: () => store.setActiveProject(p.id)
            }))
    }, [projects, mru, store])

    const commandRows = useMemo<Row[]>(
        () =>
            commands.map((c) => ({
                kind: "command" as const,
                id: c.id,
                hay: c.title,
                command: c,
                run: c.run
            })),
        [commands]
    )

    // Three filtered lists, each keeping its OWN order. Nothing here compares a
    // row of one kind against a row of another; that is the anti-disagreement
    // rule, expressed as three separate arrays that are only ever concatenated
    // in a fixed order.
    const sections = useMemo(() => {
        const keep = (rows: Row[]): Row[] => rows.filter((r) => matches(r.hay, q))
        return [
            { label: "Sessions", rows: keep(sessionRows) },
            { label: "Projects", rows: keep(projectRows) },
            // The command list is long and every kind shares one cap, so the
            // slice lands on the section that can afford it.
            { label: "Commands", rows: keep(commandRows).slice(0, 100) }
        ].filter((s) => s.rows.length > 0)
    }, [sessionRows, projectRows, commandRows, q])

    /** Every selectable row, in render order. Headers are not in here. */
    const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections])

    /** Where each section's first row sits in `rows`, so a header costs no index. */
    const offsets = useMemo(() => {
        let n = 0
        return sections.map((s) => {
            const at = n
            n += s.rows.length
            return at
        })
    }, [sections])

    useEffect(() => {
        if (sel >= rows.length) setSel(0)
    }, [rows, sel])

    // Preselect the PREVIOUSLY USED PROJECT while the query is empty, so
    // `Ctrl+K, Enter` is still the instant flip back to where you just were.
    // That gesture is the one this product has that is genuinely learned, and
    // losing it in the merge would be a regression dressed as a redesign. Once
    // the user types, selection goes to the first row of the first section that
    // matched - which is the top SESSION when a session matched, and that is the
    // cursor, not a ranking: the sections themselves never move.
    useEffect(() => {
        if (q !== "") {
            setSel(0)
            return
        }
        const prev = previousProjectId(mru, activeId)
        const idx = prev ? rows.findIndex((r) => r.id === "proj:" + prev) : -1
        setSel(idx >= 0 ? idx : 0)
        // Only when the query changes (mount / cleared search) - not on MRU or
        // session churn, which would steal the cursor mid-keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q])

    // Keep the cursor on screen. The list scrolls (70vh), and a preselected
    // project or a `not-running` session sorting last is routinely below the
    // fold — a selection you cannot see is a selection Enter runs blind.
    useEffect(() => {
        listRef.current
            ?.querySelector<HTMLElement>(".palette-item.sel")
            ?.scrollIntoView({ block: "nearest" })
    }, [sel, rows])

    const exec = (r?: Row): void => {
        if (!r) return
        r.run()
        close()
    }

    const notice = paletteEmpty(projects.length, q, rows.length)

    return (
        <div className="switcher-backdrop" onMouseDown={close}>
            <div
                className="palette"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    // The 1-9 digit pick died with the switcher grid. In a mixed
                    // list a digit names whichever KIND landed at that index - an
                    // identity that is really a position, which is the argument
                    // `shortSessionLabel`'s own doc makes against launch-order
                    // numerals.
                    if (e.key === "Escape") return close()
                    // Nothing matched: the arrows have nowhere to go, and
                    // `Math.min(rows.length - 1, …)` would park the cursor on -1.
                    if (!rows.length) return
                    if (e.key === "ArrowDown") {
                        e.preventDefault()
                        setSel((n) => Math.min(rows.length - 1, n + 1))
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault()
                        setSel((n) => Math.max(0, n - 1))
                    } else if (e.key === "Enter") {
                        e.preventDefault()
                        exec(rows[sel])
                    }
                }}
            >
                <div className="switcher-head">
                    <input
                        ref={inputRef}
                        className="switcher-search"
                        // The list is a listbox and the cursor never leaves this
                        // input, so the active row is announced from here.
                        role="combobox"
                        aria-expanded
                        aria-controls="palette-list"
                        aria-activedescendant={rows[sel] ? "palette-row-" + sel : undefined}
                        placeholder="Find a session, a project or a command…"
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value)
                            setSel(0)
                        }}
                    />
                    {/* The one piece of switcher chrome that survives, because
                        Ctrl+O is a chord nobody has met on first run. One verb
                        for one act: this button, the palette entry, the deck
                        control, Ctrl+O and the OS dialog's own title all read
                        `Open folder`. */}
                    <button
                        className="switcher-add"
                        data-tip="Open a folder as a project (Ctrl+O)"
                        onClick={() => {
                            void store.addProject()
                            close()
                        }}
                    >
                        Open folder…
                    </button>
                </div>
                <div
                    className="palette-list"
                    ref={listRef}
                    id="palette-list"
                    role="listbox"
                    aria-label="Find anything"
                >
                    {notice?.kind === "no-projects" && (
                        <div className="muted switcher-empty">No projects yet. Open a folder to start.</div>
                    )}
                    {sections.map((section, si) => (
                        <div key={section.label} className="palette-group">
                            {/* Presentational and skipped by the arrow keys: a
                                header is not a destination. One header per group
                                replaces the per-row section label the palette
                                used to carry, which is a net subtraction at any
                                list longer than three rows. */}
                            <div className="palette-head" aria-hidden="true">
                                {section.label}
                            </div>
                            {section.rows.map((r, ri) => {
                                const idx = offsets[si] + ri
                                return (
                                    <div
                                        key={r.id}
                                        id={"palette-row-" + idx}
                                        role="option"
                                        aria-selected={idx === sel}
                                        className={"palette-item" + (idx === sel ? " sel" : "")}
                                        onMouseEnter={() => setSel(idx)}
                                        onClick={() => exec(r)}
                                        onContextMenu={
                                            r.kind === "project"
                                                ? (e) => contextMenu(e, projectContextMenu(r.project.id))
                                                : undefined
                                        }
                                    >
                                        {r.kind === "session" && (
                                            <SessionRow
                                                session={r.session}
                                                status={keyStatusOf(r.session)}
                                                leaf={worktreeLeaf(
                                                    sessionDir(termCwd[r.session.termId], r.session.projectPath),
                                                    r.session.projectPath
                                                )}
                                                said={declaredFor(
                                                    declared,
                                                    r.session.termId,
                                                    keyStatusOf(r.session)
                                                )}
                                            />
                                        )}
                                        {r.kind === "project" && (
                                            <ProjectRow
                                                project={r.project}
                                                counts={counts[r.project.id]}
                                                marker={folderMarker(folderStates[r.project.id])}
                                            />
                                        )}
                                        {r.kind === "command" && (
                                            <>
                                                <span className="palette-title">{r.command.title}</span>
                                                {r.command.kbd && (
                                                    <span className="palette-kbd">{r.command.kbd}</span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                    {notice?.kind === "no-match" && (
                        <div className="muted switcher-empty">
                            No session, project or command matches{" "}
                            {/* A machine-readable value inside a sentence -> mono,
                                and it wraps, so a pasted Windows path cannot
                                widen the palette. */}
                            <code className="switcher-empty-q">{notice.query}</code>.
                        </div>
                    )}
                </div>
                <div className="overlay-foot muted small">↑↓ to move · Enter to open · Esc to close</div>
            </div>
        </div>
    )
}

/**
 * A session, rendered in the full status vocabulary instead of a prose suffix.
 *
 * The title used to be string-concatenated — `Go to claude · devdeck - needs
 * you` — which is the one surface in the app that said a session's state in
 * words nobody else uses, with no dot at all. It is the real `.tab-dot` now, in
 * the same five forms as the deck key, and the real `StatusFlag`: this row is
 * one more surface RENDERING the vocabulary rather than paraphrasing it.
 *
 * `not-running` gets the flat bar and the words `not running` where the flag
 * would be, in `--muted`. `StatusFlag` deliberately returns nothing for it — it
 * says nothing is listening, which is not "blocked on you" — so the words are
 * spelled here, in the muted ink that means a fact rather than an act.
 */
function SessionRow({
    session,
    status,
    leaf,
    said
}: {
    session: AnySession
    status: DeckKeyStatus
    /** The worktree's leaf directory, or null in the project's own tree. */
    leaf: string | null
    /** The agent's own declaration for this status, or null if DevDeck inferred it. */
    said: DeclaredSignal | null
}): JSX.Element {
    return (
        <>
            {/* A shell keeps its own single form: it is not an agent, so none of
                the five agent forms apply to it. */}
            <span className={session.isAgent ? "tab-dot claude status-" + status : "tab-dot shell"} />
            <span className="palette-title">{session.sessionName}</span>
            <span className="palette-dim">· {session.projectName}</span>
            {/* Sans for names, mono for values. Present ONLY when the session's
                directory is not the project root - the marker only ever adds, so
                its presence is the signal. */}
            {leaf && <span className="palette-branch">· {leaf}</span>}
            {status === "attention" && <span className="claude-attn">!</span>}
            <StatusFlag status={status} said={said} />
            {status === "not-running" && <span className="palette-dim">not running</span>}
        </>
    )
}

/**
 * A project row, carrying exactly what the switcher card carried and no more.
 *
 * `⚑ n want you` is `DeckWants`' own copy table (`wantsYouLabel`), over
 * `projectSessionCounts`' attention number - the same number the switcher card
 * painted as a bare accent `●`, which was a 2.92:1-class mark on Washi borrowing
 * the status vocabulary's SHAPE for a different meaning. A project row
 * aggregates, so it borrows the aggregate word and never the per-session one,
 * and it renders nothing at zero.
 *
 * The path is `--muted`, not `--faint`: 4.25 / 4.25 / 4.13 on `--bg-2` is under
 * the text floor.
 *
 * A MARKER IS NOT A GATE. A missing-folder row still selects and still activates
 * the project; `FolderNotice` is what explains. The `UNCHECKED` pill is solid and
 * leaves the chip at full colour, because only our knowledge is qualified.
 */
function ProjectRow({
    project,
    counts,
    marker
}: {
    project: Project
    counts: ProjectSessionCounts | undefined
    marker: FolderMarker | null
}): JSX.Element {
    const want = wantsYouLabel(counts?.attention ?? 0)
    return (
        <>
            <ProjectChip project={project} size="sm" />
            <span className="palette-title">{project.name}</span>
            {project.group && <span className="palette-dim">· {project.group}</span>}
            <span
                className={"palette-path" + (marker?.state === "missing" ? " folder-missing" : "")}
            >
                {project.path}
            </span>
            {marker && (
                <span className={"probe-tag" + (marker.qualified ? " qualified" : "")}>
                    {marker.pill}
                </span>
            )}
            {counts && (
                <span className="palette-dim">
                    {counts.terms} term{counts.terms === 1 ? "" : "s"}
                    {counts.agents ? ` · ${counts.agents} agent${counts.agents === 1 ? "" : "s"}` : ""}
                </span>
            )}
            {want && (
                <span className="palette-want">
                    <span className="palette-want-flag">
                        <Icon name="flag" size={11} />
                    </span>
                    {want}
                </span>
            )}
        </>
    )
}
