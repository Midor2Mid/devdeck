import { watch, type FSWatcher } from "fs"
import { matchGlob, normalizeRel } from "./glob"

/**
 * File-watch triggers for agent pipelines. Each enabled trigger watches a
 * project directory; when a file matching its glob changes, the trigger fires
 * (debounced) and the renderer decides whether to run the pipeline. Watching +
 * matching live in main; pipeline orchestration stays in the renderer.
 */

export interface PipelineTrigger {
    id: string
    enabled: boolean
    pipelineId: string
    /** Project directory to watch (recursively). */
    projectPath: string
    /** Glob to match changed files (relative path). "" = any file. */
    glob: string
    /** Quiet period after the last change before firing, ms. */
    debounceMs: number
}

// Directories whose churn should never trigger a pipeline.
const IGNORE = /(^|[/\\])(node_modules|\.git|\.devdeck|dist|out|release|\.next|\.cache|coverage)([/\\]|$)/

type Notify = (triggerId: string) => void

interface Active {
    watcher: FSWatcher
    timer: ReturnType<typeof setTimeout> | null
}

const active = new Map<string, Active>()
let notifyFn: Notify = () => undefined

export function onTriggerFired(fn: Notify): void {
    notifyFn = fn
}

function startOne(t: PipelineTrigger): void {
    let watcher: FSWatcher
    try {
        watcher = watch(t.projectPath, { recursive: true }, (_event, filename) => {
            if (!filename) return
            const rel = normalizeRel(typeof filename === "string" ? filename : (filename as Buffer).toString())
            if (IGNORE.test(rel)) return
            if (!matchGlob(t.glob, rel)) return
            const a = active.get(t.id)
            if (!a) return
            if (a.timer) clearTimeout(a.timer)
            a.timer = setTimeout(() => notifyFn(t.id), Math.max(200, t.debounceMs || 800))
        })
    } catch {
        return // path gone / not watchable - skip silently
    }
    watcher.on("error", () => stopOne(t.id))
    active.set(t.id, { watcher, timer: null })
}

function stopOne(id: string): void {
    const a = active.get(id)
    if (!a) return
    if (a.timer) clearTimeout(a.timer)
    try {
        a.watcher.close()
    } catch {
        /* already closed */
    }
    active.delete(id)
}

/** Reconcile live watchers to exactly the enabled triggers in `list`. */
export function applyTriggers(list: PipelineTrigger[]): void {
    const wanted = new Map(list.filter((t) => t.enabled && t.projectPath).map((t) => [t.id, t]))
    // Drop watchers no longer wanted.
    for (const id of [...active.keys()]) if (!wanted.has(id)) stopOne(id)
    // Restart wanted ones (cheap; ensures path/glob changes take effect).
    for (const [id, t] of wanted) {
        stopOne(id)
        startOne(t)
    }
}

export function stopAllTriggers(): void {
    for (const id of [...active.keys()]) stopOne(id)
}
