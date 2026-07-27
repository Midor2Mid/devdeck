import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
    readMcp,
    writeMcp,
    registerDevdeck,
    unregisterDevdeck,
    DEVDECK_SERVER_NAME
} from "../src/main/mcp"
import { DEVDECK_TOKEN_ENV } from "../src/shared/mcpEnv"

let dir = ""
const file = (): string => join(dir, ".mcp.json")
const raw = (): string => readFileSync(file(), "utf8")

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "devdeck-mcp-"))
})
afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
})

describe("registerDevdeck", () => {
    it("writes a Claude Code http entry", () => {
        registerDevdeck(dir, 8787)
        const entry = JSON.parse(raw()).mcpServers[DEVDECK_SERVER_NAME]
        expect(entry.type).toBe("http")
        expect(entry.url).toBe("http://127.0.0.1:8787/mcp")
    })

    // The security property. `.mcp.json` is meant to be committed, so a literal
    // token here would end up in git history on the first commit.
    it("references the token by env var and never inlines a secret", () => {
        registerDevdeck(dir, 8787)
        const text = raw()
        expect(text).toContain(`\${${DEVDECK_TOKEN_ENV}}`)
        // Nothing that looks like an actual credential.
        expect(text).not.toMatch(/Bearer [A-Za-z0-9_-]{12,}/)
    })

    it("is idempotent — re-registering doesn't duplicate the entry", () => {
        registerDevdeck(dir, 8787)
        registerDevdeck(dir, 9999)
        const servers = JSON.parse(raw()).mcpServers
        expect(Object.keys(servers).filter((k) => k === DEVDECK_SERVER_NAME)).toHaveLength(1)
        expect(servers[DEVDECK_SERVER_NAME].url).toContain("9999")
    })

    it("leaves other servers untouched", () => {
        writeMcp(dir, [
            { name: "github", command: "npx", args: ["-y", "gh-mcp"], env: { TOKEN: "x" } }
        ])
        registerDevdeck(dir, 8787)
        const servers = JSON.parse(raw()).mcpServers
        expect(servers.github.command).toBe("npx")
        expect(servers.github.args).toEqual(["-y", "gh-mcp"])
        expect(servers[DEVDECK_SERVER_NAME].type).toBe("http")
    })

    it("preserves unrelated top-level keys in the file", () => {
        writeFileSync(file(), JSON.stringify({ somethingElse: { keep: true } }, null, 2))
        registerDevdeck(dir, 8787)
        expect(JSON.parse(raw()).somethingElse).toEqual({ keep: true })
    })

    // Migration: a file written by 0.7.7 has the literal token in it. Re-running
    // "Add to this project" must replace it with the placeholder.
    it("replaces a previously inlined token", () => {
        writeMcp(dir, [
            {
                name: DEVDECK_SERVER_NAME,
                command: "",
                args: [],
                env: {},
                url: "http://127.0.0.1:8787/mcp",
                headers: { Authorization: "Bearer leaked-secret-token-value" }
            }
        ])
        expect(raw()).toContain("leaked-secret-token-value")
        registerDevdeck(dir, 8787)
        expect(raw()).not.toContain("leaked-secret-token-value")
        expect(raw()).toContain(`\${${DEVDECK_TOKEN_ENV}}`)
    })
})

describe("unregisterDevdeck", () => {
    it("removes only DevDeck's entry", () => {
        writeMcp(dir, [{ name: "github", command: "npx", args: [], env: {} }])
        registerDevdeck(dir, 8787)
        unregisterDevdeck(dir)
        const servers = JSON.parse(raw()).mcpServers
        expect(servers[DEVDECK_SERVER_NAME]).toBeUndefined()
        expect(servers.github).toBeDefined()
    })
})

describe("readMcp / writeMcp round-trip", () => {
    it("keeps stdio entries as stdio (no stray type field)", () => {
        writeMcp(dir, [{ name: "s", command: "node", args: ["x.js"], env: {} }])
        const entry = JSON.parse(raw()).mcpServers.s
        expect(entry.type).toBeUndefined()
        expect(entry.command).toBe("node")
    })

    it("reads both shapes back", () => {
        registerDevdeck(dir, 8787)
        const list = readMcp(dir)
        const dd = list.find((s) => s.name === DEVDECK_SERVER_NAME)
        expect(dd?.url).toContain("8787")
        expect(dd?.command).toBe("")
    })
})
