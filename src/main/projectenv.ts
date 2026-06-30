import { app, safeStorage } from "electron"
import { join } from "path"
import { readFileSync } from "fs"
import { atomicWrite } from "./atomic"

// Per-project environment variables, injected into every terminal / agent
// session spawned for that project. Values are encrypted at rest (DPAPI via
// safeStorage, base64 fallback) - same scheme as DB passwords / AI keys / PATs -
// since they often hold secrets (API keys, DB URLs). The whole pair list for a
// project is stored as one encrypted blob; the renderer only sees the plaintext
// while the editor is open, and injection happens here in the main process.

export interface EnvPair {
    key: string
    value: string
    enabled: boolean
}

interface Store {
    envs: Record<string, string> // projectId -> "enc:"/"b64:" prefixed JSON of EnvPair[]
}

function storeFile(): string {
    return join(app.getPath("userData"), "projectenv.json")
}
function load(): Store {
    try {
        const s = JSON.parse(readFileSync(storeFile(), "utf8")) as Store
        return { envs: s.envs ?? {} }
    } catch {
        return { envs: {} }
    }
}
function save(store: Store): void {
    try {
        atomicWrite(storeFile(), JSON.stringify(store, null, 2))
    } catch (err) {
        console.error("[projectenv] failed to save:", err)
    }
}

function encrypt(plain: string): string {
    if (!plain) return ""
    try {
        if (safeStorage.isEncryptionAvailable()) {
            return "enc:" + safeStorage.encryptString(plain).toString("base64")
        }
    } catch {
        /* fall through */
    }
    return "b64:" + Buffer.from(plain, "utf8").toString("base64")
}
function decrypt(enc?: string): string {
    if (!enc) return ""
    try {
        if (enc.startsWith("enc:")) {
            return safeStorage.decryptString(Buffer.from(enc.slice(4), "base64"))
        }
        if (enc.startsWith("b64:")) {
            return Buffer.from(enc.slice(4), "base64").toString("utf8")
        }
    } catch (err) {
        console.error("[projectenv] failed to decrypt:", err)
    }
    return ""
}

/** All stored pairs for a project (decrypted) - for the editor UI. */
export function getEnv(projectId: string): EnvPair[] {
    const enc = load().envs[projectId]
    if (!enc) return []
    try {
        const parsed = JSON.parse(decrypt(enc)) as EnvPair[]
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

/** Replace a project's env pairs (empty-keyed rows are dropped). */
export function setEnv(projectId: string, pairs: EnvPair[]): void {
    if (!projectId) return
    const store = load()
    const clean = (pairs ?? []).filter((p) => p.key.trim() !== "")
    if (clean.length) store.envs[projectId] = encrypt(JSON.stringify(clean))
    else delete store.envs[projectId]
    save(store)
}

/** The enabled key→value map injected into a project's terminals (main only). */
export function envMap(projectId: string): Record<string, string> {
    const out: Record<string, string> = {}
    if (!projectId) return out
    for (const p of getEnv(projectId)) {
        const k = p.key.trim()
        if (p.enabled && k) out[k] = p.value
    }
    return out
}
