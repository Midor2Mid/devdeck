import { app, safeStorage } from "electron"
import { join } from "path"
import { atomicWrite } from "./atomic"
import { readJson } from "./readJson"

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
// Latched by a read that failed on a file that exists. `save()` refuses while
// it is set: an unreadable store used to read back as "no token configured",
// and the next save committed that emptiness - silently destroying every stored
// token while `status()` still reported them as present.
let readFailed = false

function load(): Store {
    const res = readJson<Store>(storeFile())
    if (res.ok) {
        readFailed = false
        return { pats: res.data?.pats ?? {} }
    }
    readFailed = res.reason === "unreadable"
    return { pats: {} }
}
/** Returns whether the store actually reached disk. */
function save(store: Store): boolean {
    if (readFailed) {
        console.error(
            "[gitpat] refusing to save: the store exists but could not be read;" +
                " writing now would delete every stored token"
        )
        return false
    }
    try {
        atomicWrite(storeFile(), JSON.stringify(store, null, 2))
        return true
    } catch (err) {
        console.error("[gitpat] failed to save:", err)
        return false
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

/**
 * Forget an account's PAT, reporting whether it is really gone.
 *
 * `void` let the caller remove the row from the UI while the encrypted token
 * stayed on disk - the store refuses to save when it could not be read, exactly
 * so it never destroys tokens, and that refusal was invisible here.
 */
export function clearPat(accountId: string): boolean {
    const store = load()
    delete store.pats[accountId]
    return save(store)
}

/** Decrypt an account's PAT (main-process only). */
export function getPat(accountId: string): string {
    return decrypt(load().pats[accountId])
}
