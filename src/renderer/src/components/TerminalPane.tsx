import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { paneRegistry } from "../paneRegistry"
import { useSettings } from "../settings"
import { THEMES } from "../themes"

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
 * exists). On unmount it detaches but does NOT kill the pty — the session lives
 * on so it survives split/tab/project switches. Killing is explicit (close).
 */
export function TerminalPane({ termId, initialCommand, cwd, focused, onFocus }: Props): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const fontFamily = useSettings((s) => s.terminal.fontFamily)
    const fontSize = useSettings((s) => s.terminal.fontSize)
    const themeId = useSettings((s) => s.appearance.theme)

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
        const offExit = window.api.pty.onExit(({ id }) => {
            if (id === termId) term.write("\r\n\x1b[90m[process exited]\x1b[0m\r\n")
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
            window.api.pty.create({
                id: termId,
                cwd,
                initialCommand,
                shell: useSettings.getState().resolveShell(),
                cols: term.cols,
                rows: term.rows
            })
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
            // NOTE: intentionally NOT killing the pty — session persists.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Live-apply font changes from settings.
    useEffect(() => {
        const term = termRef.current
        const fit = fitRef.current
        if (!term) return
        term.options.fontFamily = fontFamily
        term.options.fontSize = fontSize
        try {
            fit?.fit()
            window.api.pty.resize(termId, term.cols, term.rows)
        } catch {
            /* noop */
        }
    }, [fontFamily, fontSize, termId])

    // Re-theme the terminal when the app theme changes.
    useEffect(() => {
        const term = termRef.current
        if (!term) return
        term.options.theme = THEMES[themeId].xterm
        term.options.lineHeight = THEMES[themeId].termLineHeight
        try {
            fitRef.current?.fit()
            window.api.pty.resize(termId, term.cols, term.rows)
        } catch {
            /* noop */
        }
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
        </div>
    )
}
