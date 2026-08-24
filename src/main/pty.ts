import * as nodePty from "@lydell/node-pty"
import { EventEmitter } from "events"

/**
 * A running pty and the tail of what it has printed.
 */
interface Live {
    kind: "live"
    proc: nodePty.IPty
    /** Rolling tail of output, replayed when a client attaches to this id. */
    buffer: string
}

/**
 * What is left when the process exits: the output, and why it went.
 *
 * A corpse deliberately has NO `proc` field. The alternative — one type with a
 * `dead: true` flag — leaves every `session.proc.write(...)` compiling and
 * failing at runtime on whichever call site was missed. As a separate shape,
 * the compiler enumerates them instead.
 *
 * It exists because deleting the entry at exit threw away the only record of
 * why a process died: a pane reached from another tab replayed nothing, spawned
 * a fresh shell over the evidence, and looked like it had simply been idle.
 */
interface Corpse {
    kind: "dead"
    buffer: string
    exitCode: number
    diedAt: number
}

type Entry = Live | Corpse

// One entry per terminal id, in the main process. Output is broadcast via
// `ptyEvents` so multiple transports (the Electron window AND remote/mobile
// WebSocket clients) can stream the same session. Each transport replays the
// buffer itself on attach via getBuffer(). A session that exits leaves a corpse
// behind, which lives until the pane is closed or deliberately restarted.
const sessions = new Map<string, Entry>()

/**
 * Emits "data" {id,data} and "exit" {id,exitCode,stale}.
 *
 * `stale` is true when the id had already been re-spawned before this
 * process's exit fired (a kill followed by a restart, or any other path that
 * replaces a live entry before its predecessor's onExit lands) - the exit is
 * still broadcast (server.ts's remote clients need the notice on a deliberate
 * kill) but describes a process that is no longer the one running under this
 * id.
 */
export const ptyEvents = new EventEmitter()
ptyEvents.setMaxListeners(50)

const BUFFER_CAP = 256 * 1024

export interface CreateOpts {
    id: string
    cwd?: string
    initialCommand?: string
    shell?: { file: string; args: string[] }
    cols?: number
    rows?: number
    /** Extra env vars merged over the inherited environment (e.g. model, API key). */
    env?: Record<string, string>
}

function defaultShell(): { file: string; args: string[] } {
    if (process.platform === "win32") {
        return { file: "powershell.exe", args: ["-NoLogo"] }
    }
    return { file: process.env.SHELL || "/bin/bash", args: [] }
}

/**
 * Environment for a terminal child, derived from DevDeck's own.
 *
 * `NO_COLOR` is stripped. It's the no-color.org convention and chalk checks it
 * *before* anything else, so a single inherited `NO_COLOR=1` makes every Node
 * TUI — Claude Code, Codex, Gemini are all ink/chalk — render flat monochrome no
 * matter what TERM or COLORTERM say. It's meant for pipes and CI, not for a
 * terminal a human is looking at, and DevDeck inherits whatever launched it: a
 * CI shell, a parent agent harness, or a user who set it globally years ago.
 * Someone who wants colourless output can turn it off in the agent's own config;
 * inheriting it silently is just a broken-looking terminal with no explanation.
 *
 * TERM and COLORTERM are set because xterm.js renders 24-bit colour and nothing
 * otherwise tells the child that, leaving it on a 256- or 16-colour ramp. TERM
 * matters more than it looks: node-pty's `name` option sets it on macOS/Linux but
 * conpty ignores it, so on Windows the child inherited whatever the *launcher*
 * happened to export — `xterm-256color` from Git Bash, nothing at all from the
 * Start Menu. Colour support that depends on how you started the app is a bug
 * you can't reproduce on demand. Declaring it here makes it deterministic, and
 * the claim is true: this really is an xterm-compatible 256-colour terminal.
 */
export function terminalEnv(extra?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) }
    delete env.NO_COLOR
    env.TERM = "xterm-256color"
    env.COLORTERM = "truecolor"
    return { ...env, ...(extra ?? {}) }
}

export function getBuffer(id: string): string {
    return sessions.get(id)?.buffer ?? ""
}

/**
 * A session's output and, if its process has exited, the code it exited with.
 *
 * The read behind `pty:buffer`: a held pane fetches its corpse and writes it
 * into the terminal itself. It must NOT arrive through the `pty:data` stream —
 * the renderer's handler there clears the exit record on any output, so a
 * pushed replay would erase the very thing the pane is displaying.
 *
 * `exitCode` is undefined for a live session and for an id nothing knows about.
 */
export function bufferOf(id: string): { buffer: string; exitCode: number | undefined } {
    const e = sessions.get(id)
    if (!e) return { buffer: "", exitCode: undefined }
    return { buffer: e.buffer, exitCode: e.kind === "dead" ? e.exitCode : undefined }
}

export function createPty(opts: CreateOpts): void {
    const { id } = opts
    // Attaching to a RUNNING session is a no-op; spawning over a corpse is a
    // deliberate restart and must go ahead.
    if (sessions.get(id)?.kind === "live") return

    const { file, args } = opts.shell?.file ? opts.shell : defaultShell()
    const proc = nodePty.spawn(file, args, {
        // `xterm-color` is a legacy 8-colour terminfo — a CLI that trusts TERM
        // caps itself at 16 colours, which is a big part of why agent output
        // looks washed out. Windows/conpty ignores `name`, but it *is* TERM on
        // macOS and Linux, so this matters as soon as we ship there.
        name: "xterm-256color",
        cwd: opts.cwd || process.env.USERPROFILE || process.cwd(),
        cols: opts.cols ?? 80,
        rows: opts.rows ?? 24,
        env: terminalEnv(opts.env)
    })
    const live: Live = { kind: "live", proc, buffer: "" }
    sessions.set(id, live)

    proc.onData((data) => {
        live.buffer += data
        if (live.buffer.length > BUFFER_CAP) {
            // Trim to the next line break so replay doesn't start mid escape-sequence.
            let trimmed = live.buffer.slice(-BUFFER_CAP)
            const nl = trimmed.indexOf("\n")
            if (nl > -1 && nl < 8192) trimmed = trimmed.slice(nl + 1)
            live.buffer = trimmed
        }
        ptyEvents.emit("data", { id, data })
    })
    proc.onExit(({ exitCode }) => {
        // Computed once, before anything below reads or changes the map: true
        // when a restart already spawned over this corpse, so the late exit of
        // the process it replaced must not overwrite the fresh session - and,
        // per the doc comment above, must be flagged so a listener doesn't
        // mistake a live id for a dead one either.
        const stale = sessions.get(id) !== live
        if (!stale) {
            sessions.set(id, { kind: "dead", buffer: live.buffer, exitCode, diedAt: Date.now() })
        }
        ptyEvents.emit("exit", { id, exitCode, stale })
    })

    if (opts.initialCommand) {
        setTimeout(() => {
            try {
                proc.write(opts.initialCommand + "\r")
            } catch {
                /* session may already be gone */
            }
        }, 500)
    }
}

export function writePty(id: string, data: string): void {
    const e = sessions.get(id)
    // Nothing is listening on a corpse. Previously this was a throw caught by
    // the caller; now it cannot be written at all.
    if (e?.kind === "live") e.proc.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return
    const e = sessions.get(id)
    if (e?.kind !== "live") return
    try {
        e.proc.resize(cols, rows)
    } catch {
        /* resize can race with exit */
    }
}

export function killPty(id: string): void {
    const e = sessions.get(id)
    if (!e) return
    if (e.kind === "live") {
        try {
            e.proc.kill()
        } catch {
            /* already dead */
        }
    }
    // A corpse is dropped the same way: this is the pane closing for good.
    sessions.delete(id)
}

export function killAll(): void {
    for (const e of sessions.values()) {
        if (e.kind !== "live") continue
        try {
            e.proc.kill()
        } catch {
            /* ignore */
        }
    }
    sessions.clear()
}
