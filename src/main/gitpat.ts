import { app, safeStorage } from "electron"
import { join } from "path"
import { readFileSync } from "fs"
import { atomicWrite } from "./atomic"

// Per-account Git personal access tokens, encrypted at rest (DPAPI via
// safeStorage, base64 fallback) - same scheme as DB passwords and AI keys.
// The plaintext token never goes to the renderer and never lands in
// settings.json: it's referenced only by git-account id, decrypted in the
// main process to cache into Git's credential store or verify against the host.

interface Store {
    pats: Record<string, string> // accountId -> "enc:"/"b64:" prefixed ciphertext
}

function storeFile(): string {
    return join(app.getPath("userData"), "gitpats.json")
}
function load(): Store {
    try {
        const s = JSON.parse(readFileSync(storeFile(), "utf8")) as Store
        return { pats: s.pats ?? {} }
    } catch {
        return { pats: {} }
    }
}
function save(store: Store): void {
    try {
        atomicWrite(storeFile(), JSON.stringify(store, null, 2))
    } catch (err) {
        console.error("[gitpat] failed to save:", err)
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
        console.error("[gitpat] failed to decrypt:", err)
    }
    return ""
}

/** Set (or clear, when pat is empty) the encrypted PAT for a git account. */
export function setPat(accountId: string, pat: string): void {
    if (!accountId) return
    const store = load()
    if (pat) store.pats[accountId] = encrypt(pat)
    else delete store.pats[accountId]
    save(store)
}

/** Map of accountId -> whether a PAT is stored (for the UI; no plaintext leaves main). */
export function status(): Record<string, boolean> {
    const out: Record<string, boolean> = {}
    for (const [id, enc] of Object.entries(load().pats)) out[id] = !!enc
    return out
}

export function clearPat(accountId: string): void {
    const store = load()
    delete store.pats[accountId]
    save(store)
}

/** Decrypt an account's PAT (main-process only). */
export function getPat(accountId: string): string {
    return decrypt(load().pats[accountId])
}
