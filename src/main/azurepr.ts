import { app, safeStorage } from "electron"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { request as httpsRequest } from "https"
import { request as httpRequest } from "http"
import { connect as tlsConnect } from "tls"
import type { Socket } from "net"
import { URL } from "url"

/**
 * Azure DevOps pull-request creation. What is left of `work.ts`.
 *
 * 0.14.0 deleted the Work panel and was written up as having deleted the
 * backend with it. It had not: `createAzurePr` here is still registered as
 * `pr:createAzure` and still called by the PR modal, so finishing that
 * deletion meant shrinking this file to the Azure PR path rather than
 * removing it. Everything the panel owned - the Jira and Azure work-item
 * fetchers, the config read/write, the connection test, the description
 * flatteners - is gone.
 *
 * **Nothing here writes to disk, deliberately.** `work.json` in userData
 * still holds the Jira API token, the Azure PAT and the per-provider
 * insecure-TLS flags, and this module no longer offers any way to set them.
 * D1's ruling is that removing a panel orphans a user's credentials and never
 * prunes them, so the file is read and left exactly as it is: a downgrade to
 * 0.13.x finds its Work config intact. The consequence is that this build can
 * only *read* a PAT that was saved before 0.14.0 - an install that never saved
 * one has no way to, and `createAzurePr` says that instead of failing as
 * though the credential were wrong.
 */

/**
 * The part of `work.json` this module still reads. The file also holds a
 * `jira` object with its own token and flags; they are absent from this type
 * on purpose, and absent from the type is the only place they are absent -
 * the bytes on disk are untouched.
 */
interface AzureStored {
    /** Opt-in for corporate MITM proxies. Read-only now; no UI sets it. */
    insecureTLS: boolean
    /** `enc:`-prefixed safeStorage ciphertext, or `b64:` where it was unavailable. */
    patEnc: string
}
interface StoredCreds {
    azure: AzureStored
    /** Optional proxy URL (e.g. http://user:pass@proxy:8080). Blank → env vars. */
    proxy: string
}

function blank(): StoredCreds {
    return { azure: { insecureTLS: false, patEnc: "" }, proxy: "" }
}

function storeFile(): string {
    return join(app.getPath("userData"), "work.json")
}

function load(): StoredCreds {
    try {
        if (existsSync(storeFile())) {
            const raw = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<StoredCreds>
            const b = blank()
            return { azure: { ...b.azure, ...raw.azure }, proxy: raw.proxy ?? "" }
        }
    } catch (err) {
        // A file that could not be read is not a file that is absent. Falling
        // back to blanks is safe here only because this module never writes:
        // the unreadable file keeps whatever it holds.
        console.error("[azurepr] failed to read work.json:", err)
    }
    return blank()
}

function dec(s?: string): string {
    if (!s) return ""
    try {
        if (s.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(s.slice(4), "base64"))
        if (s.startsWith("b64:")) return Buffer.from(s.slice(4), "base64").toString("utf8")
    } catch (err) {
        console.error("[azurepr] failed to decrypt secret:", err)
    }
    return ""
}

// ---------- HTTP (node http/https; insecure-TLS + corporate proxy support) ----------
interface Resp {
    status: number
    body: string
}

/** Resolve the proxy to use: explicit config wins, else the usual env vars. */
export function resolveProxy(explicit: string): string {
    return (
        explicit.trim() ||
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        process.env.npm_config_proxy ||
        ""
    )
}

function proxyAuthHeader(p: URL): Record<string, string> {
    if (!p.username) return {}
    const creds = `${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`
    return { "Proxy-Authorization": "Basic " + Buffer.from(creds).toString("base64") }
}

/** Open a CONNECT tunnel through an HTTP proxy and resolve with the raw socket. */
function proxyTunnel(proxyUrl: string, host: string, port: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
        let p: URL
        try {
            p = new URL(proxyUrl)
        } catch {
            reject(new Error("Invalid proxy URL: " + proxyUrl))
            return
        }
        const req = httpRequest({
            host: p.hostname,
            port: Number(p.port) || 80,
            method: "CONNECT",
            path: `${host}:${port}`,
            headers: proxyAuthHeader(p),
            timeout: 15000
        })
        req.on("connect", (res, socket) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Proxy CONNECT failed (${res.statusCode})`))
                socket.destroy()
                return
            }
            resolve(socket)
        })
        req.on("error", reject)
        req.on("timeout", () => req.destroy(new Error("Proxy connection timed out")))
        req.end()
    })
}

function readResponse(res: NodeJS.ReadableStream & { statusCode?: number }, resolve: (r: Resp) => void): void {
    const chunks: Buffer[] = []
    res.on("data", (c: Buffer) => chunks.push(c))
    res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }))
}

async function httpJson(
    method: string,
    urlStr: string,
    headers: Record<string, string>,
    body: string | null,
    insecure: boolean,
    proxy: string
): Promise<Resp> {
    const u = new URL(urlStr)
    const isHttps = u.protocol === "https:"
    const port = Number(u.port) || (isHttps ? 443 : 80)

    return new Promise<Resp>((resolve, reject) => {
        const finish = (req: ReturnType<typeof httpRequest>): void => {
            req.on("error", reject)
            req.on("timeout", () => req.destroy(new Error("Request timed out")))
            if (body) req.write(body)
            req.end()
        }

        if (proxy && isHttps) {
            // HTTPS through proxy: CONNECT tunnel, then TLS over the tunnel socket.
            proxyTunnel(proxy, u.hostname, port)
                .then((socket) => {
                    const req = httpsRequest(
                        u,
                        {
                            method,
                            headers,
                            timeout: 15000,
                            createConnection: () =>
                                tlsConnect({ host: u.hostname, servername: u.hostname, socket, rejectUnauthorized: !insecure })
                        },
                        (res) => readResponse(res, resolve)
                    )
                    finish(req)
                })
                .catch(reject)
            return
        }

        if (proxy && !isHttps) {
            // HTTP through proxy: send absolute-form request line to the proxy.
            const p = new URL(proxy)
            const req = httpRequest(
                {
                    host: p.hostname,
                    port: Number(p.port) || 80,
                    method,
                    path: u.href,
                    headers: { ...headers, Host: u.host, ...proxyAuthHeader(p) },
                    timeout: 15000
                },
                (res) => readResponse(res, resolve)
            )
            finish(req)
            return
        }

        // No proxy - direct.
        const fn = isHttps ? httpsRequest : httpRequest
        const req = fn(
            u,
            { method, headers, timeout: 15000, ...(isHttps && insecure ? { rejectUnauthorized: false } : {}) },
            (res) => readResponse(res, resolve)
        )
        finish(req)
    })
}

/**
 * Create an Azure DevOps pull request with the PAT saved under the old Work
 * config. The "no PAT" message names the panel's removal rather than pointing
 * at a settings screen that no longer exists - the caller has already pushed
 * the branch by this point, so the user needs to know to finish in the browser.
 */
export async function createAzurePr(opts: {
    orgUrl: string
    project: string
    repo: string
    source: string
    target: string
    title: string
    description: string
}): Promise<{ ok: boolean; url?: string; error?: string }> {
    const f = load()
    const pat = dec(f.azure.patEnc)
    if (!pat)
        return {
            ok: false,
            error:
                "No Azure DevOps PAT saved. The Work panel that saved one was removed in 0.14.0, " +
                "so only a PAT saved before then can be used - open the pull request in Azure DevOps."
        }
    const auth = "Basic " + Buffer.from(`:${pat}`).toString("base64")
    const api =
        `${opts.orgUrl}/${encodeURIComponent(opts.project)}/_apis/git/repositories/` +
        `${encodeURIComponent(opts.repo)}/pullrequests?api-version=7.0`
    const body = JSON.stringify({
        sourceRefName: `refs/heads/${opts.source}`,
        targetRefName: `refs/heads/${opts.target}`,
        title: opts.title,
        description: opts.description
    })
    try {
        const res = await httpJson(
            "POST",
            api,
            { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
            body,
            f.azure.insecureTLS,
            resolveProxy(f.proxy)
        )
        if (res.status < 200 || res.status >= 300)
            return { ok: false, error: `Azure ${res.status}: ${res.body.slice(0, 300)}` }
        const data = JSON.parse(res.body)
        const url =
            `${opts.orgUrl}/${encodeURIComponent(opts.project)}/_git/` +
            `${encodeURIComponent(opts.repo)}/pullrequest/${data.pullRequestId}`
        return { ok: true, url }
    } catch (e) {
        return { ok: false, error: String((e as Error).message ?? e) }
    }
}
