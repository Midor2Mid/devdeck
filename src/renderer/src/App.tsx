import { useEffect } from "react"
import { useStore } from "./store"
import { nextSession } from "./deck"
import { useSettings } from "./settings"
import { useToasts } from "./toast"
import { Topbar } from "./components/Topbar"
import { Deck } from "./components/Deck"
import { TerminalView } from "./components/TerminalView"
import { ApiPanel } from "./components/ApiPanel"
import { EditorPanel } from "./components/EditorPanel"
import { DbPanel } from "./components/DbPanel"
import { BrowserPanel } from "./components/BrowserPanel"
import { NetworkPanel } from "./components/NetworkPanel"
import { DECK_VIEWS } from "./components/ViewKeys"
import { SettingsModal } from "./components/SettingsModal"
import { ProjectSwitcher } from "./components/ProjectSwitcher"
import { CommandPalette } from "./components/CommandPalette"
import { SearchModal } from "./components/SearchModal"
import { DotnetPanel } from "./components/DotnetPanel"
import { ActivityPanel } from "./components/ActivityPanel"
import { InboxPanel } from "./components/InboxPanel"
import { UsagePanel } from "./components/UsagePanel"
import { ProjectEnvModal } from "./components/ProjectEnvModal"
import { CommandsModal } from "./components/CommandsModal"
import { RecordingsModal } from "./components/RecordingsModal"
import { PipelineBar } from "./components/PipelineBar"
import { WorktreesModal } from "./components/WorktreesModal"
import { ChangesModal } from "./components/ChangesModal"
import { PrModal } from "./components/PrModal"
import { WorkPanel } from "./components/WorkPanel"
import { ReleaseBoard } from "./components/ReleaseBoard"
import { StandupModal } from "./components/StandupModal"
import { Toasts } from "./components/Toasts"
import { ShortcutsModal } from "./components/ShortcutsModal"
import { IntroTip } from "./components/IntroTip"
import { ConfirmDialog } from "./components/ConfirmDialog"
import { PromptDialog } from "./components/PromptDialog"
import { TooltipLayer } from "./components/Tooltip"
import { ContextMenuLayer } from "./components/ContextMenu"

export function App(): JSX.Element {
    const { init, view } = useStore()
    const loadSettings = useSettings((s) => s.load)
    const settingsOpen = useSettings((s) => s.settingsOpen)
    const switcherOpen = useStore((s) => s.switcherOpen)
    const openSwitcher = useStore((s) => s.openSwitcher)
    const closeSwitcher = useStore((s) => s.closeSwitcher)
    const paletteOpen = useStore((s) => s.paletteOpen)
    const searchOpen = useStore((s) => s.searchOpen)
    const dotnetOpen = useStore((s) => s.dotnetOpen)
    const shortcutsOpen = useStore((s) => s.shortcutsOpen)
    const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
    const activityOpen = useStore((s) => s.activityOpen)
    const inboxOpen = useStore((s) => s.inboxOpen)
    const usageOpen = useStore((s) => s.usageOpen)
    const envEditorProject = useStore((s) => s.envEditorProject)
    const commandsEditorProject = useStore((s) => s.commandsEditorProject)
    const recordingsOpen = useStore((s) => s.recordingsOpen)
    const worktreesOpen = useStore((s) => s.worktreesOpen)
    const changesTarget = useStore((s) => s.changesTarget)
    const prTarget = useStore((s) => s.prTarget)
    const workOpen = useStore((s) => s.workOpen)
    const releaseOpen = useStore((s) => s.releaseOpen)
    const standupOpen = useStore((s) => s.standupOpen)

    // Re-sync the mobile session snapshot whenever sessions/status/projects change.
    const tabsByProject = useStore((s) => s.tabsByProject)
    const agentStatus = useStore((s) => s.agentStatus)
    const termAgents = useStore((s) => s.termAgents)
    const projects = useStore((s) => s.projects)
    const sessions = useStore((s) => s.sessions)
    const newTabIn = useStore((s) => s.newTabIn)

    useEffect(() => {
        init()
        loadSettings()
        // Flush any pending debounced writes before the window tears down.
        const flush = (): void => {
            useStore.getState().flush()
            useSettings.getState().flush()
        }
        window.addEventListener("beforeunload", flush)
        return () => window.removeEventListener("beforeunload", flush)
    }, [init, loadSettings])

    // Only push the mobile session snapshot when the remote server is actually
    // on - otherwise this fires an IPC + snapshot build on every agent status
    // flip for nothing (remote is off by default).
    const remoteEnabled = useSettings((s) => s.remote.enabled)
    useEffect(() => {
        if (!remoteEnabled) return
        window.api.mobile.syncSessions(sessions())
    }, [remoteEnabled, tabsByProject, agentStatus, termAgents, projects, sessions])

    // Tell the capture proxy which project is active, so it can tag traffic.
    const activeId = useStore((s) => s.activeId)
    useEffect(() => {
        window.api.proxy.setProject(activeId)
    }, [activeId])

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

    // Global shortcuts: Ctrl+K project switcher, Ctrl+Shift+P command palette,
    // Ctrl+1..6 view switch, Ctrl+Tab agent-session cycle.
    useEffect(() => {
        const handler = (e: KeyboardEvent): void => {
            const mod = e.ctrlKey || e.metaKey
            if (e.code === "F1") {
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
                e.preventDefault()
                e.stopPropagation()
                const s = useStore.getState()
                s.setSearchOpen(!s.searchOpen)
                return
            }
            if (mod && e.shiftKey && e.code === "KeyB") {
                e.preventDefault()
                e.stopPropagation()
                const s = useStore.getState()
                s.setDotnetOpen(!s.dotnetOpen)
                return
            }
            if (mod && !e.shiftKey && e.key.toLowerCase() === "k") {
                e.preventDefault()
                if (useStore.getState().switcherOpen) closeSwitcher()
                else openSwitcher()
                return
            }
            // Ctrl+1..6 — switch main view.
            if (mod && !e.shiftKey && /^Digit[1-6]$/.test(e.code)) {
                e.preventDefault()
                const idx = Number(e.code.slice(5)) - 1
                const v = DECK_VIEWS[idx]?.view
                if (v) useStore.getState().setView(v)
                return
            }
            // Ctrl+Tab / Ctrl+Shift+Tab — cycle agent sessions (deck alt-tab).
            if (mod && e.code === "Tab") {
                const s = useStore.getState()
                const target = nextSession(s.agentSessions(), s.lastAgentTermId, e.shiftKey ? -1 : 1)
                if (target) {
                    e.preventDefault()
                    s.jumpToTerm(target)
                }
                return
            }
        }
        window.addEventListener("keydown", handler, true)
        return () => window.removeEventListener("keydown", handler, true)
    }, [openSwitcher, closeSwitcher])

    return (
        <div className="app">
            <div className="app-body">
                <div className="main">
                    <Topbar />
                    <div className="panels">
                        {/* All panels stay mounted; visibility toggled so terminals keep running. */}
                        <div className="panel" style={{ display: view === "terminal" ? "flex" : "none" }}>
                            <TerminalView />
                        </div>
                        <div className="panel" style={{ display: view === "editor" ? "flex" : "none" }}>
                            <EditorPanel />
                        </div>
                        <div className="panel" style={{ display: view === "api" ? "flex" : "none" }}>
                            <ApiPanel />
                        </div>
                        <div className="panel" style={{ display: view === "database" ? "flex" : "none" }}>
                            <DbPanel />
                        </div>
                        <div className="panel" style={{ display: view === "browser" ? "flex" : "none" }}>
                            <BrowserPanel />
                        </div>
                        <div className="panel" style={{ display: view === "network" ? "flex" : "none" }}>
                            <NetworkPanel />
                        </div>
                    </div>
                </div>
            </div>
            <Deck />
            {settingsOpen && <SettingsModal />}
            {switcherOpen && <ProjectSwitcher />}
            {paletteOpen && <CommandPalette />}
            {searchOpen && <SearchModal />}
            {dotnetOpen && <DotnetPanel />}
            {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
            {activityOpen && <ActivityPanel />}
            {inboxOpen && <InboxPanel />}
            {usageOpen && <UsagePanel />}
            {envEditorProject && <ProjectEnvModal />}
            {commandsEditorProject && <CommandsModal />}
            {recordingsOpen && <RecordingsModal />}
            {worktreesOpen && <WorktreesModal />}
            {changesTarget && <ChangesModal />}
            {prTarget && <PrModal />}
            {workOpen && <WorkPanel />}
            {releaseOpen && <ReleaseBoard />}
            {standupOpen && <StandupModal />}
            <PipelineBar />
            <Toasts />
            <IntroTip />
            <ConfirmDialog />
            <PromptDialog />
            <TooltipLayer />
            <ContextMenuLayer />
        </div>
    )
}
