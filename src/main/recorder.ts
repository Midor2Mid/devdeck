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
    /**
     * Where this recording will be written, decided at `start`.
     *
     * It used to be supplied at `stop` by the renderer, which meant the only
     * process that knew the destination was the one being torn down: main could
     * not flush an in-progress recording on quit, because it had nowhere to put
     * it. Owning the path here is what makes `flushAll()` possible.
     */
    projectPath: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (d: any) => void
}

const active = new Map<string, ActiveRec>()

export function startRecording(termId: string, projectPath: string): void {
    if (active.has(termId)) return
    const state: ActiveRec = {
        last: Date.now(),
        events: [],
        projectPath,
        handler: () => undefined
    }
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

/**
 * Stop recording and save to <project>/.devdeck/recordings/<ts>.json.
 *
 * Order matters and is the reverse of what it used to be: the file is written
 * **first**, and only a successful write detaches the pty listener and drops
 * the in-memory events. Previously a failed write - a read-only directory, a
 * project folder deleted mid-recording, a full disk - threw *after* the only
 * copy of the events had already been deleted from `active`, so the throw the
 * caller saw was the sound of the recording being destroyed rather than a
 * chance to retry. `devices.ts` spends nine lines explaining this exact order
 * for a store whose loss is recoverable; this one's is not.
 *
 * The destination is the one captured at `start`, not one the caller supplies:
 * the renderer no longer has the ability to be wrong about where a recording
 * goes.
 */
export function stopRecording(termId: string, label: string): RecordingMeta | null {
    const s = active.get(termId)
    if (!s) return null
    const rec: Recording = { label, createdAt: Date.now(), events: s.events }
    // The project could have been removed while the recording ran; recreate the
    // directory at write time rather than trusting the one that existed at start.
    mkdirSync(dir(s.projectPath), { recursive: true })
    const safe = label.replace(/[^\w.\-]/g, "_") || "session"
    const file = join(dir(s.projectPath), `${rec.createdAt}-${safe}.json`)
    atomicWrite(file, JSON.stringify(rec))
    // Written. Only now is it safe to lose the events.
    ptyEvents.off("data", s.handler)
    active.delete(termId)
    return { name: safe, path: file, label, createdAt: rec.createdAt, events: rec.events.length }
}

/**
 * Write every in-progress recording, for the teardown path.
 *
 * Called from `before-quit`, where nothing is going to ask the renderer
 * anything. A recording that cannot be written is skipped rather than allowed
 * to abort the quit - a quit that fails is worse than a recording that is lost,
 * and unlike `stopRecording` there is no caller left to report to.
 */
export function flushAll(label = "session"): void {
    for (const termId of [...active.keys()]) {
        try {
            stopRecording(termId, label)
        } catch {
            /* a quit must not be blocked by a recording that will not write */
        }
    }
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
