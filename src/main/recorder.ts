import { readFileSync, readdirSync, mkdirSync } from "fs"
import { join } from "path"
import { ptyEvents } from "./pty"
import { atomicWrite } from "./atomic"

export interface RecEvent {
    dt: number // ms since previous event
    data: string
}
export interface Recording {
    label: string
    createdAt: number
    events: RecEvent[]
}
export interface RecordingMeta {
    name: string
    path: string
    label: string
    createdAt: number
    events: number
}

interface ActiveRec {
    last: number
    events: RecEvent[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (d: any) => void
}

const active = new Map<string, ActiveRec>()

export function startRecording(termId: string): void {
    if (active.has(termId)) return
    const state: ActiveRec = { last: Date.now(), events: [], handler: () => undefined }
    state.handler = (d: { id: string; data: string }): void => {
        if (d.id !== termId) return
        const now = Date.now()
        state.events.push({ dt: Math.min(now - state.last, 5000), data: d.data })
        state.last = now
    }
    ptyEvents.on("data", state.handler)
    active.set(termId, state)
}

export function isRecording(termId: string): boolean {
    return active.has(termId)
}

function dir(projectPath: string): string {
    return join(projectPath, ".devdeck", "recordings")
}

/** Stop recording and save to <project>/.devdeck/recordings/<ts>.json. */
export function stopRecording(termId: string, projectPath: string, label: string): RecordingMeta | null {
    const s = active.get(termId)
    if (!s) return null
    ptyEvents.off("data", s.handler)
    active.delete(termId)
    const rec: Recording = { label, createdAt: Date.now(), events: s.events }
    mkdirSync(dir(projectPath), { recursive: true })
    const safe = label.replace(/[^\w.\-]/g, "_") || "session"
    const file = join(dir(projectPath), `${rec.createdAt}-${safe}.json`)
    atomicWrite(file, JSON.stringify(rec))
    return { name: safe, path: file, label, createdAt: rec.createdAt, events: rec.events.length }
}

export function listRecordings(projectPath: string): RecordingMeta[] {
    try {
        return readdirSync(dir(projectPath))
            .filter((f) => f.endsWith(".json"))
            .map((f) => {
                const path = join(dir(projectPath), f)
                try {
                    const r = JSON.parse(readFileSync(path, "utf8")) as Recording
                    return {
                        name: f,
                        path,
                        label: r.label ?? f,
                        createdAt: r.createdAt ?? 0,
                        events: r.events?.length ?? 0
                    }
                } catch {
                    return { name: f, path, label: f, createdAt: 0, events: 0 }
                }
            })
            .sort((a, b) => b.createdAt - a.createdAt)
    } catch {
        return []
    }
}

export function loadRecording(path: string): Recording {
    return JSON.parse(readFileSync(path, "utf8")) as Recording
}
