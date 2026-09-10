/**
 * The tool surface DevDeck exposes to agent CLIs over MCP.
 *
 * Why this exists: DevDeck holds live state an agent keeps asking about, and the
 * only way to get it there used to be to *push* it (copy the pane, paste the
 * error). This lets the agent *pull* instead, mid-task, when it needs to.
 *
 * What is left, and why the list is short. The five tools that made this
 * module worth writing - three database tools and two HTTP-replay tools - are
 * gone with the panels and drivers they read from (see `RETIRED_TOOLS`).
 * They were dispatch over `db.ts` and over the API panel's saved `collections`,
 * neither of which exists any more, and their precondition (a saved connection,
 * a saved request) had never been met on any machine that ran DevDeck.
 *
 * Safety posture, deliberately narrow:
 *  - Everything here is read-only. Nothing in this module writes to a pty, a
 *    file, a database or the network. The one tool that did perform a real
 *    request (`devdeck_http_send`) is retired, so there is no longer any
 *    outbound-request path on the agent edge at all.
 *  - No secrets are ever returned.
 *  - Results are capped - entries per log section - so one call can't flood the
 *    agent's context (or DevDeck's memory).
 *
 * This module is pure dispatch over injected deps so it can be unit-tested
 * without Electron or a live socket; the transport lives in `mcpserver.ts`.
 */

export interface McpToolDef {
    name: string
    description: string
    inputSchema: Record<string, unknown>
}

/** A project as the agent sees it - enough to map a path to an open project. */
export interface McpProject {
    id: string
    name: string
    path: string
}

export interface McpConsoleEntry {
    level: string
    text: string
    url?: string
    line?: number
}

export interface McpNetEntry {
    method: string
    url: string
    status: number
    type: string
    failed: boolean
}

export interface McpBrowserPage {
    id: number
    url: string
    title: string
}

/**
 * Injected so this module stays pure dispatch - testable without Electron, a
 * live socket, or a real network.
 */
export interface McpDeps {
    projects: () => McpProject[]
    browserPages?: () => McpBrowserPage[]
    consoleLog?: (pageId: number, limit: number) => McpConsoleEntry[]
    networkLog?: (pageId: number, limit: number) => McpNetEntry[]
}

/**
 * Tools DevDeck used to advertise and has withdrawn.
 *
 * This map exists so the withdrawal is not silent. An MCP client reads
 * `tools/list` once per session and an agent carries those names for the rest
 * of its run; worse, a CLAUDE.md or a habit can carry `devdeck_db_query` across
 * sessions. Falling through to `Unknown tool` would tell that agent the server
 * is broken, when in fact the tool was deliberately removed - so the call is
 * answered with what actually happened, once, and the agent stops asking.
 *
 * No version number is quoted in these messages on purpose: the release that
 * carries the removal has not been cut, and a version an agent could check and
 * find wrong is worse than no version. The CHANGELOG entry names it.
 *
 * Do not re-use a retired name for a different tool.
 */
export const RETIRED_TOOLS: Record<string, string> = {
    devdeck_db_connections:
        "removed along with the Database panel and the bundled pg/mysql2/mssql/sqlite drivers. DevDeck no longer holds database connections.",
    devdeck_db_tables:
        "removed along with the Database panel and the bundled pg/mysql2/mssql/sqlite drivers. Read the schema from the repo, or ask the user to run the query themselves.",
    devdeck_db_query:
        "removed along with the Database panel and the bundled pg/mysql2/mssql/sqlite drivers. DevDeck cannot run SQL any more; ask the user for the rows you need.",
    devdeck_http_requests:
        "removed along with the API panel. DevDeck no longer stores saved requests.",
    devdeck_http_send:
        "removed along with the API panel. DevDeck no longer replays saved requests; use your own HTTP tooling."
}

export const TOOLS: McpToolDef[] = [
    {
        name: "devdeck_projects",
        description:
            "List the projects open in DevDeck (name and absolute path). Use this to work out which project a path belongs to.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
        name: "devdeck_console_logs",
        description:
            "Read the console messages and network activity captured from DevDeck's embedded browser panel — including uncaught exceptions, failed requests and CSP/deprecation warnings. Use this to diagnose a page instead of asking the user to copy DevTools output. If only one page is open its id is optional.",
        inputSchema: {
            type: "object",
            properties: {
                pageId: {
                    type: "number",
                    description:
                        "Page id from the listing this tool returns when several pages are open. Optional when exactly one page is captured."
                },
                limit: {
                    type: "number",
                    description: "Maximum entries per section (default 100)."
                }
            },
            additionalProperties: false
        }
    }
]

/** MCP tool results are content blocks; text is enough for everything here. */
export interface McpToolResult {
    content: { type: "text"; text: string }[]
    isError?: boolean
}

const ok = (text: string): McpToolResult => ({ content: [{ type: "text", text }] })
const fail = (text: string): McpToolResult => ({
    content: [{ type: "text", text }],
    isError: true
})

const json = (v: unknown): string => JSON.stringify(v, null, 2)

export async function callTool(
    name: string,
    args: Record<string, unknown>,
    deps: McpDeps
): Promise<McpToolResult> {
    switch (name) {
        case "devdeck_projects":
            return ok(json(deps.projects()))

        case "devdeck_console_logs": {
            const pages = deps.browserPages?.() ?? []
            if (pages.length === 0) {
                return ok(
                    "No browser page is being captured. Ask the user to open the Browser panel in DevDeck first."
                )
            }
            let pageId: number
            if (typeof args.pageId === "number") {
                if (!pages.some((p) => p.id === args.pageId)) {
                    return fail(
                        `No captured page with id ${args.pageId}. Currently captured: ${json(pages)}`
                    )
                }
                pageId = args.pageId
            } else if (pages.length === 1) {
                pageId = pages[0].id
            } else {
                return fail(
                    "Several pages are being captured — pass one of these ids as pageId:\n" +
                        json(pages)
                )
            }
            const limit =
                typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 100
            const page = pages.find((p) => p.id === pageId)
            return ok(
                json({
                    page,
                    console: deps.consoleLog?.(pageId, limit) ?? [],
                    network: deps.networkLog?.(pageId, limit) ?? []
                })
            )
        }

        default: {
            const retired = RETIRED_TOOLS[name]
            // An error, not an ok: the agent asked for something it cannot have
            // and must not treat the explanation as a result.
            if (retired) return fail(`${name} was ${retired}`)
            return fail(`Unknown tool: ${name}`)
        }
    }
}
