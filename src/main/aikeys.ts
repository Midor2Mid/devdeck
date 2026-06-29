import { app, safeStorage } from "electron"
import { join } from "path"
import { readFileSync } from "fs"
import { atomicWrite } from "./atomic"

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
function load(): Store {
    try {
        const s = JSON.parse(readFileSync(storeFile(), "utf8")) as Store
        return { keys: s.keys ?? {} }
    } catch {
        return { keys: {} }
    }
}
function save(store: Store): void {
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
