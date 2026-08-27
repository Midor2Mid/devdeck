import { useEffect, useState } from "react"

// Detects a project's canonical "start" command by sniffing files in its root,
// so the topbar can offer a one-click Run. Deliberately minimal — the three
// project shapes DevDeck's owner works in — and every command is a fixed literal
// (never interpolated from repo contents), so there's no injection surface the
// way TaskRunner's `npm run <script>` has.
export interface RunConfig {
    /** Shell command to run in a fresh terminal. */
    command: string
    /** Project type, for the tooltip / future per-type behaviour. */
    type: "node" | "dotnet" | "go"
}

// From all the .csproj files in a repo, guess the startup project to run.
// `dotnet run` at the root fails when the runnable project lives in a subfolder
// (the common src/*/Foo.Api.csproj layout) or when the root only has a .sln, so
// we resolve a specific --project. Skips test/library projects and prefers a
// web/api-looking one; ties break toward shallower, shorter paths.
export function pickStartupProject(csprojs: string[]): string | undefined {
    if (csprojs.length === 0) return undefined
    const nonTest = csprojs.filter((f) => !/test|spec/i.test(f))
    const pool = nonTest.length ? nonTest : csprojs
    const isLib = /\.(core|infra|infrastructure|common|shared|domain|data|abstractions|contracts|models?|entities|dto)\.csproj$/i
    const score = (f: string): number => {
        const n = f.toLowerCase()
        let s = 0
        if (n.includes("webapi")) s += 40
        else if (/(^|[./\\])api[./\\]/.test(n) || n.includes(".api.")) s += 30
        else if (/web|server|host|\bapp\b/.test(n)) s += 20
        if (isLib.test(f)) s -= 25
        s -= f.split(/[/\\]/).length // shallower wins
        s -= f.length / 200 // shorter breaks ties
        return s
    }
    return [...pool].sort((a, b) => score(b) - score(a))[0]
}

async function dotnetCommand(path: string): Promise<string> {
    try {
        const csprojs = (await window.api.fs.allFiles(path)).filter((f) =>
            f.toLowerCase().endsWith(".csproj")
        )
        const pick = pickStartupProject(csprojs)
        if (pick) return `dotnet run --project "${pick}"`
    } catch {
        /* couldn't scan — fall back to plain dotnet run */
    }
    return "dotnet run"
}

/** Exported for unit tests; UI consumers should use `useRunConfig`. */
export async function detectRun(path: string): Promise<RunConfig | null> {
    let names: string[] = []
    try {
        names = (await window.api.fs.readDir(path)).map((e) => e.name.toLowerCase())
    } catch {
        return null
    }
    const hasSln = names.some((n) => n.endsWith(".sln"))
    const hasCsproj = names.some((n) => n.endsWith(".csproj"))
    const hasPkg = names.includes("package.json")

    // A solution file is the strongest signal of a .NET-primary repo — prefer it
    // even when a package.json is also present (common: a C# backend with a small
    // front-end / JS tooling), so we don't offer `npm run dev` for a .NET project.
    if (hasSln) return { command: await dotnetCommand(path), type: "dotnet" }

    // Node / JS — prefer a `dev` script (the usual watch/serve entry), else fall
    // back to `npm start` (npm's conventional run target).
    let pkgUnparsed = false
    if (hasPkg) {
        try {
            const { content: txt } = await window.api.fs.read(path + "/package.json")
            const scripts = (JSON.parse(txt) as { scripts?: Record<string, string> }).scripts ?? {}
            return { command: scripts.dev ? "npm run dev" : "npm start", type: "node" }
        } catch {
            // Unreadable / malformed package.json (a trailing comma mid-edit is
            // enough). Try the other project types first, but remember it — a
            // package.json we can't parse is still a Node repo.
            pkgUnparsed = true
        }
    }

    // .NET project file(s) but no solution — resolve the startup --project too.
    if (hasCsproj) return { command: await dotnetCommand(path), type: "dotnet" }
    // Go — a module at the root.
    if (names.includes("go.mod")) return { command: "go run .", type: "go" }
    // No other signal, but there *is* a package.json we couldn't parse: offer the
    // conventional target rather than disabling Run and reporting "no runnable
    // project type" — npm will then name the manifest error in the terminal,
    // which points at the real problem instead of hiding it.
    if (pkgUnparsed) return { command: "npm start", type: "node" }
    return null
}

// Re-detects whenever the active project's path changes. Returns null until a
// runnable type is found (the topbar hides the button in that case).
export function useRunConfig(path: string | undefined): RunConfig | null {
    const [cfg, setCfg] = useState<RunConfig | null>(null)
    useEffect(() => {
        let alive = true
        if (!path) {
            setCfg(null)
            return
        }
        detectRun(path).then((r) => {
            if (alive) setCfg(r)
        })
        return () => {
            alive = false
        }
    }, [path])
    return cfg
}
