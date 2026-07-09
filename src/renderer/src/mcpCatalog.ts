import type { McpServer } from "../../preload/index"

export interface McpCatalogEntry {
    id: string
    name: string
    description: string
    command: string
    args: string[]
    env?: Record<string, string>
}

// Curated common MCP servers as editable starting templates (npx-based). Paths and
// env tokens are placeholders the user edits after adding.
export const MCP_CATALOG: McpCatalogEntry[] = [
    {
        id: "filesystem",
        name: "filesystem",
        description: "Read/write files under a directory",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    {
        id: "github",
        name: "github",
        description: "GitHub repos, issues & pull requests",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" }
    },
    {
        id: "memory",
        name: "memory",
        description: "Persistent knowledge-graph memory",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-memory"]
    },
    {
        id: "sequential-thinking",
        name: "sequential-thinking",
        description: "Structured step-by-step reasoning",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    {
        id: "puppeteer",
        name: "puppeteer",
        description: "Headless browser automation",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-puppeteer"]
    },
    {
        id: "brave-search",
        name: "brave-search",
        description: "Web search via the Brave API",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-brave-search"],
        env: { BRAVE_API_KEY: "" }
    },
    {
        id: "postgres",
        name: "postgres",
        description: "Query a PostgreSQL database (read-only)",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    },
    {
        id: "sqlite",
        name: "sqlite",
        description: "Query a SQLite database file",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./data.db"]
    },
    {
        id: "fetch",
        name: "fetch",
        description: "Fetch a URL and convert it to markdown",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-fetch"]
    },
    {
        id: "slack",
        name: "slack",
        description: "Slack channels & messages",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        env: { SLACK_BOT_TOKEN: "" }
    }
]

/** Convert a catalog entry to a project MCP server (fresh copies of args/env). */
export function toServer(entry: McpCatalogEntry): McpServer {
    return {
        name: entry.name,
        command: entry.command,
        args: [...entry.args],
        env: { ...(entry.env ?? {}) }
    }
}

/** Append the catalog entry as a server unless one with that name already exists. */
export function addServer(servers: McpServer[], entry: McpCatalogEntry): McpServer[] {
    if (servers.some((s) => s.name === entry.name)) return servers
    return [...servers, toServer(entry)]
}
