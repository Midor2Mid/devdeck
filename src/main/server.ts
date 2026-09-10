import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http"
import { createServer as createHttpsServer } from "https"
import { WebSocketServer, WebSocket } from "ws"
import { getCert } from "./tlscert"
import { app } from "electron"
import { readFileSync, mkdirSync } from "fs"
import { createHash } from "crypto"
import { join, dirname, basename } from "path"
import { networkInterfaces } from "os"
import { ptyEvents, getBuffer, writePty, resizePty } from "./pty"
import { httpSend } from "./http"
import { allConnections, runQuery, listTables } from "./db"
import {
    chooseBind,
    cookieToken,
    deviceCookie,
    clearDeviceCookie,
    originOk,
    type BindMode
} from "./guards"
import { readDir, readFileText, writeFileText, allFiles, isWithinRoots } from "./files"
import { atomicWrite } from "./atomic"
import { listProjects } from "./projects"
import {
    authenticate,
    isAuthLockedOut,
    noteAuthFailure,
    type AuthResult
} from "./devices"
import { exitNotice } from "../renderer/src/termExit"
import { consumeDecision, decisionFor, decisionOwner } from "./decisions"

export interface RemoteSession {
    termId: string
    projectId: string
    projectName: string
    projectPath: string
    tabName: string
    badge: string
    isAgent: boolean
    status: "working" | "idle" | "attention" | "waiting"
    /**
     * A permission prompt this device may answer. `options` rather than a pair of
     * fields so the wire format can grow to N choices without another protocol
     * change; `tail` so the phone can show the raw screen beside the parsed
     * question - the parsed label is the part an agent controls.
     *
     * Structurally this is `DecisionView` (src/shared/decision.ts), restated here
     * because it is a wire contract: what a paired phone parses must be spelled
     * out where the payload is defined.
     */
    pending?: {
        id: string
        kind: "menu" | "yesno"
        question: string
        tail: string
        options: { label: string; send: string }[]
    }
}

export interface ServerConfig {
    port: number
    /** Which interface to bind - see `chooseBind` in guards.ts. */
    bind: BindMode
    /** Idle-expiry window for paired devices, in days (0 = never). */
    deviceTtlDays: number
    /** Serve over HTTPS/WSS with a cached self-signed cert. */
    tls?: boolean
}

/** Result of an IPC `server:start` attempt - see `index.ts`'s handler. */
export interface ServerStartResult {
    ok: boolean
    /** Present when `ok` is false - the refusal reason, verbatim (e.g. no tailnet address). */
    reason?: string
}

export interface ServerDeps {
    getSessions: () => RemoteSession[]
    requestNewSession: (projectId: string) => void
}

interface Client extends WebSocket {
    attached?: Set<string>
    /**
     * The device that authenticated this socket (stamped from `verifyClient`'s
     * auth result). Auth is evaluated once, at upgrade - deleting a device's
     * record in `devices.ts` does nothing to a socket that already passed
     * that check, so without this a revoked device (a stolen phone, an
     * ex-collaborator) keeps full terminal reach for as long as it holds the
     * connection open, even though its row has vanished from the Settings
     * panel. `closeDeviceSockets` below is what `devices:revoke` calls to
     * actually close it.
     */
    deviceId?: string
}

let httpServer: Server | null = null
let wss: WebSocketServer | null = null
/**
 * The interface we actually bound to, as opposed to the ones currently available.
 * The two can diverge: the bind happens once in `start()`, so bringing Tailscale
 * up afterwards leaves the server on 0.0.0.0 (every interface, LAN included)
 * while the UI would happily show the new private address — telling you you're
 * private when you are not. Reporting the real value lets the panel say so.
 */
let boundHost: string | null = null
let clients = new Set<Client>()
let onData: ((d: { id: string; data: string }) => void) | null = null
let onExit: ((d: { id: string; exitCode: number }) => void) | null = null

type XtermFile = "xterm.js" | "xterm.css"
const xtermCache = new Map<XtermFile, { body: Buffer; etag: string }>()

/**
 * The two static library assets, read once per **process** rather than once per
 * request.
 *
 * These are the only two paths served above `authFor` (see `handleRequest`), so
 * anyone who can open a socket to this port can ask for them with no token, no
 * cookie and no device record. Each request used to re-read 488,663 bytes
 * synchronously and decode them as UTF-8: 3.45 ms of blocked event loop per
 * request, measured - and this is the single thread that relays every PTY byte,
 * answers every IPC call and runs `authenticate()`. ~290 requests/second is a
 * fully stalled main process. The failure throttle in `devices.ts` exists
 * because `authenticate()` was "attacker-paced, on the same thread that drives
 * the UI"; this path was an order of magnitude more expensive per request and
 * sat in FRONT of that throttle, handing an anonymous client exactly the stall
 * the throttle was added to deny them.
 *
 * The cache is per-process and never invalidated because the files live inside
 * the app bundle and cannot change while it runs. A `Buffer` rather than a
 * string so a response is a socket write of bytes already in hand, with no
 * per-request UTF-8 re-encode of half a megabyte. The ETag is content-derived,
 * which is what lets a real client fetch each file once for the life of the
 * install.
 */
function xtermAsset(file: XtermFile): { body: Buffer; etag: string } {
    const hit = xtermCache.get(file)
    if (hit) return hit
    // Resolve @xterm/xterm from node_modules at runtime (it is externalized).
    const main = require.resolve("@xterm/xterm") // .../lib/xterm.js
    const pkgDir = dirname(dirname(main))
    const path = file === "xterm.js" ? join(pkgDir, "lib", "xterm.js") : join(pkgDir, "css", "xterm.css")
    const body = readFileSync(path)
    const asset = { body, etag: `"${createHash("sha256").update(body).digest("base64url")}"` }
    xtermCache.set(file, asset)
    return asset
}

/** LAN + Tailscale (100.64.0.0/10) IPv4 addresses for building connect URLs. */
export function localAddresses(): { tailscale: string[]; lan: string[] } {
    const tailscale: string[] = []
    const lan: string[] = []
    const ifaces = networkInterfaces()
    for (const list of Object.values(ifaces)) {
        for (const ni of list ?? []) {
            if (ni.family !== "IPv4" || ni.internal) continue
            const first = Number(ni.address.split(".")[0])
            const second = Number(ni.address.split(".")[1])
            if (first === 100 && second >= 64 && second <= 127) tailscale.push(ni.address)
            else lan.push(ni.address)
        }
    }
    return { tailscale, lan }
}

function send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

// Filesystem access from the phone (the Files/AI mobile views) is confined to
// within an added project — the same defense-in-depth guard the desktop editor
// IPC uses. A remote client already has terminal (RCE) reach behind the token +
// Tailscale, so this exposes no new capability; the confinement just keeps a
// stray path from wandering outside the projects you've opened.
const projectRoots = (): string[] => listProjects().projects.map((p) => p.path)
const inProject = (p: string): boolean => !!p && isWithinRoots(p, projectRoots())

/**
 * The session list as it goes on the wire: main's snapshot, plus the pending
 * decision for any session that has one.
 *
 * The decision is only ever READ here. Minting, the attention/waiting gate and
 * the screen binding all live in `decisions.ts` - `server.ts` classifying
 * anything itself is how the phone and the desktop would come to describe one
 * prompt two different ways.
 *
 * The projection is explicit rather than a spread of the whole record: main's
 * `PendingDecision` also carries `termId`, `tailHash` and `createdAt`, which are
 * its own bookkeeping and have no business leaving this machine. Sessions
 * without a decision are passed through untouched, so the key is absent rather
 * than present-and-empty.
 */
function withDecisions(sessions: readonly RemoteSession[]): RemoteSession[] {
    return sessions.map((s) => {
        const d = decisionFor(s.termId)
        if (!d) return s
        return {
            ...s,
            pending: {
                id: d.id,
                kind: d.kind,
                question: d.question,
                tail: d.tail,
                options: d.options.map((o) => ({ label: o.label, send: o.send }))
            }
        }
    })
}

/**
 * Why a `{t:"choice"}` was refused, in words the phone shows verbatim.
 *
 * The copy lives here rather than on the client because the client must not be
 * the thing that decides what a refusal means: it renders the string it is
 * given. Every refusal says something - a silent no-op over a slow phone link is
 * how you get a second tap, and a second tap on a prompt that did fire is how
 * the answer lands in whatever the agent asked next.
 */
const CHOICE_REASONS: Record<string, string> = {
    unknown: "That prompt is no longer on screen.",
    consumed: "Already answered.",
    "not-an-option": "That is not one of the offered answers.",
    "moved-on": "The terminal moved on - check it before answering again."
}

export function broadcastSessions(deps: ServerDeps): void {
    const sessions = withDecisions(deps.getSessions())
    for (const c of clients) send(c, { t: "sessions", sessions })
}

/** The interface the running server is bound to; null when stopped. */
export function boundAddress(): string | null {
    return boundHost
}

export function isRunning(): boolean {
    return httpServer !== null
}

export async function start(config: ServerConfig, deps: ServerDeps): Promise<void> {
    // Decide the bind - and validate it - before touching any server
    // resources, and before calling stop(). Refusing is a valid outcome (e.g.
    // "tailscale" requested but the tailnet is down, or an unrecognised mode
    // from a stale/untyped config), and a refused restart must leave whatever
    // was already running alone rather than tearing down a healthy server
    // and starting nothing.
    const addrs = localAddresses()
    const bindChoice = chooseBind(config.bind, addrs)
    if (!bindChoice.ok) throw new Error(bindChoice.reason)
    const host = bindChoice.host

    stop()

    // Either a device's own token or the pairing token gets you in; only the
    // pairing token mints a new device. Both entry points below must agree,
    // so this is written once - an auth check that exists in two places
    // eventually disagrees in two places, and here that means one of them
    // lets someone in. A store write failure (disk full, permissions) fails
    // the request rather than the whole server.
    //
    // `allowEnroll` lets the WebSocket path (see verifyClient below) accept
    // device tokens only, never mint a new one: verifyClient can't hand a
    // fresh device token back to the client, so the HTML page is the only
    // place enrolment should happen. Without this, the client's own
    // reconnect-every-1.5s-on-close loop would mint a brand-new device (a
    // synchronous store write) on every dropped WebSocket that still carries
    // the pairing token in its URL - an unbounded loop of disk writes on the
    // main process's event loop, not the one orphan device the design
    // accepted.
    // Cookie first, then the `?token=` query param - but on *outcome*, not on
    // the cookie merely being present. A device that idles past deviceTtlDays
    // (or gets revoked) has its record dropped; if a stale cookie alone gated
    // the fallback, a fresh QR scan's `?token=` would never even be tried -
    // the request 401s, no page JS ever runs to clear anything, and the dead
    // cookie can strand the browser for up to Max-Age. So: try the cookie: if
    // it authenticates, done. Otherwise fall through and try `?token=` too
    // (the pairing path, or a device's own token in exceptional cases) -
    // whose success re-pairs cleanly and, via the caller's Set-Cookie, writes
    // over the dead cookie.
    const authFor = (
        req: IncomingMessage,
        url: URL,
        allowEnroll: boolean
    ): { auth: AuthResult; token: string } => {
        const userAgent = String(req.headers["user-agent"] ?? "")
        // The peer address the socket actually came from, which is what
        // devices.ts throttles repeated failures against. Deliberately NOT
        // X-Forwarded-For or any other header: this server is reached
        // directly over the LAN, and a caller-supplied header would let the
        // guesser pick a fresh bucket per attempt, which is the whole attack
        // the throttle exists to stop. An empty address (a socket already
        // torn down) shares one bucket rather than skipping the limit.
        const address = req.socket?.remoteAddress ?? ""
        // One request, at most one failure charged. This function tries two
        // credentials (cookie, then ?token=), which is one failed REQUEST
        // presenting two dead credentials - not two guesses. Counting both
        // halved the free budget for exactly the case the fallback exists to
        // serve: a browser holding a revoked device cookie, which then loads a
        // page, its assets and a WebSocket, and would be locked out while
        // holding a freshly scanned, valid pairing token. So `authenticate` is
        // told not to count, the lockout is checked once up front, and the
        // failure is charged here, once.
        const once = { countFailure: false }
        if (isAuthLockedOut(address)) return { auth: { ok: false }, token: "" }
        try {
            const cookie = cookieToken(req.headers.cookie, !!config.tls)
            if (cookie) {
                const byCookie = authenticate(
                    cookie,
                    userAgent,
                    config.deviceTtlDays,
                    allowEnroll,
                    address,
                    once
                )
                if (byCookie.ok) return { auth: byCookie, token: cookie }
            }
            const queryToken = url.searchParams.get("token") ?? ""
            if (!queryToken) {
                // A request carrying a dead cookie and no token is still a
                // failed attempt; one carrying no credential at all is just an
                // anonymous request and is not charged.
                if (cookie) noteAuthFailure(address)
                return { auth: { ok: false }, token: "" }
            }
            const auth = authenticate(
                queryToken,
                userAgent,
                config.deviceTtlDays,
                allowEnroll,
                address,
                once
            )
            if (!auth.ok) noteAuthFailure(address)
            return { auth, token: queryToken }
        } catch (err) {
            console.error("[server] auth store write failed:", (err as Error)?.message ?? err)
            return { auth: { ok: false }, token: "" }
        }
    }

    const handleRequest = (req: IncomingMessage, res: ServerResponse): void => {
        let url: URL
        try {
            url = new URL(req.url ?? "/", "http://localhost")
        } catch {
            // A request target like "//" or "///" fails URL parsing; letting
            // that throw here would be an uncaught exception in the request
            // listener, i.e. an unauthenticated remote client crashing the
            // Electron main process.
            res.writeHead(400, { "Content-Type": "text/plain" })
            res.end("Bad Request")
            return
        }
        // Static library assets carry nothing of the user's, and a phone that
        // cannot fetch them cannot render the page it was authenticated to
        // see - the sub-resource request is a fresh HTTP request that need not
        // carry the same credential the page did (a `?token=` enrolment does
        // not travel to a sub-resource at all, and a cookie can be absent for
        // reasons ranging from a `__Host-` prefix to a phone's cookie policy).
        // So they stay ABOVE authFor deliberately, and the cost of that
        // decision is bounded instead: read once per process (see xtermAsset),
        // answered with a 304 for any client that already has it, and never
        // re-encoded. What remains for an anonymous flood is one socket write
        // of bytes already in memory, which is what any static file server
        // costs.
        const assetName: XtermFile | null =
            url.pathname === "/xterm.js" ? "xterm.js" : url.pathname === "/xterm.css" ? "xterm.css" : null
        if (assetName) {
            const { body, etag } = xtermAsset(assetName)
            const cache: Record<string, string> = {
                ETag: etag,
                // Revalidate, do not pin. These URLs carry no version, so an
                // `immutable` year would leave a phone holding one DevDeck
                // release's xterm.js against the next release's page - a broken
                // pane with no diagnostic - for up to a year. A conditional GET
                // costs a 304 with no body and, now, no disk read.
                "Cache-Control": "no-cache"
            }
            if (req.headers["if-none-match"] === etag) {
                res.writeHead(304, cache)
                res.end()
                return
            }
            res.writeHead(200, {
                ...cache,
                "Content-Type": assetName === "xterm.js" ? "text/javascript" : "text/css",
                "Content-Length": String(body.length)
            })
            res.end(body)
            return
        }
        const { auth, token } = authFor(req, url, true)
        if (!auth.ok) {
            const headers: Record<string, string> = { "Content-Type": "text/plain" }
            // Only clear the cookie when one was actually presented (and
            // failed) - never unconditionally. SameSite=Strict already keeps
            // the real cookie off a cross-site request, but sending this
            // unconditionally would let an attacker force-log-out a victim's
            // valid device merely by getting their browser to load this URL
            // with NO credentials at all (e.g. an <img src=...> on another
            // tab) - the 401 they'd get anyway would clear a cookie the
            // request never even carried. See the comment on
            // clearDeviceCookie in guards.ts for the legitimate case this
            // still covers: a dead cookie that WAS presented and failed.
            if (cookieToken(req.headers.cookie, !!config.tls))
                headers["Set-Cookie"] = clearDeviceCookie(!!config.tls)
            res.writeHead(401, headers)
            res.end("Unauthorized")
            return
        }
        // no-store: before device auth existed the page held no secret, so
        // caching was harmless; now every authenticated response carries a
        // Set-Cookie with a long-lived device token, and this is sometimes
        // served over plain http on the LAN path this feature supports.
        const headers: Record<string, string> = {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            Pragma: "no-cache"
        }
        // Re-issue the cookie on *every* authenticated load, not only a fresh
        // enrolment: `auth.deviceToken` is only set when a new device was
        // just minted, but the token that actually authenticated this request
        // (the cookie itself, or a query token on the re-pair path) is always
        // in `token`. Refreshing Max-Age here is what makes the cookie's own
        // lifetime slide forward with real use instead of expiring on a fixed
        // schedule from first enrolment while the server-side idle check
        // (which does slide) would have kept the device alive - see B-2.
        // Never in the URL (history, screenshots, shared links) and never in
        // page-script scope (unlike the localStorage design this replaces).
        headers["Set-Cookie"] = deviceCookie(
            auth.deviceToken ?? token,
            !!config.tls,
            config.deviceTtlDays
        )
        res.writeHead(200, headers)
        res.end(CLIENT_HTML)
    }

    if (config.tls) {
        const { key, cert } = await getCert([...addrs.tailscale, ...addrs.lan])
        httpServer = createHttpsServer({ key, cert }, handleRequest)
    } else {
        httpServer = createServer(handleRequest)
    }

    wss = new WebSocketServer({
        server: httpServer,
        path: "/ws",
        maxPayload: 25 * 1024 * 1024,
        verifyClient: (info, cb) => {
            let url: URL
            try {
                url = new URL(info.req.url ?? "/", "http://localhost")
            } catch {
                cb(false, 400, "Bad Request")
                return
            }
            // Defense in depth now that auth can ride along as an ambient
            // cookie: SameSite=Strict already keeps it off a cross-site
            // request in current browsers, but enforcement for non-HTTP(S)
            // schemes (ws:/wss:) hasn't always been consistent - see
            // originOk's comment in guards.ts.
            if (!originOk(info.req.headers.origin, info.req.headers.host)) {
                cb(false, 403, "Forbidden")
                return
            }
            // Device tokens only - no enrolment here (allowEnroll: false). See
            // the comment on authFor above for why. The cookie set on
            // enrolment is the sole path in: this upgrade request carries it
            // automatically since it's the same origin as the HTML page.
            const { auth } = authFor(info.req, url, false)
            if (!auth.ok) {
                // 401, not 1008 (a WebSocket *close* code, not a valid HTTP
                // status): `ws` writes whatever's passed here straight onto
                // the raw HTTP response line for a rejected upgrade, so 1008
                // there produces an unparseable status line that no client -
                // including a Set-Cookie header alongside it - ever applies.
                const headers: Record<string, string> = {}
                // Same reasoning as the HTTP 401 path: only clear a cookie
                // that was actually presented and failed, never unconditionally.
                if (cookieToken(info.req.headers.cookie, !!config.tls)) {
                    headers["Set-Cookie"] = clearDeviceCookie(!!config.tls)
                }
                cb(false, 401, "Unauthorized", headers)
                return
            }
            // Tag the upgrade request with which device authenticated it, so
            // the `connection` handler below can stamp the resulting socket -
            // revoking a device needs to find its live socket by this id
            // (see `closeDeviceSockets`).
            ;(info.req as IncomingMessage & { deviceId?: string }).deviceId = auth.device.id
            cb(true)
        }
    })

    wss.on("connection", (ws: Client, req: IncomingMessage & { deviceId?: string }) => {
        ws.attached = new Set()
        ws.deviceId = req.deviceId
        clients.add(ws)
        send(ws, { t: "sessions", sessions: withDecisions(deps.getSessions()) })

        ws.on("message", (raw) => {
            let msg: Record<string, unknown>
            try {
                msg = JSON.parse(raw.toString())
            } catch {
                return
            }
            const id = typeof msg.id === "string" ? msg.id : ""
            switch (msg.t) {
                case "attach":
                    ws.attached?.add(id)
                    send(ws, { t: "data", id, data: getBuffer(id) })
                    break
                case "detach":
                    ws.attached?.delete(id)
                    break
                case "input":
                    if (typeof msg.data === "string") writePty(id, msg.data)
                    break
                case "choice": {
                    // Answer a permission prompt with a token MAIN minted. A phone
                    // may replay one of main's own answer tokens, for a prompt main
                    // can still see on the screen it classified, on a session this
                    // socket is attached to, exactly once. Everything else is a
                    // refusal that says why.
                    //
                    // Be honest about what the attach check is worth: `case
                    // "attach"` takes any id the client sends, so a paired device
                    // can attach to anything it saw on the session list and clear
                    // this. It is not a boundary against a hostile paired device --
                    // `case "input"` already writes arbitrary bytes to an arbitrary
                    // pty, so pairing IS the trust boundary and this handler grants
                    // nothing beyond it. What the check buys is that a tap can only
                    // answer a session the device actually opened, which is what
                    // keeps a mis-addressed or replayed frame from firing into a
                    // terminal nobody was looking at.
                    //
                    // Note what is NOT read here: `id`. The terminal a decision
                    // belongs to comes from main's own record (`decisionOwner`,
                    // then `r.termId`), never from the wire - otherwise a device
                    // could name a session it is attached to while spending a
                    // decision minted for a different one. `id` is accepted and
                    // cross-checked below so that it cannot quietly drift into
                    // meaning something, but it is never the authority.
                    //
                    // There is deliberately no per-pty write lock. `decisionOwner`,
                    // `consumeDecision` and `writePty` are all synchronous, so from
                    // the first check to the write this is one run-to-completion
                    // block in a single-threaded main process: no other socket, no
                    // `{t:"input"}` and no `upload` can interleave. Introducing an
                    // `await` anywhere between `consumeDecision` and `writePty` is
                    // what would break that - and only then would a lock be the fix.
                    const decisionId = typeof msg.decisionId === "string" ? msg.decisionId : ""
                    const wanted = typeof msg.send === "string" ? msg.send : ""
                    const owner = decisionOwner(decisionId)
                    if (!owner) {
                        send(ws, {
                            t: "choice:res",
                            decisionId,
                            outcome: "unknown",
                            reason: CHOICE_REASONS.unknown
                        })
                        break
                    }
                    if (!ws.attached?.has(owner)) {
                        send(ws, {
                            t: "choice:res",
                            decisionId,
                            outcome: "rejected",
                            reason: "Not attached to that session."
                        })
                        break
                    }
                    if (id && id !== owner) {
                        send(ws, {
                            t: "choice:res",
                            decisionId,
                            outcome: "rejected",
                            reason: "That answer belongs to a different session."
                        })
                        break
                    }
                    const r = consumeDecision(decisionId, wanted)
                    if (!r.ok) {
                        send(ws, {
                            t: "choice:res",
                            decisionId,
                            outcome: r.reason === "unknown" ? "unknown" : "rejected",
                            reason: CHOICE_REASONS[r.reason]
                        })
                        break
                    }
                    // `r.send` and `r.termId` - main's copy of both. And no `+ "\r"`:
                    // for a menu a trailing Return breaks the numbered selection and
                    // the ESC denial alike, and a yesno token from approval.ts
                    // already ends in one. Honour the token as recorded.
                    writePty(r.termId, r.send)
                    send(ws, { t: "choice:res", decisionId, outcome: "accepted" })
                    // The prompt is spent: push the session list so every paired
                    // device drops the card instead of offering a second tap.
                    broadcastSessions(deps)
                    break
                }
                case "resize":
                    resizePty(id, Number(msg.cols), Number(msg.rows))
                    break
                case "new":
                    if (typeof msg.projectId === "string") deps.requestNewSession(msg.projectId)
                    break
                case "list":
                    send(ws, { t: "sessions", sessions: withDecisions(deps.getSessions()) })
                    break
                case "http": {
                    const req = msg.req as Parameters<typeof httpSend>[0]
                    if (!req) {
                        send(ws, {
                            t: "http:res",
                            res: {
                                ok: false,
                                error: "Blocked: remote requests to local/private hosts aren't allowed.",
                                timeMs: 0
                            }
                        })
                        break
                    }
                    // The guard moved inside httpSend, because checking here
                    // only ever checked the FIRST url: fetch followed the
                    // redirects itself, and any allowed public host could 302
                    // the request to 127.0.0.1 or 169.254.169.254. guardRemote
                    // re-runs it on every hop, against the resolved address.
                    httpSend(req, { guardRemote: true }).then((res) =>
                        send(ws, { t: "http:res", res })
                    )
                    break
                }
                case "db:conns":
                    send(ws, { t: "db:conns", conns: allConnections() })
                    break
                case "db:tables":
                    listTables(id)
                        .then((tables) => send(ws, { t: "db:tables", profileId: id, tables }))
                        .catch((e) =>
                            send(ws, {
                                t: "db:tables",
                                profileId: id,
                                tables: [],
                                error: String(e?.message ?? e)
                            })
                        )
                    break
                case "db:query": {
                    // Read-only is enforced by the driver now, not by a regex
                    // on the first word here - see runReadOnly in db.ts. The
                    // refusal for a driver that has no read-only mode
                    // (SQL Server) comes back as an ordinary error result.
                    const sql = String(msg.sql)
                    runQuery(id, sql, { readOnly: true }).then((res) =>
                        send(ws, { t: "db:res", res })
                    )
                    break
                }
                case "projects":
                    // Full project list (not just those with a live session) so the
                    // Files/AI views work even before any terminal is open.
                    send(ws, {
                        t: "projects",
                        projects: listProjects().projects.map((p) => ({
                            id: p.id,
                            name: p.name,
                            path: p.path
                        }))
                    })
                    break
                case "fs:tree": {
                    const p = String(msg.path ?? "")
                    if (!inProject(p)) {
                        send(ws, { t: "fs:tree", path: p, error: "Path is outside any open project." })
                        break
                    }
                    try {
                        send(ws, { t: "fs:tree", path: p, entries: readDir(p) })
                    } catch (e) {
                        send(ws, { t: "fs:tree", path: p, error: String((e as Error)?.message ?? e) })
                    }
                    break
                }
                case "fs:read": {
                    const p = String(msg.path ?? "")
                    if (!inProject(p)) {
                        send(ws, { t: "fs:read", path: p, error: "Path is outside any open project." })
                        break
                    }
                    try {
                        send(ws, { t: "fs:read", path: p, content: readFileText(p).content })
                    } catch (e) {
                        send(ws, { t: "fs:read", path: p, error: String((e as Error)?.message ?? e) })
                    }
                    break
                }
                case "fs:write": {
                    const p = String(msg.path ?? "")
                    if (!inProject(p)) {
                        send(ws, { t: "fs:write", path: p, error: "Path is outside any open project." })
                        break
                    }
                    const content = String(msg.content ?? "")
                    if (content.length > 5 * 1024 * 1024) {
                        send(ws, { t: "fs:write", path: p, error: "File too large to save remotely." })
                        break
                    }
                    try {
                        // No base version: the remote client does not track one, so
                        // this stays a force-write, exactly as before. Narrowing it
                        // needs the mobile client to round-trip the mtime first.
                        writeFileText(p, content, 0)
                        send(ws, { t: "fs:write", path: p, ok: true })
                    } catch (e) {
                        send(ws, { t: "fs:write", path: p, error: String((e as Error)?.message ?? e) })
                    }
                    break
                }
                case "fs:files": {
                    // Flat file list for @-mention autocomplete in the AI composer.
                    const root = String(msg.root ?? "")
                    if (!inProject(root)) {
                        send(ws, { t: "fs:files", root, files: [] })
                        break
                    }
                    try {
                        send(ws, { t: "fs:files", root, files: allFiles(root, 4000) })
                    } catch {
                        send(ws, { t: "fs:files", root, files: [] })
                    }
                    break
                }
                case "upload": {
                    // Save a base64 file from the phone, then type its path into the session.
                    try {
                        const sess = deps.getSessions().find((s) => s.termId === id)
                        const projectPath = sess?.projectPath || app.getPath("temp")
                        const dir = join(projectPath, ".devdeck", "uploads")
                        mkdirSync(dir, { recursive: true })
                        const safe = basename(String(msg.name || "file")).replace(/[^\w.\-]/g, "_")
                        const dest = join(dir, Date.now() + "-" + safe)
                        atomicWrite(dest, Buffer.from(String(msg.data || ""), "base64"))
                        writePty(id, dest + " ")
                        send(ws, { t: "upload:done", path: dest })
                    } catch (e) {
                        send(ws, { t: "upload:done", error: String((e as Error)?.message ?? e) })
                    }
                    break
                }
            }
        })
        ws.on("close", () => clients.delete(ws))
        ws.on("error", () => clients.delete(ws))
    })

    onData = ({ id, data }) => {
        for (const c of clients) if (c.attached?.has(id)) send(c, { t: "data", id, data })
    }
    onExit = ({ id, exitCode }) => {
        // Compute the notice host-side: the DevDeck host knows its own OS, whereas a
        // remote browser client can't (and the Avast/fast-fail case is host-specific).
        const notice = exitNotice(exitCode, process.platform === "win32")
        for (const c of clients) if (c.attached?.has(id)) send(c, { t: "exit", id, notice })
    }
    ptyEvents.on("data", onData)
    ptyEvents.on("exit", onExit)

    httpServer.on("error", (err) => {
        console.error("[server] error:", err.message)
        // A failed listen (e.g. EADDRINUSE) must not leave isRunning()
        // reporting true for a socket that never actually bound.
        stop()
    })
    boundHost = host
    httpServer.listen(config.port, host)
    const scheme = config.tls ? "https" : "http"
    console.log(`[server] DevDeck remote listening on ${scheme}://${host}:${config.port}`)
}

/**
 * Close every live socket belonging to a device, right after its record is
 * deleted (`devices:revoke` in index.ts calls this immediately after
 * `devices.revokeDevice`). Auth for a WebSocket is checked once, at upgrade -
 * dropping the device's record does nothing on its own to a socket that
 * already passed that check, so without this a revoked device (a stolen
 * phone, an ex-collaborator) keeps full terminal reach for as long as it
 * holds the connection open, while its row has already vanished from the
 * Settings panel. `terminate()`, not `close()`: a device just revoked has no
 * claim on a graceful close handshake, and a hostile client could simply
 * never acknowledge one.
 */
export function closeDeviceSockets(id: string): void {
    for (const c of [...clients]) {
        if (c.deviceId !== id) continue
        clients.delete(c)
        try {
            c.terminate()
        } catch {
            /* ignore */
        }
    }
}

export function stop(): void {
    if (onData) ptyEvents.off("data", onData)
    if (onExit) ptyEvents.off("exit", onExit)
    onData = onExit = null
    for (const c of clients) {
        try {
            c.close()
        } catch {
            /* ignore */
        }
    }
    clients = new Set()
    boundHost = null
    wss?.close()
    wss = null
    httpServer?.close()
    httpServer = null
}

// ----- self-contained mobile web client -----
const CLIENT_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#211f1c" />
<title>DevDeck Remote</title>
<link rel="stylesheet" href="/xterm.css" />
<style>
  :root{--bg:#1b1a18;--bg2:#211f1c;--bg3:#141312;--bd:#322e28;--tx:#e4ddcf;--mu:#8f8678;--ac:#b8895c;--moss:#8c9a68;--clay:#c4855d;}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--tx);font-family:system-ui,sans-serif;font-size:15px}
  /* dvh, not vh: opening the phone keyboard does not shrink the layout
     viewport on iOS Safari or Chrome Android, so a 100vh column never
     re-lays-out and anything the keyboard covers cannot be scrolled back.
     Orca shipped the same bug and had to add a visualViewport handler for it
     (#16930); two units are the whole fix here, and vh stays as the fallback
     for anything that does not know dvh. */
  #app{display:flex;flex-direction:column;height:100vh;height:100dvh}
  header{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg2);border-bottom:1px solid var(--bd)}
  header .brand{font-weight:600;letter-spacing:1px;color:var(--ac);flex:none}
  header button{background:transparent;border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:6px 12px;font-size:15px}
  #status{margin-left:auto;font-size:12px;color:var(--mu);flex:none;white-space:nowrap}
  #list{flex:1;overflow:auto;padding:10px}
  .proj{font-size:11px;letter-spacing:1px;color:var(--mu);margin:14px 6px 6px}
  .sess{display:flex;align-items:center;gap:10px;padding:14px;border:1px solid var(--bd);border-radius:10px;margin-bottom:8px;background:var(--bg2)}
  .dot{width:9px;height:9px;border-radius:50%;flex:none}
  .dot.shell{background:var(--moss)} .dot.agent{background:var(--clay)}
  .dot.attention{background:var(--ac);box-shadow:0 0 0 3px rgba(184,137,92,.25)}
  .dot.waiting{background:var(--ac);animation:b 2s ease-in-out infinite}
  @keyframes b{0%,100%{box-shadow:0 0 0 0 rgba(184,137,92,.30)}50%{box-shadow:0 0 0 4px rgba(184,137,92,.06)}}
  .dot.idle{opacity:.4} .dot.working{animation:p 1.2s infinite}
  @keyframes p{0%,100%{opacity:.4}50%{opacity:1}}
  .sess .meta{flex:1} .sess .st{font-size:11px;color:var(--mu)}
  .badge{font-size:9px;letter-spacing:1px;color:var(--clay);border:1px solid var(--bd);border-radius:5px;padding:2px 6px}
  .new{color:var(--clay);border-color:var(--clay)!important}
  #term-view{flex:1;display:none;flex-direction:column;min-height:0}
  /* overflow:hidden, because xterm sizes .xterm to rows x cell-height and
     nothing refits it when the decision card appears. On a short viewport
     (a phone in landscape: #term measured 12px tall against a 120px canvas)
     the canvas overflowed and painted 114px of terminal output straight over
     the card's question and raw excerpt, while Approve/Deny stayed tappable -
     you could answer a prompt you could not read. Clipping the terminal is
     the lesser harm; refitting it would resize the HOST pty (see fit()). */
  #term{flex:1;min-height:0;overflow:hidden;background:var(--bg3);padding:6px}
  #bar{display:flex;gap:6px;padding:8px;background:var(--bg2);border-top:1px solid var(--bd)}
  #bar input{flex:1;background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px;font-size:15px}
  #bar button,.keys button{background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px 12px}
  .keys{display:flex;gap:6px;padding:0 8px 8px;background:var(--bg2);overflow-x:auto;flex:none}
  .keys button{flex:none;font-size:13px;color:var(--mu)}
  .empty{color:var(--mu);text-align:center;padding:40px 20px;line-height:1.6}
  /* flex:1 + min-width:0 + its own overflow, or the five tabs push #status
     off the right edge of every portrait phone: the header's content was a
     fixed 431px against a 320-390px viewport, so the whole PAGE scrolled
     sideways and 'disconnected - retrying' - the one thing that explains a
     tap that did nothing - was never on screen. The tabs scroll inside the
     header now; the brand and the status never move. */
  nav#nav{display:flex;gap:4px;margin-left:8px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
  nav#nav::-webkit-scrollbar{display:none}
  nav#nav button{flex:none;padding:5px 10px;font-size:13px;color:var(--mu);border-color:transparent}
  nav#nav button.active{color:var(--tx);border-color:var(--bd)}
  #http-view,#db-view,#files-view,#ai-view{flex:1;display:none;flex-direction:column;min-height:0;overflow:auto;padding:12px;gap:8px}
  #http-view .row{display:flex;gap:6px;margin-bottom:8px}
  .crumb{font-size:12px;color:var(--mu);font-family:monospace;padding:2px 4px;word-break:break-all}
  #f-content{min-height:52vh;font-family:monospace;font-size:13px}
  #f-editor{gap:8px}
  #a-prompt{min-height:120px}
  .mention{border:1px solid var(--bd);border-radius:8px;padding:8px;max-height:42vh;overflow:auto;display:flex;flex-direction:column;gap:6px}
  .ghost{background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px 12px;flex:none}
  select,textarea,input.f{background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px;font-size:15px;font-family:inherit}
  input.f,textarea{width:100%}
  textarea{min-height:70px;font-family:monospace;font-size:13px}
  .send-btn{background:var(--ac);color:#14110d;border:none;border-radius:8px;padding:10px 16px;font-weight:600}
  .lbl{font-size:11px;color:var(--mu);margin:8px 0 4px}
  .res{margin-top:10px;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:10px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;overflow:auto}
  .gridtbl{border-collapse:collapse;font-size:12px;font-family:monospace;width:max-content;min-width:100%}
  .gridtbl th,.gridtbl td{border:1px solid var(--bd);padding:4px 8px;text-align:left;white-space:nowrap}
  .gridtbl th{color:var(--ac)}
  .tbl-item{padding:8px 6px;border-bottom:1px solid var(--bd);color:var(--mu);font-size:13px}
  /* The pending-decision card. Sits above the quick keys so the answer is the
     nearest thing to your thumb, and shows the raw screen under the parsed
     question - the question is the string an agent controls. */
  /* flex:none: the answer is never what gets squeezed when the column runs
     short. Before this the quick-keys row was compressed from 45px to 8px on
     a 320px-wide phone. */
  #decision{background:var(--bg2);padding:0 8px;flex:none}
  #decision .card{border:1px solid var(--ac);border-radius:10px;padding:10px;margin:8px 0;background:var(--bg3)}
  #decision .q{font-weight:600;margin-bottom:6px;line-height:1.35}
  #decision .tail{margin:0 0 8px;padding:8px;background:var(--bg);border:1px solid var(--bd);border-radius:8px;color:var(--mu);font-family:monospace;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:30vh;max-height:30dvh;overflow:auto}
  #decision .acts{display:flex;gap:8px}
  #decision .acts button{flex:1;min-height:44px;border-radius:8px;font-size:15px;font-weight:600}
  #decision .acts .approve{background:var(--ac);color:#14110d;border:none}
  #decision .acts .deny{background:var(--bg3);border:1px solid var(--bd);color:var(--tx)}
  #decision .acts button[disabled]{opacity:.45}
  #decision .dnote{margin:0 0 8px;font-size:13px;color:var(--mu);line-height:1.4}
  #decision .dnote.bad{color:var(--clay)}
  .badge.needs{color:var(--ac);border-color:var(--ac)!important}
</style>
</head>
<body>
<div id="app">
  <header>
    <button id="back" style="display:none">‹</button>
    <span class="brand" id="title">DevDeck</span>
    <nav id="nav">
      <button data-v="list" class="active">Sessions</button>
      <button data-v="files">Files</button>
      <button data-v="ai">AI</button>
      <button data-v="http">HTTP</button>
      <button data-v="db">DB</button>
    </nav>
    <span id="status">connecting…</span>
  </header>
  <div id="list"></div>
  <div id="http-view">
    <div class="row">
      <select id="h-method"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
      <input class="f" id="h-url" placeholder="https://api.example.com" />
    </div>
    <div class="lbl">Headers (one per line, Key: Value)</div>
    <textarea id="h-headers"></textarea>
    <div class="lbl">Body</div>
    <textarea id="h-body"></textarea>
    <button class="send-btn" id="h-send">Send</button>
    <div class="res" id="h-res" style="display:none"></div>
  </div>
  <div id="db-view">
    <div class="row">
      <select id="d-conn"><option value="">Select connection…</option></select>
    </div>
    <div id="d-tables"></div>
    <div class="lbl">SQL</div>
    <textarea id="d-sql">SELECT 1;</textarea>
    <button class="send-btn" id="d-run">Run</button>
    <div class="res" id="d-res" style="display:none"></div>
  </div>
  <div id="files-view">
    <div class="row" id="f-projrow">
      <select id="f-proj"><option value="">Select project…</option></select>
    </div>
    <div class="crumb" id="f-crumb"></div>
    <div id="f-tree"></div>
    <div id="f-editor" style="display:none">
      <div class="lbl" id="f-name"></div>
      <textarea id="f-content" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
      <div class="row">
        <button class="send-btn" id="f-save">Save</button>
        <button class="ghost" id="f-close">Close</button>
      </div>
      <div class="res" id="f-status" style="display:none"></div>
    </div>
  </div>
  <div id="ai-view">
    <div class="lbl">Send to agent session</div>
    <select id="a-sess"><option value="">Select an agent session…</option></select>
    <div class="lbl">Prompt</div>
    <textarea id="a-prompt" placeholder="Ask the agent…" autocapitalize="off"></textarea>
    <div class="row">
      <button class="ghost" id="a-mention">@ file</button>
      <button class="send-btn" id="a-send">Send</button>
    </div>
    <div class="mention" id="a-files" style="display:none">
      <input class="f" id="a-filter" placeholder="filter files…" autocapitalize="off" autocomplete="off" autocorrect="off" />
      <div id="a-filelist"></div>
    </div>
    <div class="res" id="a-status" style="display:none"></div>
  </div>
  <div id="term-view">
    <div id="term"></div>
    <div id="decision"></div>
    <div class="keys">
      <button data-k="\\r">⏎</button>
      <button data-k="\\u0003">⌃C</button>
      <button data-k="\\u001b">esc</button>
      <button data-k="\\t">⇥</button>
      <button data-k="\\u001b[A">↑</button>
      <button data-k="\\u001b[B">↓</button>
      <button data-k="\\u001b[D">←</button>
      <button data-k="\\u001b[C">→</button>
    </div>
    <div id="bar">
      <input type="file" id="file" style="display:none" />
      <button id="attach" title="Attach a screenshot or file">📎</button>
      <input id="inp" placeholder="type, then Send (adds Enter)" autocapitalize="off" autocomplete="off" autocorrect="off" />
      <button id="send">Send</button>
    </div>
  </div>
</div>
<script src="/xterm.js"></script>
<script>
  // The device token now travels as an HttpOnly cookie, set on enrolment and
  // sent automatically on every request - this page never sees it. All that's
  // left to do here is drop a first-time pairing '?token=' from the address
  // bar so it doesn't linger in history or a screenshot.
  if (location.search) history.replaceState(null, '', location.pathname);
  var statusEl = document.getElementById('status');
  var listEl = document.getElementById('list');
  var termView = document.getElementById('term-view');
  var titleEl = document.getElementById('title');
  var backBtn = document.getElementById('back');
  var httpView=document.getElementById('http-view'), dbView=document.getElementById('db-view');
  var filesView=document.getElementById('files-view'), aiView=document.getElementById('ai-view');
  var ws, term, attachedId = null, sessions = [], prevStatus = {}, notifyAsked = false;
  var projs=[], froot='', fcur='', fpath='', aFiles=[];
  // The decision currently on screen, whether a tap is in flight, and the last
  // thing the server said about one. 'submitting' is the double-tap guard: a
  // second tap is how the wrong digit reaches a live agent.
  var pendingId=null, submitting=false, dnote='', dnoteBad=false, dnoteTimer=null, submitTimer=null;

  // Ask for OS-notification permission on the first user gesture (browsers
  // require one). Notifications only fire on a secure context (https / Tailscale
  // with TLS); on a plain-http LAN link the title badge + beep still work.
  function ensureNotify(){ if(notifyAsked) return; notifyAsked=true; try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }catch(e){} }
  document.addEventListener('click', ensureNotify, true);

  function beep(){ try{ var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; var a=new AC(); var o=a.createOscillator(), g=a.createGain(); o.connect(g); g.connect(a.destination); o.type='sine'; o.frequency.value=660; g.gain.value=0.06; o.start(); setTimeout(function(){ try{o.stop();a.close();}catch(e){} },180); }catch(e){} }

  function updateBadge(){ var n=sessions.filter(function(s){return s.status==='attention';}).length; document.title=(n?('('+n+') '):'')+'DevDeck Remote'; }

  // Alert when an agent needs you and you're not already looking at it.
  function notifyAttention(s){
    if(!document.hidden && attachedId===s.termId) return;
    beep();
    try{ if('Notification' in window && Notification.permission==='granted'){ var n=new Notification(s.tabName+' needs you', {body:(s.projectName||'')+' · '+(s.badge||'agent'), tag:s.termId}); n.onclick=function(){ window.focus(); openTerm(s.termId); n.close(); }; } }catch(e){}
  }

  function showView(v){
    listEl.style.display = v==='list'?'block':'none';
    termView.style.display = v==='term'?'flex':'none';
    httpView.style.display = v==='http'?'flex':'none';
    dbView.style.display = v==='db'?'flex':'none';
    filesView.style.display = v==='files'?'flex':'none';
    aiView.style.display = v==='ai'?'flex':'none';
    document.getElementById('nav').style.display = v==='term'?'none':'flex';
    backBtn.style.display = v==='term'?'block':'none';
    [].forEach.call(document.querySelectorAll('#nav button'),function(b){ b.classList.toggle('active', b.getAttribute('data-v')===v); });
    if(v!=='term'){ attachedId=null; dnote=''; renderDecision(); }
    if(v==='list') titleEl.textContent='DevDeck';
    if(v==='http') titleEl.textContent='HTTP';
    if(v==='db'){ titleEl.textContent='Database'; sendMsg({t:'db:conns'}); }
    if(v==='files'){ titleEl.textContent='Files'; sendMsg({t:'projects'}); }
    if(v==='ai'){ titleEl.textContent='AI'; fillSessSelect(); }
  }
  [].forEach.call(document.querySelectorAll('#nav button'),function(b){ b.onclick=function(){ showView(b.getAttribute('data-v')); }; });

  function connect(){
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // No token on the URL - the device cookie rides along automatically on
    // this same-origin upgrade request.
    ws = new WebSocket(proto + '://' + location.host + '/ws');
    ws.onopen = function(){ statusEl.textContent = 'connected'; };
    ws.onclose = function(){
      statusEl.textContent = 'disconnected - retrying';
      // A tap in flight when the socket died has an unknown fate: it may have
      // been written to the pty before the close, or never have arrived.
      if(submitting){ clearSubmit(); setNote('Connection dropped - the answer may not have arrived. Check the terminal.', true); }
      setTimeout(connect, 1500);
    };
    ws.onmessage = function(e){
      var m = JSON.parse(e.data);
      if(m.t === 'sessions'){
        m.sessions.forEach(function(s){ if(s.status==='attention' && prevStatus[s.termId]!=='attention') notifyAttention(s); });
        prevStatus={}; m.sessions.forEach(function(s){ prevStatus[s.termId]=s.status; });
        sessions = m.sessions; updateBadge(); if(!attachedId) renderList(); renderDecision();
      }
      else if(m.t === 'choice:res'){
        // Three-valued on purpose. A binary success/failure invites a retry, and
        // a retry is how the wrong digit reaches a live agent - so anything that
        // is not an accepted answer says what happened, in the server's words.
        clearSubmit();
        if(m.outcome === 'accepted') setNote('Answered ✓', false);
        else setNote(m.reason || 'Response unconfirmed - check the terminal before answering again.', true);
      }
      else if(m.t === 'data' && m.id === attachedId && term){ term.write(m.data); }
      else if(m.t === 'exit' && m.id === attachedId && term){ term.write('\\r\\n\\x1b[90m'+(m.notice||'[process exited]')+'\\x1b[0m\\r\\n'); }
      else if(m.t === 'upload:done'){ statusEl.textContent = m.error ? ('upload failed: '+m.error) : ('attached → path inserted'); setTimeout(function(){statusEl.textContent='connected';},2500); }
      else if(m.t === 'http:res'){ renderResult(document.getElementById('h-res'), m.res); }
      else if(m.t === 'db:res'){ renderResult(document.getElementById('d-res'), m.res); }
      else if(m.t === 'db:conns'){ var sel=document.getElementById('d-conn'); var cur=sel.value; sel.innerHTML='<option value="">Select connection…</option>'+m.conns.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+' ('+c.kind+')</option>';}).join(''); sel.value=cur; }
      else if(m.t === 'db:tables'){ var dt=document.getElementById('d-tables'); dt.innerHTML=(m.tables||[]).map(function(t){return '<div class="tbl-item" data-t="'+esc(t)+'">'+esc(t)+'</div>';}).join(''); [].forEach.call(dt.querySelectorAll('.tbl-item'),function(el){ el.onclick=function(){ document.getElementById('d-sql').value='SELECT * FROM '+el.getAttribute('data-t')+' LIMIT 100;'; }; }); }
      else if(m.t === 'projects'){ projs=m.projects||[]; var ps=document.getElementById('f-proj'); var cur=ps.value; ps.innerHTML='<option value="">Select project…</option>'+projs.map(function(p){return '<option value="'+esc(p.path)+'">'+esc(p.name)+'</option>';}).join(''); ps.value=cur; }
      else if(m.t === 'fs:tree'){ if(m.error){ document.getElementById('f-tree').innerHTML='<div class="empty">'+esc(m.error)+'</div>'; } else { renderTree(m.path, m.entries||[]); } }
      else if(m.t === 'fs:read'){ if(m.error){ fstatus(m.error,true); } else { openEditor(m.path, m.content); } }
      else if(m.t === 'fs:write'){ if(m.error){ fstatus('Save failed: '+m.error,true); } else { fstatus('Saved ✓',false); } }
      else if(m.t === 'fs:files'){ aFiles=m.files||[]; renderMentions(); }
    };
  }
  function sendMsg(o){ if(ws && ws.readyState===1) ws.send(JSON.stringify(o)); }

  function renderResult(el, res){
    el.style.display='block';
    if(!res){ el.textContent='(no response)'; return; }
    if(res.ok===false){ el.textContent='Error: '+(res.error||'failed'); return; }
    if(res.columns){
      var cols=res.columns, rows=res.rows||[];
      el.innerHTML='<div style="margin-bottom:6px;color:#8c9a68">'+(res.rowCount!=null?res.rowCount:rows.length)+' rows · '+res.timeMs+' ms</div><div style="overflow:auto"><table class="gridtbl"><thead><tr>'+cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+cols.map(function(c){var v=row[c];return '<td>'+esc(v==null?'NULL':(typeof v==='object'?JSON.stringify(v):String(v)))+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
    } else {
      el.textContent=(res.status?res.status+' '+(res.statusText||''):'')+' · '+res.timeMs+' ms\\n\\n'+(res.body||'');
    }
  }

  document.getElementById('h-send').onclick=function(){
    var headers={}; document.getElementById('h-headers').value.split('\\n').forEach(function(l){ var i=l.indexOf(':'); if(i>0) headers[l.slice(0,i).trim()]=l.slice(i+1).trim(); });
    var req={ method:document.getElementById('h-method').value, url:document.getElementById('h-url').value.trim(), headers:headers, body:document.getElementById('h-body').value||undefined };
    if(!req.url) return; var r=document.getElementById('h-res'); r.style.display='block'; r.textContent='Sending…'; sendMsg({t:'http',req:req});
  };
  document.getElementById('d-conn').onchange=function(){ var pid=this.value; if(pid) sendMsg({t:'db:tables',id:pid}); else document.getElementById('d-tables').innerHTML=''; };
  document.getElementById('d-run').onclick=function(){
    var pid=document.getElementById('d-conn').value, sql=document.getElementById('d-sql').value;
    if(!pid||!sql.trim()) return; var r=document.getElementById('d-res'); r.style.display='block'; r.textContent='Running…'; sendMsg({t:'db:query',id:pid,sql:sql});
  };

  function renderList(){
    var byProj={}; sessions.forEach(function(s){ (byProj[s.projectId]=byProj[s.projectId]||{name:s.projectName,items:[]}).items.push(s); });
    var html='';
    var keys=Object.keys(byProj);
    if(!keys.length){ listEl.innerHTML='<div class="empty">No sessions running.<br>Open a terminal or Claude session on your desktop.</div>'; return; }
    keys.forEach(function(pid){
      var p=byProj[pid];
      html+='<div class="proj">'+esc(p.name).toUpperCase()+'</div>';
      p.items.forEach(function(s){
        var kindClass = s.isAgent ? 'agent' : 'shell';
        var label = s.isAgent ? (s.badge||'AGENT') : 'shell';
        html+='<div class="sess" data-id="'+s.termId+'"><span class="dot '+kindClass+' '+s.status+'"></span>'+
          '<div class="meta"><div>'+esc(s.tabName)+'</div><div class="st">'+esc(label)+' · '+s.status+'</div></div>'+
          (s.pending?'<span class="badge needs">NEEDS YOU</span>':'')+
          (s.isAgent?'<span class="badge">'+esc(s.badge||'')+'</span>':'')+'</div>';
      });
      html+='<div class="sess new" data-new="'+pid+'"><span class="dot agent"></span><div class="meta">+ New agent session</div></div>';
    });
    listEl.innerHTML=html;
    [].forEach.call(listEl.querySelectorAll('.sess[data-id]'),function(el){ el.onclick=function(){ openTerm(el.getAttribute('data-id')); }; });
    [].forEach.call(listEl.querySelectorAll('.sess[data-new]'),function(el){ el.onclick=function(){ sendMsg({t:'new',projectId:el.getAttribute('data-new')}); }; });
  }

  // What the server said about the last tap. Kept outside the card because the
  // card is gone by the time an accepted answer is worth confirming.
  function setNote(msg, bad, sticky){
    dnote=msg; dnoteBad=!!bad;
    if(dnoteTimer) clearTimeout(dnoteTimer);
    dnoteTimer=null;
    // 'Sending…' is sticky: it has to stay up until the server answers, and
    // the answer can be slower than six seconds on a phone link.
    if(!sticky) dnoteTimer=setTimeout(function(){ dnote=''; renderDecision(); }, 6000);
    renderDecision();
  }

  // A tap that is never answered must not leave the only two answer buttons
  // dead. Before this, a silent server or a socket that dropped mid-tap left
  // 'submitting' true forever: the card stayed on screen, the link came back,
  // and both buttons were greyed out with nothing said - the prompt was
  // unanswerable from the phone until you navigated away and back.
  //
  // Re-enabling is safe, and it is main's once-only rule that makes it safe:
  // consumeDecision refuses a second spend of the same decision id
  // ('Already answered.') and refuses one whose screen has moved ('moved-on'),
  // so a second tap can never put a second keystroke into the agent. What the
  // note has to be honest about is that the first tap's fate is unknown.
  function clearSubmit(){
    if(submitTimer){ clearTimeout(submitTimer); submitTimer=null; }
    submitting=false;
  }
  function armSubmitTimeout(){
    if(submitTimer) clearTimeout(submitTimer);
    submitTimer=setTimeout(function(){
      submitTimer=null;
      if(!submitting) return;
      submitting=false;
      setNote('Response unconfirmed - check the terminal before answering again.', true);
    }, 10000);
  }

  // Keep the raw excerpt showing its NEWEST end. Called on render and again on
  // resize: a rotation re-lays-out the box without re-rendering the card, and a
  // scrollTop set against the old height then sits mid-excerpt.
  function pinTail(){
    var t=document.querySelector('#decision .tail');
    if(t) t.scrollTop=t.scrollHeight;
  }

  // The card for the attached session's pending decision, if it has one.
  //
  // Driven entirely by the session list: the desktop answering a prompt, or the
  // agent moving on, arrives as a broadcast and the card leaves on its own. The
  // page never decides a decision is spent - that is main's to say, and a client
  // that guessed would offer a second tap on a prompt that already fired.
  function renderDecision(){
    var el=document.getElementById('decision');
    if(!el) return;
    var s=attachedId?sessions.filter(function(x){return x.termId===attachedId;})[0]:null;
    var p=(s&&s.pending)?s.pending:null;
    // A new question re-enables the buttons; the old one's in-flight tap is not
    // this question's business.
    if(p && p.id!==pendingId){ pendingId=p.id; submitting=false; }
    if(!p) pendingId=null;
    var html='';
    if(p){
      html+='<div class="card"><div class="q">'+esc(p.question)+'</div>'+
        '<pre class="tail">'+esc(p.tail)+'</pre><div class="acts">';
      p.options.forEach(function(o,i){
        html+='<button class="'+(i===0?'approve':'deny')+'" data-i="'+i+'"'+(submitting?' disabled':'')+'>'+
          (i===0?'✓ ':'✕ ')+esc(o.label)+'</button>';
      });
      html+='</div></div>';
    }
    if(dnote) html+='<div class="dnote'+(dnoteBad?' bad':'')+'">'+esc(dnote)+'</div>';
    el.innerHTML=html;
    // The excerpt is 16 lines in a box that fits about 12, and it opened at the
    // TOP - so the oldest line was on screen and the option lines, including the
    // '(esc)' one that Deny actually sends, were below the fold of an inner
    // scroll box that looks like static text. Show the newest end, which is the
    // part the answer is about.
    pinTail();
    if(!p) return;
    [].forEach.call(el.querySelectorAll('.acts button'),function(b){
      b.onclick=function(){
        if(submitting) return;
        // Read the option BEFORE the re-render below detaches this button.
        var opt=p.options[Number(b.getAttribute('data-i'))];
        // sendMsg is a silent no-op on a closed socket, which on a phone link is
        // the common case rather than the rare one. Saying so beats greying the
        // buttons out over a message that was never sent.
        if(!ws || ws.readyState!==1){ setNote('Not connected - nothing was sent. Check the terminal.', true); return; }
        submitting=true;
        armSubmitTimeout();
        // Sticky, and it renders: a tap with no feedback at all is what makes
        // someone tap again.
        setNote('Sending…', false, true);
        // 'send' is one of main's own recorded tokens, echoed back - never a
        // string this page composed.
        sendMsg({t:'choice',id:attachedId,decisionId:p.id,send:opt.send});
      };
    });
  }

  function fit(){
    if(!term) return;
    var probe=document.createElement('span'); probe.style.cssText='visibility:hidden;position:absolute;font-family:monospace;font-size:13px;white-space:pre';
    probe.textContent='WWWWWWWWWW'; document.body.appendChild(probe);
    var cw=probe.getBoundingClientRect().width/10; document.body.removeChild(probe);
    var box=document.getElementById('term').getBoundingClientRect();
    var cols=Math.max(20,Math.floor((box.width-12)/cw)), rows=Math.max(8,Math.floor((box.height-12)/18));
    term.resize(cols,rows); sendMsg({t:'resize',id:attachedId,cols:cols,rows:rows});
  }

  function openTerm(id){
    var s=sessions.filter(function(x){return x.termId===id;})[0];
    showView('term');
    titleEl.textContent = s ? s.tabName : 'terminal';
    document.getElementById('term').innerHTML='';
    term = new Terminal({fontFamily:'monospace',fontSize:13,cursorBlink:true,
      theme:{background:'#141312',foreground:'#e4ddcf',cursor:'#b8895c'}});
    term.open(document.getElementById('term'));
    term.onData(function(d){ sendMsg({t:'input',id:id,data:d}); });
    attachedId=id; sendMsg({t:'attach',id:id});
    clearSubmit(); dnote=''; renderDecision();
    setTimeout(fit,60);
  }

  backBtn.onclick=function(){ if(attachedId) sendMsg({t:'detach',id:attachedId}); showView('list'); };
  document.getElementById('send').onclick=function(){ var i=document.getElementById('inp'); if(attachedId){ sendMsg({t:'input',id:attachedId,data:i.value+'\\r'}); i.value=''; } };
  document.getElementById('attach').onclick=function(){ if(attachedId) document.getElementById('file').click(); };
  document.getElementById('file').onchange=function(e){
    var f=e.target.files[0]; if(!f||!attachedId) return;
    var r=new FileReader();
    r.onload=function(){ var b64=String(r.result).split(',')[1]||''; sendMsg({t:'upload',id:attachedId,name:f.name,data:b64}); statusEl.textContent='uploading '+f.name+'…'; };
    r.readAsDataURL(f); e.target.value='';
  };
  document.getElementById('inp').addEventListener('keydown',function(e){ if(e.key==='Enter'){ document.getElementById('send').click(); }});
  [].forEach.call(document.querySelectorAll('.keys button'),function(b){ b.onclick=function(){ if(attachedId) sendMsg({t:'input',id:attachedId,data:b.getAttribute('data-k')}); }; });
  window.addEventListener('resize',function(){ if(attachedId){ fit(); pinTail(); } });

  // ----- Files (browse + edit + save) -----
  function loadTree(path){ fcur=path; sendMsg({t:'fs:tree',path:path}); }
  function renderTree(path, entries){
    fcur=path;
    var rel=path.slice(froot.length).replace(/^[\\\\/]+/,'');
    document.getElementById('f-crumb').textContent='/'+rel;
    var html = path!==froot ? '<div class="tbl-item" data-up="1">⬑ ..</div>' : '';
    entries.forEach(function(e){ html+='<div class="tbl-item" data-p="'+esc(e.path)+'" data-d="'+(e.isDir?1:0)+'">'+(e.isDir?'📁 ':'📄 ')+esc(e.name)+'</div>'; });
    var tree=document.getElementById('f-tree'); tree.innerHTML=html||'<div class="empty">Empty folder.</div>';
    [].forEach.call(tree.querySelectorAll('.tbl-item'),function(el){ el.onclick=function(){
      if(el.getAttribute('data-up')){ var up=fcur.replace(/[\\\\/][^\\\\/]+[\\\\/]?$/,''); if(up.length<froot.length) up=froot; loadTree(up); return; }
      var p=el.getAttribute('data-p'); if(el.getAttribute('data-d')==='1') loadTree(p); else sendMsg({t:'fs:read',path:p});
    }; });
  }
  function openEditor(path, content){
    fpath=path;
    document.getElementById('f-projrow').style.display='none';
    document.getElementById('f-crumb').style.display='none';
    document.getElementById('f-tree').style.display='none';
    document.getElementById('f-editor').style.display='flex';
    document.getElementById('f-name').textContent=path.split(/[\\\\/]/).pop();
    document.getElementById('f-content').value=content;
    document.getElementById('f-status').style.display='none';
  }
  function closeEditor(){
    fpath='';
    document.getElementById('f-editor').style.display='none';
    document.getElementById('f-projrow').style.display='flex';
    document.getElementById('f-crumb').style.display='block';
    document.getElementById('f-tree').style.display='block';
  }
  function fstatus(msg, err){ var el=document.getElementById('f-status'); el.style.display='block'; el.textContent=msg; el.style.color=err?'var(--clay)':'var(--moss)'; }
  document.getElementById('f-proj').onchange=function(){ froot=this.value; closeEditor(); if(froot) loadTree(froot); else document.getElementById('f-tree').innerHTML=''; };
  document.getElementById('f-save').onclick=function(){ if(!fpath) return; fstatus('Saving…',false); sendMsg({t:'fs:write',path:fpath,content:document.getElementById('f-content').value}); };
  document.getElementById('f-close').onclick=closeEditor;

  // ----- AI (compose a prompt → fire at an agent session) -----
  function fillSessSelect(){
    var sel=document.getElementById('a-sess'), cur=sel.value;
    var ags=sessions.filter(function(s){return s.isAgent;});
    sel.innerHTML='<option value="">Select an agent session…</option>'+ags.map(function(s){return '<option value="'+s.termId+'">'+esc(s.tabName)+' — '+esc(s.projectName)+'</option>';}).join('');
    if(ags.some(function(s){return s.termId===cur;})) sel.value=cur;
  }
  function renderMentions(){
    var q=(document.getElementById('a-filter').value||'').toLowerCase();
    var list=aFiles.filter(function(f){return !q||f.toLowerCase().indexOf(q)>=0;}).slice(0,100);
    var box=document.getElementById('a-filelist');
    box.innerHTML=list.map(function(f){return '<div class="tbl-item" data-f="'+esc(f)+'">'+esc(f)+'</div>';}).join('')||'<div class="empty">No files.</div>';
    [].forEach.call(box.querySelectorAll('.tbl-item'),function(el){ el.onclick=function(){ var ta=document.getElementById('a-prompt'); ta.value=(ta.value?ta.value.replace(/\\s*$/,'')+' ':'')+'@'+el.getAttribute('data-f')+' '; document.getElementById('a-files').style.display='none'; ta.focus(); }; });
  }
  function aistatus(msg, err){ var el=document.getElementById('a-status'); el.style.display='block'; el.textContent=msg; el.style.color=err?'var(--clay)':'var(--moss)'; }
  document.getElementById('a-send').onclick=function(){ var id=document.getElementById('a-sess').value, p=document.getElementById('a-prompt').value; if(!id){ aistatus('Pick a session first.',true); return; } if(!p.trim()) return; sendMsg({t:'input',id:id,data:p+'\\r'}); aistatus('Sent to session ✓',false); document.getElementById('a-prompt').value=''; };
  document.getElementById('a-mention').onclick=function(){ var id=document.getElementById('a-sess').value; var s=sessions.filter(function(x){return x.termId===id;})[0]; var box=document.getElementById('a-files'); if(!s){ aistatus('Pick a session first.',true); return; } if(box.style.display==='block'){ box.style.display='none'; return; } sendMsg({t:'fs:files',root:s.projectPath}); box.style.display='block'; };
  document.getElementById('a-filter').addEventListener('input', renderMentions);

  function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  connect();
</script>
</body>
</html>`
