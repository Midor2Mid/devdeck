import { execFile } from "child_process"

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
