import { execFile } from "child_process"
import { readdirSync } from "fs"
import { isAbsolute, join } from "path"
import type { Diag, DotnetResult } from "../preload/index"

// MSBuild diagnostic: `path(line[,col]): error|warning CODE: message [proj]`.
const DIAG = /^(.+?)\((\d+)(?:,(\d+))?\):\s+(error|warning)\s+(\S+):\s+(.*)$/
// Build/test outcome lines.
const SUMMARY = /^(Build succeeded\.?|Build FAILED\.?|Passed!.*|Failed!.*)$/

/**
 * Parse `dotnet build`/`test` stdout into diagnostics + an outcome summary.
 * Dedupes the copies MSBuild prints per target and strips the trailing
 * ` [..project..]` from each message.
 */
export function parseDotnet(stdout: string): { diagnostics: Diag[]; summary: string } {
    const seen = new Set<string>()
    const diagnostics: Diag[] = []
    let summary = ""
    for (const raw of stdout.split("\n")) {
        const line = raw.trim()
        const s = SUMMARY.exec(line)
        if (s) {
            summary = s[1]
            continue
        }
        const m = DIAG.exec(line)
        if (!m) continue
        const file = m[1]
        const lineNum = Number(m[2])
        const col = m[3] ? Number(m[3]) : 0
        const code = m[5]
        const key = `${file}:${lineNum}:${col}:${code}`
        if (seen.has(key)) continue
        seen.add(key)
        diagnostics.push({
            file,
            line: lineNum,
            col,
            severity: m[4] as "error" | "warning",
            code,
            message: m[6].replace(/\s+\[[^\]]*\]\s*$/, "")
        })
    }
    return { diagnostics, summary }
}

function hasDotnetProject(root: string): boolean {
    try {
        return readdirSync(root).some((f) => f.endsWith(".sln") || f.endsWith(".csproj"))
    } catch {
        return false
    }
}

/** Run `dotnet build`/`test` in a project root and return parsed diagnostics. */
export function run(root: string, mode: "build" | "test"): Promise<DotnetResult> {
    return new Promise((resolve) => {
        if (!hasDotnetProject(root)) {
            resolve({
                ok: false,
                ran: false,
                summary: "No .sln or .csproj found in this project.",
                diagnostics: []
            })
            return
        }
        execFile(
            "dotnet",
            [mode, "--nologo"],
            { cwd: root, timeout: 180000, maxBuffer: 10_000_000, windowsHide: true },
            (err, stdout) => {
                if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
                    resolve({
                        ok: false,
                        ran: false,
                        summary: ".NET SDK (dotnet) not found on PATH.",
                        diagnostics: []
                    })
                    return
                }
                const { diagnostics, summary } = parseDotnet(stdout || "")
                const ok = !err && !diagnostics.some((d) => d.severity === "error")
                resolve({
                    ok,
                    ran: true,
                    summary: summary || (ok ? "Done." : "Finished with problems."),
                    diagnostics: diagnostics.map((d) => ({
                        ...d,
                        absPath: isAbsolute(d.file) ? d.file : join(root, d.file)
                    }))
                })
            }
        )
    })
}
