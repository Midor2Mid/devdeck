# MCP catalog — design

**Date:** 2026-07-08 · **Status:** Approved · **Roadmap #5** (scoped to a curated
catalog; live registry and per-agent routing deferred — CLI agents read the
per-**project** `.mcp.json`).

## Problem
MCP is now infrastructure (10k+ servers), but DevDeck's MCP settings only let you
hand-type a server's `command`/`args`. Adding a common server should be one click.

## Design (reuses existing MCP infra — no new IPC)
- **Pure `src/renderer/src/mcpCatalog.ts`:**
  - `interface McpCatalogEntry { id, name, description, command, args, env? }`
  - `const MCP_CATALOG: McpCatalogEntry[]` — ~10 curated common servers (filesystem,
    github, memory, sequential-thinking, puppeteer, brave-search, postgres, sqlite,
    fetch, slack) as **editable templates** (npx-based commands; env keys blank).
  - `toServer(entry): McpServer` — clones into the `{name, command, args, env}` shape.
  - `addServer(servers, entry): McpServer[]` — append `toServer(entry)` unless a
    server with that name already exists.
  - Unit-tested.
- **Surface:** extend the existing **Settings → MCP** section (`McpSection`) with an
  **"Add from catalog"** list — each entry shows name + description + an **Add**
  button that does `setServers(addServer(servers, entry))`. Saved via the section's
  existing Save (`mcp.save` → `.mcp.json`). Catalog entries already present are shown
  disabled ("Added").

## Reuse
`window.api.mcp.list/save`, `McpServer`, the existing `McpSection` list/edit/save.

## Edge cases
- No active project → the section already shows "select a project"; catalog hidden.
- Duplicate name → `addServer` no-ops (button shows "Added").
- Templates may need editing (paths/tokens) — that's expected; the section's normal
  editor handles it.

## Testing
- Unit-test `mcpCatalog`: catalog non-empty + unique ids + every entry has
  command/args; `toServer` clones (no shared array/env refs); `addServer` appends
  when free and is a no-op on duplicate name.
- run-app: open Settings → MCP on a project, click a catalog "Add", confirm the
  server appears in the editable list.

## Build steps
1. `mcpCatalog.ts` (pure) + tests.
2. Catalog UI in `McpSection` + minimal CSS.
3. `npm test`; run-app verify.
