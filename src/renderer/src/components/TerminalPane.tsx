import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { paneRegistry } from "../paneRegistry"
import { useSettings } from "../settings"
import { SHELL, useStore } from "../store"
import { THEMES } from "../themes"
import { exitNotice } from "../termExit"
import { toast } from "../toast"
import { DEVDECK_TOKEN_ENV } from "../../../shared/mcpEnv"

const IS_WINDOWS = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent)

/**
 * The exit notice, ANSI-dimmed the same way on both call sites: the live
 * `pty:exit` handler below, and the corpse replay for a pane that mounted
 * onto an already-dead session. One string, one place it can drift.
 */
function writeExitNotice(term: Terminal, exitCode: number): void {
    term.write("\r\n\x1b[90m" + exitNotice(exitCode, IS_WINDOWS) + "\x1b[0m\r\n")
}

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
    const paneRef = useRef<HTMLDivElement>(null)
    const deadBarRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    // Holds the pty-spawn closure so the resume prompt can launch it after mount.
    const spawnRef = useRef<((cmd?: string) => void) | null>(null)
    const fontFamily = useSettings((s) => s.terminal.fontFamily)
    const fontSize = useSettings((s) => s.terminal.fontSize)
    const themeId = useSettings((s) => s.appearance.theme)
    // A held pane waits for the user before it launches: a restored session for
    // a resume/fresh choice, a dead one for a restart.
    const hold = useStore((s) => s.paneHold[termId])
    const releaseHold = useStore((s) => s.releaseHold)
    // The replay effect below is only correct for a pane that MOUNTED onto an
    // already-dead session (reached via another tab/project after the process
    // died). If this pane instance was mounted and watching when the process
    // exited, its terminal already holds every byte main kept - the live
    // `pty:exit` handler in the attach effect wrote the notice already - so
    // replaying would print the whole session twice, with two exit notices,
    // under a bar that claims the output is above. Captured once, at the
    // value `hold` already has at mount, not re-derived on every render.
    const bornDead = useRef(useStore.getState().paneHold[termId] === "restart")

    const resumeAgentId = useStore.getState().agentOf(termId)
    const isAgentPane = resumeAgentId !== SHELL
    const resumePreset = useSettings.getState().agentById(resumeAgentId)
    // Never resolve to an empty command (which would open a bare shell for a
    // restored agent whose preset was deleted): fall back to the launch command,
    // then to the agent id itself as a best guess.
    const coldCmd = resumePreset?.command || initialCommand || resumeAgentId
    const resumeCmd = resumePreset?.resumeArgs
        ? `${resumePreset.command} ${resumePreset.resumeArgs}`
        : coldCmd
    // Resume and Start fresh are only two different buttons when the preset has
    // a resumeArgs to make Resume mean something else - several shipped presets
    // (claude-yolo, gemini) and any user preset without one leave resumeCmd
    // falling back to coldCmd, so both buttons would run the identical command.
    // TerminalView.tsx's own resume affordance already gates on `a.resumeArgs`
    // for the same reason.
    const canResumeAgent = isAgentPane && !!resumePreset?.resumeArgs
    const resolveHold = (mode: "resume" | "fresh" | "restart"): void => {
        // Only mark the pane released if it actually started. The spawn closure
        // is set inside the attach effect's async tail, so a click landing in
        // that gap used to clear the flag without ever launching a pty, leaving
        // a dead pane with no way back; now the buttons stay up.
        const spawn = spawnRef.current
        if (!spawn) return
        spawn(mode === "resume" ? resumeCmd : mode === "fresh" ? coldCmd : initialCommand)
        releaseHold(termId)
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

        // Copy/paste. Ctrl+Shift+C copies the selection; Ctrl+Shift+V (and
        // right-click) paste the clipboard into the shell. Ctrl+C is left as-is
        // (SIGINT), and plain Ctrl+V still hits xterm's native paste. Clipboard
        // goes through Electron's module (the renderer's deny-all permission
        // handler blocks the async Clipboard API).
        // `term.paste()`, not a raw `pty.input()`: xterm wraps the payload in
        // DECSET 2004 brackets when the shell has asked for bracketed paste, so a
        // newline in the clipboard lands on the prompt instead of executing. The
        // raw write bypassed the capability the terminal already had — and it was
        // reached from the documented Ctrl+Shift+V chord, not just right-click.
        // A shell that never enabled 2004 receives exactly the same bytes as before.
        const pasteFromClipboard = (): void => {
            window.api.clipboard.readText().then((t) => {
                if (t) term.paste(t)
            })
        }
        // App-reserved chords must not reach the pty. App.tsx preventDefaults them
        // at window capture, but that doesn't stop xterm from *encoding* them —
        // plain Ctrl+K writes \x0b, so opening the switcher left a stray ^K on the
        // command line. Returning false means "xterm ignores this key"; the DOM
        // event still propagates, so the app handler (and find-in-terminal) run.
        // Keep in sync with the shortcut block in App.tsx.
        const isAppChord = (e: KeyboardEvent): boolean => {
            if (e.code === "Tab") return true // Ctrl+Tab / Ctrl+Shift+Tab — cycle sessions
            if (e.shiftKey) {
                // Ctrl+Shift+ P palette · F search/find · R review · J jump · K prev project
                return ["KeyP", "KeyF", "KeyR", "KeyJ", "KeyK"].includes(e.code)
            }
            if (e.code === "KeyK") return true // Ctrl+K — project switcher
            return /^Digit[1-9]$/.test(e.code) // Ctrl+1..9 — switch view
        }
        term.attachCustomKeyEventHandler((e) => {
            if (e.type !== "keydown") return true
            const mod = e.ctrlKey || e.metaKey
            // Alt+digit (jump to session) and Alt+arrow (move between panes) are
            // the app's. Without this xterm still ENCODES them, so Alt+Left would
            // write \x1b[1;3D into the shell on its way to moving focus. Narrow on
            // purpose: AltGr arrives as Ctrl+Alt on Windows layouts, so anything
            // carrying Ctrl is left alone, as is every other Alt combination.
            if (e.altKey && !mod) {
                if (/^Digit[1-9]$/.test(e.code)) return false
                if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) return false
                return true
            }
            if (!mod || e.altKey) return true
            if (e.shiftKey) {
                const k = e.key.toLowerCase()
                if (k === "c") {
                    const sel = term.getSelection()
                    if (sel) {
                        // Clearing the selection IS this copy's success signal -
                        // the highlight vanishing is how the user learns it
                        // worked. Do it only once the write is confirmed, or a
                        // refused clipboard takes the selection away too and
                        // leaves nothing to copy by hand.
                        void window.api.clipboard.writeText(sel).then((ok) => {
                            if (!ok) {
                                toast("Couldn't reach the clipboard - your selection is still there")
                                return
                            }
                            // The pane can be closed while the write is in
                            // flight; xterm throws on a disposed terminal.
                            try {
                                term.clearSelection()
                            } catch {
                                /* pane went away mid-copy */
                            }
                        })
                    }
                    return false
                }
                if (k === "v") {
                    pasteFromClipboard()
                    return false
                }
            }
            return !isAppChord(e)
        })
        const onContextMenu = (e: MouseEvent): void => {
            e.preventDefault()
            const sel = term.getSelection()
            // Right-click copies a selection if there is one, else pastes. A
            // silent copy has no success signal to withhold, so the only honest
            // thing to add is the failure: without it the user walks away
            // believing they hold text they do not.
            if (sel)
                void window.api.clipboard.writeText(sel).then((ok) => {
                    if (!ok) toast("Couldn't reach the clipboard - nothing was copied")
                })
            else pasteFromClipboard()
        }
        container.addEventListener("contextmenu", onContextMenu)

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
            if (id === termId) writeExitNotice(term, exitCode)
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
                // Bearer token for DevDeck's own MCP server. It lives here rather
                // than in .mcp.json because that file is meant to be committed —
                // the file references ${DEVDECK_MCP_TOKEN} and this supplies it.
                // Agent sessions only: a plain shell has no MCP client.
                const mcpSrv = useSettings.getState().mcpServer
                if (preset && mcpSrv.enabled && mcpSrv.token) {
                    extraEnv[DEVDECK_TOKEN_ENV] = mcpSrv.token
                }
                // `null` means the shell setting cannot be honoured — today only a
                // `custom` selection with a blank path. Refuse the spawn and say
                // so in the pane. Passing it through would land on pty.ts's
                // `opts.shell?.file ? … : defaultShell()` and quietly start
                // PowerShell instead, which is how this went unnoticed.
                const shell = useSettings.getState().resolveShell(
                    useStore.getState().termShells[termId]
                )
                if (!shell) {
                    term.write(
                        "\r\nNo shell to start: \"Custom\" is selected in Settings → Terminal " +
                            "with no path set.\r\nSet a path, or pick another shell.\r\n"
                    )
                    return
                }
                window.api.pty.create({
                    id: termId,
                    cwd: useStore.getState().termCwd[termId] ?? cwd,
                    initialCommand: cmd,
                    shell,
                    cols: term.cols,
                    rows: term.rows,
                    env: Object.keys(extraEnv).length ? extraEnv : undefined,
                    agentId: preset ? agentId : undefined,
                    keyEnv: preset?.apiKeyEnv || undefined,
                    projectId: useStore.getState().projectIdOfTerm(termId)
                })
            }
            spawnRef.current = spawn
            // A held pane holds for BOTH reasons. Spawning over a corpse is what
            // destroyed the record of why the process died.
            if (!useStore.getState().paneHold[termId]) spawn(initialCommand)
        })

        const ro = new ResizeObserver(() => safeFit())
        ro.observe(container)

        return () => {
            offData()
            offExit()
            inputSub.dispose()
            ro.disconnect()
            container.removeEventListener("contextmenu", onContextMenu)
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

    // Reserve the dead bar's height out of the terminal's usable rows BEFORE
    // fit() runs. FitAddon sizes rows to `.term-mount`'s box, so the row count
    // has to shrink at the same moment the `with-dead-bar` class lands on it -
    // otherwise xterm keeps sizing to the full pane and the bar just gets
    // layered on top of rows it already decided to use. Ordered before the
    // replay effect below so the rows are settled when the buffer is written.
    useEffect(() => {
        refit()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hold])

    // A wrapped, two-line bar (narrow split, both agent buttons) is taller
    // than the 48px default declared on `.term-pane`, and a fixed constant
    // can't follow a height that depends on the pane's width - so measure the
    // bar and feed its real height into `--dead-bar-h`, then refit.
    //
    // No feedback loop, but only because `.dead-bar`'s own min-height in
    // styles.css is a plain 48px constant, NOT this same property: this write
    // only reaches `.term-mount.with-dead-bar`'s bottom inset, a sibling box
    // this observer isn't watching. Reserving that space changes `.term-mount`'s
    // HEIGHT, not its WIDTH, and the bar's wrap (and therefore its own height)
    // is driven only by width, so even a width-only observer would be safe -
    // but the write used to also set `.dead-bar`'s own min-height, which
    // WOULD have changed the input this observer watches: once wrapped, the
    // property pinned the box at that height, the box could never report a
    // smaller size again, and the reserved space could grow but never shrink.
    useEffect(() => {
        if (hold !== "restart") return
        const bar = deadBarRef.current
        const pane = paneRef.current
        if (!bar || !pane) return
        const ro = new ResizeObserver(() => {
            pane.style.setProperty("--dead-bar-h", `${bar.offsetHeight}px`)
            refit()
        })
        ro.observe(bar)
        return () => {
            ro.disconnect()
            pane.style.removeProperty("--dead-bar-h")
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hold])

    // Show what the dead process printed, then say that it is dead.
    //
    // Fetched, not pushed: main replays a buffer through `pty:data` on create,
    // but a held pane never calls create, and that stream's handler clears the
    // exit record on any output - a pushed replay would erase the state the tile
    // is displaying. The notice is written AFTER the buffer because it is
    // rendered here, not by the process, so it is not part of what main kept.
    //
    // Gated on `bornDead`, not just `hold`: a pane that was mounted and watching
    // when the process died already has every byte in its terminal (the live
    // `pty:exit` handler above wrote the notice) - fetching and replaying the
    // same corpse here would print the whole session, and the notice, twice.
    useEffect(() => {
        if (hold !== "restart" || !bornDead.current) return
        let on = true
        void window.api.pty
            .buffer(termId)
            .then(({ buffer, exitCode }) => {
                const term = termRef.current
                if (!on || !term) return
                if (buffer) term.write(buffer)
                if (exitCode !== undefined) writeExitNotice(term, exitCode)
            })
            .catch(() => undefined) // unknown termId or a main-process throw - nothing to show
        return () => {
            on = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hold, termId])

    // Re-theme the terminal when the app theme changes.
    useEffect(() => {
        const term = termRef.current
        if (!term) return
        term.options.theme = THEMES[themeId].xterm
        term.options.lineHeight = THEMES[themeId].termLineHeight
        refit()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themeId, termId])

    // Focus the xterm when this pane becomes the active one - but not while
    // held: xterm's `attachCustomKeyEventHandler` returns true for a plain Tab,
    // so a focused terminal swallows it into a corpse that discards it, and the
    // dead bar's Resume/Fresh/Restart buttons become mouse-only. Leaving focus
    // off the terminal lets Tab reach the bar instead.
    useEffect(() => {
        if (focused && !hold) termRef.current?.focus()
    }, [focused, hold])

    return (
        <div
            ref={paneRef}
            className={"term-pane" + (focused ? " focused" : "")}
            // The handle directional navigation reads: only mounted panes carry
            // it, so the geometry it measures is what is actually on screen.
            data-term-id={termId}
            onMouseDown={() => onFocus(termId)}
        >
            <div
                ref={containerRef}
                className={"term-mount" + (hold === "restart" ? " with-dead-bar" : "")}
            />
            {hold === "resume" && (
                <div className="resume-overlay">
                    <div className="resume-card">
                        {/* Two buttons only when they would run two different
                            commands. Without `resumeArgs` — claude-yolo, gemini,
                            and any user preset that has none — `resumeCmd` falls
                            back to `coldCmd`, so "Resume" and "Start fresh" were
                            the same keystroke behind different words, over copy
                            promising a conversation that was about to be
                            discarded. The dead bar below has always gated on
                            `canResumeAgent`; this card did not. */}
                        <div className="resume-title">
                            {canResumeAgent ? "Resume this agent session?" : "Start this agent?"}
                        </div>
                        <div className="resume-sub">
                            {canResumeAgent
                                ? "Restored from your last run — its conversation isn't live yet."
                                : "Restored from your last run. This agent has no resume command, so it starts a new conversation."}
                        </div>
                        <div className="resume-actions">
                            {canResumeAgent ? (
                                <>
                                    <button className="accent" onClick={() => resolveHold("resume")}>
                                        Resume
                                    </button>
                                    <button onClick={() => resolveHold("fresh")}>Start fresh</button>
                                </>
                            ) : (
                                <button className="accent" onClick={() => resolveHold("fresh")}>
                                    Start
                                </button>
                            )}
                        </div>
                        {resumeCmd && <code className="resume-cmd">{resumeCmd}</code>}
                    </div>
                </div>
            )}
            {hold === "restart" && (
                <div ref={deadBarRef} className="dead-bar">
                    <span className="dead-bar-text">
                        This process exited. Its output is above.
                    </span>
                    <div className="dead-bar-actions">
                        {canResumeAgent ? (
                            <>
                                <button className="accent" onClick={() => resolveHold("resume")}>
                                    Resume
                                </button>
                                <button onClick={() => resolveHold("fresh")}>Start fresh</button>
                            </>
                        ) : (
                            <button className="accent" onClick={() => resolveHold("restart")}>
                                Restart
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
