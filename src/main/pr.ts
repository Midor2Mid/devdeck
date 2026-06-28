import { execFile } from "child_process"

/**
 * Pull-request helpers — push the current branch and either create the PR via
 * the Azure DevOps API (using the stored Work PAT) or hand back a web "create
 * PR" URL for GitHub/other hosts. Completes the ticket → branch → review → PR
 * loop without leaving DevDeck.
 */

const OPTS = { timeout: 20000, windowsHide: true } as const

export type RemoteHost = "azure" | "github" | "other"
export interface RemoteInfo {
    host: RemoteHost
    /** e.g. https://dev.azure.com/org  (azure) */
    orgUrl?: string
    org?: string
    project?: string
    repo?: string
    /** GitHub owner/repo */
    owner?: string
    /** Branch → web "create PR" URL (for the browser fallback). */
    webCreateUrl?: string
}

/** Parse an `origin` remote URL into a structured target. Pure. */
export function parseRemote(remoteUrl: string, branch: string, target: string): RemoteInfo {
    const url = remoteUrl.trim()

    // Azure DevOps: https://dev.azure.com/{org}/{project}/_git/{repo}
    //           or  https://{org}@dev.azure.com/{org}/{project}/_git/{repo}
    //           or  https://{org}.visualstudio.com/{project}/_git/{repo}
    let m = url.match(/dev\.azure\.com\/(?:[^/@]+@)?([^/]+)\/([^/]+)\/_git\/([^/?#]+)/i)
    if (m) {
        const [, org, project, repo] = m
        const orgUrl = `https://dev.azure.com/${org}`
        return {
            host: "azure",
            orgUrl,
            org,
            project: decodeURIComponent(project),
            repo: decodeURIComponent(repo.replace(/\.git$/, "")),
            webCreateUrl: `${orgUrl}/${project}/_git/${repo}/pullrequestcreate?sourceRef=${encodeURIComponent(branch)}&targetRef=${encodeURIComponent(target)}`
        }
    }
    m = url.match(/([^/.@]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/?#]+)/i)
    if (m) {
        const [, org, project, repo] = m
        const orgUrl = `https://dev.azure.com/${org}`
        return {
            host: "azure",
            orgUrl,
            org,
            project: decodeURIComponent(project),
            repo: decodeURIComponent(repo.replace(/\.git$/, "")),
            webCreateUrl: `https://${org}.visualstudio.com/${project}/_git/${repo}/pullrequestcreate?sourceRef=${encodeURIComponent(branch)}&targetRef=${encodeURIComponent(target)}`
        }
    }

    // GitHub: https://github.com/{owner}/{repo}(.git)  or  git@github.com:{owner}/{repo}.git
    m = url.match(/github\.com[:/]([^/]+)\/([^/?#]+)/i)
    if (m) {
        const owner = m[1]
        const repo = m[2].replace(/\.git$/, "")
        return {
            host: "github",
            owner,
            repo,
            webCreateUrl: `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(target)}...${encodeURIComponent(branch)}?expand=1`
        }
    }

    return { host: "other" }
}

function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        execFile("git", args, { cwd, ...OPTS }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" })
        })
    })
}

export async function currentBranch(cwd: string): Promise<string> {
    const r = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
    return r.ok ? r.stdout.trim() : ""
}

export async function remoteInfo(cwd: string, target: string): Promise<RemoteInfo & { branch: string }> {
    const branch = await currentBranch(cwd)
    const r = await git(cwd, ["remote", "get-url", "origin"])
    if (!r.ok) return { host: "other", branch }
    return { ...parseRemote(r.stdout, branch, target), branch }
}

export async function pushBranch(cwd: string, branch: string): Promise<{ ok: boolean; error?: string }> {
    const r = await git(cwd, ["push", "-u", "origin", branch])
    return r.ok ? { ok: true } : { ok: false, error: (r.stderr || r.stdout).trim() || "git push failed" }
}
