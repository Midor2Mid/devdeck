import * as nodePty from "@lydell/node-pty"
import type { WebContents } from "electron"

interface Session {
    proc: nodePty.IPty
    /** Rolling tail of output, replayed when a new xterm re-attaches to this id. */
    buffer: string
}

// One live pty per terminal id. Sessions live here in the main process so they
// survive the renderer unmounting a pane (project/tab/split changes). A pane is
// free to detach and re-attach; on re-attach we replay the buffer so the fresh
// xterm shows recent scrollback. Sessions are only ended by an explicit kill.
const sessions = new Map<string, Session>()

const BUFFER_CAP = 256 * 1024 // ~256 KB of recent output kept for replay

export interface CreateOpts {
    id: string
    cwd?: string
    /** A command to auto-run once the shell is ready (e.g. "claude"). */
    initialCommand?: string
    cols?: number
    rows?: number
}

function defaultShell(): { file: string; args: string[] } {
    if (process.platform === "win32") {
        // PowerShell is the user's primary shell.
        return { file: "powershell.exe", args: ["-NoLogo"] }
    }
    return { file: process.env.SHELL || "/bin/bash", args: [] }
}

export function createPty(sender: WebContents, opts: CreateOpts): void {
    const { id } = opts
    const existing = sessions.get(id)
    if (existing) {
        // Re-attach: replay buffered output into the (new) xterm instance.
        if (!sender.isDestroyed() && existing.buffer) {
            sender.send("pty:data", { id, data: existing.buffer })
        }
        return
    }

    const { file, args } = defaultShell()
    const proc = nodePty.spawn(file, args, {
        name: "xterm-color",
        cwd: opts.cwd || process.env.USERPROFILE || process.cwd(),
        cols: opts.cols ?? 80,
        rows: opts.rows ?? 24,
        env: process.env as Record<string, string>
    })
    const session: Session = { proc, buffer: "" }
    sessions.set(id, session)

    proc.onData((data) => {
        session.buffer += data
        if (session.buffer.length > BUFFER_CAP) {
            session.buffer = session.buffer.slice(-BUFFER_CAP)
        }
        if (!sender.isDestroyed()) sender.send("pty:data", { id, data })
    })
    proc.onExit(({ exitCode }) => {
        sessions.delete(id)
        if (!sender.isDestroyed()) sender.send("pty:exit", { id, exitCode })
    })

    if (opts.initialCommand) {
        // Give the shell a moment to print its prompt before injecting the command.
        setTimeout(() => {
            try {
                proc.write(opts.initialCommand + "\r")
            } catch {
                // session may already be gone; ignore
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
        // resize can race with exit; ignore
    }
}

export function killPty(id: string): void {
    const session = sessions.get(id)
    if (!session) return
    try {
        session.proc.kill()
    } catch {
        // already dead
    }
    sessions.delete(id)
}

export function killAll(): void {
    for (const session of sessions.values()) {
        try {
            session.proc.kill()
        } catch {
            // ignore
        }
    }
    sessions.clear()
}
