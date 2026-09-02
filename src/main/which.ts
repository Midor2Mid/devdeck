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
 * A stat walk over ~40 PATH entries costs microseconds and needs no child.
 */

import { realpathSync, statSync } from "fs"
import { homedir } from "os"
import { join, extname, win32, posix } from "path"
import type { ProbeRequest, ProbeResult } from "../shared/probe"

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
 * On POSIX the execute bit is part of the answer: a readable-but-not-executable
 * file on the PATH is not a command, and calling it `found` would send the user
 * looking for a problem somewhere else. On Windows the extension carries that
 * (see `windowsCandidates`) — NTFS has no execute bit and `statSync` reports
 * `0o666` for every file, so testing mode bits there would answer `missing` for
 * everything.
 */
function executableFile(abs: string, win: boolean): string | null {
    try {
        const st = statSync(abs)
        if (!st.isFile()) return null
        if (!win && (st.mode & 0o111) === 0) return null
        if (!win) return abs
        // On Windows the candidate we statted may differ in case from the file
        // on disk (`claude.CMD` from PATHEXT matching `claude.cmd` from npm),
        // and this path goes into a tooltip the user is meant to recognise.
        // `realpathSync.native` is the only thing that returns the real casing.
        // POSIX is excluded deliberately: there it would resolve symlinks, and a
        // shim's target is not the path the user's PATH entry names.
        try {
            return realpathSync.native(abs)
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

/** Split a PATH string, dropping the empty and quoted noise real PATHs contain. */
function pathEntries(path: string, win: boolean, home: string): string[] {
    const out: string[] = []
    for (const raw of path.split(win ? ";" : ":")) {
        // Windows PATH entries are sometimes quoted by installers, and a
        // trailing `;` leaves an empty entry that would resolve to the cwd.
        const dir = raw.trim().replace(/^"(.*)"$/, "$1").trim()
        if (dir) out.push(expandHome(dir, home))
    }
    return out
}

/**
 * Probe one command against a supplied PATH. Never spawns, never reads `process.env.PATH`.
 *
 * `env.platform` selects the *policy* — the PATH separator, `PATHEXT` expansion,
 * whether the execute bit means anything — and nothing else. Candidate paths are
 * always joined with the host's `path.join`, because the stat happens on the
 * host filesystem; that is what lets a Windows-policy test run on any machine.
 */
export function probeCommand(command: string, env: WhichEnv): CommandProbe {
    const platform = env.platform ?? process.platform
    const win = platform === "win32"
    const home = env.home ?? homedir()
    const token = firstToken(command)

    // Decided before the PATH is consulted, so it holds even when hydration
    // failed. A blank command is a config fault, not a fact about the machine.
    if (token === "") return { command, token: "", state: "blank" }

    const expanded = expandHome(token, home)
    const pm = win ? win32 : posix
    const exts = pathextList(win, env.pathext)

    if (pm.isAbsolute(expanded)) {
        // An absolute token needs no PATH at all: the stat is the whole answer,
        // and it is not derived from main's environment, so it is allowed to
        // produce found/missing even when hydration failed.
        for (const cand of win ? windowsCandidates(expanded, exts) : [expanded]) {
            const hit = executableFile(cand, win)
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

    for (const dir of pathEntries(env.path, win, home)) {
        const base = join(dir, expanded)
        for (const cand of win ? windowsCandidates(base, exts) : [base]) {
            const hit = executableFile(cand, win)
            if (hit) return { command, token: expanded, state: "found", resolved: hit }
        }
    }
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
 * list resolves `claude` three times — Claude, Claude Opus, and Claude YOLO,
 * whose command line is `claude --dangerously-skip-permissions` and whose lookup
 * is therefore identical. `id` and `command` are re-attached per request so each
 * result still echoes exactly what was submitted.
 */
export function probeRequests(
    requests: ProbeRequest[],
    env: WhichEnv
): Record<string, ProbeResult> {
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
        const res = { ...probeCommand(req.command, env), id: req.id }
        seen.set(key, res)
        out[req.id] = res
    }
    return out
}
