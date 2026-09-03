import { useEffect, useMemo, useState } from "react"
import { Allotment } from "allotment"
import { useStore } from "../store"
import { useSettings, type SavedRequest, defaultAuth } from "../settings"
import { rowsFromPairs } from "./KeyValueEditor"
import type { NetCapture } from "../../../preload/index"

const UI_CAP = 2000

/** Convert a captured request into an editable API-client request to replay. */
function toApiRequest(c: NetCapture): SavedRequest {
    const headers = rowsFromPairs(
        Object.entries(c.reqHeaders ?? {}).map(([key, value]) => ({ key, value }))
    )
    const hasBody = !!c.reqBody && c.method !== "GET" && c.method !== "HEAD"
    return {
        id: crypto.randomUUID(),
        name: `${c.method} ${c.host}${c.path}`.slice(0, 60),
        method: c.method,
        url: c.url,
        params: [],
        headers,
        bodyType: hasBody ? "json" : "none",
        bodyText: hasBody ? c.reqBody : "",
        formRows: [],
        auth: defaultAuth()
    }
}

function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function statusClass(c: NetCapture): string {
    if (c.error) return "error"
    if (c.tunneled) return ""
    if (!c.status) return ""
    if (c.status < 300) return "ok"
    if (c.status < 400) return "redirect"
    return "error"
}

/** Pretty-print a JSON body; otherwise return it unchanged. */
function prettyBody(body: string, headers: Record<string, string>): string {
    const ct = headers["content-type"] ?? ""
    if (!body) return ""
    if (ct.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
        try {
            return JSON.stringify(JSON.parse(body), null, 2)
        } catch {
            /* not valid JSON - show raw */
        }
    }
    return body
}

function HeaderTable({ headers }: { headers: Record<string, string> }): JSX.Element {
    const entries = Object.entries(headers)
    if (entries.length === 0) return <div className="muted net-section-empty">No headers.</div>
    return (
        <table className="net-headers">
            <tbody>
                {entries.map(([k, v]) => (
                    <tr key={k}>
                        <td className="net-hk">{k}</td>
                        <td className="net-hv">{v}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

type InspectorTab = "headers" | "request" | "response"

function Inspector({
    capture,
    onSendToApi
}: {
    capture: NetCapture | null
    onSendToApi: (c: NetCapture) => void
}): JSX.Element {
    const [tab, setTab] = useState<InspectorTab>("headers")
    if (!capture) {
        return (
            <div className="empty-state">
                <p className="muted">Select a request to inspect it.</p>
            </div>
        )
    }
    const reqBody = prettyBody(capture.reqBody, capture.reqHeaders)
    const resBody = prettyBody(capture.resBody, capture.resHeaders)
    return (
        <div className="net-inspector">
            <div className="net-insp-head">
                <span className={"status " + statusClass(capture)}>
                    {capture.error
                        ? "error"
                        : capture.tunneled
                          ? "tunnel"
                          : `${capture.status || "—"} ${capture.statusText}`}
                </span>
                <span className="net-method">{capture.method}</span>
                <span className="net-insp-url" data-tip={capture.url}>
                    {capture.url}
                </span>
                <span className="spacer" />
                {!capture.tunneled && (
                    <button
                        className="net-to-api"
                        onClick={() => onSendToApi(capture)}
                        data-tip="Load this request into the API client to replay / edit"
                    >
                        → API
                    </button>
                )}
                <span className="muted small">{capture.timeMs} ms</span>
            </div>
            {capture.error && <div className="resp-error">{capture.error}</div>}
            <div className="net-insp-tabs">
                <button className={tab === "headers" ? "on" : ""} onClick={() => setTab("headers")}>
                    Headers
                </button>
                <button className={tab === "request" ? "on" : ""} onClick={() => setTab("request")}>
                    Request
                </button>
                <button
                    className={tab === "response" ? "on" : ""}
                    onClick={() => setTab("response")}
                >
                    Response
                </button>
            </div>
            <div className="net-insp-body">
                {capture.tunneled && (
                    <div className="muted net-note">
                        Encrypted HTTPS tunnel — payload isn't captured. Sent{" "}
                        {fmtBytes(capture.bytesOut)}, received {fmtBytes(capture.bytesIn)}.
                    </div>
                )}
                {tab === "headers" && (
                    <>
                        <div className="net-section-title">Request headers</div>
                        <HeaderTable headers={capture.reqHeaders} />
                        <div className="net-section-title">Response headers</div>
                        <HeaderTable headers={capture.resHeaders} />
                    </>
                )}
                {tab === "request" &&
                    (reqBody ? (
                        <pre className="net-pre">
                            {reqBody}
                            {capture.reqBodyTruncated ? "\n…(truncated)" : ""}
                        </pre>
                    ) : (
                        <div className="muted net-section-empty">No request body.</div>
                    ))}
                {tab === "response" &&
                    (resBody ? (
                        <pre className="net-pre">
                            {resBody}
                            {capture.resBodyTruncated ? "\n…(truncated)" : ""}
                        </pre>
                    ) : (
                        <div className="muted net-section-empty">No response body.</div>
                    ))}
            </div>
        </div>
    )
}

export function NetworkPanel(): JSX.Element {
    const activeId = useStore((s) => s.activeId)
    const setView = useStore((s) => s.setView)
    const setPendingApiRequest = useStore((s) => s.setPendingApiRequest)
    const port = useSettings((s) => s.network.port)
    const setNetwork = useSettings((s) => s.setNetwork)

    const sendToApi = (c: NetCapture): void => {
        setPendingApiRequest(toApiRequest(c))
        setView("api")
    }

    const [running, setRunning] = useState(false)
    const [captures, setCaptures] = useState<NetCapture[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [filter, setFilter] = useState("")
    const [thisProjectOnly, setThisProjectOnly] = useState(false)
    const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle")

    // Load current status + backlog, and subscribe to live captures.
    useEffect(() => {
        let alive = true
        window.api.proxy.status().then((s) => {
            if (!alive) return
            setRunning(s.running)
        })
        window.api.proxy.list().then((list) => {
            if (alive) setCaptures(list.slice(-UI_CAP))
        })
        const off = window.api.proxy.onCapture((c) => {
            setCaptures((prev) => {
                const next = [...prev, c]
                return next.length > UI_CAP ? next.slice(next.length - UI_CAP) : next
            })
        })
        return () => {
            alive = false
            off()
        }
    }, [])

    const toggleProxy = async (): Promise<void> => {
        const s = running ? await window.api.proxy.stop() : await window.api.proxy.start(port)
        setRunning(s.running)
    }

    const clear = async (): Promise<void> => {
        await window.api.proxy.clear()
        setCaptures([])
        setSelectedId(null)
    }

    const addr = `http://127.0.0.1:${port}`
    const copyAddr = async (): Promise<void> => {
        // See StandupModal: `navigator.clipboard` is denied in this renderer.
        // Await the answer: "copied!" over a write that never landed sends the
        // user to paste an address they do not have.
        const ok = await window.api.clipboard.writeText(addr)
        setCopied(ok ? "ok" : "fail")
        setTimeout(() => setCopied("idle"), ok ? 1200 : 2400)
    }

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase()
        return captures
            .filter((c) => !thisProjectOnly || c.projectId === activeId)
            .filter((c) => {
                if (!q) return true
                return (
                    `${c.method} ${c.host}${c.path} ${c.status}`.toLowerCase().includes(q)
                )
            })
            .slice()
            .reverse()
    }, [captures, filter, thisProjectOnly, activeId])

    const selected = captures.find((c) => c.id === selectedId) ?? null

    return (
        <div className="net-panel">
            <div className="net-toolbar">
                <button
                    className={"net-toggle" + (running ? " on" : "")}
                    onClick={toggleProxy}
                    data-tip={running ? "Stop the capture proxy" : "Start the capture proxy"}
                >
                    <span className={"net-dot " + (running ? "live" : "off")} />
                    {running ? "Capturing" : "Start proxy"}
                </button>

                <span className="net-port-wrap" data-tip="Proxy port (loopback only)">
                    <label className="muted small">port</label>
                    <input
                        className="net-port"
                        type="number"
                        value={port}
                        disabled={running}
                        onChange={(e) => setNetwork({ port: Number(e.target.value) || 8899 })}
                    />
                </span>

                <button
                    className="net-addr"
                    onClick={copyAddr}
                    data-tip={`Copy ${addr} — set HTTP_PROXY / HTTPS_PROXY to this`}
                >
                    {copied === "ok" ? "copied!" : copied === "fail" ? "couldn't copy" : addr}
                </button>

                <span className="spacer" />

                <input
                    className="net-filter"
                    placeholder="Filter by method / host / path / status"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <label className="net-check" data-tip="Only traffic captured while this project was active">
                    <input
                        type="checkbox"
                        checked={thisProjectOnly}
                        onChange={(e) => setThisProjectOnly(e.target.checked)}
                    />
                    This project
                </label>
                <span className="muted small net-count">
                    {filtered.length}/{captures.length}
                </span>
                <button onClick={clear} data-tip="Clear captured requests">
                    Clear
                </button>
            </div>

            <Allotment proportionalLayout={false}>
                <Allotment.Pane preferredSize={520}>
                    <div className="net-list">
                        {captures.length === 0 ? (
                            <div className="empty-state net-list-empty">
                                <p className="muted">No traffic captured yet.</p>
                                <p className="muted small">
                                    {running
                                        ? "Point a client at the proxy address above (set HTTP_PROXY / HTTPS_PROXY), then make a request."
                                        : "Start the proxy, then route a client's traffic through it."}
                                </p>
                            </div>
                        ) : (
                            <table className="net-table">
                                <thead>
                                    <tr>
                                        <th className="net-c-method">Method</th>
                                        <th className="net-c-status">Status</th>
                                        <th className="net-c-host">Host</th>
                                        <th className="net-c-path">Path</th>
                                        <th className="net-c-num">Time</th>
                                        <th className="net-c-num">Size</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((c) => (
                                        <tr
                                            key={c.id}
                                            className={c.id === selectedId ? "active" : ""}
                                            onClick={() => setSelectedId(c.id)}
                                        >
                                            <td className="net-c-method">{c.method}</td>
                                            <td className={"net-c-status status " + statusClass(c)}>
                                                {c.error
                                                    ? "ERR"
                                                    : c.tunneled
                                                      ? "—"
                                                      : c.status || "…"}
                                            </td>
                                            <td className="net-c-host" data-tip={c.host}>
                                                {c.host}
                                            </td>
                                            <td className="net-c-path" data-tip={c.path}>
                                                {c.path || (c.tunneled ? "(tunnel)" : "/")}
                                            </td>
                                            <td className="net-c-num">{c.timeMs}ms</td>
                                            <td className="net-c-num">{fmtBytes(c.bytesIn)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </Allotment.Pane>
                <Allotment.Pane>
                    <Inspector capture={selected} onSendToApi={sendToApi} />
                </Allotment.Pane>
            </Allotment>
        </div>
    )
}
