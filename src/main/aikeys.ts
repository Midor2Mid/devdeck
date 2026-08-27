import { app, safeStorage } from "electron"
import { join } from "path"
import { atomicWrite } from "./atomic"
import { readJson } from "./readJson"

// Per-agent API keys, encrypted at rest (DPAPI via safeStorage, base64 fallback).
// Same scheme as DB passwords: the plaintext key never goes to the renderer and
// never lands in settings.json - it's referenced only by agent id, decrypted in
// the main process and injected into that agent's terminal env at spawn.

interface Store {
    keys: Record<string, string> // agentId -> "enc:"/"b64:" prefixed ciphertext
}

function storeFile(): string {
    return join(app.getPath("userData"), "aikeys.json")
}
// Latched by a read that failed on a file that exists. `save()` refuses while
// it is set: an unreadable store used to read back as "no key configured",
// and the next save committed that emptiness - silently destroying every stored
// key while `status()` still reported them as present.
let readFailed = false

function load(): Store {
    const res = readJson<Store>(storeFile())
    if (res.ok) {
        readFailed = false
        return { keys: res.data?.keys ?? {} }
    }
    readFailed = res.reason === "unreadable"
    return { keys: {} }
}
function save(store: Store): void {
    if (readFailed) {
        console.error(
            "[aikeys] refusing to save: the store exists but could not be read;" +
                " writing now would delete every stored key"
        )
        return
    }
    try {
        atomicWrite(storeFile(), JSON.stringify(store, null, 2))
    } catch (err) {
        console.error("[aikeys] failed to save:", err)
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
        console.error("[aikeys] failed to decrypt:", err)
    }
    return ""
}

/** Set (or clear, when key is empty) the encrypted API key for an agent. */
export function setKey(agentId: string, key: string): void {
    if (!agentId) return
    const store = load()
    if (key) store.keys[agentId] = encrypt(key)
    else delete store.keys[agentId]
    save(store)
}

/** Map of agentId -> whether a key is stored (for the UI; no plaintext leaves main). */
export function status(): Record<string, boolean> {
    const out: Record<string, boolean> = {}
    for (const [id, enc] of Object.entries(load().keys)) out[id] = !!enc
    return out
}

export function clearKey(agentId: string): void {
    const store = load()
    delete store.keys[agentId]
    save(store)
}

/** Decrypt an agent's key (main-process only - for env injection at pty spawn). */
export function getKey(agentId: string): string {
    return decrypt(load().keys[agentId])
}
