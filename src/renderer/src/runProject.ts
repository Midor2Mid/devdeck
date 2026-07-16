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
    // Node / JS — prefer a `dev` script (the usual watch/serve entry), else fall
    // back to `npm start` (npm's conventional run target).
    try {
        const txt = await window.api.fs.read(path + "/package.json")
        const scripts = (JSON.parse(txt) as { scripts?: Record<string, string> }).scripts ?? {}
        return { command: scripts.dev ? "npm run dev" : "npm start", type: "node" }
    } catch {
        // no package.json / unreadable — fall through to the other types
    }

    let names: string[] = []
    try {
        names = (await window.api.fs.readDir(path)).map((e) => e.name.toLowerCase())
    } catch {
        return null
    }

    // .NET — a solution or project file in the root; `dotnet run` resolves it.
    if (names.some((n) => n.endsWith(".sln") || n.endsWith(".csproj"))) {
        return { command: "dotnet run", type: "dotnet" }
    }
    // Go — a module at the root.
    if (names.includes("go.mod")) {
        return { command: "go run .", type: "go" }
    }
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
