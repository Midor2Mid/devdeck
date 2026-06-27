import { app, safeStorage } from "electron"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { request as httpsRequest } from "https"
import { request as httpRequest } from "http"
import { URL } from "url"
import { atomicWrite } from "./atomic"

/**
 * Work-item providers: Jira Cloud + Azure DevOps. Fetches the developer's
 * assigned items so DevDeck can start a session straight from a ticket. Tokens
 * are encrypted at rest (safeStorage) and never sent to the renderer. All HTTP
 * happens here in main (no CORS, secrets stay server-side). Supports an opt-in
 * insecure-TLS toggle for corporate MITM-proxy environments.
 */

export type Provider = "jira" | "azure"

export interface WorkItem {
    provider: Provider
    /** Human key shown in UI and used for branches, e.g. "PROJ-123" or "4821". */
    key: string
    title: string
    type: string
    status: string
    url: string
    description: string
}

interface JiraStored {
    enabled: boolean
    baseUrl: string
    email: string
    jql: string
    insecureTLS: boolean
    tokenEnc: string
}
interface AzureStored {
    enabled: boolean
    orgUrl: string
    project: string
    wiql: string
    insecureTLS: boolean
    patEnc: string
}
interface WorkFile {
    jira: JiraStored
    azure: AzureStored
}

/** Redacted config sent to the renderer (no secrets, just whether a token is set). */
export interface WorkConfigPublic {
    jira: Omit<JiraStored, "tokenEnc"> & { hasToken: boolean }
    azure: Omit<AzureStored, "patEnc"> & { hasToken: boolean }
}

/** Fields the renderer can submit; token/pat optional (blank = keep existing). */
export interface WorkConfigInput {
    jira: { enabled: boolean; baseUrl: string; email: string; jql: string; insecureTLS: boolean; token?: string }
    azure: { enabled: boolean; orgUrl: string; project: string; wiql: string; insecureTLS: boolean; pat?: string }
}

export const DEFAULT_JQL =
    "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
export const DEFAULT_WIQL =
    "SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me " +
    "AND [System.State] <> 'Closed' AND [System.State] <> 'Done' AND [System.State] <> 'Removed' " +
    "ORDER BY [System.ChangedDate] DESC"

function blankFile(): WorkFile {
    return {
        jira: { enabled: false, baseUrl: "", email: "", jql: DEFAULT_JQL, insecureTLS: false, tokenEnc: "" },
        azure: { enabled: false, orgUrl: "", project: "", wiql: DEFAULT_WIQL, insecureTLS: false, patEnc: "" }
    }
}

function storeFile(): string {
    return join(app.getPath("userData"), "work.json")
}

function load(): WorkFile {
    try {
        if (existsSync(storeFile())) {
            const raw = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<WorkFile>
            const b = blankFile()
            return { jira: { ...b.jira, ...raw.jira }, azure: { ...b.azure, ...raw.azure } }
        }
    } catch (err) {
        console.error("[work] failed to load config:", err)
    }
    return blankFile()
}

function enc(secret: string): string {
    if (!secret) return ""
    try {
        if (safeStorage.isEncryptionAvailable()) return "enc:" + safeStorage.encryptString(secret).toString("base64")
    } catch {
        /* fall through */
    }
    return "b64:" + Buffer.from(secret, "utf8").toString("base64")
}
function dec(s?: string): string {
    if (!s) return ""
    try {
        if (s.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(s.slice(4), "base64"))
        if (s.startsWith("b64:")) return Buffer.from(s.slice(4), "base64").toString("utf8")
    } catch (err) {
        console.error("[work] failed to decrypt secret:", err)
    }
    return ""
}

export function getConfig(): WorkConfigPublic {
    const f = load()
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { tokenEnc, ...jira } = f.jira
    const { patEnc, ...azure } = f.azure
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return {
        jira: { ...jira, hasToken: !!tokenEnc },
        azure: { ...azure, hasToken: !!patEnc }
    }
}

export function saveConfig(input: WorkConfigInput): WorkConfigPublic {
    const cur = load()
    const next: WorkFile = {
        jira: {
            enabled: input.jira.enabled,
            baseUrl: input.jira.baseUrl.trim().replace(/\/+$/, ""),
            email: input.jira.email.trim(),
            jql: input.jira.jql.trim() || DEFAULT_JQL,
            insecureTLS: !!input.jira.insecureTLS,
            tokenEnc: input.jira.token ? enc(input.jira.token) : cur.jira.tokenEnc
        },
        azure: {
            enabled: input.azure.enabled,
            orgUrl: input.azure.orgUrl.trim().replace(/\/+$/, ""),
            project: input.azure.project.trim(),
            wiql: input.azure.wiql.trim() || DEFAULT_WIQL,
            insecureTLS: !!input.azure.insecureTLS,
            patEnc: input.azure.pat ? enc(input.azure.pat) : cur.azure.patEnc
        }
    }
    atomicWrite(storeFile(), JSON.stringify(next, null, 2))
    return getConfig()
}

// ---------- HTTP (node http/https; supports insecure TLS for corporate proxies) ----------
interface Resp {
    status: number
    body: string
}
function httpJson(
    method: string,
    urlStr: string,
    headers: Record<string, string>,
    body: string | null,
    insecure: boolean
): Promise<Resp> {
    return new Promise((resolve, reject) => {
        let u: URL
        try {
            u = new URL(urlStr)
        } catch {
            reject(new Error("Invalid URL: " + urlStr))
            return
        }
        const isHttps = u.protocol === "https:"
        const fn = isHttps ? httpsRequest : httpRequest
        const req = fn(
            u,
            {
                method,
                headers,
                timeout: 15000,
                ...(isHttps && insecure ? { rejectUnauthorized: false } : {})
            },
            (res) => {
                const chunks: Buffer[] = []
                res.on("data", (c) => chunks.push(c))
                res.on("end", () =>
                    resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") })
                )
            }
        )
        req.on("error", reject)
        req.on("timeout", () => req.destroy(new Error("Request timed out")))
        if (body) req.write(body)
        req.end()
    })
}

// ---------- description flattening (pure, best-effort) ----------
/** Strip HTML to readable text (Azure DevOps descriptions are HTML). Pure. */
export function htmlToText(html: string): string {
    if (!html) return ""
    return html
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

/** Flatten Jira Cloud ADF (Atlassian Document Format) into text. Pure. */
export function adfToText(node: unknown): string {
    if (node == null) return ""
    if (typeof node === "string") return node
    const n = node as { type?: string; text?: string; content?: unknown[] }
    if (n.type === "text" && typeof n.text === "string") return n.text
    const inner = Array.isArray(n.content) ? n.content.map(adfToText).join("") : ""
    if (n.type === "paragraph" || n.type === "heading") return inner + "\n"
    if (n.type === "listItem") return "• " + inner
    if (n.type === "hardBreak") return "\n"
    return inner
}

function descToText(d: unknown): string {
    if (typeof d === "string") {
        // Could be HTML (Azure) or plain.
        return /<[a-z][\s\S]*>/i.test(d) ? htmlToText(d) : d.trim()
    }
    if (d && typeof d === "object") return adfToText(d).replace(/\n{3,}/g, "\n\n").trim()
    return ""
}

// ---------- normalizers (pure, exported for tests) ----------
export function normalizeJira(issue: any, baseUrl: string): WorkItem {
    const f = issue.fields ?? {}
    return {
        provider: "jira",
        key: issue.key,
        title: f.summary ?? "(no summary)",
        type: f.issuetype?.name ?? "Issue",
        status: f.status?.name ?? "",
        url: `${baseUrl}/browse/${issue.key}`,
        description: descToText(f.description).slice(0, 4000)
    }
}

export function normalizeAzure(item: any, orgUrl: string, project: string): WorkItem {
    const f = item.fields ?? {}
    return {
        provider: "azure",
        key: String(item.id),
        title: f["System.Title"] ?? "(no title)",
        type: f["System.WorkItemType"] ?? "Work Item",
        status: f["System.State"] ?? "",
        url: `${orgUrl}/${encodeURIComponent(project)}/_workitems/edit/${item.id}`,
        description: descToText(f["System.Description"]).slice(0, 4000)
    }
}

// ---------- fetchers ----------
async function fetchJira(c: JiraStored): Promise<WorkItem[]> {
    const token = dec(c.tokenEnc)
    if (!c.baseUrl || !c.email || !token) return []
    const auth = "Basic " + Buffer.from(`${c.email}:${token}`).toString("base64")
    const res = await httpJson(
        "POST",
        `${c.baseUrl}/rest/api/3/search`,
        { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
        JSON.stringify({ jql: c.jql || DEFAULT_JQL, maxResults: 40, fields: ["summary", "status", "issuetype", "description"] }),
        c.insecureTLS
    )
    if (res.status < 200 || res.status >= 300) throw new Error(`Jira ${res.status}: ${res.body.slice(0, 200)}`)
    const data = JSON.parse(res.body)
    return (data.issues ?? []).map((i: unknown) => normalizeJira(i, c.baseUrl))
}

async function fetchAzure(c: AzureStored): Promise<WorkItem[]> {
    const pat = dec(c.patEnc)
    if (!c.orgUrl || !c.project || !pat) return []
    const auth = "Basic " + Buffer.from(`:${pat}`).toString("base64")
    const wiql = await httpJson(
        "POST",
        `${c.orgUrl}/${encodeURIComponent(c.project)}/_apis/wit/wiql?api-version=7.0`,
        { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
        JSON.stringify({ query: c.wiql || DEFAULT_WIQL }),
        c.insecureTLS
    )
    if (wiql.status < 200 || wiql.status >= 300) throw new Error(`Azure WIQL ${wiql.status}: ${wiql.body.slice(0, 200)}`)
    const ids: number[] = (JSON.parse(wiql.body).workItems ?? []).map((w: { id: number }) => w.id).slice(0, 40)
    if (ids.length === 0) return []
    const fields = ["System.Title", "System.State", "System.WorkItemType", "System.Description"].join(",")
    const detail = await httpJson(
        "GET",
        `${c.orgUrl}/_apis/wit/workitems?ids=${ids.join(",")}&fields=${encodeURIComponent(fields)}&api-version=7.0`,
        { Authorization: auth, Accept: "application/json" },
        null,
        c.insecureTLS
    )
    if (detail.status < 200 || detail.status >= 300) throw new Error(`Azure items ${detail.status}: ${detail.body.slice(0, 200)}`)
    return (JSON.parse(detail.body).value ?? []).map((it: unknown) => normalizeAzure(it, c.orgUrl, c.project))
}

export interface FetchResult {
    items: WorkItem[]
    errors: { provider: Provider; message: string }[]
}

export async function fetchItems(): Promise<FetchResult> {
    const f = load()
    const items: WorkItem[] = []
    const errors: FetchResult["errors"] = []
    const jobs: Promise<void>[] = []
    if (f.jira.enabled)
        jobs.push(
            fetchJira(f.jira)
                .then((r) => void items.push(...r))
                .catch((e) => void errors.push({ provider: "jira", message: String(e.message ?? e) }))
        )
    if (f.azure.enabled)
        jobs.push(
            fetchAzure(f.azure)
                .then((r) => void items.push(...r))
                .catch((e) => void errors.push({ provider: "azure", message: String(e.message ?? e) }))
        )
    await Promise.all(jobs)
    return { items, errors }
}

/** Test a single provider with the stored (just-saved) credentials. */
export async function testProvider(provider: Provider): Promise<{ ok: boolean; count?: number; error?: string }> {
    const f = load()
    try {
        const items = provider === "jira" ? await fetchJira(f.jira) : await fetchAzure(f.azure)
        return { ok: true, count: items.length }
    } catch (e) {
        return { ok: false, error: String((e as Error).message ?? e) }
    }
}
