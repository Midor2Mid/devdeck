// Pure assertion engine for the API client. Kept dependency-free and separate
// from the panel so it's unit-testable: given a response and a list of tests,
// return a pass/fail result (with the actual value) for each.

export type TestSource = "status" | "time" | "body" | "header" | "json"
export type TestOp = "eq" | "neq" | "contains" | "lt" | "gt"

export interface ApiTest {
    id: string
    source: TestSource
    /** Header name (source=header) or JSON path like `data.id` / `$.items[0].name` (source=json). */
    target: string
    op: TestOp
    value: string
}

export interface TestableResponse {
    status?: number
    timeMs?: number
    headers?: Record<string, string>
    body?: string
}

export interface TestResult {
    test: ApiTest
    pass: boolean
    actual: string
}

const OP_LABEL: Record<TestOp, string> = {
    eq: "equals",
    neq: "≠",
    contains: "contains",
    lt: "<",
    gt: ">"
}
export const SOURCE_LABEL: Record<TestSource, string> = {
    status: "Status code",
    time: "Time (ms)",
    body: "Body",
    header: "Header",
    json: "JSON path"
}
export { OP_LABEL }

/** Ops that make sense per source (drives the UI dropdown). */
export function opsFor(source: TestSource): TestOp[] {
    if (source === "status" || source === "time") return ["eq", "neq", "lt", "gt"]
    return ["eq", "neq", "contains"]
}

/** Case-insensitive header lookup. */
function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
    if (!headers) return undefined
    const want = name.trim().toLowerCase()
    for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v
    return undefined
}

/** Resolve a dot/bracket path (`$.a.b[0].c`, `a.b`) within a parsed JSON value. */
export function resolveJsonPath(root: unknown, path: string): unknown {
    const clean = path.trim().replace(/^\$\.?/, "")
    if (!clean) return root
    const parts = clean.split(/\.|\[(\d+)\]/).filter((p) => p !== undefined && p !== "")
    let cur: unknown = root
    for (const part of parts) {
        if (cur == null) return undefined
        const idx = /^\d+$/.test(part) ? Number(part) : part
        cur = (cur as Record<string | number, unknown>)[idx as string]
    }
    return cur
}

function toText(v: unknown): string {
    if (v == null) return ""
    if (typeof v === "object") return JSON.stringify(v)
    return String(v)
}

function actualFor(test: ApiTest, resp: TestableResponse): string {
    switch (test.source) {
        case "status":
            return resp.status != null ? String(resp.status) : ""
        case "time":
            return resp.timeMs != null ? String(resp.timeMs) : ""
        case "body":
            return resp.body ?? ""
        case "header":
            return headerValue(resp.headers, test.target) ?? ""
        case "json":
            try {
                return toText(resolveJsonPath(JSON.parse(resp.body ?? ""), test.target))
            } catch {
                return ""
            }
    }
}

function compare(actual: string, op: TestOp, expected: string): boolean {
    switch (op) {
        case "eq": {
            const an = Number(actual)
            const en = Number(expected)
            if (actual.trim() !== "" && expected.trim() !== "" && !isNaN(an) && !isNaN(en)) return an === en
            return actual === expected
        }
        case "neq":
            return !compare(actual, "eq", expected)
        case "contains":
            return actual.includes(expected)
        case "lt":
            return Number(actual) < Number(expected)
        case "gt":
            return Number(actual) > Number(expected)
    }
}

/** Run all tests against a response. */
export function evalTests(tests: ApiTest[], resp: TestableResponse): TestResult[] {
    return tests.map((test) => {
        const actual = actualFor(test, resp)
        return { test, pass: compare(actual, test.op, test.value), actual }
    })
}

/** A short "for display" label of a test, e.g. `Status code equals 200`. */
export function describeTest(t: ApiTest): string {
    const head = t.source === "header" || t.source === "json" ? `${SOURCE_LABEL[t.source]} ${t.target}` : SOURCE_LABEL[t.source]
    return `${head} ${OP_LABEL[t.op]} ${t.value}`
}
