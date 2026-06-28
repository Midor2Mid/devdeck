import { webContents } from "electron"

// Captures network activity from the embedded <webview> via the Chrome DevTools
// Protocol (attached in the main process to the webview's webContents).
export interface NetEntry {
    method: string
    url: string
    status: number
    type: string
    failed: boolean
}

const attached = new Set<number>()
const buffers = new Map<number, NetEntry[]>()
const pending = new Map<number, Map<string, NetEntry>>()
const CAP = 250

function cap(buf: NetEntry[]): void {
    if (buf.length > CAP) buf.splice(0, buf.length - CAP)
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
    pending.set(id, new Map())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wc.debugger.on("message", (_e, method: string, params: any) => {
        const reqs = pending.get(id)
        const buf = buffers.get(id)
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
}

export function getRecent(id: number, limit = 60): NetEntry[] {
    return (buffers.get(id) ?? []).slice(-limit)
}

export function detach(id: number): void {
    try {
        webContents.fromId(id)?.debugger.detach()
    } catch {
        /* ignore */
    }
    attached.delete(id)
    buffers.delete(id)
    pending.delete(id)
}
