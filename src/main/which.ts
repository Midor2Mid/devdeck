/**
 * "Is this command's first token a real file on this PATH?" — an `fs.stat` walk.
 *
 * Deliberately pure and electron-free: it takes the PATH string it should walk
 * and never reads `process.env`, so it is node-testable and, more importantly,
 * so that a `found`/`missing` answer can only ever come from a PATH somebody
 * handed it. `main/shellPath.ts` is the only production caller and it hands over
 * a **login-shell** PATH or `null`. Reading `process.env.PATH` here would make
 * the probe report on main's own environment, which a GUI-launched Electron
 * process does not share with the shell a pane spawns — that is the defect this
 * whole module is shaped to prevent.
 *
 * **It does not spawn `where`/`which`.** One spawn per preset per probe is eight
 * spawns at launch, and privilege-management software (this machine runs it)
 * gates each spawn with a delay that turns a status line into a startup stall.
 * A stat walk over ~40 local PATH entries costs microseconds and needs no child.
 *
 * **It stats asynchronously, under a deadline, and never in the UNC or device
 * namespace.** The command string is caller-supplied, and `\\host\share\x` is
 * not a filesystem read — it is an outbound SMB session to a host the caller
 * named. Measured on this machine: 26.6 s of a *synchronously frozen* Electron
 * main process for one unreachable address, and a successful NTLM authentication
 * to a reachable one. See `isUncOrDevicePath` and `DEFAULT_BUDGET_MS`.
 */

import { promises as fsp, realpath } from "fs"
import { promisify } from "util"
import { homedir } from "os"
import { join, extname, win32, posix } from "path"
import type { ProbeRequest, ProbeResult } from "../shared/probe"

/**
 * `fs.promises.realpath` has **no** `.native` variant — only the callback and
 * sync APIs do (checked on Node 22: `fs.promises.realpath.native` is
 * `undefined`). `.native` is not decoration here: it is the only call that
 * returns the real on-disk casing, which is what puts a path the user recognises
 * in the tooltip. So the callback form is promisified rather than the promise
 * API being used and quietly losing the casing.
 */
const realpathNative = promisify(realpath.native)

/**
 * A probe answer before it is attached to a preset. `probeCommand` resolves a
 * command line; only `probeRequests` knows which preset asked.
 */
export type CommandProbe = Omit<ProbeResult, "id">

/**
 * What Windows will execute from a bare name. Used when the machine reports no
 * `PATHEXT`, which happens in stripped service environments.
 */
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.JS;.WSF;.MSC"

/**
 * `.ps1` is not in `PATHEXT` and is still launchable, because DevDeck's panes
 * run PowerShell and PowerShell adds `.ps1` to its own command discovery. An
 * npm-global install writes `claude.ps1` beside `claude.cmd`; omitting this
 * would have reported `missing` for a shim that runs. Appended *after* PATHEXT
 * so the `.cmd` shim is the path we show when both exist, matching `where`.
 */
const POWERSHELL_EXT = ".PS1"

/**
 * Wall-clock ceiling for one *batch* of lookups, after which nothing further is
 * statted and every unresolved command answers `unknown`.
 *
 * A stat cannot be cancelled, so this bounds how many slow stats one call can
 * accumulate, not how long any single one takes. Refusing the UNC namespace
 * (see `isUncOrDevicePath`) removes the only unbounded case a caller can aim;
 * what is left is a disconnected mapped drive letter in the user's own PATH,
 * where the deadline turns "60 entries × 20 s" into "one entry × 20 s, then an
 * honest `unknown`".
 *
 * **Sized from a measurement, and deliberately loose.** The miss path is the
 * expensive one — it stats every PATH entry × every `PATHEXT` candidate before
 * it can say `missing` — and on the author's machine (62 PATH entries, 18
 * candidates each, so ~1,100 stats) one missing command costs **132 ms**. At the
 * 64-request cap that is ~8.4 s of walking, which is why the walk had to stop
 * being synchronous: pre-`fsp` that was 8.4 s of a frozen main process from one
 * IPC call, with no attacker and no network involved.
 *
 * A budget tight enough to be a governor is the wrong instrument: at 2 s, 50 of
 * 64 real misses came back `unknown`, which is a feature regression dressed as a
 * guard. 8 s covers the full cap on this machine, so it fires only when
 * something is genuinely stuck — which is the only thing it is for, now that the
 * event loop is no longer the thing being spent.
 */
const DEFAULT_BUDGET_MS = 8000

export interface WhichEnv {
    /**
     * The PATH to walk, or `null` when it could not be obtained.
     *
     * `null` is not "empty PATH" — it forces `unknown` for every bare command.
     * An empty string would mean "a PATH was read and it has no entries", which
     * legitimately produces `missing`.
     */
    path: string | null
    /** `PATHEXT`, Windows only. Defaults to the standard set when absent or blank. */
    pathext?: string
    /** Home directory for `~` expansion. Defaults to `os.homedir()`. */
    home?: string
    /** Which platform's *policy* to apply. Defaults to the host. See `probeCommand`. */
    platform?: NodeJS.Platform
    /** Wall-clock ceiling for the whole walk. Defaults to `DEFAULT_BUDGET_MS`. */
    budgetMs?: number
    /** Injectable clock, so the deadline can be tested without waiting for it. */
    now?: () => number
}

/**
 * The first token of a command line — what a shell would try to execute.
 *
 * A quoted first token is unwrapped, because `"C:\Program Files\x\claude.cmd"`
 * is one token with a space in it and splitting on whitespace would look up
 * `C:\Program`. Both quote characters are handled: cmd uses `"`, PowerShell
 * accepts `'` as well, and a user pastes whichever their shell taught them.
 *
 * `""` for an empty or whitespace-only command — the caller turns that into the
 * `blank` state rather than a lookup.
 */
export function firstToken(command: string): string {
    const s = command.trim()
    if (!s) return ""
    if (s.startsWith('"') || s.startsWith("'")) {
        const q = s[0]
        const end = s.indexOf(q, 1)
        return end === -1 ? s.slice(1) : s.slice(1, end)
    }
    const m = /^\S+/.exec(s)
    return m ? m[0] : ""
}

/**
 * Anything in the UNC or Win32 device namespace: `\\host\share`, `//host/share`,
 * `\\?\C:\…`, `\\?\UNC\host\…`, `\\.\PhysicalDrive0`.
 *
 * **Never statted, on any platform.** A `stat` of `\\host\share\x` is not a
 * filesystem read: Windows opens an SMB session to a host the *caller* named,
 * which (a) authenticates with the logged-in user's credentials, handing an
 * NTLMv2 challenge and response to whoever answers on 445, and (b) blocks —
 * measured at 26.6 s for one unreachable address, uncancellable. `probe:commands`
 * accepts 64 command strings per call, so 64 distinct hosts is roughly half an
 * hour. Neither is a price a "which is on the PATH?" question may charge.
 *
 * The rule is the whole `\\` / `//` prefix class rather than "starts with two
 * backslashes", because `//10.0.0.1/s/x.exe`, `\\?\UNC\10.0.0.1\s\x.exe` and
 * `\\.\…` are the same reach wearing different spellings, and a guard that
 * catches one spelling of a class has not caught the class. The cost of the
 * uniform rule is that a POSIX host with a genuine `//net/x` path answers
 * `unknown` instead of `found`, which is a degradation, not a lie.
 *
 * `unknown` — "nothing was checked" — is the honest answer, and it is a state
 * the launcher still launches on. `missing` would be a claim we did not earn.
 */
function isUncOrDevicePath(p: string): boolean {
    return /^[\\/]{2}/.test(p)
}

/** Expand a leading `~` (and `~/…`) against a home directory. */
function expandHome(token: string, home: string): string {
    if (token === "~") return home
    if (token.startsWith("~/") || token.startsWith("~\\")) return join(home, token.slice(2))
    return token
}

function pathextList(win: boolean, raw: string | undefined): string[] {
    if (!win) return [""]
    const src = (raw && raw.trim() ? raw : DEFAULT_PATHEXT).split(";")
    const out: string[] = []
    for (const e of src) {
        const ext = e.trim()
        if (ext && ext.startsWith(".")) out.push(ext)
    }
    if (!out.some((e) => e.toUpperCase() === POWERSHELL_EXT)) out.push(POWERSHELL_EXT)
    return out
}

/**
 * The filenames Windows would try for one base name.
 *
 * If the base already carries a launchable extension we try exactly that and
 * nothing else. Otherwise we append each extension — including for a base like
 * `tool.py`, which becomes `tool.py.exe`/`tool.py.cmd`, exactly as cmd and
 * PowerShell resolve it. The bare, extension-less name is **not** a candidate on
 * Windows: PowerShell will not execute an extension-less file, so reporting
 * `found` for one would be reporting something that cannot run.
 */
function windowsCandidates(base: string, exts: string[]): string[] {
    const ext = extname(base).toLowerCase()
    if (ext && exts.some((e) => e.toLowerCase() === ext)) return [base]
    // Each extension is tried as `PATHEXT` spells it (conventionally uppercase)
    // and lowercased. Two reasons, both real: NTFS directories can be flagged
    // case-sensitive and network/WSL-backed PATH entries genuinely are, and it
    // is what lets the Windows walk be tested on a case-sensitive filesystem
    // instead of only on Windows. The extra stats land only on the miss path —
    // on a case-insensitive volume the as-written candidate already hit.
    const out: string[] = []
    for (const e of exts) {
        out.push(base + e)
        const lower = base + e.toLowerCase()
        if (lower !== base + e) out.push(lower)
    }
    return out
}

/**
 * A stat that answers "would a shell run this file?", or null.
 *
 * Asynchronous on purpose. This runs in the Electron **main** process, where a
 * synchronous stat is the whole app: one PATH entry on a disconnected mapped
 * drive blocks every window, every pty and the remote HTTP server for as long as
 * the redirector's timeout lasts. `fsp.stat` pays the same wait on a libuv
 * threadpool thread and leaves the event loop answering.
 *
 * On POSIX the execute bit is part of the answer: a readable-but-not-executable
 * file on the PATH is not a command, and calling it `found` would send the user
 * looking for a problem somewhere else. On Windows the extension carries that
 * (see `windowsCandidates`) — NTFS has no execute bit and `stat` reports `0o666`
 * for every file, so testing mode bits there would answer `missing` for
 * everything.
 */
async function executableFile(abs: string, win: boolean): Promise<string | null> {
    try {
        const st = await fsp.stat(abs)
        if (!st.isFile()) return null
        if (!win && (st.mode & 0o111) === 0) return null
        if (!win) return abs
        // On Windows the candidate we statted may differ in case from the file
        // on disk (`claude.CMD` from PATHEXT matching `claude.cmd` from npm),
        // and this path goes into a tooltip the user is meant to recognise.
        // `realpath.native` is the only thing that returns the real casing.
        // POSIX is excluded deliberately: there it would resolve symlinks, and a
        // shim's target is not the path the user's PATH entry names.
        try {
            return await realpathNative(abs)
        } catch {
            return abs
        }
    } catch {
        // ENOENT is the common case and the expected one. EACCES / ENOTDIR /
        // EPERM / a PATH entry on a disconnected network drive all mean the same
        // thing to a walk: not here, keep going. None of them is an error worth
        // surfacing, and none may abort the walk — one unreadable entry must not
        // turn a found command into a missing one.
        return null
    }
}

/** What a PATH split produced: the entries worth statting, and whether any were refused. */
interface PathScan {
    dirs: string[]
    /** True when at least one entry was dropped, which forbids answering `missing`. */
    skipped: boolean
}

/** Split a PATH string, dropping the empty and quoted noise real PATHs contain. */
function pathEntries(path: string, win: boolean, home: string): PathScan {
    const dirs: string[] = []
    let skipped = false
    for (const raw of path.split(win ? ";" : ":")) {
        // Windows PATH entries are sometimes quoted by installers, and a
        // trailing `;` leaves an empty entry that would resolve to the cwd.
        const dir = raw.trim().replace(/^"(.*)"$/, "$1").trim()
        if (!dir) continue
        const expanded = expandHome(dir, home)
        // A UNC entry in the user's own PATH is the no-attacker version of the
        // same freeze, and it is ordinary on a corporate machine that is off its
        // VPN. Skipping it means the walk did not look everywhere, so what comes
        // out the far end may be `found` but may never be `missing`.
        if (isUncOrDevicePath(expanded)) {
            skipped = true
            continue
        }
        dirs.push(expanded)
    }
    return { dirs, skipped }
}

/** The shared wall-clock ceiling for one batch of lookups. */
interface Deadline {
    at: number
    now: () => number
}

function makeDeadline(env: WhichEnv): Deadline {
    const now = env.now ?? Date.now
    return { at: now() + (env.budgetMs ?? DEFAULT_BUDGET_MS), now }
}

function expired(d: Deadline): boolean {
    return d.now() >= d.at
}

/**
 * Probe one command against a supplied PATH. Never spawns, never reads `process.env.PATH`.
 *
 * `env.platform` selects the *policy* — the PATH separator, `PATHEXT` expansion,
 * whether the execute bit means anything — and nothing else. Candidate paths are
 * always joined with the host's `path.join`, because the stat happens on the
 * host filesystem; that is what lets a Windows-policy test run on any machine.
 */
export async function probeCommand(command: string, env: WhichEnv): Promise<CommandProbe> {
    return probeWithDeadline(command, env, makeDeadline(env))
}

async function probeWithDeadline(
    command: string,
    env: WhichEnv,
    deadline: Deadline
): Promise<CommandProbe> {
    const platform = env.platform ?? process.platform
    const win = platform === "win32"
    const home = env.home ?? homedir()
    const token = firstToken(command)

    // Decided before the PATH is consulted, so it holds even when hydration
    // failed. A blank command is a config fault, not a fact about the machine.
    if (token === "") return { command, token: "", state: "blank" }

    const expanded = expandHome(token, home)

    // Before anything is statted, and ahead of `isAbsolute` getting a say: the
    // UNC and device namespaces are a network reach and an uncancellable block,
    // not a file lookup. See `isUncOrDevicePath`.
    if (isUncOrDevicePath(expanded)) return { command, token: expanded, state: "unknown" }

    const pm = win ? win32 : posix
    const exts = pathextList(win, env.pathext)

    if (pm.isAbsolute(expanded)) {
        // An absolute token needs no PATH at all: the stat is the whole answer,
        // and it is not derived from main's environment, so it is allowed to
        // produce found/missing even when hydration failed.
        if (expired(deadline)) return { command, token: expanded, state: "unknown" }
        for (const cand of win ? windowsCandidates(expanded, exts) : [expanded]) {
            const hit = await executableFile(cand, win)
            if (hit) return { command, token: expanded, state: "found", resolved: hit }
        }
        return { command, token: expanded, state: "missing" }
    }

    // A relative path is resolved against the shell's cwd, and a pane's cwd is
    // whichever project it was opened in. There is no single right answer, so
    // the probe declines instead of picking one and being wrong per project.
    // `C:foo` (drive-relative) lands here too, which is the same problem.
    if (/[\\/]/.test(expanded) || (win && /^[a-z]:/i.test(expanded))) {
        return { command, token: expanded, state: "unknown" }
    }

    // The only branch that can say `missing`, and only with a real PATH in hand.
    if (env.path === null) return { command, token: expanded, state: "unknown" }

    const scan = pathEntries(env.path, win, home)
    for (const dir of scan.dirs) {
        // Checked per directory rather than per candidate: a stat cannot be
        // interrupted, so the deadline's only job is to stop *starting* new ones.
        if (expired(deadline)) return { command, token: expanded, state: "unknown" }
        const base = join(dir, expanded)
        for (const cand of win ? windowsCandidates(base, exts) : [base]) {
            const hit = await executableFile(cand, win)
            if (hit) return { command, token: expanded, state: "found", resolved: hit }
        }
    }
    // `missing` is the claim that every place it could have been was looked at.
    // If an entry was refused or the clock ran out, that claim is not available
    // and the honest answer is that nothing conclusive was checked.
    if (scan.skipped || expired(deadline)) return { command, token: expanded, state: "unknown" }
    return { command, token: expanded, state: "missing" }
}

/**
 * Probe a preset list, keyed by preset id.
 *
 * **Non-agent presets are dropped, not answered.** A normal-mode preset is a
 * shell line — `npm run dev`, `cd api && go run .`, a pipe — and its first token
 * is `npm` or `cd`, which tells nobody anything and would mark a working `&&`
 * chain as absent. Returning `unknown` for them would still put a state on the
 * card; the absence of a key is what keeps those cards unmarked.
 *
 * Lookups are memoised **by first token**, not by command line: the stock preset
 * list resolves `claude` three times — Claude, Claude Opus, and Claude (no
 * permission prompts),
 * whose command line is `claude --dangerously-skip-permissions` and whose lookup
 * is therefore identical. `id` and `command` are re-attached per request so each
 * result still echoes exactly what was submitted.
 *
 * The deadline is made **once for the batch**, not per command: 64 requests each
 * granted their own budget is 64 budgets, which is not a bound.
 */
export async function probeRequests(
    requests: ProbeRequest[],
    env: WhichEnv
): Promise<Record<string, ProbeResult>> {
    const deadline = makeDeadline(env)
    const seen = new Map<string, CommandProbe>()
    const out: Record<string, ProbeResult> = {}
    for (const req of requests) {
        if (req.runMode !== "agent") continue
        const key = firstToken(req.command)
        const hit = seen.get(key)
        if (hit) {
            out[req.id] = { ...hit, id: req.id, command: req.command }
            continue
        }
        const res = { ...(await probeWithDeadline(req.command, env, deadline)), id: req.id }
        seen.set(key, res)
        out[req.id] = res
    }
    return out
}
