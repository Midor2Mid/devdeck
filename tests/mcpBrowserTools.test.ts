import { describe, it, expect, vi } from "vitest"

// mcptools.ts is pure dispatch over injected deps - no module stub is needed
// since the database tools (the only importer of db.ts, and with it the native
// drivers) were removed. The HTTP-replay tools this file also covered went with
// the API panel that saved the requests they replayed; what is left of the agent
// edge is the browser capture below.
import { callTool } from "../src/main/mcptools"
import type { McpDeps } from "../src/main/mcptools"

const text = (r: { content: { text: string }[] }): string => r.content[0].text
const isErr = (r: { isError?: boolean }): boolean => r.isError === true

const baseDeps = (over: Partial<McpDeps> = {}): McpDeps => ({
    projects: () => [],
    browserPages: () => [{ id: 7, url: "http://localhost:3000/", title: "App" }],
    consoleLog: () => [{ level: "error", text: "boom", url: "app.js", line: 3 }],
    networkLog: () => [{ method: "GET", url: "/api/x", status: 500, type: "xhr", failed: false }],
    ...over
})

describe("devdeck_console_logs", () => {
    it("uses the only captured page without being told which", async () => {
        const r = await callTool("devdeck_console_logs", {}, baseDeps())
        const out = JSON.parse(text(r))
        expect(out.page.id).toBe(7)
        expect(out.console[0].text).toBe("boom")
        expect(out.network[0].status).toBe(500)
    })

    it("asks which page when several are captured", async () => {
        const r = await callTool(
            "devdeck_console_logs",
            {},
            baseDeps({
                browserPages: () => [
                    { id: 1, url: "a", title: "A" },
                    { id: 2, url: "b", title: "B" }
                ]
            })
        )
        expect(isErr(r)).toBe(true)
        expect(text(r)).toContain("pageId")
    })

    it("rejects a page id that isn't captured", async () => {
        const r = await callTool("devdeck_console_logs", { pageId: 99 }, baseDeps())
        expect(isErr(r)).toBe(true)
    })

    it("explains what to do when no page is open", async () => {
        const r = await callTool("devdeck_console_logs", {}, baseDeps({ browserPages: () => [] }))
        expect(text(r)).toMatch(/Browser panel/)
        expect(isErr(r)).toBe(false)
    })

    it("passes the caller's limit through to both sources", async () => {
        const consoleLog = vi.fn().mockReturnValue([])
        const networkLog = vi.fn().mockReturnValue([])
        await callTool("devdeck_console_logs", { limit: 5 }, baseDeps({ consoleLog, networkLog }))
        expect(consoleLog).toHaveBeenCalledWith(7, 5)
        expect(networkLog).toHaveBeenCalledWith(7, 5)
    })
})
