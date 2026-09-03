/**
 * The PATH a pane will actually have — read once from a login shell, cached for
 * the process, and allowed to fail.
 *
 * **`process.env.PATH` is the wrong answer and this is the module that exists to
 * say so.** An Electron main process launched from Explorer, the Start Menu or a
 * desktop shortcut inherits the PATH the *shell-less* session had. DevDeck's
 * panes spawn PowerShell, which runs the user's profile, and a profile is
 * exactly where an npm-global bin directory or an installer's PATH edit lands.
 * A probe that read main's environment would answer `missing` for an agent CLI
 * the user's terminal runs perfectly — a signal that lies, on the one screen
 * whose whole job is telling a stranger why nothing happened.
 *
 * So: spawn the user's shell once, ask it what PATH it ended up with, and if
 * that fails, say `unknown`. It must never fall back to `process.env.PATH`,
 * because a wrong `missing` is worse than an honest "not checked".
 */

import { execFile } from "child_process"
import { randomBytes } from "crypto"
import { join } from "path"
import { probeRequests } from "./which"
import type { ProbeReport, ProbeRequest } from "../shared/probe"

/**
 * Generous, because the thing being waited on is a user's PowerShell profile —
 * module imports, `oh-my-posh`, a corporate logon script. Measured on the
 * author's machine (no profile): 150–180ms warm, and hydration is warmed at app
 * ready, so nothing user-visible waits on it in the normal case. The timeout is
 * a stop, not a budget: the only thing it protects against is a profile that
 * blocks forever, and its cost is paid once per process.
 */
const HYDRATE_TIMEOUT_MS = 6000

/**
 * Forces hydration to fail without spawning anything, so the `unknown` state
 * can be observed in the real UI.
 *
 * The only genuine trigger for a hydration failure is an antivirus killing the
 * spawned PowerShell (Avast does this on this machine, exit `0xC0000409`), which
 * is not reproducible on demand — which meant the state this whole feature
 * exists to protect could only ever be verified by reading code. This makes it
 * an observation instead: `DEVDECK_FORCE_PATH_UNKNOWN=1 <launch DevDeck>`.
 *
 * It logs on every use, deliberately. A silent switch that degrades a feature is
 * a foot-gun; one that announces itself in the log the diagnostics blob carries
 * cannot be quietly left on in someone's environment.
 */
const FORCE_UNKNOWN_ENV = "DEVDECK_FORCE_PATH_UNKNOWN"

export interface HydrationCommand {
    file: string
    args: string[]
}

/**
 * Three markers, not two, because two values are read in one spawn: the PATH
 * between `begin` and `mid`, and `PATHEXT` between `mid` and `end`.
 *
 * `PATHEXT` is hydrated rather than taken from `process.env` for the same reason
 * PATH is: it decides which filenames count as launchable, so a `missing` answer
 * partly rests on it, and no part of a `found`/`missing` answer may come from
 * main's own environment.
 */
export interface Marks {
    begin: string
    mid: string
    end: string
}

/** What one hydration produced. `pathext` is absent on POSIX, where it is meaningless. */
export interface ShellEnv {
    path: string
    pathext?: string
}

/**
 * `powershell.exe`, named absolutely.
 *
 * `execFile` with a bare name hands resolution to libuv's PATH search, which
 * walks `process.env.PATH` in order — and on a real developer machine that PATH
 * is not a list of admin-owned directories. The one this was written on has a
 * user-writable application directory as its **third** entry, ahead of
 * `C:\Windows\system32`; anything running as the user (an agent in a pane, a
 * postinstall script) can drop a `powershell.exe` there and DevDeck will run it
 * at app-ready, unattended, once per launch, forever. That is not a new
 * capability for something that already has a shell — it is DevDeck electing to
 * be the trigger — and naming the file costs nothing.
 *
 * `%SystemRoot%` rather than a literal `C:\Windows`, because Windows is not
 * always on C:. With no `SystemRoot` at all we fall back to the bare name: a
 * spawn that fails hydrates to `unknown`, which is the safe direction, and
 * refusing to spawn anything in an environment that broken is the worse trade.
 */
export function windowsPowerShell(): string {
    const root = process.env.SystemRoot || process.env.windir
    return root
        ? join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
        : "powershell.exe"
}

/**
 * The shell invocation that prints a delimited PATH and PATHEXT.
 *
 * Windows notes, all load-bearing:
 *
 * - **No `-NoProfile`.** Capturing the profile's effect on PATH is the entire
 *   point. Adding it would make this module a slower, more elaborate way of
 *   reading `process.env.PATH`.
 * - **`-EncodedCommand`, not `-Command`.** A `-Command` string's quotes are
 *   re-parsed by `CommandLineToArgvW` and then by PowerShell; the double quotes
 *   around the delimiters are eaten on the way through and the script fails to
 *   parse (observed, 2026-09-03). Base64 UTF-16LE has no quoting to lose.
 * - **`[Console]::Out.WriteLine`, not `Write-Output`.** PowerShell's format
 *   engine wraps a long string at 120 columns when stdout is redirected, and a
 *   real PATH is ~2000 characters. `Write-Output $env:PATH` would hand back a
 *   PATH broken into pieces. `[Console]::Out` bypasses the formatter entirely.
 * - **`-NonInteractive`** so a profile containing a `Read-Host` cannot hang the
 *   spawn until the timeout. It does not suppress the profile.
 *
 * POSIX uses `-l -c` (a login shell, which is what reads the profile) and
 * `printf`, and deliberately not `-i`: an interactive shell can block on job
 * control.
 */
export function hydrationCommand(platform: NodeJS.Platform, marks: Marks): HydrationCommand {
    const { begin, mid, end } = marks
    // The delimiters are generated here (see `hydrateShellEnv`) and never come
    // from a caller, a setting or a client. This assertion is what keeps that
    // true if someone later wires a parameter into it: a delimiter is the one
    // string in this file that gets interpolated into a shell script.
    for (const m of [begin, mid, end]) {
        if (!/^[A-Za-z0-9-]+$/.test(m)) {
            throw new Error("shellPath: delimiters must be generated, alphanumeric tokens")
        }
    }
    if (platform === "win32") {
        const script = [
            `[Console]::Out.WriteLine("${begin}")`,
            "[Console]::Out.WriteLine($env:PATH)",
            `[Console]::Out.WriteLine("${mid}")`,
            "[Console]::Out.WriteLine($env:PATHEXT)",
            `[Console]::Out.WriteLine("${end}")`
        ].join(";")
        return {
            file: windowsPowerShell(),
            args: [
                "-NoLogo",
                "-NonInteractive",
                "-EncodedCommand",
                Buffer.from(script, "utf16le").toString("base64")
            ]
        }
    }
    const shell = process.env.SHELL || "/bin/bash"
    const script = `printf '%s\\n' '${begin}' "$PATH" '${mid}' "$PATHEXT" '${end}'`
    return { file: shell, args: ["-l", "-c", script] }
}

/**
 * Pull the value between two of our delimiters out of whatever the shell printed.
 *
 * A profile is free to print a banner, a MOTD, an update notice or a warning,
 * and on this machine at least one of those is likely. Everything outside the
 * delimiters is therefore ignored rather than parsed. Requiring **both** markers
 * is also the integrity check: a shell that was killed mid-run (an antivirus
 * kill, the timeout) may have printed the opening marker and a partial PATH, and
 * a truncated PATH would produce confident, wrong `missing` answers. No closing
 * marker, no answer.
 *
 * Multiple lines between the markers are re-joined rather than dropped. The
 * writer emits exactly one line, so more than one means the stream was wrapped
 * by something downstream; joining cannot lose a PATH entry, whereas picking one
 * line could.
 */
export function extractDelimited(stdout: string, begin: string, end: string): string | null {
    const i = stdout.indexOf(begin)
    if (i === -1) return null
    const from = i + begin.length
    const j = stdout.indexOf(end, from)
    if (j === -1) return null
    const value = stdout
        .slice(from, j)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l !== "")
        .join("")
    return value === "" ? null : value
}

/** The spawn, isolated so it can be replaced in tests. Resolves; never rejects. */
export type RunShell = (cmd: HydrationCommand, timeoutMs: number) => Promise<string>

const runShell: RunShell = (cmd, timeoutMs) =>
    new Promise((resolve) => {
        execFile(
            cmd.file,
            cmd.args,
            {
                timeout: timeoutMs,
                windowsHide: true,
                maxBuffer: 1_000_000,
                env: process.env
            },
            // The error is deliberately ignored and stdout parsed anyway. A
            // profile that ends in `exit 1`, a non-fatal profile error, and an
            // antivirus killing the shell after it printed all three lines all arrive
            // here as an error with usable output. The delimiters decide whether
            // there is an answer, not the exit code.
            (_err, stdout) => resolve(stdout || "")
        )
    })

/**
 * Read the login shell's PATH (and `PATHEXT`). Resolves to `null` when it could
 * not be read — timeout, spawn failure, antivirus kill, or output we refuse to
 * trust. `null` is the whole `unknown` state: it never degrades to
 * `process.env.PATH`.
 */
export async function hydrateShellEnv(
    run: RunShell = runShell,
    platform: NodeJS.Platform = process.platform
): Promise<ShellEnv | null> {
    if (process.env[FORCE_UNKNOWN_ENV]) {
        console.warn(`[probe] ${FORCE_UNKNOWN_ENV} is set: shell PATH hydration disabled`)
        return null
    }
    // Random per call: a profile cannot print, and a stale buffer cannot replay,
    // a marker it has never seen.
    const tag = randomBytes(8).toString("hex").toUpperCase()
    const marks: Marks = {
        begin: `DDPATHBEGIN-${tag}`,
        mid: `DDPATHMID-${tag}`,
        end: `DDPATHEND-${tag}`
    }
    try {
        const stdout = await run(hydrationCommand(platform, marks), HYDRATE_TIMEOUT_MS)
        const path = extractDelimited(stdout, marks.begin, marks.mid)
        if (path === null) return null
        // A missing PATHEXT is not a failed hydration: it is empty on POSIX by
        // definition, and `which.ts` falls back to the standard Windows set.
        const pathext = extractDelimited(stdout, marks.mid, marks.end) ?? undefined
        return { path, pathext }
    } catch (err) {
        console.error("[probe] shell PATH hydration failed:", (err as Error)?.message)
        return null
    }
}

/**
 * The cached promise, so concurrent first callers share one spawn instead of
 * racing to start several.
 *
 * A **failed** hydration is cached too, and that is deliberate: retrying on
 * every render would spawn a shell per launcher paint on a machine where the
 * spawn is exactly what is failing. The design already gives the user the retry
 * — the `Re-check` control, which arrives here as `refresh`.
 */
let cached: Promise<ShellEnv | null> | null = null

/**
 * Whether the cached promise is a spawn still in progress.
 *
 * This is what keeps `refresh` from being a spawn multiplier. `refresh`
 * invalidates the cache, so N refreshes arriving before the first one answered
 * used to invalidate N times and start N shells — and each shell runs the user's
 * entire PowerShell profile. A component that re-checks in a loop, or one
 * renderer bug, is then a fork bomb wearing a button. A refresh that lands while
 * a hydration is already running joins it instead, and still gets a freshly read
 * PATH, which is the whole promise of `Re-check`.
 */
let hydrating = false

export function shellEnv(run?: RunShell): Promise<ShellEnv | null> {
    if (!cached) {
        hydrating = true
        cached = hydrateShellEnv(run).finally(() => {
            hydrating = false
        })
    }
    return cached
}

/** Drop the cache so the next `shellEnv()` re-spawns. The `Re-check` control. */
export function invalidateShellEnv(): void {
    cached = null
    hydrating = false
}

/** True while a hydration spawn is outstanding. Exposed so the cap can be tested. */
export function isHydrating(): boolean {
    return hydrating
}

/**
 * Start hydration without waiting for it. Called at app ready so the one spawn
 * overlaps renderer boot and the first probe finds the PATH already in hand —
 * see the probe-timing note on `probe()`.
 */
export function warmShellEnv(): void {
    void shellEnv()
}

const MAX_REQUESTS = 64
const MAX_COMMAND_LEN = 2048

/**
 * Coerce whatever arrived over IPC into requests. Nothing here trusts the shape.
 *
 * Malformed entries are kept with a blank command rather than dropped, so a
 * caller cannot be silently answered about fewer presets than it asked about —
 * and a blank command has an honest answer already (`blank`).
 */
function sanitize(raw: unknown): ProbeRequest[] {
    if (!Array.isArray(raw)) return []
    return raw.slice(0, MAX_REQUESTS).map((r, i) => {
        const o = (r ?? {}) as Record<string, unknown>
        return {
            id: typeof o.id === "string" && o.id ? o.id.slice(0, 200) : `#${i}`,
            command: typeof o.command === "string" ? o.command.slice(0, MAX_COMMAND_LEN) : "",
            runMode: typeof o.runMode === "string" ? o.runMode : ""
        }
    })
}

/**
 * Probe a preset list against the login-shell PATH.
 *
 * **Probe timing.** Hydration happens once per process (warmed at app ready);
 * the stat walk re-runs on every call and costs microseconds, so the renderer is
 * free to call this whenever its preset list or its launcher mounts, and does not
 * need to cache the report to avoid cost. `refresh` re-hydrates, and is meant
 * only for the design's explicit `Re-check` control.
 */
export async function probe(
    requests: unknown,
    refresh = false,
    run?: RunShell
): Promise<ProbeReport> {
    // `&& !hydrating`: a refresh joins a spawn that is already outstanding rather
    // than starting a second one. See `hydrating`.
    if (refresh && !hydrating) invalidateShellEnv()
    const env = await shellEnv(run)
    return {
        // `path: null` when hydration failed, which is what makes every bare
        // command answer `unknown`. Substituting `process.env.PATH` here is the
        // one-line change that would turn this whole feature into a liar.
        results: await probeRequests(sanitize(requests), {
            path: env?.path ?? null,
            pathext: env?.pathext
        }),
        pathHydrated: env !== null,
        checkedAt: Date.now()
    }
}

/**
 * The `probe:commands` IPC entry point, payload and all.
 *
 * The unwrapping lives here rather than in the handler's parameter list because
 * `(_e, { requests, refresh }) => …` answers a payload that is not an object
 * with a **`TypeError`**, and a guard that throws has not refused — it has
 * failed to decide, upstream of the `sanitize` that was written to decide. This
 * repo has already shipped that exact shape once, in a path guard that answered
 * with a `TypeError` out of `path.resolve` instead of a verdict, and it was
 * found by driving the app rather than by a test.
 *
 * Nothing here is reachable from the current renderer, whose bridge always sends
 * an object literal, and `contextIsolation` means renderer code cannot reach
 * `ipcRenderer` to send anything else. It is written this way so that the next
 * caller — another preload entry, an MCP tool — inherits a refusal instead of an
 * exception, and so the refusal is in a module a test can call.
 *
 * `refresh` is compared to `true` rather than coerced: `"false"`, `1` and `{}`
 * are all truthy, and this is the one flag that spawns a shell.
 */
export function probeIpc(payload: unknown, run?: RunShell): Promise<ProbeReport> {
    const o = (payload ?? {}) as Record<string, unknown>
    return probe(o.requests, o.refresh === true, run)
}
