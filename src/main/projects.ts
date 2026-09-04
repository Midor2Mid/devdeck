import { app, dialog, BrowserWindow } from "electron"
import { join, basename } from "path"
import { statSync } from "fs"
import { stat } from "fs/promises"
import { randomUUID } from "crypto"
import { atomicWrite } from "./atomic"
import { readJson } from "./readJson"

export interface Project {
    id: string
    name: string
    path: string
    addedAt: number
    group?: string
    emoji?: string
    color?: string
}

export interface ProjectStore {
    projects: Project[]
    activeId: string | null
    /**
     * Set when projects.json exists but could not be read. Every mutator refuses
     * to save while it is set, so the list you are looking at is the last one we
     * managed to read - not the truth on disk, and not something to write back.
     */
    unreadable?: boolean
}

function storeFile(): string {
    return join(app.getPath("userData"), "projects.json")
}

// The last store we successfully read. Main is both reader and writer here, and
// every mutator is `load(); mutate; save()` - so without this, one unreadable
// read turns the very next click into a save of an empty store over the user's
// projects. It also keeps `guardPath`'s roots (index.ts) alive through a
// transient lock; an empty root list makes the guard deny every path.
let lastGood: ProjectStore | null = null
// Latched by an `unreadable` read, cleared by any successful one. `save()`
// refuses while it is set.
let readFailed = false

function empty(): ProjectStore {
    return { projects: [], activeId: null }
}

function load(): ProjectStore {
    const res = readJson<ProjectStore>(storeFile())
    if (res.ok) {
        readFailed = false
        lastGood = {
            projects: Array.isArray(res.data?.projects) ? res.data.projects : [],
            activeId: res.data?.activeId ?? null
        }
        return { ...lastGood, projects: [...lastGood.projects] }
    }
    if (res.reason === "missing") {
        // A legitimate first run (or the file was removed). An empty base is the
        // correct answer, and saving over nothing destroys nothing.
        readFailed = false
        return lastGood ? { ...lastGood, projects: [...lastGood.projects] } : empty()
    }
    readFailed = true
    const base = lastGood ? { ...lastGood, projects: [...lastGood.projects] } : empty()
    return { ...base, unreadable: true }
}

function save(store: ProjectStore): void {
    if (readFailed) {
        console.error(
            "[projects] refusing to save: projects.json exists but could not be read;" +
                " writing now would replace it with an incomplete store"
        )
        return
    }
    try {
        const { unreadable: _unreadable, ...clean } = store
        atomicWrite(storeFile(), JSON.stringify(clean, null, 2))
    } catch (err) {
        console.error("[projects] failed to save:", err)
    }
}

export function listProjects(): ProjectStore {
    return load()
}

/**
 * What DevDeck knows about a project's folder.
 *
 * Three states, and the third is not a weaker second. `missing` is a fact about
 * the FOLDER - the OS answered, and the answer was "nothing there". `unchecked`
 * is a fact about US: the stat itself failed or never came back, so nothing
 * about the project is qualified, only our knowledge of it. Collapsing the two
 * would let a locked-down drive or a sleeping NAS read as a deleted folder.
 *
 * There is deliberately no fourth state for "not probed yet": the absence of an
 * entry is that state, and it renders as nothing at all.
 */
export type FolderState = "ok" | "missing" | "unchecked"

/**
 * How long we wait for one stat. A path on a disconnected network share can
 * block far longer than any UI should, and a probe that never returns would
 * leave the marker in "not yet checked" forever - which reads as healthy.
 */
const PROBE_TIMEOUT_MS = 2000

/**
 * Does this folder resolve?
 *
 * `fs/promises` rather than `statSync`: this runs on a poll, and a synchronous
 * stat against an unmounted drive freezes the main process - every terminal,
 * every IPC reply - for as long as the OS takes to answer.
 */
export async function probeProject(
    path: string,
    timeoutMs: number = PROBE_TIMEOUT_MS
): Promise<FolderState> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            stat(path).then(
                // A FILE at the project's path is not the folder, and the OS
                // answered plainly - so that is `missing`, not `unchecked`.
                (st) => (st.isDirectory() ? ("ok" as const) : ("missing" as const)),
                (err: NodeJS.ErrnoException) =>
                    // Only these two are proof of absence. Everything else -
                    // EACCES, EPERM, EBUSY, an unreachable host - is a failure
                    // to look, and saying "missing" there would attribute to
                    // the folder what belongs to the attempt. Same rule as the
                    // pty cwd guard, which refuses either way but says only
                    // what it can see.
                    err.code === "ENOENT" || err.code === "ENOTDIR"
                        ? ("missing" as const)
                        : ("unchecked" as const)
            ),
            new Promise<FolderState>((resolve) => {
                timer = setTimeout(() => resolve("unchecked"), timeoutMs)
            })
        ])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/**
 * Every known project's folder state, keyed by project id.
 *
 * Takes no path from the renderer on purpose: it probes what is already in the
 * store, so this channel cannot be used to ask whether an arbitrary path
 * exists. An unreadable store yields `{}` - no claim about projects we could
 * not read.
 *
 * Sequential, not `Promise.all`: libuv's default thread pool is four threads,
 * and a timed-out stat keeps holding one until the OS gives up. Four dead
 * network paths probed at once would stall every other fs operation in main.
 */
export async function probeProjects(): Promise<Record<string, FolderState>> {
    const store = load()
    if (store.unreadable) return {}
    const out: Record<string, FolderState> = {}
    for (const p of store.projects) out[p.id] = await probeProject(p.path)
    return out
}

export async function addProject(win: BrowserWindow): Promise<ProjectStore> {
    const res = await dialog.showOpenDialog(win, {
        // The dialog's own title is the fifth label this one act used to ship.
        // No ellipsis here: an ellipsis promises a further dialog, and this IS
        // the dialog.
        title: "Open folder",
        properties: ["openDirectory"]
    })
    const store = load()
    if (store.unreadable) return store // damaged on disk - do not mutate what we could not read
    if (res.canceled || !res.filePaths[0]) return store

    const path = res.filePaths[0]
    const existing = store.projects.find((p) => p.path === path)
    if (existing) {
        store.activeId = existing.id
    } else {
        const project: Project = {
            id: randomUUID(),
            name: basename(path) || path,
            path,
            addedAt: Date.now()
        }
        store.projects.push(project)
        store.activeId = project.id
    }
    save(store)
    return store
}

/** Add a project from a known folder path (e.g. a drag-and-drop onto the window). */
export function addProjectByPath(path: string): ProjectStore {
    const store = load()
    if (store.unreadable) return store // damaged on disk - do not mutate what we could not read
    try {
        if (!statSync(path).isDirectory()) return store
    } catch {
        return store // not a real directory
    }
    const existing = store.projects.find((p) => p.path === path)
    if (existing) {
        store.activeId = existing.id
    } else {
        const project: Project = {
            id: randomUUID(),
            name: basename(path) || path,
            path,
            addedAt: Date.now()
        }
        store.projects.push(project)
        store.activeId = project.id
    }
    save(store)
    return store
}

/**
 * What `Locate...` did, alongside the store it produced.
 *
 * The other projects:* channels return a bare `ProjectStore`, and that is
 * enough for them because they cannot half-succeed. This one can: the folder
 * chosen may already be open under another project, and the notice bar has to
 * say so rather than leaving the user clicking a button that appears to do
 * nothing.
 */
export interface RelocateResult {
    store: ProjectStore
    outcome: "relocated" | "canceled" | "duplicate" | "unreadable"
}

/**
 * Point an existing project at a folder the user picks, keeping its id - and
 * therefore its tabs, its remembered view and its saved layouts, which are all
 * keyed by id. Re-adding the folder as a new project would have lost every one
 * of them.
 *
 * The project's NAME is deliberately left alone. It was derived from the
 * folder's basename when the project was added, but the user may have changed
 * it since, and a repair action that silently renames what is on screen is a
 * second surprise on top of the one they came here to fix.
 */
export async function relocateProject(id: string, win: BrowserWindow): Promise<RelocateResult> {
    const res = await dialog.showOpenDialog(win, {
        title: "Locate folder",
        properties: ["openDirectory"]
    })
    const store = load()
    if (store.unreadable) return { store, outcome: "unreadable" }
    if (res.canceled || !res.filePaths[0]) return { store, outcome: "canceled" }
    const path = res.filePaths[0]
    const project = store.projects.find((p) => p.id === id)
    if (!project) return { store, outcome: "canceled" }
    if (store.projects.some((p) => p.id !== id && p.path === path)) {
        // One path, one project is an invariant every other entry point keeps
        // (both add paths dedupe on it), and breaking it here would give the
        // switcher two cards for one folder with two separate tab sets.
        return { store, outcome: "duplicate" }
    }
    project.path = path
    store.activeId = project.id
    save(store)
    return { store, outcome: "relocated" }
}

export function removeProject(id: string): ProjectStore {
    const store = load()
    if (store.unreadable) return store // damaged on disk - do not mutate what we could not read
    store.projects = store.projects.filter((p) => p.id !== id)
    if (store.activeId === id) {
        store.activeId = store.projects[0]?.id ?? null
    }
    save(store)
    return store
}

export function setGroup(id: string, group: string): ProjectStore {
    const store = load()
    if (store.unreadable) return store // damaged on disk - do not mutate what we could not read
    const project = store.projects.find((p) => p.id === id)
    if (project) {
        project.group = group.trim() || undefined
        save(store)
    }
    return store
}

export function setMeta(id: string, meta: { emoji?: string; color?: string }): ProjectStore {
    const store = load()
    if (store.unreadable) return store // damaged on disk - do not mutate what we could not read
    const project = store.projects.find((p) => p.id === id)
    if (project) {
        if ("emoji" in meta) project.emoji = meta.emoji?.trim() || undefined
        if ("color" in meta) project.color = meta.color || undefined
        save(store)
    }
    return store
}

export function setActive(id: string): ProjectStore {
    const store = load()
    if (store.unreadable) return store // damaged on disk - do not mutate what we could not read
    if (store.projects.some((p) => p.id === id)) {
        store.activeId = id
        save(store)
    }
    return store
}
