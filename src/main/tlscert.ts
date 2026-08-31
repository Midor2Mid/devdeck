import { app } from "electron"
import { join } from "path"
import { readFileSync, existsSync } from "fs"
import { atomicWrite } from "./atomic"
import { generate } from "selfsigned"

// A long-lived self-signed cert/key for the remote server's HTTPS/WSS option.
// Cached in userData and reused as long as it still covers the current LAN /
// Tailscale IPs (so the SANs match). Self-signed means the phone shows a
// one-time "not private" warning - the point is to encrypt the link on plain
// LAN, and to let the session cookie carry `Secure` + the `__Host-` prefix
// (guards.ts).
//
// What it does NOT buy is a secure context: clicking through the interstitial
// marks the origin insecure for that session, so `serviceWorker.register` and
// `PushManager` stay refused, and iOS Safari offers no path to trust it at all.
// This file used to claim it "unlocks reliable mobile push". It does not, and a
// trusted certificate (e.g. `tailscale cert`) is what would.

interface CachedCert {
    key: string
    cert: string
    ips: string[]
}

function certFile(): string {
    return join(app.getPath("userData"), "remote-tls.json")
}

/** Get (generating + caching if needed) a cert/key whose SANs cover these IPs. */
export async function getCert(ips: string[]): Promise<{ key: string; cert: string }> {
    try {
        if (existsSync(certFile())) {
            const c = JSON.parse(readFileSync(certFile(), "utf8")) as CachedCert
            if (c.key && c.cert && ips.every((ip) => c.ips?.includes(ip))) {
                return { key: c.key, cert: c.cert }
            }
        }
    } catch {
        /* regenerate below */
    }

    const altNames = [
        { type: 2 as const, value: "localhost" },
        { type: 7 as const, ip: "127.0.0.1" },
        ...ips.map((ip) => ({ type: 7 as const, ip }))
    ]
    const pems = await generate([{ name: "commonName", value: "DevDeck Remote" }], {
        keySize: 2048,
        algorithm: "sha256",
        // ~10 years; the cert is personal-use and pinned by the user accepting it once.
        notAfterDate: new Date(Date.UTC(new Date().getUTCFullYear() + 10, 0, 1)),
        extensions: [
            { name: "basicConstraints", cA: false },
            { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
            { name: "extKeyUsage", serverAuth: true },
            { name: "subjectAltName", altNames }
        ]
    })

    const out: CachedCert = { key: pems.private, cert: pems.cert, ips }
    try {
        atomicWrite(certFile(), JSON.stringify(out))
    } catch (err) {
        console.error("[tlscert] failed to cache cert:", err)
    }
    return { key: out.key, cert: out.cert }
}
