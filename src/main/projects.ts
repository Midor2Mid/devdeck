import { app, dialog, BrowserWindow } from "electron"
import { join, basename } from "path"
import { readFileSync, writeFileSync } from "fs"
import { randomUUID } from "crypto"

export interface Project {
    id: string
    name: string
    path: string
    addedAt: number
}

export interface ProjectStore {
    projects: Project[]
    activeId: string | null
}

function storeFile(): string {
    return join(app.getPath("userData"), "projects.json")
}

function load(): ProjectStore {
    try {
        return JSON.parse(readFileSync(storeFile(), "utf8")) as ProjectStore
    } catch {
        return { projects: [], activeId: null }
    }
}

function save(store: ProjectStore): void {
    try {
        writeFileSync(storeFile(), JSON.stringify(store, null, 2), "utf8")
    } catch (err) {
        console.error("[projects] failed to save:", err)
    }
}

export function listProjects(): ProjectStore {
    return load()
}

export async function addProject(win: BrowserWindow): Promise<ProjectStore> {
    const res = await dialog.showOpenDialog(win, {
        title: "Add a project folder",
        properties: ["openDirectory"]
    })
    const store = load()
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

export function removeProject(id: string): ProjectStore {
    const store = load()
    store.projects = store.projects.filter((p) => p.id !== id)
    if (store.activeId === id) {
        store.activeId = store.projects[0]?.id ?? null
    }
    save(store)
    return store
}

export function setActive(id: string): ProjectStore {
    const store = load()
    if (store.projects.some((p) => p.id === id)) {
        store.activeId = id
        save(store)
    }
    return store
}
