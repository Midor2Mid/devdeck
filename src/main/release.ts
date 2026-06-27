import { execFile } from "child_process"
import { readFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { atomicWrite } from "./atomic"

/**
 * Release / promotion board. Models a project's deploy stages (e.g. Dev → UAT →
 * PROD), each mapped to a git ref (branch or tag), and surfaces what's sitting
 * in each and what's waiting to be promoted to the next. Promotion itself is
 * left explicit (commands / tag), never an automatic push from the app.
 */

const OPTS = { timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 } as const
const SEP = "\x1f"

export interface Stage {
    id: string
    name: string
    /** Git ref tracked by this stage (branch or tag). */
    ref: string
}
export interface ReleaseConfig {
    stages: Stage[]
    checklist: string[]
}

export interface Commit {
    sha: string
    subject: string
    author: string
    when: string
}
export interface StageStatus {
    id: string
    name: string
    ref: string
    found: boolean
    commit: Commit | null
    /** Commits in this stage's ref not yet in the NEXT stage's ref. */
    aheadOfNext: number
}

function configPath(repo: string): string {
    return join(repo, ".devdeck", "release.json")
}

function defaults(): ReleaseConfig {
    return {
        stages: [
            { id: "dev", name: "Dev", ref: "develop" },
            { id: "uat", name: "UAT", ref: "release/uat" },
            { id: "prod", name: "PROD", ref: "main" }
        ],
        checklist: ["Tests green", "DB migrations reviewed", "Release notes ready", "Sign-off received"]
    }
}

export function loadConfig(repo: string): ReleaseConfig {
    try {
        if (existsSync(configPath(repo))) {
            const raw = JSON.parse(readFileSync(configPath(repo), "utf8")) as Partial<ReleaseConfig>
            const d = defaults()
            return { stages: raw.stages ?? d.stages, checklist: raw.checklist ?? d.checklist }
        }
    } catch (err) {
        console.error("[release] failed to load config:", err)
    }
    return defaults()
}

export function saveConfig(repo: string, cfg: ReleaseConfig): ReleaseConfig {
    mkdirSync(join(repo, ".devdeck"), { recursive: true })
    atomicWrite(configPath(repo), JSON.stringify(cfg, null, 2))
    return cfg
}

function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        execFile("git", args, { cwd, ...OPTS }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" })
        })
    })
}

/** Parse a `%h<SEP>%s<SEP>%an<SEP>%cr` commit line. Pure. */
export function parseCommit(line: string): Commit | null {
    const parts = line.split(SEP)
    if (parts.length < 4 || !parts[0]) return null
    return { sha: parts[0], subject: parts[1], author: parts[2], when: parts[3] }
}

async function commitInfo(repo: string, ref: string): Promise<Commit | null> {
    if (!ref) return null
    const r = await git(repo, ["log", "-1", `--format=%h${SEP}%s${SEP}%an${SEP}%cr`, ref, "--"])
    if (!r.ok) return null
    return parseCommit(r.stdout.trim())
}

/** Count commits reachable from `head` but not `base` (base..head). */
async function aheadCount(repo: string, base: string, head: string): Promise<number> {
    if (!base || !head) return 0
    const r = await git(repo, ["rev-list", "--count", `${base}..${head}`])
    if (!r.ok) return 0
    return parseInt(r.stdout.trim(), 10) || 0
}

export async function status(repo: string, stages: Stage[]): Promise<StageStatus[]> {
    const out: StageStatus[] = []
    for (let i = 0; i < stages.length; i++) {
        const s = stages[i]
        const commit = await commitInfo(repo, s.ref)
        const next = stages[i + 1]
        // How many commits this stage has that the NEXT stage doesn't (i.e. ready to promote).
        const aheadOfNext = next ? await aheadCount(repo, next.ref, s.ref) : 0
        out.push({ id: s.id, name: s.name, ref: s.ref, found: !!commit, commit, aheadOfNext })
    }
    return out
}

/** Commits in `source` ref not yet in `target` ref (what a promotion would move). */
export async function pending(repo: string, target: string, source: string): Promise<Commit[]> {
    if (!target || !source) return []
    const r = await git(repo, ["log", `${target}..${source}`, `--format=%h${SEP}%s${SEP}%an${SEP}%cr`])
    if (!r.ok) return []
    return r.stdout
        .split("\n")
        .map((l) => parseCommit(l.trim()))
        .filter((c): c is Commit => c !== null)
}

export async function createTag(
    repo: string,
    name: string,
    ref: string
): Promise<{ ok: boolean; error?: string }> {
    const clean = name.trim().replace(/[^\w.\-/]/g, "-")
    if (!clean) return { ok: false, error: "Empty tag name" }
    const r = await git(repo, ["tag", clean, ref || "HEAD"])
    return r.ok ? { ok: true } : { ok: false, error: r.stderr.trim() || "git tag failed" }
}
