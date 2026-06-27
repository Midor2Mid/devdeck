// Import API requests from Postman collections, OpenAPI/Swagger (JSON), or cURL.
// Pure functions → a normalized { name, requests } the collections store can take.

import { type SavedRequest, type AuthConfig, type ApiBodyType, defaultAuth } from "./settings"
import { type KvRow, emptyRow } from "./components/KeyValueEditor"
import { parseCurl } from "./curl"

export interface ImportResult {
    name: string
    requests: SavedRequest[]
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"]

function row(key: string, value: string, enabled = true): KvRow {
    return { id: crypto.randomUUID(), enabled, key: key ?? "", value: value ?? "" }
}

// Always leave a trailing blank row so the editor shows its add-row.
function rows(list: Array<{ key: string; value: string; enabled?: boolean }>): KvRow[] {
    return [...list.map((r) => row(r.key, r.value, r.enabled !== false)), emptyRow()]
}

function baseRequest(partial: Partial<SavedRequest>): SavedRequest {
    return {
        id: crypto.randomUUID(),
        name: "Untitled",
        method: "GET",
        url: "",
        params: [emptyRow()],
        headers: [emptyRow()],
        bodyType: "none",
        bodyText: "",
        formRows: [emptyRow()],
        auth: defaultAuth(),
        ...partial
    }
}

/** Detect the format and parse. Throws Error with a friendly message on failure. */
export function parseImport(text: string): ImportResult {
    const trimmed = text.trim()
    if (!trimmed) throw new Error("Nothing to import.")

    if (/^curl\b/i.test(trimmed)) return fromCurl(trimmed)

    let doc: unknown
    try {
        doc = JSON.parse(trimmed)
    } catch {
        throw new Error("Could not parse — paste a Postman collection, OpenAPI (JSON), or a curl command.")
    }

    const d = doc as Record<string, any>
    if (d.info && Array.isArray(d.item)) return fromPostman(d)
    if (d.openapi || d.swagger) return fromOpenApi(d)
    throw new Error("Unrecognized format. Expected a Postman collection, OpenAPI/Swagger JSON, or curl.")
}

// ---------- cURL ----------
function fromCurl(text: string): ImportResult {
    const p = parseCurl(text)
    if (!p) throw new Error("Could not parse the curl command.")
    return {
        name: "Imported",
        requests: [
            baseRequest({
                name: `${p.method} ${stripScheme(p.url)}`.slice(0, 60),
                method: p.method,
                url: p.url,
                headers: rows(Object.entries(p.headers).map(([key, value]) => ({ key, value }))),
                bodyType: p.body ? "json" : "none",
                bodyText: p.body
            })
        ]
    }
}

// ---------- Postman v2.x ----------
function fromPostman(doc: Record<string, any>): ImportResult {
    const out: SavedRequest[] = []
    const walk = (items: any[]): void => {
        for (const it of items ?? []) {
            if (Array.isArray(it.item)) walk(it.item) // folder
            else if (it.request) out.push(postmanRequest(it))
        }
    }
    walk(doc.item)
    if (out.length === 0) throw new Error("No requests found in the Postman collection.")
    return { name: doc.info?.name || "Imported collection", requests: out }
}

function postmanRequest(item: any): SavedRequest {
    const req = item.request ?? {}
    const method = (typeof req.method === "string" ? req.method : "GET").toUpperCase()
    const url = typeof req.url === "string" ? req.url : (req.url?.raw ?? "")

    const headerList = (req.header ?? [])
        .filter((h: any) => h && h.key)
        .map((h: any) => ({ key: h.key, value: h.value ?? "", enabled: h.disabled !== true }))

    let bodyType: ApiBodyType = "none"
    let bodyText = ""
    let formRows = [emptyRow()]
    const body = req.body
    if (body?.mode === "raw") {
        bodyType = "json"
        bodyText = body.raw ?? ""
    } else if (body?.mode === "urlencoded" || body?.mode === "formdata") {
        bodyType = "form"
        const list = (body[body.mode] ?? [])
            .filter((f: any) => f && f.key && f.type !== "file")
            .map((f: any) => ({ key: f.key, value: f.value ?? "", enabled: f.disabled !== true }))
        formRows = rows(list)
    }

    return baseRequest({
        name: item.name || `${method} ${stripScheme(url)}`.slice(0, 60),
        method,
        url,
        headers: rows(headerList),
        bodyType,
        bodyText,
        formRows,
        auth: postmanAuth(req.auth)
    })
}

function postmanAuth(auth: any): AuthConfig {
    const a = defaultAuth()
    if (!auth || typeof auth.type !== "string") return a
    const pick = (arr: any[], key: string): string =>
        (arr ?? []).find((x) => x.key === key)?.value ?? ""
    if (auth.type === "bearer") {
        a.type = "bearer"
        a.token = pick(auth.bearer, "token")
    } else if (auth.type === "basic") {
        a.type = "basic"
        a.username = pick(auth.basic, "username")
        a.password = pick(auth.basic, "password")
    } else if (auth.type === "apikey") {
        a.type = "apikey"
        a.apiKeyName = pick(auth.apikey, "key")
        a.apiKeyValue = pick(auth.apikey, "value")
        a.apiKeyIn = pick(auth.apikey, "in") === "query" ? "query" : "header"
    }
    return a
}

// ---------- OpenAPI / Swagger ----------
function fromOpenApi(doc: Record<string, any>): ImportResult {
    const base =
        doc.servers?.[0]?.url ??
        (doc.host ? `${(doc.schemes?.[0] ?? "https")}://${doc.host}${doc.basePath ?? ""}` : "")
    const out: SavedRequest[] = []

    for (const [path, ops] of Object.entries<any>(doc.paths ?? {})) {
        for (const [method, op] of Object.entries<any>(ops ?? {})) {
            if (!HTTP_METHODS.includes(method.toLowerCase())) continue
            const params = (op?.parameters ?? []).concat(ops.parameters ?? [])
            const query = params
                .filter((p: any) => p?.in === "query")
                .map((p: any) => ({ key: p.name, value: "", enabled: p.required === true }))
            const headerParams = params
                .filter((p: any) => p?.in === "header")
                .map((p: any) => ({ key: p.name, value: "" }))

            // Build the URL with the base + path; query rows feed the URL too.
            let url = `${base}${path}`
            const enabledQuery = query.filter((q: any) => q.enabled && q.key)
            if (enabledQuery.length) {
                url += "?" + enabledQuery.map((q: any) => `${encodeURIComponent(q.key)}=`).join("&")
            }

            out.push(
                baseRequest({
                    name: (op?.summary || op?.operationId || `${method.toUpperCase()} ${path}`).slice(0, 70),
                    method: method.toUpperCase(),
                    url,
                    params: rows(query),
                    headers: rows(headerParams),
                    bodyType: op?.requestBody || op?.consumes ? "json" : "none"
                })
            )
        }
    }
    if (out.length === 0) throw new Error("No operations found in the OpenAPI document.")
    return { name: doc.info?.title || "Imported API", requests: out }
}

function stripScheme(url: string): string {
    return (url || "").replace(/^https?:\/\//, "")
}
