import * as nodePty from "@lydell/node-pty"
import { EventEmitter } from "events"
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { cleanTail, lastLines, CARRY_MAX, OSC, CSI, OTHER } from "../shared/tail"

/**
 * A running pty and the tail of what it has printed.
 */
interface Live {
    kind: "live"
    proc: nodePty.IPty
    /** Rolling tail of output, replayed when a client attaches to this id. */
    buffer: string
    /**
     * The agent this session runs, when it runs one.
     *
     * Main already receives this on `pty:create` (it decrypts that agent's API
     * key from it) and used to throw it away. Keeping it is what lets the close
     * handler answer "is anything still working" without a new IPC channel and
     * without the renderer being asked at teardown time.
     */
    agentId?: string
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

// The cleaned tail main classifies from. Kept beside the raw buffer rather than
// derived from it on demand: the raw buffer is bytes mid-escape-sequence, and a
// one-pass clean over a slice of it can cut an escape in half. Fed the same
// chunks the renderer's tail is fed, so the two agree by construction.
const TAIL_CAP = 4000
const tails = new Map<string, string>()

// Anchored (no "g" flag, so no lastIndex state) copies of the escape-sequence
// regexes, used only to ask "does the sequence starting here resolve within
// the bytes I already have" - never to strip anything themselves.
const OSC_START = new RegExp("^(?:" + OSC.source + ")")
const CSI_START = new RegExp("^(?:" + CSI.source + ")")
const OTHER_START = new RegExp("^(?:" + OTHER.source + ")")

// Raw bytes held back from a session's tail because they might be an escape
// sequence a chunk boundary cut in half. cleanTail's own control-char strip
// treats an unresolved ESC as a stray byte and deletes it outright - correct
// for real noise, fatal for a sequence that simply hasn't finished arriving:
// the ESC is gone before the rest of the sequence lands, and what's left
// renders as literal bracket-and-digit text. Held raw here until it resolves
// into a complete match (or, per CARRY_MAX, until it's clearly not one).
const rawCarry = new Map<string, string>()

/**
 * Split newly-arrived raw pty bytes (already prefixed with any carry from the
 * previous chunk) into the prefix that's safe to run through cleanTail now
 * and the suffix to hold for next time.
 *
 * Only the LAST escape byte in `raw` needs checking: anything before it was
 * already resolved in an earlier call, by the same invariant this function
 * maintains. Capped at CARRY_MAX so a lone byte that merely looks like the
 * start of an escape - or a real one these regexes don't recognise, e.g. a
 * DCS string - can't stall a session's tail forever.
 */
function safeSplit(raw: string): { clean: string; carry: string } {
    const idx = raw.lastIndexOf("\x1b")
    if (idx === -1 || raw.length - idx > CARRY_MAX) return { clean: raw, carry: "" }
    const tail = raw.slice(idx)
    if (OSC_START.test(tail) || CSI_START.test(tail) || OTHER_START.test(tail)) {
        return { clean: raw, carry: "" }
    }
    return { clean: raw.slice(0, idx), carry: tail }
}

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
    /** Agent this terminal runs, if any. Plain shells leave it undefined. */
    agentId?: string
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

/** The last `n` non-empty cleaned lines of a session's output. "" if unknown. */
export function getTail(id: string, n: number): string {
    const t = tails.get(id)
    return t ? lastLines(t, n) : ""
}

/** sha256 of exactly what getTail(id, n) returns — binds a decision to a screen. */
export function tailDigest(id: string, n: number): string {
    return createHash("sha256").update(getTail(id, n)).digest("hex")
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

/**
 * The spawn itself, isolated so its option block stays readable next to the
 * failure handling in `createPty`.
 */
function spawnShell(file: string, args: string[], opts: CreateOpts): nodePty.IPty {
    return nodePty.spawn(file, args, {
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
}

export function createPty(opts: CreateOpts): void {
    const { id } = opts
    // Attaching to a RUNNING session is a no-op; spawning over a corpse is a
    // deliberate restart and must go ahead.
    if (sessions.get(id)?.kind === "live") return

    const { file, args } = opts.shell?.file ? opts.shell : defaultShell()
    let proc: nodePty.IPty
    try {
        proc = spawnShell(file, args, opts)
    } catch (e) {
        // Experiment E2 (2026-08-29): `nodePty.spawn` throws synchronously for a
        // missing or non-executable shell ("File not found: <path>"), and the
        // throw inside `ipcMain.on("pty:create")` is swallowed whole - main stays
        // healthy and keeps serving IPC, nothing reaches stderr, and no `pty:exit`
        // is ever emitted. The observed symptom is therefore a permanently BLACK
        // PANE that never learns anything, not a crash. So this reports rather
        // than recovers.
        const why = e instanceof Error ? e.message : String(e)
        const notice = [
            "",
            "DevDeck could not start this terminal.",
            `  shell: ${file}`,
            `  error: ${why}`,
            "Pick a different shell in Settings -> Terminal, or fix the path there.",
            ""
        ].join("\r\n")
        // Through the SAME surface a real death uses: a corpse holding the
        // reason, one data event so an attached pane prints it now, and one exit
        // event so every consumer (the exit record, the tile, the remote client)
        // learns this session is over instead of waiting forever.
        sessions.set(id, { kind: "dead", buffer: notice, exitCode: 1, diedAt: Date.now() })
        // The corpse's buffer is the notice text, not whatever a prior process
        // left behind at this id — the tail must match, or getTail would show a
        // dead process's screen under a corpse that displays this one.
        tails.set(id, cleanTail("", notice, TAIL_CAP))
        rawCarry.delete(id)
        ptyEvents.emit("data", { id, data: notice })
        ptyEvents.emit("exit", { id, exitCode: 1, stale: false })
        return
    }
    const live: Live = { kind: "live", proc, buffer: "", agentId: opts.agentId }
    sessions.set(id, live)
    // A restart (spawning over a corpse) reaches here with a fresh, empty
    // buffer above — the tail must reset the same way, or it stays seeded
    // with the dead process's leftover text until 4000 chars of new output
    // push it out. That stale blend is exactly what a later check (comparing
    // tailDigest before firing a keystroke at a live agent) exists to catch.
    tails.set(id, "")
    rawCarry.delete(id)

    // Fires `initialCommand` on the FIRST byte the shell prints, and never on a
    // timer. The 500 ms guess was made in the one process that can see that byte
    // for free: a shell slower than half a second had its command written into a
    // pty that was not reading yet, and the command was simply gone.
    let sentInitial = !opts.initialCommand
    proc.onData((data) => {
        live.buffer += data
        const { clean, carry } = safeSplit((rawCarry.get(id) ?? "") + data)
        rawCarry.set(id, carry)
        tails.set(id, cleanTail(tails.get(id) ?? "", clean, TAIL_CAP))
        if (live.buffer.length > BUFFER_CAP) {
            // Trim to the next line break so replay doesn't start mid escape-sequence.
            let trimmed = live.buffer.slice(-BUFFER_CAP)
            const nl = trimmed.indexOf("\n")
            if (nl > -1 && nl < 8192) trimmed = trimmed.slice(nl + 1)
            live.buffer = trimmed
        }
        ptyEvents.emit("data", { id, data })
        if (!sentInitial) {
            sentInitial = true
            try {
                proc.write(opts.initialCommand + "\r")
            } catch {
                /* the session can die between its first byte and this write */
            }
        }
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

/**
 * The agent ids of every session still running, one entry per live pty.
 *
 * Duplicates are kept: two panes running the same agent are two pieces of work
 * in flight, and the close prompt counts work, not distinct agents.
 */
export function liveAgents(): string[] {
    const out: string[] = []
    for (const e of sessions.values()) {
        if (e.kind === "live" && e.agentId) out.push(e.agentId)
    }
    return out
}

/**
 * Kill a shell *and everything it started*.
 *
 * `proc.kill()` signals the shell alone. On Windows a conpty shell is routinely
 * the root of a tree — `npm run dev` -> `node` -> a dev server holding a port —
 * and those grandchildren survived every close: the pane vanished, the port
 * stayed bound, and nothing in the UI could explain why the next run failed to
 * bind. `taskkill /T` walks the tree; `/F` is needed because a detached child
 * has no console to receive a polite request on.
 *
 * It must be **synchronous**. An async `spawn` loses the race with the
 * `proc.kill()` on the next line: the shell dies first, its detached children
 * are re-parented, and `taskkill /T` then walks a tree that no longer contains
 * them - which is exactly the leak this is here to stop. Measured, not assumed.
 *
 * Best-effort otherwise: a failed or missing `taskkill` costs nothing, because
 * `proc.kill()` still runs. `pid` is 0 for the first moment after spawn (the
 * conpty handshake is async), and a 0 must never be passed to `taskkill /T`.
 */
function reapTree(proc: nodePty.IPty): void {
    if (process.platform !== "win32") return
    const pid = proc.pid
    if (!pid || pid < 1) return
    try {
        spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], {
            stdio: "ignore",
            windowsHide: true,
            timeout: 5000
        })
    } catch {
        /* taskkill missing or refused; proc.kill() below still runs */
    }
}

function killEntry(e: Live): void {
    reapTree(e.proc)
    try {
        e.proc.kill()
    } catch {
        /* already dead */
    }
}

export function killPty(id: string): void {
    const e = sessions.get(id)
    if (!e) return
    if (e.kind === "live") killEntry(e)
    // A corpse is dropped the same way: this is the pane closing for good.
    sessions.delete(id)
    tails.delete(id)
    rawCarry.delete(id)
}

export function killAll(): void {
    for (const e of sessions.values()) {
        if (e.kind !== "live") continue
        killEntry(e)
    }
    sessions.clear()
    tails.clear()
    rawCarry.clear()
}
