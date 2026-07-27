import * as nodePty from "@lydell/node-pty"
import { EventEmitter } from "events"

interface Session {
    proc: nodePty.IPty
    /** Rolling tail of output, replayed when a client attaches to this id. */
    buffer: string
}

// One live pty per terminal id, in the main process. Output is broadcast via
// `ptyEvents` so multiple transports (the Electron window AND remote/mobile
// WebSocket clients) can stream the same session. Each transport replays the
// buffer itself on attach via getBuffer(). Sessions end only on explicit kill.
const sessions = new Map<string, Session>()

/** Emits "data" {id,data} and "exit" {id,exitCode}. */
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

export function hasSession(id: string): boolean {
    return sessions.has(id)
}

export function getBuffer(id: string): string {
    return sessions.get(id)?.buffer ?? ""
}

export function createPty(opts: CreateOpts): void {
    const { id } = opts
    if (sessions.has(id)) return

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
        env: {
            ...(process.env as Record<string, string>),
            // xterm.js renders 24-bit colour, but nothing told the child that.
            // Node TUIs (Claude Code, Codex, Gemini — all ink/chalk) check
            // COLORTERM for truecolor and otherwise fall back to a 256- or
            // 16-colour ramp, which flattens their palette.
            COLORTERM: "truecolor",
            ...(opts.env ?? {})
        }
    })
    const session: Session = { proc, buffer: "" }
    sessions.set(id, session)

    proc.onData((data) => {
        session.buffer += data
        if (session.buffer.length > BUFFER_CAP) {
            // Trim to the next line break so replay doesn't start mid escape-sequence.
            let trimmed = session.buffer.slice(-BUFFER_CAP)
            const nl = trimmed.indexOf("\n")
            if (nl > -1 && nl < 8192) trimmed = trimmed.slice(nl + 1)
            session.buffer = trimmed
        }
        ptyEvents.emit("data", { id, data })
    })
    proc.onExit(({ exitCode }) => {
        sessions.delete(id)
        ptyEvents.emit("exit", { id, exitCode })
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
    sessions.get(id)?.proc.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return
    try {
        sessions.get(id)?.proc.resize(cols, rows)
    } catch {
        /* resize can race with exit */
    }
}

export function killPty(id: string): void {
    const session = sessions.get(id)
    if (!session) return
    try {
        session.proc.kill()
    } catch {
        /* already dead */
    }
    sessions.delete(id)
}

export function killAll(): void {
    for (const session of sessions.values()) {
        try {
            session.proc.kill()
        } catch {
            /* ignore */
        }
    }
    sessions.clear()
}
