import { readFileSync } from "fs"
import { join } from "path"
import { atomicWrite } from "./atomic"
import { DEVDECK_AUTH_HEADER } from "../shared/mcpEnv"

// Reads/writes a project's .mcp.json (the standard Claude Code project MCP config).
// Two entry shapes are supported, matching what Claude Code accepts:
//   stdio: { "<name>": { "command": "...", "args": [...], "env": {...} } }
//   http:  { "<name>": { "type": "http", "url": "...", "headers": {...} } }
// A blank `url` means stdio, which keeps every existing catalog entry unchanged.
export interface McpServer {
    name: string
    command: string
    args: string[]
    env: Record<string, string>
    /** Set for HTTP servers (e.g. DevDeck's own); empty for stdio. */
    url?: string
    headers?: Record<string, string>
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
    const servers = (raw.mcpServers ?? {}) as Record<string, Partial<McpServer> & { type?: string }>
    return Object.entries(servers).map(([name, v]) => ({
        name,
        command: v.command ?? "",
        args: Array.isArray(v.args) ? v.args : [],
        env: v.env ?? {},
        url: v.url ?? "",
        headers: v.headers ?? {}
    }))
}

export function writeMcp(projectPath: string, servers: McpServer[]): void {
    const raw = loadRaw(projectPath) // preserve any other top-level keys
    const mcpServers: Record<string, unknown> = {}
    for (const s of servers) {
        const name = s.name.trim()
        if (!name) continue
        if (s.url) {
            // HTTP transport. `type` is required — without it Claude Code reads the
            // entry as stdio and fails on the missing command.
            const entry: Record<string, unknown> = { type: "http", url: s.url }
            if (s.headers && Object.keys(s.headers).length) entry.headers = s.headers
            mcpServers[name] = entry
            continue
        }
        const entry: Record<string, unknown> = { command: s.command, args: s.args }
        if (s.env && Object.keys(s.env).length) entry.env = s.env
        mcpServers[name] = entry
    }
    raw.mcpServers = mcpServers
    atomicWrite(file(projectPath), JSON.stringify(raw, null, 2))
}

/** The `.mcp.json` entry name DevDeck registers itself under. */
export const DEVDECK_SERVER_NAME = "devdeck"

/**
 * Register (or refresh) DevDeck's own MCP server in a project's `.mcp.json`,
 * leaving every other server entry untouched. Claude Code prompts for approval
 * the first time it sees a project-scoped server, so this does not silently grant
 * the agent access — the user still confirms on the CLI side.
 *
 * The token is written as `${DEVDECK_MCP_TOKEN}`, never inlined. `.mcp.json` is
 * the file Claude Code expects you to commit ("designed to be checked into
 * version control"), so a literal token here would land in git history on the
 * first commit. The placeholder is expanded from the environment at load time,
 * and DevDeck injects that var into the agent sessions it starts — so the file
 * stays safe to commit and share with a teammate, who supplies their own token.
 */
export function registerDevdeck(projectPath: string, port: number): void {
    const others = readMcp(projectPath).filter((s) => s.name !== DEVDECK_SERVER_NAME)
    writeMcp(projectPath, [
        ...others,
        {
            name: DEVDECK_SERVER_NAME,
            command: "",
            args: [],
            env: {},
            url: `http://127.0.0.1:${port}/mcp`,
            headers: { Authorization: DEVDECK_AUTH_HEADER }
        }
    ])
}

/** Remove DevDeck's entry, leaving other servers in place. */
export function unregisterDevdeck(projectPath: string): void {
    writeMcp(
        projectPath,
        readMcp(projectPath).filter((s) => s.name !== DEVDECK_SERVER_NAME)
    )
}
