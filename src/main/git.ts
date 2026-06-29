import { execFile, spawn } from "child_process"
import { request as httpsRequest } from "https"

export interface GitStatus {
    isRepo: boolean
    branch: string
    changes: number
}

const OPTS = { timeout: 4000, windowsHide: true } as const

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

/** Branch + uncommitted-change count for a directory (empty if not a git repo). */
export function gitStatus(cwd: string): Promise<GitStatus> {
    return new Promise((resolve) => {
        execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, ...OPTS }, (err, stdout) => {
            if (err) {
                resolve({ isRepo: false, branch: "", changes: 0 })
                return
            }
            const branch = stdout.trim()
            execFile("git", ["status", "--porcelain"], { cwd, ...OPTS }, (e2, out2) => {
                const changes = e2 ? 0 : out2.split("\n").filter((l) => l.trim()).length
                resolve({ isRepo: true, branch, changes })
            })
        })
    })
}
