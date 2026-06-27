import { useState } from "react"
import Editor from "@monaco-editor/react"
import type { HttpResponse } from "../../../preload/index"
import { parseCurl } from "../curl"
import { THEMES } from "../themes"
import "../monaco-setup"
import { KeyValueEditor, KvRow, emptyRow, rowsFromPairs } from "./KeyValueEditor"
import { splitUrl, parseQueryPairs, buildUrl } from "../httpParams"
import { useSettings, type SavedRequest, type AuthConfig, defaultAuth } from "../settings"
import { buildVarMap, substitute, findUnresolved } from "../vars"
import { EnvManager } from "./EnvManager"
import { CollectionsSidebar } from "./CollectionsSidebar"

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
type ReqTab = "params" | "auth" | "headers" | "body"
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

function langForContentType(ct: string): string {
    if (ct.includes("json")) return "json"
    if (ct.includes("html")) return "html"
    if (ct.includes("xml")) return "xml"
    if (ct.includes("javascript")) return "javascript"
    if (ct.includes("css")) return "css"
    return "plaintext"
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
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
    const [auth, setAuth] = useState<AuthConfig>(defaultAuth())
    const [reqTab, setReqTab] = useState<ReqTab>("params")
    const [resp, setResp] = useState<HttpResponse | null>(null)
    const [respTab, setRespTab] = useState<"body" | "headers">("body")
    const [respPretty, setRespPretty] = useState(true)
    const [respWrap, setRespWrap] = useState(true)
    const [copied, setCopied] = useState(false)
    const [sending, setSending] = useState(false)
    const monacoTheme = useSettings((s) => THEMES[s.appearance.theme].monacoId)
    const [imported, setImported] = useState(false)
    const [envOpen, setEnvOpen] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [loadedReqId, setLoadedReqId] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [saveOpen, setSaveOpen] = useState(false)
    const [saveName, setSaveName] = useState("")
    const [saveColId, setSaveColId] = useState("")
    const [saveNewCol, setSaveNewCol] = useState("")

    const environments = useSettings((s) => s.environments)
    const activeEnvId = useSettings((s) => s.activeEnvId)
    const setActiveEnv = useSettings((s) => s.setActiveEnv)
    const collections = useSettings((s) => s.collections)
    const setCollections = useSettings((s) => s.setCollections)
    const env = environments.find((e) => e.id === activeEnvId)
    const varMap = buildVarMap(env?.vars)

    // Variables referenced but not defined in the active env (for a gentle warning).
    const unresolved = (() => {
        const all = [url, ...headers.flatMap((h) => [h.key, h.value])]
        if (bodyType === "json") all.push(bodyText)
        if (bodyType === "form") formRows.forEach((r) => all.push(r.key, r.value))
        if (auth.type === "bearer") all.push(auth.token)
        if (auth.type === "basic") all.push(auth.username, auth.password)
        if (auth.type === "apikey") all.push(auth.apiKeyName, auth.apiKeyValue)
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

            // Auth (overrides a manually-set header of the same name, like Postman).
            let finalUrl = sub(url.trim())
            if (auth.type === "bearer" && auth.token.trim()) {
                hdrs["Authorization"] = "Bearer " + sub(auth.token).trim()
            } else if (auth.type === "basic") {
                hdrs["Authorization"] = "Basic " + btoa(`${sub(auth.username)}:${sub(auth.password)}`)
            } else if (auth.type === "apikey" && auth.apiKeyName.trim()) {
                const name = sub(auth.apiKeyName).trim()
                const value = sub(auth.apiKeyValue)
                if (auth.apiKeyIn === "query") {
                    finalUrl +=
                        (finalUrl.includes("?") ? "&" : "?") +
                        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
                } else {
                    hdrs[name] = value
                }
            }

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
                url: finalUrl,
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

    // ----- saved requests / collections -----
    const flashSaved = (): void => {
        setSaved(true)
        setTimeout(() => setSaved(false), 1600)
    }

    // The current editor state as a savable request body (no id/name).
    const currentBody = (): Omit<SavedRequest, "id" | "name"> => ({
        method,
        url,
        params,
        headers,
        bodyType,
        bodyText,
        formRows,
        auth
    })

    const loadRequest = (req: SavedRequest): void => {
        setMethod(req.method)
        setUrl(req.url)
        setParams(req.params?.length ? req.params : [emptyRow()])
        setHeaders(req.headers?.length ? req.headers : [emptyRow()])
        setBodyType(req.bodyType ?? "none")
        setBodyText(req.bodyText ?? "")
        setFormRows(req.formRows?.length ? req.formRows : [emptyRow()])
        setAuth({ ...defaultAuth(), ...req.auth })
        setLoadedReqId(req.id)
        setResp(null)
        setReqTab("params")
    }

    // Update the currently-loaded saved request in place.
    const saveExisting = (): void => {
        if (!loadedReqId) return
        setCollections(
            collections.map((c) => ({
                ...c,
                requests: c.requests.map((r) =>
                    r.id === loadedReqId ? { ...r, ...currentBody() } : r
                )
            }))
        )
        flashSaved()
    }

    const onSaveClick = (): void => {
        if (loadedReqId) {
            saveExisting()
            return
        }
        openSaveDialog()
    }

    const openSaveDialog = (): void => {
        const guess = url ? `${method} ${splitUrl(url).base.replace(/^https?:\/\//, "")}` : "New request"
        setSaveName(guess.slice(0, 60))
        setSaveColId(collections[0]?.id ?? "")
        setSaveNewCol("")
        setSaveOpen(true)
    }

    const confirmSave = (): void => {
        const name = saveName.trim() || "Untitled"
        const req: SavedRequest = { id: crypto.randomUUID(), name, ...currentBody() }

        let next = collections
        let targetId = saveColId
        if (!targetId) {
            const col = { id: crypto.randomUUID(), name: saveNewCol.trim() || "Collection 1", requests: [] }
            next = [...collections, col]
            targetId = col.id
        }
        setCollections(
            next.map((c) => (c.id === targetId ? { ...c, requests: [...c.requests, req] } : c))
        )
        setLoadedReqId(req.id)
        setSaveOpen(false)
        flashSaved()
    }

    const paramN = activeCount(params)
    const headerN = activeCount(headers)
    const bodyDot = bodyType !== "none" && (bodyType === "json" ? bodyText.trim() !== "" : activeCount(formRows) > 0)

    // ----- response view derivations -----
    const respCt = resp?.headers?.["content-type"] ?? ""
    const respLang = langForContentType(respCt)
    const rawRespBody = resp?.body ?? ""
    const shownRespBody =
        respLang === "json" && respPretty ? prettify(rawRespBody, "application/json") : rawRespBody
    const respSize = formatSize(new TextEncoder().encode(rawRespBody).length)
    const respHeaderEntries: Array<[string, string]> = resp?.headers ? Object.entries(resp.headers) : []

    const copyBody = async (): Promise<void> => {
        try {
            await navigator.clipboard.writeText(shownRespBody)
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
        } catch {
            /* clipboard unavailable */
        }
    }

    return (
        <div className="api-panel">
            {sidebarOpen && <CollectionsSidebar onLoad={loadRequest} activeReqId={loadedReqId} />}
            <div className="api-main">
            <div className="api-bar">
                <button
                    className="api-toggle"
                    onClick={() => setSidebarOpen((v) => !v)}
                    title={sidebarOpen ? "Hide collections" : "Show collections"}
                >
                    ☰
                </button>
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
                {saved && <span className="api-imported" title="Saved">Saved ✓</span>}
                <button onClick={onSaveClick} disabled={!url.trim()} title={loadedReqId ? "Update saved request" : "Save request"}>
                    Save
                </button>
                {loadedReqId && (
                    <button onClick={openSaveDialog} disabled={!url.trim()} title="Save as a new request">
                        as…
                    </button>
                )}
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
                    <span className={reqTab === "auth" ? "active" : ""} onClick={() => setReqTab("auth")}>
                        Auth{auth.type !== "none" ? " •" : ""}
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
                {reqTab === "auth" && (
                    <div className="auth-pane">
                        <label className="auth-type">
                            <span>Type</span>
                            <select
                                value={auth.type}
                                onChange={(e) => setAuth({ ...auth, type: e.target.value as AuthConfig["type"] })}
                            >
                                <option value="none">No auth</option>
                                <option value="bearer">Bearer token</option>
                                <option value="basic">Basic auth</option>
                                <option value="apikey">API key</option>
                            </select>
                        </label>

                        {auth.type === "none" && (
                            <div className="muted body-none">No authentication.</div>
                        )}
                        {auth.type === "bearer" && (
                            <label className="auth-field">
                                <span>Token</span>
                                <input
                                    value={auth.token}
                                    onChange={(e) => setAuth({ ...auth, token: e.target.value })}
                                    placeholder="{{token}} or a literal token"
                                />
                            </label>
                        )}
                        {auth.type === "basic" && (
                            <>
                                <label className="auth-field">
                                    <span>Username</span>
                                    <input
                                        value={auth.username}
                                        onChange={(e) => setAuth({ ...auth, username: e.target.value })}
                                    />
                                </label>
                                <label className="auth-field">
                                    <span>Password</span>
                                    <input
                                        type="password"
                                        value={auth.password}
                                        onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                                    />
                                </label>
                            </>
                        )}
                        {auth.type === "apikey" && (
                            <>
                                <label className="auth-field">
                                    <span>Key</span>
                                    <input
                                        value={auth.apiKeyName}
                                        onChange={(e) => setAuth({ ...auth, apiKeyName: e.target.value })}
                                        placeholder="X-API-Key"
                                    />
                                </label>
                                <label className="auth-field">
                                    <span>Value</span>
                                    <input
                                        value={auth.apiKeyValue}
                                        onChange={(e) => setAuth({ ...auth, apiKeyValue: e.target.value })}
                                        placeholder="{{apiKey}}"
                                    />
                                </label>
                                <label className="auth-field">
                                    <span>Add to</span>
                                    <select
                                        value={auth.apiKeyIn}
                                        onChange={(e) =>
                                            setAuth({ ...auth, apiKeyIn: e.target.value as "header" | "query" })
                                        }
                                    >
                                        <option value="header">Header</option>
                                        <option value="query">Query param</option>
                                    </select>
                                </label>
                            </>
                        )}
                    </div>
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
                            <span className="muted">{respSize}</span>
                            <div className="resp-tabs">
                                <span
                                    className={respTab === "body" ? "active" : ""}
                                    onClick={() => setRespTab("body")}
                                >
                                    Body
                                </span>
                                <span
                                    className={respTab === "headers" ? "active" : ""}
                                    onClick={() => setRespTab("headers")}
                                >
                                    Headers{respHeaderEntries.length ? ` (${respHeaderEntries.length})` : ""}
                                </span>
                            </div>
                            {respTab === "body" && (
                                <div className="resp-tools">
                                    {respLang === "json" && (
                                        <button
                                            className={respPretty ? "tool on" : "tool"}
                                            onClick={() => setRespPretty((v) => !v)}
                                            title="Pretty-print JSON"
                                        >
                                            Pretty
                                        </button>
                                    )}
                                    <button
                                        className={respWrap ? "tool on" : "tool"}
                                        onClick={() => setRespWrap((v) => !v)}
                                        title="Wrap long lines"
                                    >
                                        Wrap
                                    </button>
                                    <button className="tool" onClick={copyBody} title="Copy body">
                                        {copied ? "Copied ✓" : "Copy"}
                                    </button>
                                </div>
                            )}
                        </div>
                        {respTab === "body" ? (
                            <div className="resp-viewer">
                                <Editor
                                    theme={monacoTheme}
                                    language={respLang}
                                    value={shownRespBody}
                                    options={{
                                        readOnly: true,
                                        domReadOnly: true,
                                        fontFamily: '"Cascadia Mono", Consolas, monospace',
                                        fontSize: 12,
                                        minimap: { enabled: false },
                                        wordWrap: respWrap ? "on" : "off",
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        padding: { top: 10 },
                                        folding: true,
                                        guides: { indentation: false }
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="resp-headers">
                                {respHeaderEntries.map(([k, v]) => (
                                    <div className="resp-hrow" key={k}>
                                        <span className="resp-hkey">{k}</span>
                                        <span className="resp-hval">{v}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="resp-error">
                        Request failed: {resp.error} ({resp.timeMs} ms)
                    </div>
                )}
            </div>
            </div>

            {envOpen && <EnvManager onClose={() => setEnvOpen(false)} />}

            {saveOpen && (
                <div className="env-backdrop" onClick={() => setSaveOpen(false)}>
                    <div className="save-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="env-head">
                            <h3>Save request</h3>
                            <button onClick={() => setSaveOpen(false)}>Close</button>
                        </div>
                        <label className="save-field">
                            <span>Name</span>
                            <input
                                autoFocus
                                value={saveName}
                                onChange={(e) => setSaveName(e.target.value)}
                                placeholder="e.g. Get orders (paid)"
                            />
                        </label>
                        <label className="save-field">
                            <span>Collection</span>
                            <select value={saveColId} onChange={(e) => setSaveColId(e.target.value)}>
                                {collections.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                                <option value="">+ New collection…</option>
                            </select>
                        </label>
                        {saveColId === "" && (
                            <label className="save-field">
                                <span>New name</span>
                                <input
                                    value={saveNewCol}
                                    onChange={(e) => setSaveNewCol(e.target.value)}
                                    placeholder="Collection name"
                                />
                            </label>
                        )}
                        <div className="save-actions">
                            <button onClick={() => setSaveOpen(false)}>Cancel</button>
                            <button className="accent" onClick={confirmSave} disabled={!saveName.trim()}>
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
