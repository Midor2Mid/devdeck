import { useCallback, useEffect, useRef, useState } from "react"
import { useStore } from "./store"
import { nextSession } from "./deck"
import { orderByMru } from "./projectMru"
import { setDecisions } from "./missionTail"
import { useSettings } from "./settings"
import { useToasts, toast } from "./toast"
import { classifyDrop, type DroppedItem } from "./folderDrop"
import { refreshFolderStates } from "./folderStates"
import { PersistBlockedBar } from "./components/PersistBlockedBar"
import { FolderNotice } from "./components/FolderNotice"
import { RegionBoundary } from "./components/RegionBoundary"
import { Topbar } from "./components/Topbar"
import { Deck } from "./components/Deck"
import { TerminalView } from "./components/TerminalView"
import { ApiPanel } from "./components/ApiPanel"
import { EditorPanel } from "./components/EditorPanel"
import { DbPanel } from "./components/DbPanel"
import { BrowserPanel } from "./components/BrowserPanel"
import { NoProjects } from "./components/NoProjects"
import { paneAtIndex, pickInDirection, type PaneDir, type PaneRect } from "./paneNav"
import { DECK_VIEWS, viewKeysLive } from "./components/ViewKeys"
import { SettingsModal } from "./components/SettingsModal"
import { ProjectSwitcher } from "./components/ProjectSwitcher"
import { CommandPalette } from "./components/CommandPalette"
import { ExtendAgentModal } from "./components/ExtendAgentModal"
import { SearchModal } from "./components/SearchModal"
import { ReviewPanel } from "./components/ReviewPanel"
import { MissionControl } from "./components/MissionControl"
import { TaskBoard } from "./components/TaskBoard"
import { ActivityPanel } from "./components/ActivityPanel"
import { UsagePanel } from "./components/UsagePanel"
import { ProjectEnvModal } from "./components/ProjectEnvModal"
import { CommandsModal } from "./components/CommandsModal"
import { ProjectIdentityModal } from "./components/ProjectIdentityModal"
import { PipelineBar } from "./components/PipelineBar"
import { WorktreesModal } from "./components/WorktreesModal"
import { ChangesModal } from "./components/ChangesModal"
import { PrModal } from "./components/PrModal"
import { WorkPanel } from "./components/WorkPanel"
import { Toasts } from "./components/Toasts"
import { ShortcutsModal } from "./components/ShortcutsModal"
import { ConfirmDialog } from "./components/ConfirmDialog"
import { PromptDialog } from "./components/PromptDialog"
import { TooltipLayer } from "./components/Tooltip"
import { ContextMenuLayer } from "./components/ContextMenu"

const PANE_DIRS: Record<string, PaneDir> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down"
}

/**
 * Every mounted pane's box. Only panes actually on screen carry the attribute,
 * so this answers "what can I see" rather than "what exists": in Tabs that is
 * the active tab's panes, and in Grid it is every card, which is what makes
 * directional movement work in both without a special case.
 */
function paneRects(): PaneRect[] {
    return [...document.querySelectorAll<HTMLElement>("[data-term-id]")].map((el) => {
        const r = el.getBoundingClientRect()
        return {
            termId: el.dataset.termId as string,
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom
        }
    })
}

export function App(): JSX.Element {
    // Slice selectors only — a whole-store subscription here would re-render
    // the entire app tree on every store mutation (pty status flips, drags…).
    const init = useStore((s) => s.init)
    const view = useStore((s) => s.view)
    const loadSettings = useSettings((s) => s.load)
    const settingsOpen = useSettings((s) => s.settingsOpen)
    const switcherOpen = useStore((s) => s.switcherOpen)
    const openSwitcher = useStore((s) => s.openSwitcher)
    const closeSwitcher = useStore((s) => s.closeSwitcher)
    const paletteOpen = useStore((s) => s.paletteOpen)
    const setPaletteOpen = useStore((s) => s.setPaletteOpen)
    const closeSettings = useSettings((s) => s.closeSettings)
    const extendOpen = useStore((s) => s.extendOpen)
    const searchOpen = useStore((s) => s.searchOpen)
    const reviewOpen = useStore((s) => s.reviewOpen)
    const shortcutsOpen = useStore((s) => s.shortcutsOpen)
    const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
    const activityOpen = useStore((s) => s.activityOpen)
    const usageOpen = useStore((s) => s.usageOpen)
    const envEditorProject = useStore((s) => s.envEditorProject)
    const commandsEditorProject = useStore((s) => s.commandsEditorProject)
    const identityEditorProject = useStore((s) => s.identityEditorProject)
    const worktreesOpen = useStore((s) => s.worktreesOpen)
    const changesTarget = useStore((s) => s.changesTarget)
    const prTarget = useStore((s) => s.prTarget)
    const workOpen = useStore((s) => s.workOpen)

    // Re-sync the mobile session snapshot whenever sessions/status/projects change.
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const termAgents = useStore((s) => s.termAgents)
    const projects = useStore((s) => s.projects)
    const projectMru = useStore((s) => s.projectMru)
    const activeId = useStore((s) => s.activeId)
    const sessions = useStore((s) => s.sessions)
    const newTabIn = useStore((s) => s.newTabIn)
    const addProjectByPath = useStore((s) => s.addProjectByPath)

    /**
     * Folder drop, at the app root rather than on the switcher.
     *
     * It lived on the switcher backdrop, so the only way to drop a folder was
     * to first open the picker you were trying to avoid - and the read behind
     * it (`File.path`) had been dead since Electron 32, so it animated and did
     * nothing either way. Here it works with nothing open, and the switcher
     * still receives it because the event bubbles to this element.
     */
    const [folderOver, setFolderOver] = useState(false)
    // dragenter/dragleave fire for every element the pointer crosses inside the
    // window, so a boolean flipped on `dragleave` blinks off over each child.
    // Depth counting is the standard fix and it is why this is a ref, not state.
    const dragDepth = useRef(0)
    // Holds the toast raised when a Ctrl+N chord is refused, so holding the
    // chord down does not stack one toast per repeat.
    const gateToast = useRef<string | null>(null)

    const onDrop = useCallback(
        (e: React.DragEvent): void => {
            dragDepth.current = 0
            setFolderOver(false)
            if (!e.dataTransfer.types.includes("Files")) return
            // A child that already took this drop wins: PromptComposer attaches
            // a dropped image and calls preventDefault without stopping
            // propagation, so without this the root would follow a successful
            // attach with "that's a file, not a folder" - two answers to one
            // act, and the wrong one last.
            if (e.defaultPrevented) return
            e.preventDefault()
            // Both reads are synchronous on purpose: `items` is neutered the
            // moment this handler yields, so an `await` before them loses the
            // drop entirely.
            const items: DroppedItem[] = Array.from(e.dataTransfer.items).map((it) => {
                const file = it.getAsFile()
                const entry = it.webkitGetAsEntry?.() ?? null
                return {
                    path: file ? window.api.projects.pathForFile(file) : "",
                    // `webkitGetAsEntry` is what tells a folder from a file
                    // before main is involved; the fallback stays `null`
                    // ("nobody asked"), never `false`.
                    isDirectory: entry ? entry.isDirectory : null
                }
            })
            const verdict = classifyDrop(items)
            if (verdict.kind === "nothing") return
            if (verdict.kind === "file") {
                toast("That's a file, not a folder. DevDeck opens folders.")
                return
            }
            for (const path of verdict.paths) {
                void addProjectByPath(path).then(() => {
                    // Main stats the path and refuses anything that is not a
                    // directory, so a path that never became a project is the
                    // one case the renderer could not classify. Say that much
                    // and no more - the cause is main's to know, and a
                    // damaged projects.json lands here too.
                    if (!useStore.getState().projects.some((p) => p.path === path)) {
                        toast("DevDeck couldn't open that.")
                    }
                })
            }
        },
        [addProjectByPath]
    )

    useEffect(() => {
        // Bare `init()` swallowed every rejection: there is no unhandledrejection
        // handler, so a failed load left the store on module-load defaults and
        // the beforeunload flush below wrote them over the real workspace.
        void init().catch((err) => {
            console.error("[app] workspace init failed:", err)
            toast("Could not load your workspace - nothing will be saved this session.")
        })
        loadSettings()
        // Flush any pending debounced writes before the window tears down.
        const flush = (): void => {
            useStore.getState().flush()
            useSettings.getState().flush()
        }
        window.addEventListener("beforeunload", flush)
        return () => window.removeEventListener("beforeunload", flush)
    }, [init, loadSettings])

    // The session snapshot goes to main on every status flip, remote server or
    // not. It used to be gated on `remote.enabled` to save an IPC when nobody
    // was listening — but main is now the only classifier of permission
    // prompts, and status is the half of that it cannot see for itself. Gated,
    // main would mint nothing with remote off and the desktop's own Approve /
    // Deny buttons would silently never appear. Main still broadcasts to the
    // phone only when the server is running.
    useEffect(() => {
        window.api.mobile.syncSessions(sessions())
    }, [tabsByProject, agentStatus, termAgents, projects, sessions])

    /**
     * The folder probe: does each project's path still resolve?
     *
     * Deliberately NOT gated on `document.hidden`, unlike the git poll. What a
     * project IS does not depend on whether anyone is looking at it, and a
     * folder deleted while DevDeck sat in the background must be marked when
     * you come back, not attributed to whatever you click first. The focus
     * listener is what makes that immediate.
     *
     * Nothing renders until the first report lands - a project with no entry in
     * the map gets no marker, which is the honest state while a probe is in
     * flight.
     */
    useEffect(() => {
        if (projects.length === 0) return
        const tick = (): void => void refreshFolderStates()
        tick()
        const iv = setInterval(tick, 15000)
        window.addEventListener("focus", tick)
        return () => {
            clearInterval(iv)
            window.removeEventListener("focus", tick)
        }
    }, [projects])

    /**
     * File -> Open Recent, in both directions.
     *
     * The order is the renderer's: `projectMru` is where a switch is recorded,
     * and `projects.json` knows only when a project was added - so a submenu
     * built in main would have been in the wrong order while calling itself
     * Recent. The active project is left out; it is already open, and its
     * entry would be a no-op at the top of the list.
     */
    useEffect(() => {
        const s = useStore.getState()
        const ids = orderByMru(
            projects.map((p) => p.id),
            s.projectMru
        ).filter((id) => id !== s.activeId)
        const byId = new Map(projects.map((p) => [p.id, p.name]))
        window.api.menu.setRecent(ids.map((id) => ({ id, name: byId.get(id) as string })))
    }, [projects, projectMru, activeId])

    useEffect(() => {
        return window.api.menu.onCommand((cmd) => {
            if (cmd.command !== "project:activate") return
            // Validated here rather than trusted: the menu was built from a
            // list this window sent, but it can be a rebuild behind (a project
            // removed while the menu was open), and `setActiveProject` would
            // otherwise point `activeId` at a project that no longer exists.
            const s = useStore.getState()
            if (s.projects.some((p) => p.id === cmd.projectId)) {
                void s.setActiveProject(cmd.projectId)
            }
        })
    }, [])

    // Main's classification, straight into missionTail's module cache — no
    // React state on this path: it fires per status flip and the tiles read it
    // synchronously on their own 1s tick.
    useEffect(() => window.api.decisions.onChanged(setDecisions), [])

    useEffect(() => {
        return window.api.mobile.onNew(({ projectId }) =>
            newTabIn(projectId, useSettings.getState().agents[0]?.id ?? "claude")
        )
    }, [newTabIn])

    // Surface an available / ready update as an actionable toast.
    useEffect(() => {
        return window.api.update.onStatus((s) => {
            if (s.state === "available") {
                useToasts.getState().push({
                    text: `Update available: ${s.version}`,
                    actionLabel: "Download",
                    onAction: () => void window.api.update.download()
                })
            } else if (s.state === "ready") {
                useToasts.getState().push({
                    text: `Update ${s.version} ready`,
                    actionLabel: "Restart & install",
                    onAction: () => void window.api.update.install()
                })
            }
        })
    }, [])

    // Global shortcuts: Ctrl+O open folder, Ctrl+K project switcher,
    // Ctrl+Shift+K previous project, Ctrl+Shift+P command palette, Ctrl+1..N
    // view switch, Ctrl+Tab session cycle. Every one of them is published in
    // shortcuts.ts, which is what the F1 overlay and Settings read.
    useEffect(() => {
        const handler = (e: KeyboardEvent): void => {
            const mod = e.ctrlKey || e.metaKey
            // `e.key` as well as `e.code`: the Help menu replays this chord
            // through `sendInputEvent`, which is reliable about `key`.
            if (e.code === "F1" || e.key === "F1") {
                e.preventDefault()
                const s = useStore.getState()
                s.setShortcutsOpen(!s.shortcutsOpen)
                return
            }
            if (mod && e.shiftKey && e.code === "KeyP") {
                e.preventDefault()
                e.stopPropagation()
                const s = useStore.getState()
                s.setPaletteOpen(!s.paletteOpen)
                return
            }
            if (mod && e.shiftKey && e.code === "KeyF") {
                const s = useStore.getState()
                // In Terminal view Ctrl+Shift+F belongs to find-in-terminal
                // (TerminalView handles it) — don't also toggle global search.
                if (s.view === "terminal") return
                e.preventDefault()
                e.stopPropagation()
                s.setSearchOpen(!s.searchOpen)
                return
            }
            if (mod && e.shiftKey && e.code === "KeyR") {
                e.preventDefault()
                e.stopPropagation()
                const s = useStore.getState()
                s.setReviewOpen(!s.reviewOpen)
                return
            }
            // Ctrl+Shift+I — prompt composer. Handled here rather than in
            // TerminalView so it works from any view (it switches to Terminal
            // first, matching the palette's "Open prompt composer" action).
            if (mod && e.shiftKey && e.code === "KeyI") {
                e.preventDefault()
                e.stopPropagation()
                const s = useStore.getState()
                if (!s.activeId) return
                const open = !s.composerOpen
                if (open) s.setView("terminal")
                s.setComposerOpen(open)
                return
            }
            // Ctrl+Shift+K — recent projects, alt-tab style. One tap is the old
            // instant flip; holding the modifier and tapping again walks further
            // back, committing on release (see the keyup listener below).
            if (mod && e.shiftKey && e.code === "KeyK") {
                e.preventDefault()
                e.stopPropagation()
                useStore.getState().cycleProject()
                return
            }
            // Ctrl+Shift+J — jump to the agent that has been waiting on you
            // longest. Nothing to do with the Inbox drawer this chord was once
            // mislabelled as opening: the drawer is gone, this is not.
            if (mod && e.shiftKey && e.code === "KeyJ") {
                e.preventDefault()
                e.stopPropagation()
                useStore.getState().jumpToPending()
                return
            }
            // Ctrl+Shift+Z — zoom the focused pane to fill the stage, and back.
            if (mod && e.shiftKey && e.code === "KeyZ") {
                const s = useStore.getState()
                if (s.view !== "terminal") return
                e.preventDefault()
                e.stopPropagation()
                s.toggleZoomPane()
                return
            }
            // Alt+1..9 — jump straight to a session in this project, counted the
            // way the tab bar reads. Alt is otherwise unbound here; the window
            // now has a menu bar, but its mnemonics are F and H, so no digit
            // collides with one.
            if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) {
                const s = useStore.getState()
                if (!s.activeId) return
                const target = paneAtIndex(s.tabsFor(s.activeId), Number(e.code.slice(5)))
                if (!target) return
                e.preventDefault()
                e.stopPropagation()
                s.jumpToTerm(target)
                return
            }
            // Alt+arrows — move focus to the pane in that direction, by what is
            // on screen rather than by the layout tree (see paneNav). Ignored
            // while a pane is zoomed: the other panes are behind the zoom, so
            // "the one to the right" is not a question the screen can answer.
            if (e.altKey && !mod && PANE_DIRS[e.code]) {
                const s = useStore.getState()
                if (s.view !== "terminal" || !s.activeId || s.zoomedPane) return
                const from = s.activePane(s.activeId)
                if (!from) return
                const target = pickInDirection(paneRects(), from, PANE_DIRS[e.code])
                if (!target) return
                e.preventDefault()
                e.stopPropagation()
                s.focusPane(s.activeId, target)
                return
            }
            if (mod && !e.shiftKey && e.key.toLowerCase() === "k") {
                e.preventDefault()
                if (useStore.getState().switcherOpen) closeSwitcher()
                else openSwitcher()
                return
            }
            // Ctrl+O — the folder dialog, in one keystroke. It is the first
            // thing a Windows user tries and until now it did nothing at all.
            // It goes straight to `addProject()` rather than to the switcher:
            // `addProject` already adopts main's activeId, so opening a folder
            // always activates it, and routing through the picker would put the
            // dialog three hops from the chord that names it.
            if (mod && !e.shiftKey && e.key.toLowerCase() === "o") {
                e.preventDefault()
                void useStore.getState().addProject()
                return
            }
            // Ctrl+1..N — switch main view (indexed into the deck view order).
            // Gated on the same predicate the keys are, because it was not: on
            // first run the chord moved the topbar to "Terminal" while the
            // first-run panel stayed up and no key lit, so the app named a view
            // it was not showing. A chord may not reach a control the pointer
            // cannot.
            if (mod && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
                const idx = Number(e.code.slice(5)) - 1
                const dv = DECK_VIEWS[idx]
                if (dv) {
                    e.preventDefault()
                    if (!viewKeysLive(useStore.getState().projects)) {
                        // Gating it stopped the app naming a view it was not
                        // showing, but it left the chord answering with nothing
                        // at all - so a refused chord and a chord that does not
                        // exist were indistinguishable. The key answers a click
                        // with the fix rather than the reason; the chord now
                        // gives the same answer, because otherwise a stranger
                        // presses Ctrl+2 twice and concludes the app is broken
                        // when it is only empty.
                        const t = useToasts.getState()
                        if (gateToast.current) t.dismiss(gateToast.current)
                        gateToast.current = t.push({
                            text: `No project is open, so ${dv.name} has nothing to show yet.`,
                            actionLabel: "Open folder…",
                            onAction: () => void useStore.getState().addProject()
                        })
                        return
                    }
                    useStore.getState().setView(dv.view)
                    return
                }
            }
            // Ctrl+Tab / Ctrl+Shift+Tab — cycle agent sessions (deck alt-tab).
            if (mod && e.code === "Tab") {
                const s = useStore.getState()
                // Every session, shells included: a cycle that silently skips half
                // the panes is a cycle you cannot trust to reach the one you want.
                const here = s.activeId ? s.activePane(s.activeId) ?? null : null
                const target = nextSession(s.sessions(), here, e.shiftKey ? -1 : 1)
                if (target) {
                    e.preventDefault()
                    s.jumpToTerm(target)
                }
                return
            }
        }
        // Releasing either modifier lands a project cycle. Blur commits too: if
        // the window loses focus mid-walk the keyup never arrives, and an open
        // cycle would leave activeId moved with nothing persisted.
        const release = (e: KeyboardEvent): void => {
            if (e.key === "Control" || e.key === "Meta" || e.key === "Shift") {
                useStore.getState().commitProjectCycle()
            }
        }
        const blur = (): void => useStore.getState().commitProjectCycle()
        window.addEventListener("keydown", handler, true)
        window.addEventListener("keyup", release, true)
        window.addEventListener("blur", blur)
        return () => {
            window.removeEventListener("keydown", handler, true)
            window.removeEventListener("keyup", release, true)
            window.removeEventListener("blur", blur)
        }
    }, [openSwitcher, closeSwitcher])

    return (
        <div
            className={"app" + (folderOver ? " folder-drop" : "")}
            onDragEnter={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return
                dragDepth.current++
                setFolderOver(true)
            }}
            onDragOver={(e) => {
                // Without preventDefault on dragover the browser refuses the
                // drop and the cursor stays a "no entry" sign.
                if (e.dataTransfer.types.includes("Files")) e.preventDefault()
            }}
            onDragLeave={() => {
                dragDepth.current = Math.max(0, dragDepth.current - 1)
                if (dragDepth.current === 0) setFolderOver(false)
            }}
            onDrop={onDrop}
        >
            <div className="app-body">
                <div className="main">
                    {/* Deliberately no resetKey: the top bar is not view-scoped.
                        Keying it on `view` meant a deterministic throw re-threw
                        on every view switch, so the retry the prop exists to
                        provide was the one action guaranteed to fail. `Try
                        again` on the card is the honest retry here. */}
                    <RegionBoundary
                        title="The top bar hit an error"
                        description="Everything below it still works, and your sessions are still running. Use the deck at the bottom to move around."
                    >
                        <Topbar />
                    </RegionBoundary>
                    <PersistBlockedBar />
                    {/* A marker is not a gate: this bar names the failure and
                        offers the repair, and everything below it keeps
                        working. */}
                    <FolderNotice />
                    <div className="panels">
                        {/* One guard above the whole panel stack: with no project,
                            all eight views resolve to the same panel. Folding
                            first contact into "the no-project empty state" would
                            have left a stranger on Mission, whose empty state is
                            a wall of every listening port on their machine.
                            Nothing is running with zero projects, so unmounting
                            the stack costs no terminal. */}
                        {projects.length === 0 ? (
                            <div className="panel" style={{ display: "flex" }}>
                                <RegionBoundary
                                    title="The welcome panel hit an error"
                                    description="Add a project folder from the deck at the bottom, or reload when you get a chance."
                                    resetKey={view}
                                >
                                    <NoProjects />
                                </RegionBoundary>
                            </div>
                        ) : (
                            <>
                        <div className="panel" style={{ display: view === "mission" ? "flex" : "none" }}>
                            <RegionBoundary
                                title="The Mission view hit an error"
                                description="Your terminals and sessions are still running, and every other view still works. Switch away and back to retry this one."
                                resetKey={view}
                            >
                                <MissionControl />
                            </RegionBoundary>
                        </div>
                        <div className="panel" style={{ display: view === "tasks" ? "flex" : "none" }}>
                            <RegionBoundary
                                title="The Tasks view hit an error"
                                description="Your terminals and sessions are still running, and every other view still works. Switch away and back to retry this one."
                                resetKey={view}
                            >
                                <TaskBoard />
                            </RegionBoundary>
                        </div>
                        <div className="panel" style={{ display: view === "terminal" ? "flex" : "none" }}>
                            <RegionBoundary
                                title="The Terminal view hit an error"
                                description="Your terminals and sessions are still running, and every other view still works. Switch away and back to retry this one."
                                resetKey={view}
                            >
                                <TerminalView />
                            </RegionBoundary>
                        </div>
                        <div className="panel" style={{ display: view === "editor" ? "flex" : "none" }}>
                            <RegionBoundary
                                title="The Editor view hit an error"
                                description="Your terminals and sessions are still running, and every other view still works. Switch away and back to retry this one."
                                resetKey={view}
                            >
                                <EditorPanel />
                            </RegionBoundary>
                        </div>
                        <div className="panel" style={{ display: view === "api" ? "flex" : "none" }}>
                            <RegionBoundary
                                title="The API view hit an error"
                                description="Your terminals and sessions are still running, and every other view still works. Switch away and back to retry this one."
                                resetKey={view}
                            >
                                <ApiPanel />
                            </RegionBoundary>
                        </div>
                        <div className="panel" style={{ display: view === "database" ? "flex" : "none" }}>
                            <RegionBoundary
                                title="The Database view hit an error"
                                description="Your terminals and sessions are still running, and every other view still works. Switch away and back to retry this one."
                                resetKey={view}
                            >
                                <DbPanel />
                            </RegionBoundary>
                        </div>
                        <div className="panel" style={{ display: view === "browser" ? "flex" : "none" }}>
                            <RegionBoundary
                                title="The Browser view hit an error"
                                description="Your terminals and sessions are still running, and every other view still works. Switch away and back to retry this one."
                                resetKey={view}
                            >
                                <BrowserPanel />
                            </RegionBoundary>
                        </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {/* No resetKey, for the same reason as the top bar: the deck is
                what you switch views WITH, so keying its reset on `view` made
                every attempted retry re-throw. */}
            <RegionBoundary
                title="The deck hit an error"
                description="Your sessions are still running and the view above still works. Reload when you get a chance."
            >
                <Deck />
            </RegionBoundary>
            {/* These three are the overlays a stranger reaches first, and a
                throw in any of them blanked the whole window - the exact failure
                the region boundaries were added to stop. The SEVENTEEN below
                them are still bare and still blank the window; WorktreesModal
                renders {project.name} unguarded and is how a reviewer produced a
                root crash on purpose. Wrapping them is follow-up work, not a
                thing this comment should imply is done. Each boundary sits INSIDE
                its own conditional, so closing the crashed overlay unmounts the
                boundary with it and reopening starts clean. Each therefore
                needs a way out: a crashed modal has taken its own close button
                down with it. */}
            {settingsOpen && (
                <RegionBoundary
                    overlay
                    title="Settings hit an error"
                    description="The rest of the cockpit is untouched and your sessions are still running. Close this and your settings are as you left them."
                    actions={<button onClick={closeSettings}>Close settings</button>}
                >
                    <SettingsModal />
                </RegionBoundary>
            )}
            {switcherOpen && (
                <RegionBoundary
                    overlay
                    title="The project switcher hit an error"
                    description="Nothing changed and your sessions are still running. Close this and pick a project from the top bar instead."
                    actions={<button onClick={closeSwitcher}>Close</button>}
                >
                    <ProjectSwitcher />
                </RegionBoundary>
            )}
            {paletteOpen && (
                <RegionBoundary
                    overlay
                    title="The command palette hit an error"
                    description="No command ran and your sessions are still running. Close this and use the menus instead."
                    actions={<button onClick={() => setPaletteOpen(false)}>Close</button>}
                >
                    <CommandPalette />
                </RegionBoundary>
            )}
            {extendOpen && <ExtendAgentModal />}
            {searchOpen && <SearchModal />}
            {reviewOpen && <ReviewPanel />}
            {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
            {activityOpen && <ActivityPanel />}
            {usageOpen && <UsagePanel />}
            {envEditorProject && <ProjectEnvModal />}
            {commandsEditorProject && <CommandsModal />}
            {identityEditorProject && <ProjectIdentityModal />}
            {worktreesOpen && <WorktreesModal />}
            {changesTarget && <ChangesModal />}
            {prTarget && <PrModal />}
            {workOpen && <WorkPanel />}
            <PipelineBar />
            <Toasts />
            <ConfirmDialog />
            <PromptDialog />
            <TooltipLayer />
            <ContextMenuLayer />
        </div>
    )
}
