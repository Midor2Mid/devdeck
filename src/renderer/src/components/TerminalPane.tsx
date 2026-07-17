import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { paneRegistry } from "../paneRegistry"
import { useSettings } from "../settings"
import { useStore } from "../store"
import { THEMES } from "../themes"
import { exitNotice } from "../termExit"

const IS_WINDOWS = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent)

interface Props {
    termId: string
    /** Command auto-run once the shell is ready (e.g. "claude"); undefined = plain shell. */
    initialCommand?: string
    cwd: string
    focused: boolean
    onFocus: (termId: string) => void
}

/**
 * One xterm.js instance bound to one pty (by termId). On mount it attaches to
 * the pty (the main process spawns it, or replays its buffer if it already
 * exists). On unmount it detaches but does NOT kill the pty - the session lives
 * on so it survives split/tab/project switches. Killing is explicit (close).
 */
export function TerminalPane({ termId, initialCommand, cwd, focused, onFocus }: Props): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    // Holds the pty-spawn closure so the resume prompt can launch it after mount.
    const spawnRef = useRef<((cmd?: string) => void) | null>(null)
    const fontFamily = useSettings((s) => s.terminal.fontFamily)
    const fontSize = useSettings((s) => s.terminal.fontSize)
    const themeId = useSettings((s) => s.appearance.theme)
    // A restored agent session waits for a resume/fresh choice before it launches.
    const pending = useStore((s) => !!s.agentResumePending[termId])
    const clearAgentResume = useStore((s) => s.clearAgentResume)

    const resumeAgentId = useStore.getState().agentOf(termId)
    const resumePreset = useSettings.getState().agentById(resumeAgentId)
    // Never resolve to an empty command (which would open a bare shell for a
    // restored agent whose preset was deleted): fall back to the launch command,
    // then to the agent id itself as a best guess.
    const coldCmd = resumePreset?.command || initialCommand || resumeAgentId
    const resumeCmd = resumePreset?.resumeArgs
        ? `${resumePreset.command} ${resumePreset.resumeArgs}`
        : coldCmd
    const resolveResume = (mode: "resume" | "fresh"): void => {
        spawnRef.current?.(mode === "resume" ? resumeCmd : coldCmd)
        clearAgentResume(termId)
        termRef.current?.focus()
    }

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const term = new Terminal({
            fontFamily: useSettings.getState().terminal.fontFamily,
            fontSize: useSettings.getState().terminal.fontSize,
            cursorBlink: true,
            allowProposedApi: true,
            lineHeight: THEMES[useSettings.getState().appearance.theme].termLineHeight,
            theme: THEMES[useSettings.getState().appearance.theme].xterm
        })
        const fit = new FitAddon()
        const search = new SearchAddon()
        term.loadAddon(fit)
        term.loadAddon(search)
        term.open(container)
        termRef.current = term
        fitRef.current = fit
        paneRegistry.set(termId, { term, search })

        const safeFit = (): void => {
            if (!container.clientWidth || !container.clientHeight) return
            try {
                fit.fit()
                window.api.pty.resize(termId, term.cols, term.rows)
            } catch {
                /* resize can race with exit */
            }
        }

        // Register stream listeners BEFORE attaching so replayed buffer isn't missed.
        const offData = window.api.pty.onData(({ id, data }) => {
            if (id === termId) term.write(data)
        })
        const offExit = window.api.pty.onExit(({ id, exitCode }) => {
            if (id === termId) term.write("\r\n\x1b[90m" + exitNotice(exitCode, IS_WINDOWS) + "\x1b[0m\r\n")
        })
        const inputSub = term.onData((data) => window.api.pty.input(termId, data))

        requestAnimationFrame(() => {
            if (container.clientWidth && container.clientHeight) {
                try {
                    fit.fit()
                } catch {
                    /* noop */
                }
            }
            // Spawn (first time) or re-attach + replay (already running).
            // A per-terminal cwd override (e.g. a git worktree) wins over the project dir.
            // For agent terminals, inject the configured model (env) + API key (main
            // decrypts it from agentId + keyEnv); plain shells get neither.
            const spawn = (cmd?: string): void => {
                const agentId = useStore.getState().agentOf(termId)
                const preset = useSettings.getState().agentById(agentId)
                const extraEnv: Record<string, string> = {}
                if (preset?.model && preset?.modelEnv) extraEnv[preset.modelEnv] = preset.model
                window.api.pty.create({
                    id: termId,
                    cwd: useStore.getState().termCwd[termId] ?? cwd,
                    initialCommand: cmd,
                    shell: useSettings.getState().resolveShell(useStore.getState().termShells[termId]),
                    cols: term.cols,
                    rows: term.rows,
                    env: Object.keys(extraEnv).length ? extraEnv : undefined,
                    agentId: preset ? agentId : undefined,
                    keyEnv: preset?.apiKeyEnv || undefined,
                    projectId: useStore.getState().projectIdOfTerm(termId)
                })
            }
            spawnRef.current = spawn
            // A restored agent session holds until the user chooses resume/fresh;
            // everything else launches immediately (or just re-attaches).
            if (!useStore.getState().agentResumePending[termId]) spawn(initialCommand)
        })

        const ro = new ResizeObserver(() => safeFit())
        ro.observe(container)

        return () => {
            offData()
            offExit()
            inputSub.dispose()
            ro.disconnect()
            paneRegistry.delete(termId)
            term.dispose()
            // NOTE: intentionally NOT killing the pty - session persists.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Re-fit only when the pane actually has dimensions (avoid 0-size fit errors).
    const refit = (): void => {
        const c = containerRef.current
        const term = termRef.current
        if (!c || !term || !c.clientWidth || !c.clientHeight) return
        try {
            fitRef.current?.fit()
            window.api.pty.resize(termId, term.cols, term.rows)
        } catch {
            /* resize can race with exit */
        }
    }

    // Live-apply font changes from settings.
    useEffect(() => {
        const term = termRef.current
        if (!term) return
        term.options.fontFamily = fontFamily
        term.options.fontSize = fontSize
        refit()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fontFamily, fontSize, termId])

    // Re-theme the terminal when the app theme changes.
    useEffect(() => {
        const term = termRef.current
        if (!term) return
        term.options.theme = THEMES[themeId].xterm
        term.options.lineHeight = THEMES[themeId].termLineHeight
        refit()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themeId, termId])

    // Focus the xterm when this pane becomes the active one.
    useEffect(() => {
        if (focused) termRef.current?.focus()
    }, [focused])

    return (
        <div
            className={"term-pane" + (focused ? " focused" : "")}
            onMouseDown={() => onFocus(termId)}
        >
            <div ref={containerRef} className="term-mount" />
            {pending && (
                <div className="resume-overlay">
                    <div className="resume-card">
                        <div className="resume-title">Resume this agent session?</div>
                        <div className="resume-sub">
                            Restored from your last run — its conversation isn&apos;t live yet.
                        </div>
                        <div className="resume-actions">
                            <button className="accent" onClick={() => resolveResume("resume")}>
                                Resume
                            </button>
                            <button onClick={() => resolveResume("fresh")}>Start fresh</button>
                        </div>
                        {resumeCmd && <code className="resume-cmd">{resumeCmd}</code>}
                    </div>
                </div>
            )}
        </div>
    )
}
