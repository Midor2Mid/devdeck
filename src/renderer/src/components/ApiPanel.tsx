import { useState } from "react"
import type { HttpResponse } from "../../../preload/index"
import { parseCurl } from "../curl"
import { KeyValueEditor, KvRow, emptyRow, rowsFromPairs } from "./KeyValueEditor"
import { splitUrl, parseQueryPairs, buildUrl } from "../httpParams"
import { useSettings } from "../settings"
import { buildVarMap, substitute, findUnresolved } from "../vars"
import { EnvManager } from "./EnvManager"

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
type ReqTab = "params" | "headers" | "body"
type BodyType = "none" | "json" | "form"

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

const activeCount = (rows: KvRow[]): number =>
    rows.filter((r) => r.enabled && r.key.trim() !== "").length

const hasHeader = (hdrs: Record<string, string>, name: string): boolean =>
    Object.keys(hdrs).some((k) => k.toLowerCase() === name.toLowerCase())

export function ApiPanel(): JSX.Element {
    const [method, setMethod] = useState("GET")
    const [url, setUrl] = useState("")
    const [params, setParams] = useState<KvRow[]>([emptyRow()])
    const [headers, setHeaders] = useState<KvRow[]>([emptyRow()])
    const [bodyType, setBodyType] = useState<BodyType>("none")
    const [bodyText, setBodyText] = useState("")
    const [formRows, setFormRows] = useState<KvRow[]>([emptyRow()])
    const [reqTab, setReqTab] = useState<ReqTab>("params")
    const [resp, setResp] = useState<HttpResponse | null>(null)
    const [sending, setSending] = useState(false)
    const [imported, setImported] = useState(false)
    const [envOpen, setEnvOpen] = useState(false)

    const environments = useSettings((s) => s.environments)
    const activeEnvId = useSettings((s) => s.activeEnvId)
    const setActiveEnv = useSettings((s) => s.setActiveEnv)
    const env = environments.find((e) => e.id === activeEnvId)
    const varMap = buildVarMap(env?.vars)

    // Variables referenced but not defined in the active env (for a gentle warning).
    const unresolved = (() => {
        const all = [url, ...headers.flatMap((h) => [h.key, h.value])]
        if (bodyType === "json") all.push(bodyText)
        if (bodyType === "form") formRows.forEach((r) => all.push(r.key, r.value))
        const set = new Set<string>()
        all.forEach((t) => findUnresolved(t, varMap).forEach((v) => set.add(v)))
        return [...set]
    })()

    // URL bar edited → reflect query into the Params table (keeping disabled rows).
    const setUrlSyncParams = (value: string): void => {
        setUrl(value)
        const fresh = rowsFromPairs(parseQueryPairs(value)) // [...enabled, trailing empty]
        const disabled = params.filter((r) => !r.enabled && (r.key !== "" || r.value !== ""))
        setParams([...fresh.slice(0, -1), ...disabled, fresh[fresh.length - 1]])
    }

    // Params table edited → rebuild the URL's query string.
    const onParamsChange = (rows: KvRow[]): void => {
        setParams(rows)
        setUrl(buildUrl(splitUrl(url).base, rows))
    }

    // Smart paste: a cURL command populates the whole request; else it's a URL.
    const onUrlChange = (value: string): void => {
        if (/^\s*curl\s/i.test(value)) {
            const parsed = parseCurl(value)
            if (parsed) {
                setMethod(parsed.method)
                setUrlSyncParams(parsed.url)
                setHeaders(
                    rowsFromPairs(Object.entries(parsed.headers).map(([key, v]) => ({ key, value: v })))
                )
                if (parsed.body) {
                    setBodyText(parsed.body)
                    setBodyType("json")
                    setReqTab("body")
                }
                setImported(true)
                setTimeout(() => setImported(false), 1800)
                return
            }
        }
        setUrlSyncParams(value)
    }

    const send = async (): Promise<void> => {
        if (!url.trim()) return
        setSending(true)
        setResp(null)
        try {
            const sub = (s: string): string => substitute(s, varMap)

            const hdrs: Record<string, string> = {}
            headers
                .filter((h) => h.enabled && h.key.trim() !== "")
                .forEach((h) => (hdrs[sub(h.key).trim()] = sub(h.value)))

            let outBody: string | undefined
            if (bodyType === "json" && bodyText.trim()) {
                outBody = sub(bodyText)
                if (!hasHeader(hdrs, "content-type")) hdrs["Content-Type"] = "application/json"
            } else if (bodyType === "form") {
                const enc = formRows
                    .filter((r) => r.enabled && r.key.trim() !== "")
                    .map((r) => `${encodeURIComponent(sub(r.key))}=${encodeURIComponent(sub(r.value))}`)
                    .join("&")
                if (enc) {
                    outBody = enc
                    if (!hasHeader(hdrs, "content-type"))
                        hdrs["Content-Type"] = "application/x-www-form-urlencoded"
                }
            }

            const res = await window.api.http.send({
                method,
                url: sub(url.trim()),
                headers: hdrs,
                body: outBody
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

    const paramN = activeCount(params)
    const headerN = activeCount(headers)
    const bodyDot = bodyType !== "none" && (bodyType === "json" ? bodyText.trim() !== "" : activeCount(formRows) > 0)

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

            <div className="api-env-bar">
                <span className="muted small">Env</span>
                <select
                    className="api-env-select"
                    value={activeEnvId ?? ""}
                    onChange={(e) => setActiveEnv(e.target.value || null)}
                >
                    <option value="">No environment</option>
                    {environments.map((e) => (
                        <option key={e.id} value={e.id}>
                            {e.name || "(unnamed)"}
                        </option>
                    ))}
                </select>
                <button onClick={() => setEnvOpen(true)}>Manage…</button>
                {unresolved.length > 0 && (
                    <span className="api-unresolved" title="Variables not defined in the active environment">
                        unresolved: {unresolved.join(", ")}
                    </span>
                )}
            </div>

            <div className="api-req">
                <div className="subtabs">
                    <span className={reqTab === "params" ? "active" : ""} onClick={() => setReqTab("params")}>
                        Params{paramN ? ` (${paramN})` : ""}
                    </span>
                    <span className={reqTab === "headers" ? "active" : ""} onClick={() => setReqTab("headers")}>
                        Headers{headerN ? ` (${headerN})` : ""}
                    </span>
                    <span className={reqTab === "body" ? "active" : ""} onClick={() => setReqTab("body")}>
                        Body{bodyDot ? " •" : ""}
                    </span>
                </div>

                {reqTab === "params" && (
                    <KeyValueEditor rows={params} onChange={onParamsChange} />
                )}
                {reqTab === "headers" && (
                    <KeyValueEditor
                        rows={headers}
                        onChange={setHeaders}
                        keyPlaceholder="Header"
                        valuePlaceholder="value"
                    />
                )}
                {reqTab === "body" && (
                    <div className="body-pane">
                        <div className="body-types">
                            {(["none", "json", "form"] as BodyType[]).map((t) => (
                                <label key={t}>
                                    <input
                                        type="radio"
                                        name="bodyType"
                                        checked={bodyType === t}
                                        onChange={() => setBodyType(t)}
                                    />
                                    {t === "none" ? "None" : t === "json" ? "JSON" : "Form"}
                                </label>
                            ))}
                        </div>
                        {bodyType === "json" && (
                            <textarea
                                className="code-area"
                                placeholder={'{\n  "key": "value"\n}'}
                                value={bodyText}
                                onChange={(e) => setBodyText(e.target.value)}
                            />
                        )}
                        {bodyType === "form" && (
                            <KeyValueEditor rows={formRows} onChange={setFormRows} keyPlaceholder="field" />
                        )}
                        {bodyType === "none" && <div className="muted body-none">No request body.</div>}
                    </div>
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

            {envOpen && <EnvManager onClose={() => setEnvOpen(false)} />}
        </div>
    )
}
