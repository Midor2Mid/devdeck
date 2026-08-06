import { describe, it, expect, vi } from "vitest"

// Same reason as mcpserver.test.ts: db.ts pulls in native drivers, and none of
// these tests touch SQL.
vi.mock("../src/main/db", () => ({
    listConnections: vi.fn(),
    allConnections: vi.fn(),
    listTables: vi.fn(),
    runQuery: vi.fn()
}))

const { TOOLS, callTool, buildHttpRequest, MAX_BODY } = await import("../src/main/mcptools")
import type { McpDeps, McpSavedRequest } from "../src/main/mcptools"

const text = (r: { content: { text: string }[] }): string => r.content[0].text
const isErr = (r: { isError?: boolean }): boolean => r.isError === true

const row = (key: string, value: string, enabled = true): { key: string; value: string; enabled: boolean } => ({ key, value, enabled })

const SAVED: McpSavedRequest = {
    id: "r1",
    name: "Get widget",
    method: "get",
    url: "https://api.example.com/widgets?page=2",
    params: [row("q", "blue"), row("skip", "x", false), row("", "empty")],
    headers: [row("X-Trace", "abc")],
    bodyType: "none",
    collection: "Widgets"
}

const baseDeps = (over: Partial<McpDeps> = {}): McpDeps => ({
    projects: () => [],
    savedRequests: () => [SAVED],
    httpSend: async () => ({ ok: true, status: 200, statusText: "OK", body: "hello", timeMs: 12 }),
    browserPages: () => [{ id: 7, url: "http://localhost:3000/", title: "App" }],
    consoleLog: () => [{ level: "error", text: "boom", url: "app.js", line: 3 }],
    networkLog: () => [{ method: "GET", url: "/api/x", status: 500, type: "xhr", failed: false }],
    ...over
})

describe("buildHttpRequest", () => {
    it("merges the params table into the URL's existing query string", () => {
        const r = buildHttpRequest(SAVED)
        expect(r.url).toBe("https://api.example.com/widgets?page=2&q=blue")
    })

    it("skips disabled and blank-key rows", () => {
        const r = buildHttpRequest(SAVED)
        expect(r.url).not.toContain("skip")
        expect(r.url).not.toContain("empty")
    })

    it("upper-cases the method and defaults it to GET", () => {
        expect(buildHttpRequest(SAVED).method).toBe("GET")
        expect(buildHttpRequest({ id: "x", name: "x" }).method).toBe("GET")
    })

    it("carries enabled headers through", () => {
        expect(buildHttpRequest(SAVED).headers["X-Trace"]).toBe("abc")
    })

    it("builds a bearer Authorization header", () => {
        const r = buildHttpRequest({ ...SAVED, auth: { type: "bearer", token: "t0k" } })
        expect(r.headers["Authorization"]).toBe("Bearer t0k")
    })

    it("base64-encodes basic auth", () => {
        const r = buildHttpRequest({ ...SAVED, auth: { type: "basic", username: "u", password: "p" } })
        expect(r.headers["Authorization"]).toBe("Basic " + Buffer.from("u:p").toString("base64"))
    })

    it("puts an api key in a header or the query, as configured", () => {
        const h = buildHttpRequest({
            ...SAVED,
            auth: { type: "apikey", apiKeyName: "X-Key", apiKeyValue: "k", apiKeyIn: "header" }
        })
        expect(h.headers["X-Key"]).toBe("k")
        const q = buildHttpRequest({
            ...SAVED,
            auth: { type: "apikey", apiKeyName: "key", apiKeyValue: "k", apiKeyIn: "query" }
        })
        expect(q.url).toContain("key=k")
        expect(q.headers["key"]).toBeUndefined()
    })

    it("sends a json body and infers its content type", () => {
        const r = buildHttpRequest({ ...SAVED, bodyType: "json", bodyText: '{"a":1}' })
        expect(r.body).toBe('{"a":1}')
        expect(r.headers["Content-Type"]).toBe("application/json")
    })

    it("does not override a content type the user set explicitly", () => {
        const r = buildHttpRequest({
            ...SAVED,
            bodyType: "json",
            bodyText: "{}",
            headers: [row("content-type", "application/vnd.api+json")]
        })
        expect(r.headers["content-type"]).toBe("application/vnd.api+json")
        expect(r.headers["Content-Type"]).toBeUndefined()
    })

    it("url-encodes a form body", () => {
        const r = buildHttpRequest({
            ...SAVED,
            bodyType: "form",
            formRows: [row("a b", "c&d")]
        })
        expect(r.body).toBe("a%20b=c%26d")
        expect(r.headers["Content-Type"]).toBe("application/x-www-form-urlencoded")
    })

    it("leaves GET without a body", () => {
        expect(buildHttpRequest(SAVED).body).toBeUndefined()
    })
})

describe("devdeck_http_requests", () => {
    it("omits the query string, which can hold api keys", async () => {
        const r = await callTool("devdeck_http_requests", {}, baseDeps())
        const list = JSON.parse(text(r))
        expect(list[0].url).toBe("https://api.example.com/widgets")
        expect(text(r)).not.toContain("page=2")
    })

    it("reports the collection and enabled param count", async () => {
        const list = JSON.parse(text(await callTool("devdeck_http_requests", {}, baseDeps())))
        expect(list[0]).toMatchObject({ collection: "Widgets", method: "GET", paramCount: 1 })
    })

    it("guides the user when nothing is saved", async () => {
        const r = await callTool("devdeck_http_requests", {}, baseDeps({ savedRequests: () => [] }))
        expect(text(r)).toMatch(/API panel/)
    })
})

describe("devdeck_http_send", () => {
    it("replays a saved request and returns status, timing and body", async () => {
        const r = await callTool("devdeck_http_send", { requestId: "r1" }, baseDeps())
        expect(JSON.parse(text(r))).toMatchObject({ status: 200, timeMs: 12, body: "hello" })
    })

    it("refuses an unknown id rather than sending anything", async () => {
        const httpSend = vi.fn()
        const r = await callTool("devdeck_http_send", { requestId: "nope" }, baseDeps({ httpSend }))
        expect(isErr(r)).toBe(true)
        expect(httpSend).not.toHaveBeenCalled()
    })

    // The containment property: the agent picks an id, never a URL, so the set of
    // reachable hosts is exactly what the user saved.
    it("offers no way to supply a URL of its own", () => {
        const def = TOOLS.find((t) => t.name === "devdeck_http_send")!
        const props = def.inputSchema.properties as Record<string, unknown>
        expect(Object.keys(props)).toEqual(["requestId"])
        expect(def.inputSchema.additionalProperties).toBe(false)
    })

    it("truncates a huge body and says so", async () => {
        const big = "x".repeat(MAX_BODY + 500)
        const r = await callTool(
            "devdeck_http_send",
            { requestId: "r1" },
            baseDeps({ httpSend: async () => ({ ok: true, status: 200, body: big, timeMs: 1 }) })
        )
        const out = JSON.parse(text(r))
        expect(out.truncated).toBe(true)
        expect(out.body.length).toBe(MAX_BODY)
    })

    it("surfaces a transport failure as an error", async () => {
        const r = await callTool(
            "devdeck_http_send",
            { requestId: "r1" },
            baseDeps({ httpSend: async () => ({ ok: false, error: "ENOTFOUND", timeMs: 3 }) })
        )
        expect(isErr(r)).toBe(true)
        expect(text(r)).toContain("ENOTFOUND")
    })
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
