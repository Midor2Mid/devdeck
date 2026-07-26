export interface HttpRequest {
    method: string
    url: string
    headers?: Record<string, string>
    body?: string
}

export interface HttpResponse {
    ok: boolean
    status?: number
    statusText?: string
    headers?: Record<string, string>
    body?: string
    timeMs: number
    error?: string
}

const BODYLESS = new Set(["GET", "HEAD"])

// Runs in the main process, so it is free of browser CORS restrictions -
// the whole point of a Postman-style client.
export async function httpSend(req: HttpRequest): Promise<HttpResponse> {
    const start = Date.now()
    try {
        const method = (req.method || "GET").toUpperCase()
        const res = await fetch(req.url, {
            method,
            headers: req.headers,
            body: BODYLESS.has(method) ? undefined : req.body
        })
        const body = await res.text()
        const headers: Record<string, string> = {}
        res.headers.forEach((value, key) => {
            headers[key] = value
        })
        return {
            ok: true,
            status: res.status,
            statusText: res.statusText,
            headers,
            body,
            timeMs: Date.now() - start
        }
    } catch (err) {
        // Undici reports every transport failure as a bare "fetch failed" and
        // hides the useful part (ECONNREFUSED, ENOTFOUND, cert errors) in
        // err.cause - so surface that too or the UI says nothing actionable.
        let error = err instanceof Error ? err.message : String(err)
        const cause = err instanceof Error ? (err.cause as { code?: string; message?: string }) : null
        const detail = cause?.code || cause?.message
        if (detail && !error.includes(detail)) error += ` (${detail})`
        return { ok: false, error, timeMs: Date.now() - start }
    }
}
