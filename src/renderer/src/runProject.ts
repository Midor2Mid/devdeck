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

async function detectRun(path: string): Promise<RunConfig | null> {
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
    if (hasSln) return { command: "dotnet run", type: "dotnet" }

    // Node / JS — prefer a `dev` script (the usual watch/serve entry), else fall
    // back to `npm start` (npm's conventional run target).
    if (hasPkg) {
        try {
            const txt = await window.api.fs.read(path + "/package.json")
            const scripts = (JSON.parse(txt) as { scripts?: Record<string, string> }).scripts ?? {}
            return { command: scripts.dev ? "npm run dev" : "npm start", type: "node" }
        } catch {
            // unreadable / malformed package.json — fall through to the other types
        }
    }

    // .NET project file (no solution) — `dotnet run` resolves it.
    if (hasCsproj) return { command: "dotnet run", type: "dotnet" }
    // Go — a module at the root.
    if (names.includes("go.mod")) return { command: "go run .", type: "go" }
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
