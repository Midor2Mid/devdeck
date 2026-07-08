import { execFile } from "child_process"
import { join } from "path"
import { listProjects } from "./projects"
import type { SearchHit } from "../preload/index"

export interface RawHit {
    file: string
    line: number
    text: string
}

const LINE = /^(.+?):(\d+):(.*)$/

/**
 * Parse `git grep -n` output (`path:line:text` per line) into raw hits. The path
 * pattern is non-greedy so a colon inside the matched text is preserved. Skips
 * blank/malformed lines, normalizes `\`→`/`, clamps text, and stops at the cap.
 */
export function parseGitGrep(stdout: string, maxPerProject: number): RawHit[] {
    const out: RawHit[] = []
    for (const raw of stdout.split("\n")) {
        if (out.length >= maxPerProject) break
        const m = LINE.exec(raw)
        if (!m) continue
        out.push({
            file: m[1].replace(/\\/g, "/"),
            line: Number(m[2]),
            text: m[3].slice(0, 300)
        })
    }
    return out
}

const PER_PROJECT = 50
const TOTAL = 300

function grepProject(
    project: { id: string; name: string; path: string },
    query: string
): Promise<SearchHit[]> {
    return new Promise((resolve) => {
        // Arg array → the query is never shell-interpreted (injection-safe).
        // -F fixed string, -i ignore case, -n line numbers, -I skip binary.
        execFile(
            "git",
            ["grep", "-n", "-I", "-F", "-i", "--no-color", "-e", query],
            { cwd: project.path, timeout: 5000, windowsHide: true, maxBuffer: 4_000_000 },
            (_err, stdout) => {
                // git grep exits 1 with no matches, and errors in a non-git dir;
                // in both cases stdout is empty and we return nothing.
                if (!stdout) return resolve([])
                const raws = parseGitGrep(stdout, PER_PROJECT)
                resolve(
                    raws.map((r) => ({
                        projectId: project.id,
                        projectName: project.name,
                        file: r.file,
                        absPath: join(project.path, r.file),
                        line: r.line,
                        text: r.text
                    }))
                )
            }
        )
    })
}

/** Search file contents across every registered project (fixed-string, case-insensitive). */
export async function code(query: string): Promise<SearchHit[]> {
    const q = query.trim()
    if (q.length < 2) return []
    const projects = listProjects().projects
    const results = await Promise.all(projects.map((p) => grepProject(p, q)))
    return results.flat().slice(0, TOTAL)
}
