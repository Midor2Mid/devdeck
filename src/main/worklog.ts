import { execFile } from "child_process"

/**
 * Worklog collector — gathers what you did across your projects (commits you
 * authored in a time window, current branch, uncommitted change count) so the
 * renderer can turn it into a standup summary. Read-only; no mutation.
 */

const OPTS = { timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 } as const
const SEP = "\x1f"

export interface WCommit {
    sha: string
    subject: string
    when: string
}
export interface RepoLog {
    name: string
    path: string
    branch: string
    changes: number
    commits: WCommit[]
}

function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
    return new Promise((resolve) => {
        execFile("git", args, { cwd, ...OPTS }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? "" }))
    })
}

/** Parse `%h<SEP>%s<SEP>%cr` log lines. Pure. */
export function parseLog(stdout: string): WCommit[] {
    return stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
            const p = l.split(SEP)
            return { sha: p[0], subject: p[1] ?? "", when: p[2] ?? "" }
        })
        .filter((c) => c.sha)
}

async function oneRepo(name: string, path: string, sinceISO: string): Promise<RepoLog> {
    const branchR = await git(path, ["rev-parse", "--abbrev-ref", "HEAD"])
    if (!branchR.ok) return { name, path, branch: "", changes: 0, commits: [] }
    const email = (await git(path, ["config", "user.email"])).stdout.trim()
    const logArgs = ["log", `--since=${sinceISO}`, `--format=%h${SEP}%s${SEP}%cr`]
    if (email) logArgs.push(`--author=${email}`)
    const [log, status] = await Promise.all([git(path, logArgs), git(path, ["status", "--porcelain"])])
    return {
        name,
        path,
        branch: branchR.stdout.trim(),
        changes: status.stdout.split("\n").filter((l) => l.trim()).length,
        commits: parseLog(log.stdout)
    }
}

export async function collect(repos: { name: string; path: string }[], sinceISO: string): Promise<RepoLog[]> {
    return Promise.all(repos.map((r) => oneRepo(r.name, r.path, sinceISO)))
}
