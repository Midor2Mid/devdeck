// Request chaining: after a response comes back, pull values out of it into
// named variables that later requests can reference via {{name}}. Pure +
// testable; reuses the JSON-path resolver from the assertions engine.

import { resolveJsonPath } from "./apiTests"

export type ExtractSource = "json" | "header" | "status" | "regex"

export interface Extractor {
    id: string
    /** Variable name to write into the chain scope. */
    varName: string
    source: ExtractSource
    /** JSON path (json), header name (header), or a regex whose 1st group is captured (regex). */
    path: string
}

export interface ExtractResult {
    extractor: Extractor
    value: string
    ok: boolean
}

export interface ExtractableResponse {
    status?: number
    headers?: Record<string, string>
    body?: string
}

export const EXTRACT_SOURCE_LABEL: Record<ExtractSource, string> = {
    json: "JSON path",
    header: "Header",
    status: "Status code",
    regex: "Body regex"
}

function headerValue(headers: Record<string, string> | undefined, name: string): string {
    if (!headers) return ""
    const want = name.trim().toLowerCase()
    for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v
    return ""
}

function toText(v: unknown): string {
    if (v == null) return ""
    if (typeof v === "object") return JSON.stringify(v)
    return String(v)
}

/** Extract a single value from a response per the extractor's rule. */
export function extractValue(ex: Extractor, resp: ExtractableResponse): string {
    switch (ex.source) {
        case "status":
            return resp.status != null ? String(resp.status) : ""
        case "header":
            return headerValue(resp.headers, ex.path)
        case "json":
            try {
                return toText(resolveJsonPath(JSON.parse(resp.body ?? ""), ex.path))
            } catch {
                return ""
            }
        case "regex":
            try {
                const m = new RegExp(ex.path).exec(resp.body ?? "")
                // First capture group if present, else the whole match.
                return m ? (m[1] ?? m[0]) : ""
            } catch {
                return ""
            }
    }
}

/** Run all extractors against a response; ok = a named, non-empty value. */
export function runExtractors(extractors: Extractor[], resp: ExtractableResponse): ExtractResult[] {
    return (extractors ?? []).map((extractor) => {
        const value = extractValue(extractor, resp)
        return { extractor, value, ok: extractor.varName.trim() !== "" && value !== "" }
    })
}
