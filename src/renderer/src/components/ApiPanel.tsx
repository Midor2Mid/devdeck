import { useState } from "react"
import type { HttpResponse } from "../../../preload/index"
import { parseCurl } from "../curl"

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

function parseHeaders(text: string): Record<string, string> {
    const headers: Record<string, string> = {}
    for (const line of text.split("\n")) {
        const idx = line.indexOf(":")
        if (idx === -1) continue
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        if (key) headers[key] = value
    }
    return headers
}

function prettify(body: string, contentType?: string): string {
    if (contentType && contentType.includes("json")) {
        try {
            return JSON.stringify(JSON.parse(body), null, 2)
        } catch {
            return body
        }
    }
    return body
}

export function ApiPanel(): JSX.Element {
    const [method, setMethod] = useState("GET")
    const [url, setUrl] = useState("")
    const [headersText, setHeadersText] = useState("")
    const [body, setBody] = useState("")
    const [reqTab, setReqTab] = useState<"headers" | "body">("headers")
    const [resp, setResp] = useState<HttpResponse | null>(null)
    const [sending, setSending] = useState(false)
    const [imported, setImported] = useState(false)

    // Postman-style smart paste: if the value is a cURL command, parse it into
    // method/url/headers/body; otherwise treat it as a plain URL.
    const onUrlChange = (value: string): void => {
        if (/^\s*curl\s/i.test(value)) {
            const parsed = parseCurl(value)
            if (parsed) {
                setMethod(parsed.method)
                setUrl(parsed.url)
                setHeadersText(
                    Object.entries(parsed.headers)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n")
                )
                setBody(parsed.body)
                if (parsed.body) setReqTab("body")
                setImported(true)
                setTimeout(() => setImported(false), 1800)
                return
            }
        }
        setUrl(value)
    }

    const send = async (): Promise<void> => {
        if (!url.trim()) return
        setSending(true)
        setResp(null)
        try {
            const res = await window.api.http.send({
                method,
                url: url.trim(),
                headers: parseHeaders(headersText),
                body: body || undefined
            })
            setResp(res)
        } finally {
            setSending(false)
        }
    }

    const statusClass = (status?: number): string => {
        if (!status) return ""
        if (status < 300) return "ok"
        if (status < 400) return "redirect"
        return "error"
    }

    return (
        <div className="api-panel">
            <div className="api-bar">
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                    {METHODS.map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                </select>
                <input
                    className="api-url"
                    placeholder="https://api.example.com/endpoint  —  or paste a curl command"
                    value={url}
                    onChange={(e) => onUrlChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") send()
                    }}
                />
                {imported && <span className="api-imported" title="Imported from cURL">cURL ✓</span>}
                <button className="accent" onClick={send} disabled={sending || !url.trim()}>
                    {sending ? "Sending…" : "Send"}
                </button>
            </div>

            <div className="api-req">
                <div className="subtabs">
                    <span
                        className={reqTab === "headers" ? "active" : ""}
                        onClick={() => setReqTab("headers")}
                    >
                        Headers
                    </span>
                    <span
                        className={reqTab === "body" ? "active" : ""}
                        onClick={() => setReqTab("body")}
                    >
                        Body
                    </span>
                </div>
                {reqTab === "headers" ? (
                    <textarea
                        className="code-area"
                        placeholder={"One per line, e.g.\nAuthorization: Bearer xxx\nContent-Type: application/json"}
                        value={headersText}
                        onChange={(e) => setHeadersText(e.target.value)}
                    />
                ) : (
                    <textarea
                        className="code-area"
                        placeholder={'{\n  "key": "value"\n}'}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                    />
                )}
            </div>

            <div className="api-resp">
                {resp === null ? (
                    <div className="muted resp-placeholder">
                        Response will appear here. (Requests run in the main process — no CORS
                        limits.)
                    </div>
                ) : resp.ok ? (
                    <>
                        <div className="resp-meta">
                            <span className={"status " + statusClass(resp.status)}>
                                {resp.status} {resp.statusText}
                            </span>
                            <span className="muted">{resp.timeMs} ms</span>
                        </div>
                        <pre className="resp-body">
                            {prettify(resp.body ?? "", resp.headers?.["content-type"])}
                        </pre>
                    </>
                ) : (
                    <div className="resp-error">
                        Request failed: {resp.error} ({resp.timeMs} ms)
                    </div>
                )}
            </div>
        </div>
    )
}
