/**
 * Shared between main and renderer, because both halves must agree on the name
 * or the token never reaches the agent:
 *  - main writes `Bearer ${DEVDECK_MCP_TOKEN}` into the project's `.mcp.json`
 *  - the renderer injects that var into the agent terminals it spawns
 *
 * No Electron imports here on purpose — a runtime import of `preload` would drag
 * `contextBridge` into the main process, and `main` can only take *type* imports
 * from it. A plain module is importable from either side.
 */

/** Env var holding DevDeck's MCP bearer token. */
export const DEVDECK_TOKEN_ENV = "DEVDECK_MCP_TOKEN"

/**
 * The literal header value written to `.mcp.json` — a placeholder, never the
 * token itself. Claude Code expands `${VAR}` inside `headers` when it loads the
 * file, and `.mcp.json` is designed to be committed, so inlining a real token
 * would put a secret in git history.
 */
export const DEVDECK_AUTH_HEADER = `Bearer \${${DEVDECK_TOKEN_ENV}}`
