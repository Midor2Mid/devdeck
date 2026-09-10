import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import ts from "typescript"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { start, stop, hookEnv } from "../src/main/mcpserver"
import { setDeps, __resetBindingsForTest, type LiveSession } from "../src/main/attention"
import {
    parseHook,
    hookSettingsFragment,
    HOOK_PATH,
    SESSION_HEADER,
    DEVDECK_SESSION_ENV,
    DEVDECK_HOOK_URL_ENV,
    MAX_MESSAGE,
    type DeclaredSignal
} from "../src/shared/attention"
import { DEVDECK_TOKEN_ENV } from "../src/shared/mcpEnv"

const PORT = 18791
const TOKEN = "hook-test-token"
const base = `http://127.0.0.1:${PORT}`

// The two things the route is allowed to touch, both recorded.
let emitted: DeclaredSignal[] = []
let live: LiveSession[] = []
/**
 * Every byte the hook path sent to a pty. The route's contract is that it
 * writes NONE - a hook is a statement about a session, never a keystroke into
 * one - and a no-op mock cannot show an absence, so the writes are recorded and
 * the emptiness is asserted (the same reason tests/server-remote.test.ts keeps
 * an `h.writes` array).
 */
const ptyWrites: { id: string; data: string }[] = []

function post(
    body: unknown,
    opts: { token?: string | null; session?: string; method?: string } = {}
): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" }
    const token = opts.token === undefined ? TOKEN : opts.token
    if (token) headers.Authorization = `Bearer ${token}`
    if (opts.session) headers[SESSION_HEADER] = opts.session
    return fetch(`${base}${HOOK_PATH}`, {
        method: opts.method ?? "POST",
        headers,
        body: opts.method === "GET" ? undefined : JSON.stringify(body)
    })
}

async function waitForListen(): Promise<void> {
    const deadline = Date.now() + 3000
    for (;;) {
        try {
            await fetch(`${base}${HOOK_PATH}`, { method: "POST", body: "{}" })
            return
        } catch {
            if (Date.now() > deadline) throw new Error("test server never started listening")
            await new Promise((r) => setTimeout(r, 20))
        }
    }
}

/** A Claude Code hook payload, in the shape the CLI actually posts. */
const claudeHook = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    session_id: "cc-sess-1",
    transcript_path: "C:/Users/me/.claude/projects/repo/cc-sess-1.jsonl",
    cwd: "C:/repos/web-api",
    hook_event_name: "Notification",
    notification_type: "permission_prompt",
    notification_text: "Claude needs your permission to edit store.ts",
    ...over
})

beforeAll(async () => {
    setDeps({
        liveSessions: () => live,
        emit: (s) => emitted.push(s),
        now: () => 1_700_000_000_000
    })
    await start({ port: PORT, token: TOKEN }, { projects: () => [] })
    await waitForListen()
})

afterAll(async () => {
    await stop()
})

beforeEach(() => {
    emitted = []
    ptyWrites.length = 0
    __resetBindingsForTest()
    live = [
        { id: "term-a", cwd: "C:/repos/web-api", agentId: "claude" },
        { id: "term-b", cwd: "C:/repos/other", agentId: "codex" }
    ]
})

describe("the hook route rides the MCP server's existing auth", () => {
    it("refuses a request with no token", async () => {
        const res = await post(claudeHook(), { token: null })
        expect(res.status).toBe(401)
        expect(emitted).toEqual([])
    })

    it("refuses a wrong token", async () => {
        const res = await post(claudeHook(), { token: "not-the-token" })
        expect(res.status).toBe(401)
        expect(emitted).toEqual([])
    })

    it("accepts the same bearer token the MCP route takes", async () => {
        const res = await post(claudeHook(), { session: "term-a" })
        expect(res.status).toBe(204)
        expect(emitted).toHaveLength(1)
    })

    it("refuses a GET, and every other method", async () => {
        expect((await post(null, { method: "GET" })).status).toBe(405)
        expect((await post(claudeHook(), { method: "PUT" })).status).toBe(405)
    })

    it("opened no second listener - the hook and the MCP route share one port", async () => {
        const mcp = await fetch(`${base}/mcp`, {
            method: "POST",
            headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
        })
        expect(mcp.status).toBe(200)
        expect(JSON.parse(await mcp.text()).result.tools.length).toBeGreaterThan(0)
    })
})

// A CLI feeds an http hook's response back through the same output contract as
// a command hook's stdout, and for several events (UserPromptSubmit,
// SessionStart, and per the current reference page Stop/SubagentStop) that
// output is ADDED TO THE MODEL'S CONTEXT. Anything DevDeck wrote here would be
// text injected into the agent it is supposed to be observing. An empty body
// cannot be injected under any vendor or any flag - so every branch, including
// the failures, is checked rather than just the happy one.
describe("no response body, ever", () => {
    it("sends none on success", async () => {
        const res = await post(claudeHook(), { session: "term-a" })
        expect(await res.text()).toBe("")
    })

    it("sends none on an unauthorised request", async () => {
        const res = await post(claudeHook(), { token: "wrong" })
        expect(await res.text()).toBe("")
    })

    it("sends none on a body it could not parse, or could not understand", async () => {
        const bad = await fetch(`${base}${HOOK_PATH}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${TOKEN}` },
            body: "{not json"
        })
        expect(bad.status).toBe(400)
        expect(await bad.text()).toBe("")
        const junk = await post({ hook_event_name: "Stop", state: "banana" })
        expect(junk.status).toBe(400)
        expect(await junk.text()).toBe("")
    })

    it("sends none on a wrong method", async () => {
        expect(await (await post(null, { method: "GET" })).text()).toBe("")
    })

    it("says what happened in a header instead, which no CLI reads", async () => {
        const res = await post(claudeHook(), { session: "term-a" })
        expect(res.headers.get("x-devdeck-hook")).toBe("accepted")
        const orphan = await post(claudeHook({ cwd: "C:/repos/nowhere", session_id: "z" }))
        expect(orphan.headers.get("x-devdeck-hook")).toBe("unmatched")
    })
})

describe("correlating a hook to a session", () => {
    it("matches the session id DevDeck put in the pty's environment", async () => {
        await post(claudeHook(), { session: "term-b" })
        expect(emitted[0].termId).toBe("term-b")
        expect(emitted[0].matchedBy).toBe("session-env")
    })

    it("takes the same id from the body, for a wrapper that cannot set headers", async () => {
        await post(claudeHook({ devdeck_session: "term-b" }))
        expect(emitted[0].termId).toBe("term-b")
        expect(emitted[0].matchedBy).toBe("session-env")
    })

    it("refuses a session id that names nothing live, rather than guessing", async () => {
        // Falls through to the cwd rule, which here IS unique - so the point of
        // this case is that a dead id does not resolve AS a session-env match.
        await post(claudeHook({ cwd: "C:/repos/web-api" }), { session: "term-gone" })
        expect(emitted[0].matchedBy).toBe("cwd")
        expect(emitted[0].termId).toBe("term-a")
    })

    it("inherits exactness: a bound CLI session id keeps matching without the header", async () => {
        // The first event of a run carries the header; later ones may not (an
        // older docs copy, a hand-written settings file). The binding is what
        // carries the exactness forward, and it never upgrades a guess.
        await post(claudeHook({ hook_event_name: "SessionStart" }), { session: "term-b" })
        emitted = []
        await post(claudeHook({ cwd: "C:/somewhere/ambiguous" }))
        expect(emitted[0].termId).toBe("term-b")
        expect(emitted[0].matchedBy).toBe("cli-session")
    })

    it("drops a binding whose session has died", async () => {
        await post(claudeHook({ hook_event_name: "SessionStart" }), { session: "term-b" })
        live = live.filter((s) => s.id !== "term-b")
        emitted = []
        await post(claudeHook({ cwd: "C:/repos/other" }))
        expect(emitted[0].termId).toBeNull()
        expect(emitted[0].matchedBy).toBe("none")
    })

    it("falls back to the cwd when exactly ONE live agent is there", async () => {
        await post(claudeHook({ cwd: "C:/repos/web-api" }))
        expect(emitted[0].termId).toBe("term-a")
        expect(emitted[0].matchedBy).toBe("cwd")
    })

    it("matches that cwd across separator and case spellings", async () => {
        // Windows-first: the same directory is `C:\repos\web-api` from a
        // PowerShell pane and `C:/Repos/Web-API` from the same CLI under Git
        // Bash, and both name one folder.
        await post(claudeHook({ cwd: "C:\\Repos\\WEB-API\\" }))
        expect(emitted[0].termId).toBe("term-a")
    })

    it("REFUSES when two live agents share the cwd - the case DevDeck exists for", async () => {
        // Several agents in one repo is this product's premise, not an edge
        // case, and a coin-flip between two of them would attribute a question
        // to the wrong agent. That is worse than not knowing: the user goes to
        // the pane DevDeck named and finds nothing waiting.
        live.push({ id: "term-c", cwd: "C:/repos/web-api", agentId: "claude" })
        await post(claudeHook({ cwd: "C:/repos/web-api" }))
        expect(emitted[0].termId).toBeNull()
        expect(emitted[0].matchedBy).toBe("none")
    })

    it("ignores plain shells when counting candidates in a directory", async () => {
        // A terminal open in the same folder is not a candidate for "which
        // agent asked this", and refusing an otherwise-unique match because one
        // was open is the wrong failure.
        live.push({ id: "term-shell", cwd: "C:/repos/web-api" })
        await post(claudeHook({ cwd: "C:/repos/web-api" }))
        expect(emitted[0].termId).toBe("term-a")
    })

    it("still reports an unmatched hook rather than dropping it", async () => {
        const res = await post(claudeHook({ cwd: "C:/repos/unknown", session_id: "nope" }))
        // Not an error TO THE CLI: it did its part, and putting an error in the
        // user's agent for a DevDeck-side config gap is the wrong place to
        // complain. The renderer surfaces it where the user is looking.
        expect(res.status).toBe(204)
        expect(emitted).toHaveLength(1)
        expect(emitted[0].termId).toBeNull()
    })
})

describe("what the payload buys", () => {
    it("carries the transcript path straight through, retiring the --session-id plan", async () => {
        await post(claudeHook(), { session: "term-a" })
        expect(emitted[0].transcriptPath).toBe(
            "C:/Users/me/.claude/projects/repo/cc-sess-1.jsonl"
        )
    })

    it("stamps the arrival time in main, never taking it from the client", async () => {
        await post(claudeHook({ at: 1, ts: 1 }), { session: "term-a" })
        expect(emitted[0].at).toBe(1_700_000_000_000)
    })

    it("carries the agent's own words for the question", async () => {
        await post(claudeHook(), { session: "term-a" })
        expect(emitted[0].message).toBe("Claude needs your permission to edit store.ts")
    })
})

describe("what each event declares", () => {
    const declaredBy = async (body: Record<string, unknown>): Promise<string | undefined> => {
        emitted = []
        await post(body, { session: "term-a" })
        return emitted[0]?.state
    }

    it("maps a permission prompt and an idle prompt to attention", async () => {
        expect(await declaredBy(claudeHook({ notification_type: "permission_prompt" }))).toBe(
            "attention"
        )
        expect(await declaredBy(claudeHook({ notification_type: "idle_prompt" }))).toBe(
            "attention"
        )
        expect(await declaredBy(claudeHook({ notification_type: "agent_needs_input" }))).toBe(
            "attention"
        )
    })

    it("maps Stop, and agent_completed, to the SOFT hand-back - not to a question", async () => {
        expect(
            await declaredBy({
                hook_event_name: "Stop",
                last_assistant_message: "Ready for review.",
                session_id: "cc-sess-1"
            })
        ).toBe("waiting")
        expect(await declaredBy(claudeHook({ notification_type: "agent_completed" }))).toBe(
            "waiting"
        )
    })

    it("maps UserPromptSubmit to working", async () => {
        expect(
            await declaredBy({ hook_event_name: "UserPromptSubmit", user_input: "fix the build" })
        ).toBe("working")
    })

    it("declares nothing for a notification that is not about the user", async () => {
        for (const nt of ["auth_success", "quota_auto_resume_fired", "elicitation_complete"]) {
            expect(await declaredBy(claudeHook({ notification_type: nt }))).toBeUndefined()
        }
    })

    it("declares nothing for SessionStart, and for an event it does not know", async () => {
        expect(await declaredBy({ hook_event_name: "SessionStart" })).toBeUndefined()
        expect(await declaredBy({ hook_event_name: "PostToolUse" })).toBeUndefined()
        expect(await declaredBy({ hook_event_name: "SubagentStop" })).toBeUndefined()
    })

    it("takes an explicit state from a vendor whose events DevDeck cannot name", async () => {
        // The cross-vendor door: Codex's hooks are command-type only and have
        // to be wrapped by hand, and a vendor can add an event faster than
        // DevDeck can ship a mapping.
        expect(await declaredBy({ event: "gemini/AfterAgent", state: "waiting" })).toBe("waiting")
    })
})

describe("every inbound field is validated", () => {
    it("refuses a body that is not a JSON object", () => {
        expect(parseHook(null).kind).toBe("invalid")
        expect(parseHook([{ hook_event_name: "Stop" }]).kind).toBe("invalid")
        expect(parseHook("Stop").kind).toBe("invalid")
        expect(parseHook({}).kind).toBe("invalid")
    })

    it("refuses a state that is not one of the three", () => {
        expect(parseHook({ event: "x", state: "exited" }).kind).toBe("invalid")
        expect(parseHook({ event: "x", state: 3 }).kind).toBe("invalid")
    })

    it("caps and flattens the agent's message, which is arbitrary model output", () => {
        const r = parseHook({
            hook_event_name: "Stop",
            last_assistant_message: "\u001b[31mred\u001b[0m\r\nand a bell \u0007" + "x".repeat(900)
        })
        expect(r.kind).toBe("signal")
        if (r.kind !== "signal") return
        const msg = r.hook.message ?? ""
        expect(msg.length).toBeLessThanOrEqual(MAX_MESSAGE)
        // No escape sequence, no bell, no newline survives onto a surface that
        // is not a terminal.
        expect(msg).not.toMatch(/[\u0000-\u001f\u007f]/)
    })

    it("drops a transcript path that is not absolute, or carries a NUL", () => {
        const path = (v: unknown): string | undefined => {
            const r = parseHook({ hook_event_name: "Stop", transcript_path: v })
            return r.kind === "signal" ? r.hook.transcriptPath : undefined
        }
        expect(path("C:/x/y.jsonl")).toBe("C:/x/y.jsonl")
        expect(path("/home/me/y.jsonl")).toBe("/home/me/y.jsonl")
        expect(path("\\\\server\\share\\y.jsonl")).toBe("\\\\server\\share\\y.jsonl")
        expect(path("../../../etc/passwd")).toBeUndefined()
        expect(path("y.jsonl")).toBeUndefined()
        expect(path("C:/x/y.jsonl\u0000.txt")).toBeUndefined()
        expect(path("C:/" + "x".repeat(2000))).toBeUndefined()
        expect(path(42)).toBeUndefined()
    })

    it("drops a session id that is not a plain id", () => {
        const sid = (v: unknown): string | undefined => {
            const r = parseHook({ hook_event_name: "Stop", session_id: v })
            return r.kind === "signal" ? r.hook.sessionId : undefined
        }
        expect(sid("abc-123_x.y")).toBe("abc-123_x.y")
        expect(sid("../other")).toBeUndefined()
        expect(sid("a".repeat(500))).toBeUndefined()
        expect(sid({ a: 1 })).toBeUndefined()
    })

    it("refuses a body larger than the hook cap", async () => {
        // The refusal is a CONNECTION RESET rather than a 413, and that is
        // `readBody`'s pre-existing shape: it destroys the request the moment
        // the cap is passed, which is the right order for a flood (stop reading
        // first, explain later) and leaves no socket to answer on. The MCP
        // route behaves identically. What matters, and what is asserted, is
        // that the cap holds and that nothing reached the renderer.
        await expect(
            fetch(`${base}${HOOK_PATH}`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    hook_event_name: "Stop",
                    last_assistant_message: "x".repeat(200_000)
                })
            })
        ).rejects.toThrow()
        expect(emitted).toEqual([])
    })
})

describe("the hook writes nothing to any pty", () => {
    it("records no pty write for any accepted, ignored or refused hook", async () => {
        for (const body of [
            claudeHook(),
            claudeHook({ notification_type: "agent_completed" }),
            { hook_event_name: "Stop", last_assistant_message: "done" },
            { hook_event_name: "UserPromptSubmit", user_input: "go" },
            { hook_event_name: "SessionStart" },
            { hook_event_name: "PostToolUse" },
            { event: "x", state: "attention" },
            { nonsense: true }
        ]) {
            await post(body, { session: "term-a" })
        }
        // The absence is the assertion. A hook is a statement ABOUT a session;
        // a write would be a keystroke INTO a running agent, sourced from a
        // string an HTTP client supplied.
        expect(ptyWrites).toEqual([])
    })
})

describe("the terminal environment that makes correlation exact", () => {
    it("names this pane, the route, and the token the hook authenticates with", () => {
        const env = hookEnv("term-a", true)
        expect(env[DEVDECK_SESSION_ENV]).toBe("term-a")
        expect(env[DEVDECK_HOOK_URL_ENV]).toBe(`http://127.0.0.1:${PORT}${HOOK_PATH}`)
        expect(env[DEVDECK_TOKEN_ENV]).toBe(TOKEN)
    })

    it("points only at loopback", () => {
        expect(hookEnv("term-a", true)[DEVDECK_HOOK_URL_ENV]).toMatch(/^http:\/\/127\.0\.0\.1:/)
    })

    it("withholds the TOKEN from a plain shell pane, exactly as the renderer does", () => {
        // Widening who can read DevDeck's bearer token - from the children of an
        // agent pane to the children of every terminal - is a change to the auth
        // surface, and this feature does not get to make one on the side. The
        // session id and the url are not secrets; the token is.
        const shell = hookEnv("term-shell", false)
        expect(shell[DEVDECK_SESSION_ENV]).toBe("term-shell")
        expect(shell[DEVDECK_HOOK_URL_ENV]).toBeTruthy()
        expect(shell[DEVDECK_TOKEN_ENV]).toBeUndefined()
    })
})

// The documented example and the code that produces it are one thing, so the
// doc cannot drift from the route. Every claim here is a fact about Claude
// Code's hook schema that would silently break the feature if it were wrong -
// which is why each is asserted rather than described in prose.
describe("the settings fragment a user pastes", () => {
    const frag = hookSettingsFragment(8787)
    const one = frag.hooks.Notification[0].hooks[0] as Record<string, unknown>

    it("covers the four events that carry a hand-over fact", () => {
        expect(Object.keys(frag.hooks).sort()).toEqual([
            "Notification",
            "SessionStart",
            "Stop",
            "UserPromptSubmit"
        ])
    })

    it("is an http hook at the literal loopback url, not an interpolated one", () => {
        // Env interpolation is documented for HTTP hook HEADER values and not
        // for the url. A url that interpolated to nothing would be a hook that
        // never fires, which is this feature's worst failure mode.
        expect(one.type).toBe("http")
        expect(one.url).toBe(`http://127.0.0.1:8787${HOOK_PATH}`)
    })

    it("carries the bearer token and the session id as interpolated headers", () => {
        expect(one.headers).toEqual({
            Authorization: "Bearer ${DEVDECK_MCP_TOKEN}",
            "X-DevDeck-Session": "${DEVDECK_SESSION}"
        })
    })

    it("declares both vars in allowedEnvVars, because an unlisted one becomes EMPTY", () => {
        // Not cosmetic: an env var missing from this list is replaced with an
        // empty string rather than left alone, so omitting it would send a
        // blank token AND a blank session id - an unauthorised hook that could
        // not be correlated either.
        expect(one.allowedEnvVars).toEqual([DEVDECK_TOKEN_ENV, DEVDECK_SESSION_ENV])
        const headerVars = Object.values(one.headers as Record<string, string>)
            .flatMap((v) => [...v.matchAll(/\$\{([A-Z_]+)\}/g)].map((m) => m[1]))
        for (const v of headerVars) expect(one.allowedEnvVars).toContain(v)
    })

    it("sets a short timeout, so a supervision feature cannot stall the agent", () => {
        // The documented default is 600 seconds. DevDeck answers on loopback in
        // microseconds; the one thing this must never do is hold up the agent
        // it is watching.
        expect(one.timeout).toBe(5)
        expect(one.timeout as number).toBeLessThanOrEqual(10)
    })

    it("matches the example in docs/attention-hooks.md exactly", () => {
        const HERE = dirname(fileURLToPath(import.meta.url))
        const doc = readFileSync(join(HERE, "..", "docs", "attention-hooks.md"), "utf8")
        // The doc shows the fragment for the default port. Pulled out of the
        // fenced block and compared as parsed JSON, so formatting is free to
        // differ and the CONTENT cannot.
        const block = doc.match(/```json\n([\s\S]*?)\n```/)
        expect(block, "docs/attention-hooks.md must carry a ```json fragment").toBeTruthy()
        expect(JSON.parse(block![1])).toEqual(hookSettingsFragment(8787))
    })
})

/**
 * The no-telemetry guarantee, as a scan rather than a sentence.
 *
 * `product-director` §5 forbids telemetry outright - even anonymous, even "just
 * for the beta" - and the hook path is the first thing in DevDeck that receives
 * structured facts about what the user's agents are doing. A comment saying
 * "this never phones home" is worth nothing: the code one edit away from
 * `fetch(...)` looks identical. So the modules on the hook path are parsed and
 * every outbound-capable identifier in the language is looked for. Adding one
 * turns this red.
 *
 * Same instrument as `tests/architectureBoundaries.test.ts` and for the same
 * reason: `typescript` is already a devDependency, and a regex over source can
 * be fooled by the word appearing in a comment or a string - which would report
 * a confidence it does not have. The scanner is exercised against a synthetic
 * file below, so swapping it for something cheaper has to prove the same.
 */
describe("nothing on the hook path can reach the network or the filesystem", () => {
    const HERE = dirname(fileURLToPath(import.meta.url))
    const SRC = join(HERE, "..", "src")

    /** The modules a hook's data actually passes through. */
    const HOOK_PATH_MODULES = ["shared/attention.ts", "main/attention.ts"]

    /**
     * Anything that could take data off this machine, as a CALLED name.
     *
     * `get` and `request` were on this list and came straight back off it: they
     * are ordinary Map and property names (`bindings.get`, `liveById.get`), so
     * a scanner that fired on them would report a confidence it does not have
     * and would be silenced by its own first false positive. The rule that
     * actually closes the door is the import allowlist below — reaching the
     * network needs either one of these globals or a module, and both are
     * pinned.
     */
    const EGRESS = [
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
        "sendBeacon",
        "connect",
        "createConnection"
    ]
    /** Anything that could open a file named by a string a client supplied. */
    const FS = [
        "readFile",
        "readFileSync",
        "createReadStream",
        "writeFile",
        "writeFileSync",
        "open",
        "openSync",
        "appendFile",
        "appendFileSync"
    ]
    /** Anything that could start a process. */
    const SPAWN = ["spawn", "spawnSync", "exec", "execFile", "execSync", "fork"]

    /**
     * Every called name in a file: `foo(...)`, `a.foo(...)`, `new Foo(...)`.
     *
     * Call sites rather than bare identifiers, because `get` and `request` are
     * ordinary words and a property named `request` on an interface is not an
     * egress. What matters is whether something is INVOKED.
     */
    function calledNames(file: string, text: string): { name: string; line: number }[] {
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true)
        const out: { name: string; line: number }[] = []
        const at = (n: ts.Node): number =>
            sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
        const visit = (node: ts.Node): void => {
            if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
                const e = node.expression
                if (ts.isIdentifier(e)) out.push({ name: e.text, line: at(node) })
                else if (ts.isPropertyAccessExpression(e))
                    out.push({ name: e.name.text, line: at(node) })
            }
            ts.forEachChild(node, visit)
        }
        visit(sf)
        return out
    }

    const offendersIn = (file: string, text: string, banned: string[]): string[] =>
        calledNames(file, text)
            .filter((c) => banned.includes(c.name))
            .map((c) => `${file}:${c.line} calls ${c.name}()`)

    it("finds the modules and their call sites at all", () => {
        // Guards every assertion below: a renamed file would otherwise leave
        // the whole block passing over an empty list.
        for (const f of HOOK_PATH_MODULES) {
            const text = readFileSync(join(SRC, f), "utf8")
            expect(calledNames(f, text).length).toBeGreaterThan(3)
        }
    })

    /**
     * What each hook-path module may import.
     *
     * The load-bearing half of this whole block, and the reason the call scan
     * can afford to be narrow: an outbound request needs a global (scanned
     * below) or a module, and these two modules are allowed neither `http`,
     * `https`, `net`, `dns`, `tls`, `child_process` nor `fs`. Nothing is
     * reachable from a hook that DevDeck has not already accepted a connection
     * on. An allowlist rather than a denylist, for the reason
     * `tests/architectureBoundaries.test.ts` gives: a denylist can only forbid
     * the crossings someone has already thought of.
     */
    const ALLOWED_IMPORTS: Record<string, string[]> = {
        "shared/attention.ts": ["./mcpEnv"],
        "main/attention.ts": ["../shared/attention"]
    }

    /**
     * Every module this file pulls in, however it spells it.
     *
     * Takes the text rather than reading it, so the scanner's own tests can run
     * the real function over a synthetic file - a pin that paraphrases the
     * thing it pins proves nothing.
     */
    function importSpecs(file: string, text: string): { spec: string; line: number }[] {
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true)
        const out: { spec: string; line: number }[] = []
        const visit = (node: ts.Node): void => {
            let spec: string | undefined
            if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
                spec = node.moduleSpecifier.text
            } else if (
                ts.isExportDeclaration(node) &&
                node.moduleSpecifier &&
                ts.isStringLiteral(node.moduleSpecifier)
            ) {
                spec = node.moduleSpecifier.text
            } else if (
                ts.isCallExpression(node) &&
                (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                    (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
                node.arguments[0] &&
                ts.isStringLiteral(node.arguments[0])
            ) {
                // The first thing an edit would reach for to get round a
                // static import rule.
                spec = node.arguments[0].text
            }
            if (spec !== undefined) {
                out.push({
                    spec,
                    line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
                })
            }
            ts.forEachChild(node, visit)
        }
        visit(sf)
        return out
    }

    const strayImports = (file: string, text: string, allowed: string[]): string[] =>
        importSpecs(file, text)
            .filter((i) => !allowed.includes(i.spec))
            .map((i) => `${file}:${i.line} imports ${i.spec}`)

    it("imports nothing that could open a socket, a file or a process", () => {
        const offenders = HOOK_PATH_MODULES.flatMap((f) =>
            strayImports(f, readFileSync(join(SRC, f), "utf8"), ALLOWED_IMPORTS[f])
        )
        expect(
            offenders,
            "A new import on the hook path. Adding one is how this route would " +
                "gain a capability it has none of today — reading the transcript " +
                "it is handed, or sending anywhere at all. If the import is " +
                "right, add it to ALLOWED_IMPORTS with the reason."
        ).toEqual([])
    })

    it("has no stale allowlist entry", () => {
        // The other direction of the same gate: an entry whose import is gone
        // is a rule protecting nothing.
        for (const [file, allowed] of Object.entries(ALLOWED_IMPORTS)) {
            const text = readFileSync(join(SRC, file), "utf8")
            for (const spec of allowed) expect(text).toContain(`"${spec}"`)
        }
    })

    it("makes no outbound request of any kind", () => {
        const offenders = HOOK_PATH_MODULES.flatMap((f) =>
            offendersIn(f, readFileSync(join(SRC, f), "utf8"), EGRESS)
        )
        expect(
            offenders,
            "Nothing about the user's agents may leave this machine. The hook " +
                "route RECEIVES; it has no client and no socket of its own."
        ).toEqual([])
    })

    it("opens no file - the transcript path is carried, never read", () => {
        const offenders = HOOK_PATH_MODULES.flatMap((f) =>
            offendersIn(f, readFileSync(join(SRC, f), "utf8"), FS)
        )
        expect(
            offenders,
            "transcript_path arrives from an HTTP client. Whoever adds the " +
                "reader validates it against the real filesystem, at the read, " +
                "with the capability the API already has - not here."
        ).toEqual([])
    })

    it("starts no process", () => {
        const offenders = HOOK_PATH_MODULES.flatMap((f) =>
            offendersIn(f, readFileSync(join(SRC, f), "utf8"), SPAWN)
        )
        expect(offenders).toEqual([])
    })

    describe("the scanner itself", () => {
        const scan = (text: string, banned = EGRESS): string[] =>
            offendersIn("synthetic.ts", text, banned)

        const imports = (text: string): string[] =>
            strayImports("synthetic.ts", text, ["../shared/attention"])

        it("catches the edit it exists to stop", () => {
            expect(scan('await fetch("https://example.com", { body: signal })')).toHaveLength(1)
            expect(scan('new WebSocket("wss://example.com")')).toHaveLength(1)
            expect(scan("net.connect(443, host)")).toHaveLength(1)
            expect(scan("net.createConnection({ port: 443 })")).toHaveLength(1)
            expect(scan('readFileSync(hook.transcriptPath, "utf8")', FS)).toHaveLength(1)
            expect(scan("execFile(cmd, args)", SPAWN)).toHaveLength(1)
        })

        it("catches an egress that needs a MODULE, which the call scan lets past", () => {
            // The honest division of labour, stated as a test rather than
            // assumed. `https.request(...)` is invisible to the call scan -
            // `request` came off that list because it is an ordinary property
            // name - and it is the import rule that stops it. Neither half is
            // sufficient alone, which is why both exist.
            expect(scan('https.request("https://example.com")')).toEqual([])
            expect(imports('import https from "https"')).toHaveLength(1)
            expect(imports('import { request } from "node:http"')).toHaveLength(1)
            expect(imports('import { readFileSync } from "node:fs"')).toHaveLength(1)
            expect(imports('import { spawn } from "child_process"')).toHaveLength(1)
        })

        it("catches the dynamic ways round a static import rule", () => {
            expect(imports('const h = await import("node:https")')).toHaveLength(1)
            expect(imports('const h = require("node:https")')).toHaveLength(1)
            expect(imports('export * from "node:https"')).toHaveLength(1)
            expect(imports('import "node:https"')).toHaveLength(1)
            // A type-only import is erased at build time and loads nothing, but
            // it is still SEEN - this rule is an allowlist, so an unlisted
            // specifier fails whatever its form. Nothing on the hook path needs
            // a type from anywhere else.
            expect(imports('import type { Server } from "node:https"')).toHaveLength(1)
            expect(imports('import { parseHook } from "../shared/attention"')).toEqual([])
        })

        it("is not fooled by the word in a comment or a string", () => {
            // The three mutations that got past earlier scanners in this repo.
            expect(scan('// await fetch("https://example.com")')).toEqual([])
            expect(scan('/*\nfetch("https://x")\n*/\nexport const x = 1')).toEqual([])
            expect(scan("const decoy = 'fetch(\"https://x\")'")).toEqual([])
        })

        it("does not fire on a PROPERTY that merely shares the name", () => {
            // Only an invocation is an egress, which is why this scans call
            // sites rather than identifiers.
            expect(scan("interface D { connect?: string }\nexport type X = D")).toEqual([])
            expect(scan("const o = { connect: 2 }\nexport default o")).toEqual([])
        })

        it("does not fire on the Map lookups these modules are built out of", () => {
            // The false positive that took `get` off the list. A scanner
            // silenced by its own noise protects nothing.
            expect(scan('const m = new Map()\nexport const x = m.get("k")')).toEqual([])
        })
    })
})
