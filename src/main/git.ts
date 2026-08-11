import { execFile, spawn } from "child_process"
import { request as httpsRequest } from "https"

export interface GitStatus {
    isRepo: boolean
    branch: string
    changes: number
    /** Tracking branch (e.g. "origin/main"), empty when the branch has no upstream. */
    upstream: string
    /** Commits the local branch is ahead / behind its upstream (0 when unknown). */
    ahead: number
    behind: number
}

export interface PullResult {
    ok: boolean
    /** Git's own summary line on success (e.g. "Already up to date."). */
    summary?: string
    error?: string
}

const OPTS = { timeout: 4000, windowsHide: true } as const
/** Pull talks to the network, so it gets a far longer leash than the status polls. */
const NET_OPTS = { timeout: 120000, windowsHide: true } as const

export interface GitIdentity {
    name: string
    email: string
    sshCommand: string
}

function getConfig(cwd: string, key: string): Promise<string> {
    return new Promise((resolve) => {
        execFile("git", ["config", "--local", "--get", key], { cwd, ...OPTS }, (err, out) => {
            resolve(err ? "" : out.trim())
        })
    })
}

function setConfig(cwd: string, key: string, value: string): Promise<void> {
    return new Promise((resolve) => {
        const args = value
            ? ["config", "--local", key, value]
            : ["config", "--local", "--unset", key]
        execFile("git", args, { cwd, ...OPTS }, () => resolve())
    })
}

export async function getIdentity(cwd: string): Promise<GitIdentity> {
    const [name, email, sshCommand] = await Promise.all([
        getConfig(cwd, "user.name"),
        getConfig(cwd, "user.email"),
        getConfig(cwd, "core.sshCommand")
    ])
    return { name, email, sshCommand }
}

export async function setIdentity(cwd: string, id: GitIdentity): Promise<GitIdentity> {
    await setConfig(cwd, "user.name", id.name)
    await setConfig(cwd, "user.email", id.email)
    await setConfig(cwd, "core.sshCommand", id.sshCommand)
    return getIdentity(cwd)
}

/**
 * Hand a username/PAT to Git's credential store for a host, so all HTTPS git
 * operations (terminal pushes, the in-app PR push) authenticate without the
 * token ever touching git config or a remote URL. The password is fed on stdin
 * (never argv, so it can't leak via a process listing). Relies on a configured
 * credential.helper (Git Credential Manager is the default on Git for Windows);
 * with no helper this is a harmless no-op.
 */
export function cacheCredential(
    host: string,
    username: string,
    password: string
): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
        if (!password) {
            resolve({ ok: false, error: "No token stored for this account." })
            return
        }
        const h = (host || "github.com").trim()
        const user = (username || "x-access-token").trim()
        const child = spawn("git", ["credential", "approve"], { windowsHide: true })
        let err = ""
        child.stderr.on("data", (d) => (err += d))
        child.on("error", (e) => resolve({ ok: false, error: e.message }))
        child.on("close", (code) =>
            resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `git exited ${code}` })
        )
        child.stdin.write(`protocol=https\nhost=${h}\nusername=${user}\npassword=${password}\n\n`)
        child.stdin.end()
    })
}

/** Check a GitHub PAT by calling /user; returns the login on success. */
export function verifyGitHubToken(
    pat: string
): Promise<{ ok: boolean; login?: string; error?: string }> {
    return new Promise((resolve) => {
        if (!pat) {
            resolve({ ok: false, error: "No token stored." })
            return
        }
        const req = httpsRequest(
            {
                hostname: "api.github.com",
                path: "/user",
                method: "GET",
                timeout: 8000,
                headers: {
                    "User-Agent": "DevDeck",
                    Authorization: `Bearer ${pat}`,
                    Accept: "application/vnd.github+json"
                }
            },
            (res) => {
                let body = ""
                res.on("data", (d) => (body += d))
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        try {
                            resolve({ ok: true, login: (JSON.parse(body) as { login?: string }).login })
                        } catch {
                            resolve({ ok: true })
                        }
                    } else {
                        resolve({ ok: false, error: `HTTP ${res.statusCode}` })
                    }
                })
            }
        )
        req.on("error", (e) => resolve({ ok: false, error: e.message }))
        req.on("timeout", () => {
            req.destroy()
            resolve({ ok: false, error: "timeout" })
        })
        req.end()
    })
}

/**
 * Parse the `## ` header line of `git status --porcelain -b`, which carries the
 * tracking branch and divergence:
 *   `## main...origin/main [ahead 1, behind 2]`
 * A branch with no upstream has no `...` part, and a detached HEAD reads
 * `## HEAD (no branch)` - both yield an empty upstream and zero counts. Pure.
 */
export function parseBranchLine(line: string): { upstream: string; ahead: number; behind: number } {
    const none = { upstream: "", ahead: 0, behind: 0 }
    if (!line.startsWith("## ")) return none
    const head = line.slice(3)
    const sep = head.indexOf("...")
    if (sep < 0) return none
    const rest = head.slice(sep + 3)
    // Upstream name runs to the divergence bracket (or end of line).
    const upstream = (rest.split(" [")[0] ?? "").trim()
    if (!upstream) return none
    const ahead = Number(rest.match(/ahead (\d+)/)?.[1] ?? 0)
    const behind = Number(rest.match(/behind (\d+)/)?.[1] ?? 0)
    return { upstream, ahead, behind }
}

/** Branch + uncommitted-change count for a directory (empty if not a git repo). */
export function gitStatus(cwd: string): Promise<GitStatus> {
    return new Promise((resolve) => {
        execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, ...OPTS }, (err, stdout) => {
            if (err) {
                resolve({ isRepo: false, branch: "", changes: 0, upstream: "", ahead: 0, behind: 0 })
                return
            }
            const branch = stdout.trim()
            // `-b` adds the tracking header for free - same process, no extra poll
            // cost, and it's what tells the deck whether a pull has anything to do.
            execFile("git", ["status", "--porcelain", "-b"], { cwd, ...OPTS }, (e2, out2) => {
                const lines = e2 ? [] : out2.split("\n")
                const changes = lines.filter((l) => l.trim() && !l.startsWith("## ")).length
                const track = parseBranchLine(lines.find((l) => l.startsWith("## ")) ?? "")
                resolve({ isRepo: true, branch, changes, ...track })
            })
        })
    })
}

/**
 * Fast-forward the current branch from its upstream. `--ff-only` is deliberate:
 * a one-click button must never invent a merge commit or drop the working tree
 * into a conflicted state - if the branch has diverged, it fails and says so,
 * and the resolution stays a conscious decision in the terminal.
 */
export function pullLatest(cwd: string): Promise<PullResult> {
    return new Promise((resolve) => {
        execFile("git", ["pull", "--ff-only"], { cwd, ...NET_OPTS }, (err, stdout, stderr) => {
            const out = (stdout ?? "").trim()
            const errOut = (stderr ?? "").trim()
            if (!err) {
                resolve({ ok: true, summary: out.split("\n")[0] || "Pulled." })
                return
            }
            resolve({ ok: false, error: errOut.split("\n")[0] || out.split("\n")[0] || "git pull failed" })
        })
    })
}

/**
 * A ref we are willing to interpolate into an argv slot git may read as an option.
 *
 * Both functions below build `<ref>..HEAD` as a single argument. execFile does not
 * involve a shell, so there is no command injection - but a ref beginning with `-`
 * is still parsed by git as a FLAG, not a revision: `--output=/tmp/x` becomes
 * `--output=/tmp/x..HEAD`, a real `git diff` option that writes an attacker-chosen
 * file. guardRepo constrains the directory arguments and does nothing for this one.
 *
 * Every ref reaching these functions is a commit sha read out of `git worktree
 * list` (see parseWorktreeList), so requiring hex is exact rather than restrictive.
 */
export function isCommitSha(ref: string): boolean {
    return /^[0-9a-fA-F]{7,40}$/.test(ref)
}

/** Raw `git diff --shortstat <fromRef>..HEAD` for a worktree; "" on any failure. */
export function shortstat(cwd: string, fromRef: string): Promise<string> {
    return new Promise((resolve) => {
        if (!isCommitSha(fromRef)) {
            resolve("")
            return
        }
        execFile("git", ["diff", "--shortstat", `${fromRef}..HEAD`], { cwd, ...OPTS }, (err, out) => {
            resolve(err ? "" : out.trim())
        })
    })
}

/**
 * Land a race entrant's work: take everything it committed in its worktree and
 * apply it to the target tree as unstaged changes.
 *
 * Both halves run here rather than in the renderer so a large patch never crosses
 * IPC. `--binary` so image and asset changes survive; `--3way` so a patch that
 * does not apply cleanly can still be reconciled against blobs both sides share.
 *
 * The caller is responsible for refusing to land onto a dirty tree - see the
 * store. `git apply` leaves the target untouched when it fails, so a rejected
 * patch is not a half-applied mess.
 *
 * `--3way` stages what it applies, so a bare `git reset` follows to put the work
 * back in the working tree unstaged. That is the whole point of landing rather
 * than merging: you stage and describe the change instead of inheriting an
 * agent's commit. The reset cannot touch anything of yours, because landing
 * already requires a clean tree.
 */
export function landFrom(
    worktree: string,
    baseHead: string,
    target: string
): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
        // See isCommitSha: a ref starting with "-" would be read by git as a flag.
        if (!isCommitSha(baseHead)) {
            resolve({ ok: false, error: "refusing to land from an unrecognised revision" })
            return
        }
        execFile(
            "git",
            ["diff", "--binary", `${baseHead}..HEAD`],
            { cwd: worktree, maxBuffer: 64 * 1024 * 1024, ...OPTS },
            (err, patch) => {
                if (err) {
                    resolve({ ok: false, error: "could not read the winner's diff" })
                    return
                }
                if (!patch.trim()) {
                    resolve({ ok: false, error: "the winner committed nothing to land" })
                    return
                }
                const child = execFile(
                    "git",
                    ["apply", "--3way", "--whitespace=nowarn"],
                    { cwd: target, ...OPTS },
                    (e2, _o, stderr) => {
                        if (e2) {
                            resolve({
                                ok: false,
                                error: (stderr || "").trim().split("\n")[0] || "git apply failed"
                            })
                            return
                        }
                        // --3way stages what it applies. The design is that the
                        // winner's work arrives UNSTAGED, so you stage and describe
                        // it yourself rather than inheriting an agent's framing. A
                        // bare reset is safe here precisely because landing already
                        // requires a clean tree - there is nothing of yours to lose.
                        execFile("git", ["reset"], { cwd: target, ...OPTS }, () => resolve({ ok: true }))
                    }
                )
                child.stdin?.end(patch)
            }
        )
    })
}
