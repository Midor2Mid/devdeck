import { app, dialog, BrowserWindow } from "electron"
import { join, basename } from "path"
import { statSync } from "fs"
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
