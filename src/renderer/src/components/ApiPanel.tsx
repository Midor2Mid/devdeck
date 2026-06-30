import { useEffect, useState } from "react"
import Editor from "@monaco-editor/react"
import { useStore } from "../store"
import type { HttpResponse } from "../../../preload/index"
import { parseCurl } from "../curl"
import { THEMES } from "../themes"
import "../monaco-setup"
import { KeyValueEditor, KvRow, emptyRow, rowsFromPairs } from "./KeyValueEditor"
import { splitUrl, parseQueryPairs, buildUrl } from "../httpParams"
import { useSettings, type SavedRequest, type AuthConfig, defaultAuth } from "../settings"
import {
    evalTests,
    opsFor,
    describeTest,
    OP_LABEL,
    SOURCE_LABEL,
    type ApiTest,
    type TestSource,
    type TestOp,
    type TestResult
} from "../apiTests"
import {
    runExtractors,
    EXTRACT_SOURCE_LABEL,
    type Extractor,
    type ExtractSource,
    type ExtractResult
} from "../apiChain"
import { useChainVars } from "../chain"
import { buildVarMap, substitute, findUnresolved } from "../vars"
import { confirm } from "../confirm"
import { EnvManager } from "./EnvManager"
import { CollectionsSidebar } from "./CollectionsSidebar"

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
type ReqTab = "params" | "auth" | "headers" | "body" | "tests" | "chain"
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

const TEST_SOURCES: TestSource[] = ["status", "time", "body", "header", "json"]

const EXTRACT_SOURCES: ExtractSource[] = ["json", "header", "status", "regex"]

/** Editor for a request's response extractors (the "Chain" subtab). */
function ExtractorsEditor({
    extractors,
    onChange
}: {
    extractors: Extractor[]
    onChange: (e: Extractor[]) => void
}): JSX.Element {
    const update = (i: number, patch: Partial<Extractor>): void =>
        onChange(extractors.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
    const remove = (i: number): void => onChange(extractors.filter((_, idx) => idx !== i))
    const add = (): void =>
        onChange([
            ...extractors,
            { id: crypto.randomUUID(), varName: "", source: "json", path: "" }
        ])

    return (
        <div className="tests-pane">
            {extractors.length === 0 && (
                <div className="muted small tests-hint">
                    After Send, pull a value from the response into a variable later requests can
                    use as <code>{"{{name}}"}</code> - a JSON path (<code>data.token</code>), a
                    header, the status, or a body regex (1st group).
                </div>
            )}
            {extractors.map((e, i) => {
                const needsPath = e.source !== "status"
                return (
                    <div className="test-row" key={e.id}>
                        <input
                            className="test-target"
                            value={e.varName}
                            placeholder="varName"
                            onChange={(ev) => update(i, { varName: ev.target.value })}
                        />
                        <span className="muted small">=</span>
                        <select
                            value={e.source}
                            onChange={(ev) => update(i, { source: ev.target.value as ExtractSource })}
                        >
                            {EXTRACT_SOURCES.map((s) => (
                                <option key={s} value={s}>
                                    {EXTRACT_SOURCE_LABEL[s]}
                                </option>
                            ))}
                        </select>
                        {needsPath && (
                            <input
                                className="test-value"
                                value={e.path}
                                placeholder={
                                    e.source === "header"
                                        ? "Header name"
                                        : e.source === "regex"
                                          ? "pattern with (group)"
                                          : "data.token"
                                }
                                onChange={(ev) => update(i, { path: ev.target.value })}
                            />
                        )}
                        <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                            ×
                        </button>
                    </div>
                )
            })}
            <button onClick={add} style={{ marginTop: 6 }}>
                + Add extractor
            </button>
        </div>
    )
}

/** Editor for a request's response assertions (the "Tests" subtab). */
function TestsEditor({
    tests,
    onChange
}: {
    tests: ApiTest[]
    onChange: (t: ApiTest[]) => void
}): JSX.Element {
    const update = (i: number, patch: Partial<ApiTest>): void =>
        onChange(tests.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
    const remove = (i: number): void => onChange(tests.filter((_, idx) => idx !== i))
    const add = (): void =>
        onChange([
            ...tests,
            { id: crypto.randomUUID(), source: "status", target: "", op: "eq", value: "200" }
        ])

    return (
        <div className="tests-pane">
            {tests.length === 0 && (
                <div className="muted small tests-hint">
                    Add assertions checked against the response after Send - status code, time,
                    body text, a header, or a JSON path (e.g. <code>data.id</code>).
                </div>
            )}
            {tests.map((t, i) => {
                const needsTarget = t.source === "header" || t.source === "json"
                return (
                    <div className="test-row" key={t.id}>
                        <select
                            value={t.source}
                            onChange={(e) => {
                                const source = e.target.value as TestSource
                                const ops = opsFor(source)
                                update(i, { source, op: ops.includes(t.op) ? t.op : ops[0] })
                            }}
                        >
                            {TEST_SOURCES.map((s) => (
                                <option key={s} value={s}>
                                    {SOURCE_LABEL[s]}
                                </option>
                            ))}
                        </select>
                        {needsTarget && (
                            <input
                                className="test-target"
                                value={t.target}
                                placeholder={t.source === "header" ? "Header name" : "data.id"}
                                onChange={(e) => update(i, { target: e.target.value })}
                            />
                        )}
                        <select
                            value={t.op}
                            onChange={(e) => update(i, { op: e.target.value as TestOp })}
                        >
                            {opsFor(t.source).map((o) => (
                                <option key={o} value={o}>
                                    {OP_LABEL[o]}
                                </option>
                            ))}
                        </select>
                        <input
                            className="test-value"
                            value={t.value}
                            placeholder="value"
                            onChange={(e) => update(i, { value: e.target.value })}
                        />
                        <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                            ×
                        </button>
                    </div>
                )
            })}
            <button onClick={add} style={{ marginTop: 6 }}>
                + Add assertion
            </button>
        </div>
    )
}

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
    const [tests, setTests] = useState<ApiTest[]>([])
    const [testResults, setTestResults] = useState<TestResult[]>([])
    const [extractors, setExtractors] = useState<Extractor[]>([])
    const [extractResults, setExtractResults] = useState<ExtractResult[]>([])
    const chainVars = useChainVars((s) => s.vars)
    const setChainVar = useChainVars((s) => s.set)
    const removeChainVar = useChainVars((s) => s.remove)
    const clearChainVars = useChainVars((s) => s.clear)
    const [respTab, setRespTab] = useState<"body" | "headers" | "tests">("body")
    const [respPretty, setRespPretty] = useState(true)
    const [respWrap, setRespWrap] = useState(true)
    const [copied, setCopied] = useState(false)
    const [sentToAgent, setSentToAgent] = useState(false)
    const [sending, setSending] = useState(false)
    const sendToAgent = useStore((s) => s.sendToAgent)
    const lastAgent = useStore((s) => s.lastAgentTermId)
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
    // Chain vars (extracted from prior responses) override the active environment.
    const varMap = { ...buildVarMap(env?.vars), ...chainVars }

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
        // Warn before firing a request that still has unresolved {{variables}} -
        // they'd be sent literally and almost certainly fail.
        if (unresolved.length > 0) {
            const ok = await confirm({
                title: "Unresolved variables",
                message: `${unresolved.length} variable${unresolved.length === 1 ? "" : "s"} not defined in the active environment: ${unresolved.map((v) => "{{" + v + "}}").join(", ")}. Send anyway?`,
                confirmLabel: "Send anyway"
            })
            if (!ok) return
        }
        setSending(true)
        setResp(null)
        setTestResults([])
        setExtractResults([])
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
            if (tests.length) {
                setTestResults(evalTests(tests, res))
                if (res.ok) setRespTab("tests")
            }
            // Chain: pull values from a successful response into chain variables.
            if (res.ok && extractors.length) {
                const results = runExtractors(extractors, res)
                setExtractResults(results)
                results.filter((r) => r.ok).forEach((r) => setChainVar(r.extractor.varName.trim(), r.value))
            }
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
        auth,
        tests,
        extractors
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
        setTests(req.tests ?? [])
        setTestResults([])
        setExtractors(req.extractors ?? [])
        setExtractResults([])
        setLoadedReqId(req.id)
        setResp(null)
        setReqTab("params")
    }

    // A request handed over from the Network panel ("→ API"): load it, then clear.
    const pendingApiRequest = useStore((s) => s.pendingApiRequest)
    const setPendingApiRequest = useStore((s) => s.setPendingApiRequest)
    useEffect(() => {
        if (!pendingApiRequest) return
        loadRequest(pendingApiRequest)
        setPendingApiRequest(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingApiRequest])

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

    // Hand the response to the focused agent session as context to reason about.
    // The body is capped so a huge payload can't flood the terminal.
    const sendRespToAgent = (): void => {
        if (!resp) return
        const cap = 12000
        const body = shownRespBody.length > cap
            ? shownRespBody.slice(0, cap) + `\n…(truncated, ${shownRespBody.length - cap} more chars)`
            : shownRespBody
        const text =
            `Here's an HTTP response I captured in DevDeck:\n\n` +
            `REQUEST: ${method} ${url}\n` +
            `RESPONSE: ${resp.status} ${resp.statusText} (${resp.timeMs} ms)\n\n` +
            "```\n" + body + "\n```\n"
        if (sendToAgent(text)) {
            setSentToAgent(true)
            setTimeout(() => setSentToAgent(false), 1500)
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
                    data-tip={sidebarOpen ? "Hide collections" : "Show collections"}
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
                    placeholder="https://api.example.com/endpoint  -  or paste a curl command"
                    value={url}
                    onChange={(e) => onUrlChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") send()
                    }}
                />
                {imported && <span className="api-imported" data-tip="Imported from cURL">cURL ✓</span>}
                {saved && <span className="api-imported" data-tip="Saved">Saved ✓</span>}
                <button onClick={onSaveClick} disabled={!url.trim()} data-tip={loadedReqId ? "Update saved request" : "Save request"}>
                    Save
                </button>
                {loadedReqId && (
                    <button onClick={openSaveDialog} disabled={!url.trim()} data-tip="Save as a new request">
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
                    <span className="api-unresolved" data-tip="Variables not defined in the active environment">
                        unresolved: {unresolved.join(", ")}
                    </span>
                )}
                {Object.keys(chainVars).length > 0 && (
                    <span className="chain-vars" data-tip="Chain variables extracted from responses">
                        <span className="muted small">chain:</span>
                        {Object.keys(chainVars).map((name) => (
                            <span key={name} className="chain-chip">
                                {name}
                                <button
                                    className="chain-chip-x"
                                    data-tip={`Forget ${name}`}
                                    onClick={() => removeChainVar(name)}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                        <button className="chain-clear" onClick={() => clearChainVars()} data-tip="Clear all chain variables">
                            clear
                        </button>
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
                    <span className={reqTab === "tests" ? "active" : ""} onClick={() => setReqTab("tests")}>
                        Tests{tests.length ? ` (${tests.length})` : ""}
                    </span>
                    <span className={reqTab === "chain" ? "active" : ""} onClick={() => setReqTab("chain")}>
                        Chain{extractors.length ? ` (${extractors.length})` : ""}
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
                {reqTab === "tests" && (
                    <TestsEditor tests={tests} onChange={setTests} />
                )}
                {reqTab === "chain" && (
                    <ExtractorsEditor extractors={extractors} onChange={setExtractors} />
                )}
            </div>

            <div className="api-resp">
                {resp === null ? (
                    <div className="muted resp-placeholder">
                        Response will appear here. (Requests run in the main process - no CORS
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
                            {extractResults.some((r) => r.ok) && (
                                <span
                                    className="resp-extracted"
                                    data-tip="Saved to chain variables"
                                >
                                    ⛓ {extractResults.filter((r) => r.ok).map((r) => r.extractor.varName.trim()).join(", ")}
                                </span>
                            )}
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
                                {testResults.length > 0 && (
                                    <span
                                        className={
                                            (respTab === "tests" ? "active " : "") +
                                            (testResults.every((r) => r.pass) ? "tests-pass" : "tests-fail")
                                        }
                                        onClick={() => setRespTab("tests")}
                                    >
                                        Tests {testResults.filter((r) => r.pass).length}/{testResults.length}
                                        {testResults.every((r) => r.pass) ? " ✓" : " ✗"}
                                    </span>
                                )}
                            </div>
                            {respTab === "body" && (
                                <div className="resp-tools">
                                    {respLang === "json" && (
                                        <button
                                            className={respPretty ? "tool on" : "tool"}
                                            onClick={() => setRespPretty((v) => !v)}
                                            data-tip="Pretty-print JSON"
                                        >
                                            Pretty
                                        </button>
                                    )}
                                    <button
                                        className={respWrap ? "tool on" : "tool"}
                                        onClick={() => setRespWrap((v) => !v)}
                                        data-tip="Wrap long lines"
                                    >
                                        Wrap
                                    </button>
                                    <button className="tool" onClick={copyBody} data-tip="Copy body">
                                        {copied ? "Copied ✓" : "Copy"}
                                    </button>
                                    <button
                                        className="tool"
                                        onClick={sendRespToAgent}
                                        disabled={!lastAgent}
                                        data-tip={
                                            lastAgent
                                                ? "Send this response to the focused agent session"
                                                : "No agent session yet"
                                        }
                                    >
                                        {sentToAgent ? "Sent ✓" : "→ Agent"}
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
                        ) : respTab === "headers" ? (
                            <div className="resp-headers">
                                {respHeaderEntries.map(([k, v]) => (
                                    <div className="resp-hrow" key={k}>
                                        <span className="resp-hkey">{k}</span>
                                        <span className="resp-hval">{v}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="resp-tests">
                                {testResults.map((r, i) => (
                                    <div
                                        key={i}
                                        className={"test-result " + (r.pass ? "pass" : "fail")}
                                    >
                                        <span className="test-icon">{r.pass ? "✓" : "✗"}</span>
                                        <span className="test-desc">{describeTest(r.test)}</span>
                                        <span className="test-actual" data-tip={r.actual}>
                                            got: {r.actual.slice(0, 120) || "(empty)"}
                                        </span>
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
