import { readFileSync } from "fs"
import { join } from "path"
import { atomicWrite } from "./atomic"

// Reads/writes a project's .mcp.json (the standard Claude Code project MCP config):
//   { "mcpServers": { "<name>": { "command": "...", "args": [...], "env": {...} } } }
export interface McpServer {
    name: string
    command: string
    args: string[]
    env: Record<string, string>
}

function file(projectPath: string): string {
    return join(projectPath, ".mcp.json")
}

function loadRaw(projectPath: string): Record<string, unknown> {
    try {
        return JSON.parse(readFileSync(file(projectPath), "utf8")) as Record<string, unknown>
    } catch {
        return {}
    }
}

export function readMcp(projectPath: string): McpServer[] {
    const raw = loadRaw(projectPath)
    const servers = (raw.mcpServers ?? {}) as Record<string, Partial<McpServer>>
    return Object.entries(servers).map(([name, v]) => ({
        name,
        command: v.command ?? "",
        args: Array.isArray(v.args) ? v.args : [],
        env: v.env ?? {}
    }))
}

export function writeMcp(projectPath: string, servers: McpServer[]): void {
    const raw = loadRaw(projectPath) // preserve any other top-level keys
    const mcpServers: Record<string, unknown> = {}
    for (const s of servers) {
        const name = s.name.trim()
        if (!name) continue
        const entry: Record<string, unknown> = { command: s.command, args: s.args }
        if (s.env && Object.keys(s.env).length) entry.env = s.env
        mcpServers[name] = entry
    }
    raw.mcpServers = mcpServers
    atomicWrite(file(projectPath), JSON.stringify(raw, null, 2))
}
