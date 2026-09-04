import { webContents } from "electron"

// Captures network *and* console activity from the embedded <webview> via the
// Chrome DevTools Protocol (attached in the main process to the webview's
// webContents). Both buffers feed the Browser panel's `-> Agent` payload and
// the MCP tools that let an agent read what the page actually did. (They fed the
// Network view too, until 4a5c936 deleted it - this module is not that proxy.)
export interface NetEntry {
    method: string
    url: string
    status: number
    type: string
    failed: boolean
}

/** A console message, a `Log` entry, or an uncaught exception from the page. */
export interface ConsoleEntry {
    /** log | debug | info | warning | error (CDP levels, normalised). */
    level: string
    text: string
    /** Source location, when the protocol gives us one. */
    url?: string
    line?: number
}

const attached = new Set<number>()
const buffers = new Map<number, NetEntry[]>()
const logs = new Map<number, ConsoleEntry[]>()
const pending = new Map<number, Map<string, NetEntry>>()
const CAP = 250

function cap<T>(buf: T[]): void {
    if (buf.length > CAP) buf.splice(0, buf.length - CAP)
}

/** Render one CDP RemoteObject the way DevTools shows it in a collapsed row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function one(a: any): string {
    if (!a) return ""
    if (a.type === "string") return String(a.value ?? "")
    if ("value" in a && a.value !== undefined) return JSON.stringify(a.value)
    // Objects arrive unserialised unless we ask for it; the preview is what
    // DevTools itself shows before you expand the row.
    if (a.preview?.properties) {
        const inner = a.preview.properties
            .map((p: { name: string; value?: string }) => `${p.name}: ${p.value ?? ""}`)
            .join(", ")
        return `${a.className ?? a.subtype ?? a.type}{${inner}}`
    }
    return a.description ?? a.className ?? a.type ?? ""
}

/**
 * Flatten a console call into the text a human would see.
 *
 * The first argument may be a printf-style format string, and libraries lean on
 * it heavily — Electron's own security warnings use `%c` with a CSS argument. A
 * naive join renders those as `"%cWarning… font-weight: bold"`, i.e. the styling
 * leaks into the message and the directive stays in it. So substitute properly:
 * `%c` consumes its argument and emits nothing (we can't show colour in text),
 * `%s/%d/%i/%f/%o/%O/%j` consume and render, and `%%` is a literal percent.
 */
// Exported for unit tests — the substitution rules are fiddly enough to pin down.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function argText(args: any[]): string {
    if (!Array.isArray(args) || args.length === 0) return ""
    const first = args[0]
    const rest = args.slice(1)

    if (first?.type !== "string" || !String(first.value ?? "").includes("%")) {
        return args.map(one).filter(Boolean).join(" ")
    }

    let next = 0
    const out = String(first.value ?? "").replace(/%([%csdifoOj])/g, (m, spec: string) => {
        if (spec === "%") return "%"
        if (next >= rest.length) return m // more directives than arguments
        const arg = rest[next++]
        if (spec === "c") return "" // a style argument — consumed, not shown
        if (spec === "d" || spec === "i") {
            const n = Number(arg?.value)
            return Number.isFinite(n) ? String(Math.trunc(n)) : one(arg)
        }
        if (spec === "f") {
            const n = Number(arg?.value)
            return Number.isFinite(n) ? String(n) : one(arg)
        }
        return one(arg)
    })

    // Anything the format string didn't consume still gets logged after it.
    const trailing = rest.slice(next).map(one).filter(Boolean)
    return [out.trim(), ...trailing].filter(Boolean).join(" ")
}

export function attach(id: number): void {
    if (attached.has(id)) return
    const wc = webContents.fromId(id)
    if (!wc) return
    try {
        wc.debugger.attach("1.3")
    } catch {
        return // already attached (e.g. devtools open) - skip
    }
    attached.add(id)
    buffers.set(id, [])
    logs.set(id, [])
    pending.set(id, new Map())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wc.debugger.on("message", (_e, method: string, params: any) => {
        const reqs = pending.get(id)
        const buf = buffers.get(id)
        const log = logs.get(id)
        if (log) {
            if (method === "Runtime.consoleAPICalled") {
                log.push({
                    level: params.type === "warning" ? "warning" : (params.type ?? "log"),
                    text: argText(params.args),
                    url: params.stackTrace?.callFrames?.[0]?.url,
                    line: params.stackTrace?.callFrames?.[0]?.lineNumber
                })
                cap(log)
            } else if (method === "Runtime.exceptionThrown") {
                const d = params.exceptionDetails ?? {}
                log.push({
                    level: "error",
                    text:
                        d.exception?.description ??
                        d.text ??
                        d.exception?.value ??
                        "Uncaught exception",
                    url: d.url,
                    line: d.lineNumber
                })
                cap(log)
            } else if (method === "Log.entryAdded") {
                // Browser-side messages the page never logged itself: failed
                // subresources, CSP violations, deprecations.
                log.push({
                    level: params.entry?.level ?? "info",
                    text: params.entry?.text ?? "",
                    url: params.entry?.url,
                    line: params.entry?.lineNumber
                })
                cap(log)
            }
        }
        if (!reqs || !buf) return
        if (method === "Network.requestWillBeSent") {
            reqs.set(params.requestId, {
                method: params.request?.method ?? "GET",
                url: params.request?.url ?? "",
                status: 0,
                type: params.type ?? "",
                failed: false
            })
        } else if (method === "Network.responseReceived") {
            const e = reqs.get(params.requestId)
            if (e) {
                e.status = params.response?.status ?? 0
                e.type = params.type ?? e.type
            }
        } else if (method === "Network.loadingFinished") {
            const e = reqs.get(params.requestId)
            if (e) {
                buf.push(e)
                reqs.delete(params.requestId)
                cap(buf)
            }
        } else if (method === "Network.loadingFailed") {
            const e = reqs.get(params.requestId)
            if (e) {
                e.failed = true
                buf.push(e)
                reqs.delete(params.requestId)
                cap(buf)
            }
        }
    })
    wc.debugger.on("detach", () => attached.delete(id))
    wc.debugger.sendCommand("Network.enable").catch(() => undefined)
    // Runtime gives us console.* and uncaught exceptions; Log gives us the
    // browser's own messages (blocked subresources, CSP, deprecations).
    wc.debugger.sendCommand("Runtime.enable").catch(() => undefined)
    wc.debugger.sendCommand("Log.enable").catch(() => undefined)
}

export function getRecent(id: number, limit = 60): NetEntry[] {
    return (buffers.get(id) ?? []).slice(-limit)
}

export function getConsole(id: number, limit = 100): ConsoleEntry[] {
    return (logs.get(id) ?? []).slice(-limit)
}

/**
 * The pages currently being captured, with their live URL. Callers that aren't
 * the Browser panel (the MCP tools) have no way to know a webContents id, so
 * this is how they discover what's attached. Dead ids are pruned as we go.
 */
export function attachedPages(): { id: number; url: string; title: string }[] {
    const out: { id: number; url: string; title: string }[] = []
    for (const id of attached) {
        const wc = webContents.fromId(id)
        if (!wc || wc.isDestroyed()) {
            attached.delete(id)
            continue
        }
        out.push({ id, url: wc.getURL(), title: wc.getTitle() })
    }
    return out
}

export function detach(id: number): void {
    try {
        webContents.fromId(id)?.debugger.detach()
    } catch {
        /* ignore */
    }
    attached.delete(id)
    buffers.delete(id)
    logs.delete(id)
    pending.delete(id)
}
