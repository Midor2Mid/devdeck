import { execFile } from "child_process"

export interface GitStatus {
    isRepo: boolean
    branch: string
    changes: number
}

const OPTS = { timeout: 4000, windowsHide: true } as const

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
