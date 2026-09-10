import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import {
    useSettings,
    missingRecommended,
    aiModeAgents,
    commitIdleMs,
    idleFieldValue,
    IDLE_MIN,
    SHELL_LABELS,
    type ShellKind,
    type GitAccount,
    type AgentPreset,
    type RunMode,
    type DeviceTtlDays
} from "../settings"
import { useStore } from "../store"
import { DiagnosticsNote, useCopyDiagnostics } from "./CopyDiagnostics"
import { THEMES, STYLES } from "../themes"
import { shortcutGroups } from "../shortcuts"
import { DECK_VIEWS } from "./ViewKeys"
import type { McpServer } from "../../../preload/index"
import { MCP_CATALOG, addServer } from "../mcpCatalog"
import { type Pipeline, type PipelineStep, type PipelineTrigger, type BranchTarget, isRunnable, moveItem } from "../pipeline"
import { type RoutingRule, type RuleKind } from "../routing"

/** Encode/decode a BranchTarget for a <select> value. "" = use the default. */
function encodeTarget(t?: BranchTarget): string {
    if (!t) return ""
    if (t === "next" || t === "stop") return t
    return "goto:" + t.goto
}
function decodeTarget(v: string): BranchTarget | undefined {
    if (v === "next" || v === "stop") return v
    if (v.startsWith("goto:")) return { goto: v.slice(5) }
    return undefined
}
import { type GateMode, type StepGate, DEFAULT_GATE } from "../gate"
import { deriveRemoteBindView } from "../remoteBindView"
import { DEVDECK_TOKEN_ENV } from "../../../shared/mcpEnv"
import { useProbe } from "../useProbe"
import { rowMark, pathUnreadable, isBlankCommand } from "../probeView"
import { Modal } from "./Modal"

const THEME_LIST = Object.values(THEMES)
const STYLE_LIST = Object.values(STYLES)
import type { ServerStatus, UpdateStatus, BindMode, RemoteDevice } from "../../../preload/index"

type Section =
    | "appearance"
    | "terminal"
    | "editor"
    | "agents"
    | "ai"
    | "snippets"
    | "pipelines"
    | "git"
    | "ssh"
    | "mcp"
    | "remote"
    | "proxy"
    | "notifications"
    | "shortcuts"
    | "about"

const SECTIONS: { key: Section; label: string }[] = [
    { key: "appearance", label: "Appearance" },
    { key: "terminal", label: "Terminal" },
    { key: "editor", label: "Editor" },
    { key: "agents", label: "Agents" },
    { key: "ai", label: "AI" },
    { key: "snippets", label: "Snippets" },
    { key: "pipelines", label: "Pipelines" },
    { key: "git", label: "Git" },
    { key: "ssh", label: "SSH" },
    { key: "mcp", label: "MCP" },
    { key: "remote", label: "Remote (Mobile)" },
    { key: "proxy", label: "Proxy" },
    { key: "notifications", label: "Notifications" },
    { key: "shortcuts", label: "Shortcuts" },
    { key: "about", label: "About" }
]

/**
 * DevDeck's own MCP server. The inverse of the "→ Agent" buttons elsewhere in the
 * app: instead of pushing a query result into the prompt, the agent pulls what it
 * needs — so it reads the live database rather than a table you pasted earlier.
 */
function DevdeckMcpBlock(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    const mcpServer = useSettings((s) => s.mcpServer)
    const setMcpServer = useSettings((s) => s.setMcpServer)
    const [status, setStatus] = useState<{ running: boolean; port: number | null }>({
        running: false,
        port: null
    })
    const [err, setErr] = useState("")
    const [note, setNote] = useState("")

    const refresh = (): void => {
        window.api.mcpsrv.status().then(setStatus).catch(() => void 0)
    }
    useEffect(() => {
        refresh()
        const iv = setInterval(refresh, 4000)
        return () => clearInterval(iv)
    }, [])

    const toggle = async (enabled: boolean): Promise<void> => {
        setErr("")
        setMcpServer({ enabled })
        // setMcpServer starts/stops the server; surface a bind failure (port in use).
        if (enabled) {
            const s = useSettings.getState().mcpServer
            const res = await window.api.mcpsrv.start({ port: s.port, token: s.token })
            if (!res.ok) setErr(res.error ?? "Could not start")
            setStatus({ running: res.running, port: res.port })
        } else {
            setStatus(await window.api.mcpsrv.stop())
        }
    }

    const registerHere = async (): Promise<void> => {
        if (!project) return
        const s = useSettings.getState().mcpServer
        await window.api.mcpsrv.register(project.path, s.port)
        setNote(
            `Added to ${project.name}/.mcp.json — start a new agent session to pick it up.`
        )
        setTimeout(() => setNote(""), 5000)
    }

    return (
        <div className="settings-block">
            <div className="settings-block-head">
                <span className="section-label">DEVDECK AS AN MCP SERVER</span>
                <label className="switch-row">
                    <input
                        type="checkbox"
                        checked={mcpServer.enabled}
                        onChange={(e) => void toggle(e.target.checked)}
                    />
                    <span>{status.running ? `Running on 127.0.0.1:${status.port}` : "Off"}</span>
                </label>
            </div>
            <p className="muted small">
                Lets your agent CLI read what DevDeck can see, instead of asking you to copy it out.
                Exposes <code>devdeck_projects</code> — which project a path belongs to — and{" "}
                <code>devdeck_console_logs</code>, the console messages, failed requests and uncaught
                exceptions from the Browser panel, so an agent can diagnose a page without you
                pasting DevTools output.
            </p>
            <p className="muted small mcp-safety">
                Read-only: nothing here writes to a terminal, a file or the network. Bound to
                127.0.0.1 and guarded by a bearer token, so nothing off this machine can reach it.
                The token is <em>not</em> written into <code>.mcp.json</code> — that file references{" "}
                <code>${"{"}
                {DEVDECK_TOKEN_ENV}
                {"}"}</code>, which DevDeck sets in the agent sessions it starts, so the file stays
                safe to commit.
            </p>
            <div className="form-grid">
                <label>Port</label>
                <input
                    type="number"
                    value={mcpServer.port}
                    onChange={(e) => setMcpServer({ port: Number(e.target.value) || 8787 })}
                />
                <label>Token</label>
                <div className="row-inline">
                    <input value={mcpServer.token} readOnly placeholder="generated when enabled" />
                    <button onClick={() => setMcpServer({ token: "" })} data-tip="Generate a new token">
                        Rotate
                    </button>
                </div>
            </div>
            <div className="row-inline">
                <button
                    className="accent"
                    disabled={!project || !mcpServer.token}
                    onClick={() => void registerHere()}
                    data-tip={
                        project
                            ? `Write the devdeck entry into ${project.name}/.mcp.json`
                            : "Select a project first"
                    }
                >
                    Add to this project
                </button>
                {project && (
                    <button onClick={() => void window.api.mcpsrv.unregister(project.path)}>
                        Remove from project
                    </button>
                )}
            </div>
            {err && <p className="small err-text">{err}</p>}
            {note && <p className="small ok-text">{note}</p>}
        </div>
    )
}

function McpSection(): JSX.Element {
    const project = useStore((s) => s.activeProject())
    const [servers, setServers] = useState<McpServer[]>([])
    const [saved, setSaved] = useState(false)
    const path = project?.path

    useEffect(() => {
        if (path) window.api.mcp.list(path).then(setServers).catch(() => setServers([]))
        else setServers([])
    }, [path])

    const update = (i: number, patch: Partial<McpServer>): void =>
        setServers(servers.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
    const remove = (i: number): void => setServers(servers.filter((_, idx) => idx !== i))
    const add = (): void => setServers([...servers, { name: "", command: "npx", args: [], env: {} }])
    const save = async (): Promise<void> => {
        if (!path) return
        await window.api.mcp.save(path, servers)
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
    }

    if (!project) {
        return (
            <div className="settings-section">
                <h3>MCP servers</h3>
                {/* The DevDeck server itself isn't per-project, so it stays reachable
                    here even with nothing selected — only registering it needs a project. */}
                <DevdeckMcpBlock />
                <p className="muted">Select a project first - MCP servers are per-project.</p>
            </div>
        )
    }

    return (
        <div className="settings-section">
            <h3>MCP servers · {project.name}</h3>
            <DevdeckMcpBlock />
            {servers.map((s, i) => (
                <div key={i} className="git-account">
                    <div className="git-account-head">
                        <input
                            className="git-label"
                            value={s.name}
                            placeholder="server-name"
                            onChange={(e) => update(i, { name: e.target.value })}
                        />
                        <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                            ×
                        </button>
                    </div>
                    <div className="form-grid">
                        <label>Command</label>
                        <input value={s.command} onChange={(e) => update(i, { command: e.target.value })} />
                        <label>Args</label>
                        <input
                            value={s.args.join(" ")}
                            placeholder="-y @modelcontextprotocol/server-filesystem"
                            onChange={(e) =>
                                update(i, { args: e.target.value.split(/\s+/).filter(Boolean) })
                            }
                        />
                        <label>Env</label>
                        <input
                            value={Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join(" ")}
                            placeholder="KEY=value KEY2=value2"
                            onChange={(e) => {
                                const env: Record<string, string> = {}
                                for (const pair of e.target.value.split(/\s+/).filter(Boolean)) {
                                    const eq = pair.indexOf("=")
                                    if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1)
                                }
                                update(i, { env })
                            }}
                        />
                    </div>
                </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={add}>+ Add server</button>
                <span style={{ flex: 1 }} />
                <button className="accent" onClick={save}>
                    {saved ? "Saved ✓" : "Save .mcp.json"}
                </button>
            </div>
            <div className="mcp-catalog">
                <div className="section-label mcp-catalog-title">Add from catalog</div>
                {MCP_CATALOG.map((entry) => {
                    const added = servers.some((s) => s.name === entry.name)
                    return (
                        <div key={entry.id} className="mcp-cat-row">
                            <span className="mcp-cat-name">{entry.name}</span>
                            <span className="mcp-cat-desc muted small">{entry.description}</span>
                            <button
                                className="mcp-cat-add"
                                disabled={added}
                                onClick={() => setServers(addServer(servers, entry))}
                            >
                                {added ? "Added" : "Add"}
                            </button>
                        </div>
                    )
                })}
            </div>
            <p className="settings-hint">
                Writes <code>{project.name}/.mcp.json</code> - the standard project MCP config read
                by Claude Code (and other agents). Args/env are space-separated.
            </p>
        </div>
    )
}

function SshSection(): JSX.Element {
    const profiles = useSettings((s) => s.sshProfiles)
    const setSshProfiles = useSettings((s) => s.setSshProfiles)

    const update = (i: number, patch: Record<string, string>): void =>
        setSshProfiles(profiles.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
    const remove = (i: number): void => setSshProfiles(profiles.filter((_, idx) => idx !== i))
    const add = (): void =>
        setSshProfiles([
            ...profiles,
            { id: crypto.randomUUID(), label: "New host", host: "", user: "", port: "22", args: "" }
        ])

    return (
        <div className="settings-section">
            <h3>SSH hosts</h3>
            {profiles.map((p, i) => (
                <div key={p.id} className="git-account">
                    <div className="git-account-head">
                        <input
                            className="git-label"
                            value={p.label}
                            placeholder="my-vps"
                            onChange={(e) => update(i, { label: e.target.value })}
                        />
                        <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                            ×
                        </button>
                    </div>
                    <div className="form-grid">
                        <label>User</label>
                        <input value={p.user} onChange={(e) => update(i, { user: e.target.value })} />
                        <label>Host</label>
                        <input value={p.host} onChange={(e) => update(i, { host: e.target.value })} />
                        <label>Port</label>
                        <input value={p.port} onChange={(e) => update(i, { port: e.target.value })} />
                        <label>Extra args</label>
                        <input
                            value={p.args}
                            placeholder="-i ~/.ssh/id_vps"
                            onChange={(e) => update(i, { args: e.target.value })}
                        />
                    </div>
                </div>
            ))}
            <button onClick={add} style={{ marginTop: 8 }}>
                + Add host
            </button>
            <p className="settings-hint">
                Launch an SSH session from the terminal's <b>▾</b> menu - it opens a shell running
                the <code>ssh</code> command for the host.
            </p>
        </div>
    )
}

function GitSection(): JSX.Element {
    const accounts = useSettings((s) => s.gitAccounts)
    const setGitAccounts = useSettings((s) => s.setGitAccounts)
    const [pats, setPats] = useState<Record<string, boolean>>({})
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [msg, setMsg] = useState<Record<string, string>>({})

    const refreshPats = (): void => {
        window.api.git.patStatus().then(setPats)
    }
    useEffect(refreshPats, [])

    const update = (i: number, patch: Partial<GitAccount>): void =>
        setGitAccounts(accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
    const remove = async (i: number): Promise<void> => {
        // Awaited and read: removing the row while the token survives on disk is
        // the account looking deleted and its credential still being there.
        const id = accounts[i].id
        const gone = await window.api.git.clearPat(id)
        if (!gone) {
            flash(id, "✗ could not clear its token - the account was kept")
            return
        }
        setGitAccounts(accounts.filter((_, idx) => idx !== i))
    }
    const add = (): void =>
        setGitAccounts([
            ...accounts,
            {
                id: crypto.randomUUID(),
                label: "New account",
                name: "",
                email: "",
                sshCommand: "",
                host: "github.com",
                username: ""
            }
        ])

    const flash = (id: string, text: string): void => {
        setMsg((m) => ({ ...m, [id]: text }))
        setTimeout(() => setMsg((m) => ({ ...m, [id]: "" })), 4000)
    }
    const saveToken = async (id: string): Promise<void> => {
        await window.api.git.setPat(id, (drafts[id] ?? "").trim())
        setDrafts((d) => ({ ...d, [id]: "" }))
        refreshPats()
        flash(id, "token saved")
    }
    const clearToken = async (id: string): Promise<void> => {
        // The store refuses to write when it could not be read, precisely so it
        // never destroys tokens - and that refusal used to be invisible here:
        // "token cleared" while the encrypted PAT was still on disk.
        const gone = await window.api.git.clearPat(id)
        refreshPats()
        flash(id, gone ? "token cleared" : "✗ could not clear - the token is still stored")
    }
    const cache = async (a: GitAccount): Promise<void> => {
        const r = await window.api.git.cacheCredential(a.id, a.host ?? "github.com", a.username ?? "")
        flash(a.id, r.ok ? "✓ cached for HTTPS push" : `✗ ${r.error ?? "failed"}`)
    }
    const verify = async (id: string): Promise<void> => {
        flash(id, "verifying…")
        const r = await window.api.git.verifyPat(id)
        flash(id, r.ok ? `✓ valid${r.login ? " · " + r.login : ""}` : `✗ ${r.error ?? "invalid"}`)
    }

    return (
        <div className="settings-section">
            <h3>Git accounts</h3>
            {accounts.map((a, i) => (
                <div key={a.id} className="git-account">
                    <div className="git-account-head">
                        <input
                            className="git-label"
                            value={a.label}
                            placeholder="Work / Personal…"
                            onChange={(e) => update(i, { label: e.target.value })}
                        />
                        <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                            ×
                        </button>
                    </div>
                    <div className="form-grid">
                        <label>user.name</label>
                        <input value={a.name} onChange={(e) => update(i, { name: e.target.value })} />
                        <label>user.email</label>
                        <input value={a.email} onChange={(e) => update(i, { email: e.target.value })} />
                        <label>SSH command</label>
                        <input
                            value={a.sshCommand}
                            placeholder={'ssh -i ~/.ssh/id_work -o IdentitiesOnly=yes'}
                            onChange={(e) => update(i, { sshCommand: e.target.value })}
                        />
                        <label>HTTPS host</label>
                        <input
                            value={a.host ?? ""}
                            placeholder="github.com"
                            onChange={(e) => update(i, { host: e.target.value })}
                        />
                        <label>HTTPS user</label>
                        <input
                            value={a.username ?? ""}
                            placeholder="x-access-token (GitHub ignores it)"
                            onChange={(e) => update(i, { username: e.target.value })}
                        />
                        <label>Token (PAT)</label>
                        <div className="accent-controls">
                            <input
                                type="password"
                                autoComplete="off"
                                value={drafts[a.id] ?? ""}
                                placeholder={pats[a.id] ? "•••••••• (stored)" : "paste a PAT"}
                                onChange={(e) =>
                                    setDrafts((d) => ({ ...d, [a.id]: e.target.value }))
                                }
                            />
                            <button onClick={() => saveToken(a.id)} disabled={!(drafts[a.id] ?? "").trim()}>
                                Save
                            </button>
                            {pats[a.id] && (
                                <button onClick={() => clearToken(a.id)} data-tip="Remove stored token">
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                    {pats[a.id] && (
                        <div className="git-pat-actions">
                            <button onClick={() => cache(a)} data-tip="Store in Git's credential manager for HTTPS push">
                                Cache for HTTPS push
                            </button>
                            <button onClick={() => verify(a.id)} data-tip="Check the token against GitHub">
                                Verify (GitHub)
                            </button>
                            {msg[a.id] && <span className="git-pat-msg">{msg[a.id]}</span>}
                        </div>
                    )}
                    {!pats[a.id] && msg[a.id] && <div className="git-pat-msg standalone">{msg[a.id]}</div>}
                </div>
            ))}
            <button onClick={add} style={{ marginTop: 8 }}>
                + Add account
            </button>
            <p className="settings-hint">
                Apply an account to the active project from the <b>status bar</b> (click the
                identity next to the branch) - it writes the repo's local <code>git config</code>{" "}
                (name, email, optional <code>core.sshCommand</code>). The <b>PAT is encrypted at
                rest</b> (DPAPI) and never stored in <code>settings.json</code>; <b>Cache for HTTPS
                push</b> hands it to Git's credential manager so <code>git push</code> over HTTPS
                just works.
            </p>
        </div>
    )
}

function SnippetsSection(): JSX.Element {
    const snippets = useSettings((s) => s.snippets)
    const setSnippets = useSettings((s) => s.setSnippets)

    const update = (i: number, patch: Record<string, string>): void =>
        setSnippets(snippets.map((sn, idx) => (idx === i ? { ...sn, ...patch } : sn)))
    const remove = (i: number): void => setSnippets(snippets.filter((_, idx) => idx !== i))
    const add = (): void =>
        setSnippets([...snippets, { id: crypto.randomUUID(), name: "new", body: "" }])

    return (
        <div className="settings-section">
            <h3>Prompt snippets</h3>
            {snippets.map((sn, i) => (
                <div key={sn.id} className="snippet-row">
                    <div className="snippet-head">
                        <span className="snippet-slash">/</span>
                        <input
                            className="snippet-name"
                            value={sn.name}
                            onChange={(e) =>
                                update(i, { name: e.target.value.replace(/\s+/g, "-") })
                            }
                        />
                        <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                            ×
                        </button>
                    </div>
                    <textarea
                        className="snippet-body"
                        value={sn.body}
                        placeholder="The text inserted when you type /name"
                        onChange={(e) => update(i, { body: e.target.value })}
                    />
                </div>
            ))}
            <button onClick={add} style={{ marginTop: 8 }}>
                + Add snippet
            </button>
            <p className="settings-hint">
                Type <code>/name</code> in the prompt composer to insert a snippet's text -
                reusable prompts for reviews, commits, explanations, etc.
            </p>
        </div>
    )
}

const GATE_MODE_LABEL: Record<GateMode, string> = {
    none: "No gate",
    contains: "Output contains",
    absent: "Output does NOT contain",
    regex: "Output matches /regex/",
    // Ground truth: the machine decides, not the agent's prose.
    command: "Command succeeds (exit 0)",
    commandFails: "Command fails (non-zero exit)"
}

function gatePlaceholder(mode: GateMode): string {
    if (mode === "command") return "e.g. npm test"
    if (mode === "commandFails") return "e.g. git diff --quiet   (fails when there are changes)"
    if (mode === "regex") return "e.g. \\b0 errors?\\b"
    return "e.g. All tests passed"
}

function GateEditor({
    gate,
    onChange
}: {
    gate?: StepGate
    onChange: (gate: StepGate) => void
}): JSX.Element {
    const g = gate ?? DEFAULT_GATE
    const patch = (p: Partial<StepGate>): void => onChange({ ...g, ...p })
    return (
        <div className="pipe-gate">
            <span className="pipe-gate-label">Gate</span>
            <select
                className="pipe-gate-mode"
                value={g.mode}
                onChange={(e) => patch({ mode: e.target.value as GateMode })}
            >
                {(Object.keys(GATE_MODE_LABEL) as GateMode[]).map((m) => (
                    <option key={m} value={m}>
                        {GATE_MODE_LABEL[m]}
                    </option>
                ))}
            </select>
            {g.mode !== "none" && (
                <>
                    <input
                        className={
                            "pipe-gate-pattern" +
                            (g.mode === "command" || g.mode === "commandFails" ? " mono" : "")
                        }
                        value={g.pattern}
                        placeholder={gatePlaceholder(g.mode)}
                        data-tip={
                            g.mode === "command" || g.mode === "commandFails"
                                ? "Runs in the active project directory; its exit code decides the gate"
                                : undefined
                        }
                        onChange={(e) => patch({ pattern: e.target.value })}
                    />
                    <label className="pipe-gate-retries" data-tip="Extra attempts if the gate fails">
                        retries
                        <input
                            type="number"
                            min={0}
                            max={10}
                            value={g.retries}
                            onChange={(e) => patch({ retries: Math.max(0, Number(e.target.value) || 0) })}
                        />
                    </label>
                    <select
                        className="pipe-gate-onfail"
                        value={g.onFail}
                        onChange={(e) => patch({ onFail: e.target.value as StepGate["onFail"] })}
                        data-tip="What to do if the gate ultimately fails"
                    >
                        <option value="stop">then stop</option>
                        <option value="continue">then continue</option>
                    </select>
                </>
            )}
        </div>
    )
}

function TriggersEditor({ pipelines }: { pipelines: Pipeline[] }): JSX.Element {
    const triggers = useSettings((s) => s.triggers)
    const setTriggers = useSettings((s) => s.setTriggers)
    const projects = useStore((s) => s.projects)

    const update = (i: number, patch: Partial<PipelineTrigger>): void =>
        setTriggers(triggers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
    const remove = (i: number): void => setTriggers(triggers.filter((_, idx) => idx !== i))
    const add = (): void =>
        setTriggers([
            ...triggers,
            {
                id: crypto.randomUUID(),
                enabled: false,
                pipelineId: pipelines[0]?.id ?? "",
                projectPath: projects[0]?.path ?? "",
                glob: "",
                debounceMs: 1500
            }
        ])

    return (
        <div className="triggers-block">
            <h3 style={{ marginTop: 22 }}>File triggers</h3>
            <p className="settings-hint" style={{ marginTop: 0 }}>
                Auto-run a pipeline when files matching a glob change in a project. Triggers are
                <b> off by default</b> - enable one only when you want hands-free runs. A run won't
                start while another is already in progress.
            </p>
            {triggers.length === 0 && (
                <p className="muted small">No triggers yet.</p>
            )}
            {triggers.map((t, i) => (
                <div key={t.id} className={"trigger-row" + (t.enabled ? " on" : "")}>
                    <label className="trigger-enable" data-tip="Enable this trigger">
                        <input
                            type="checkbox"
                            checked={t.enabled}
                            onChange={(e) => update(i, { enabled: e.target.checked })}
                        />
                    </label>
                    <select
                        className="trigger-project"
                        value={t.projectPath}
                        onChange={(e) => update(i, { projectPath: e.target.value })}
                    >
                        {projects.map((p) => (
                            <option key={p.id} value={p.path}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                    <input
                        className="trigger-glob"
                        value={t.glob}
                        placeholder="glob, e.g. src/**/*.cs (blank = any)"
                        onChange={(e) => update(i, { glob: e.target.value })}
                    />
                    <span className="trigger-arrow">→</span>
                    <select
                        className="trigger-pipeline"
                        value={t.pipelineId}
                        onChange={(e) => update(i, { pipelineId: e.target.value })}
                    >
                        {pipelines.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                    <label className="trigger-debounce" data-tip="Quiet period after the last change before firing">
                        <input
                            type="number"
                            min={200}
                            step={100}
                            value={t.debounceMs}
                            onChange={(e) => update(i, { debounceMs: Math.max(200, Number(e.target.value) || 200) })}
                        />
                        ms
                    </label>
                    <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                        ×
                    </button>
                </div>
            ))}
            <button
                className="btn-min"
                style={{ marginTop: 6 }}
                onClick={add}
                disabled={pipelines.length === 0 || projects.length === 0}
            >
                + Add trigger
            </button>
        </div>
    )
}

function PipelinesSection(): JSX.Element {
    const pipelines = useSettings((s) => s.pipelines)
    const setPipelines = useSettings((s) => s.setPipelines)
    const agents = useSettings((s) => s.agents)
    const runPipeline = useStore((s) => s.runPipeline)
    const closeSettings = useSettings((s) => s.closeSettings)

    const updatePipe = (pi: number, patch: Partial<Pipeline>): void =>
        setPipelines(pipelines.map((p, idx) => (idx === pi ? { ...p, ...patch } : p)))
    const removePipe = (pi: number): void => setPipelines(pipelines.filter((_, idx) => idx !== pi))
    const addPipe = (): void =>
        setPipelines([
            ...pipelines,
            { id: crypto.randomUUID(), name: "New pipeline", steps: [] }
        ])

    const setSteps = (pi: number, steps: PipelineStep[]): void => updatePipe(pi, { steps })
    const addStep = (pi: number): void =>
        setSteps(pi, [
            ...pipelines[pi].steps,
            {
                id: crypto.randomUUID(),
                title: "Step " + (pipelines[pi].steps.length + 1),
                agentId: agents[0]?.id ?? "claude",
                prompt: "",
                fresh: false
            }
        ])
    const updateStep = (pi: number, si: number, patch: Partial<PipelineStep>): void =>
        setSteps(
            pi,
            pipelines[pi].steps.map((st, idx) => (idx === si ? { ...st, ...patch } : st))
        )
    const removeStep = (pi: number, si: number): void =>
        setSteps(pi, pipelines[pi].steps.filter((_, idx) => idx !== si))
    const moveStep = (pi: number, si: number, dir: -1 | 1): void =>
        setSteps(pi, moveItem(pipelines[pi].steps, si, si + dir))

    const run = (pi: number): void => {
        closeSettings()
        runPipeline(pipelines[pi].id)
    }

    return (
        <div className="settings-section">
            <h3>Agent pipelines</h3>
            <p className="settings-hint" style={{ marginTop: 0 }}>
                A pipeline sends a sequence of prompts to your agents, waiting for each to
                finish before sending the next. Same-agent steps reuse one session, so context
                carries across them. Run from here or the command palette (<code>Ctrl+Shift+P</code>).
            </p>
            {pipelines.map((p, pi) => (
                <div key={p.id} className="pipe-edit">
                    <div className="pipe-edit-head">
                        <input
                            className="pipe-name"
                            value={p.name}
                            onChange={(e) => updatePipe(pi, { name: e.target.value })}
                        />
                        <button
                            className="btn-min"
                            onClick={() => run(pi)}
                            disabled={!isRunnable(p)}
                            data-tip="Run now"
                        >
                            ▶ run
                        </button>
                        <button className="row-remove" data-tip="Remove" onClick={() => removePipe(pi)}>
                            ×
                        </button>
                    </div>
                    {p.steps.map((st, si) => {
                        // Steps that route back to this one (a loop) — surfaced so the
                        // flow is legible instead of hidden in a dropdown value.
                        const loopFrom = p.steps
                            .map((s2, idx) => ({ s2, idx }))
                            .filter(
                                ({ s2 }) =>
                                    (typeof s2.onPass === "object" && s2.onPass.goto === st.id) ||
                                    (typeof s2.onFail === "object" && s2.onFail.goto === st.id)
                            )
                            .map(({ idx }) => idx + 1)
                        return (
                        <div key={st.id} className="pipe-step">
                            <div className="pipe-step-head">
                                <span className="pipe-step-num">{si + 1}</span>
                                <input
                                    className="pipe-step-title"
                                    value={st.title}
                                    placeholder="Step title"
                                    onChange={(e) => updateStep(pi, si, { title: e.target.value })}
                                />
                                {loopFrom.length > 0 && (
                                    <span
                                        className="pipe-loop-chip"
                                        data-tip={`Step ${loopFrom.join(", ")} route back to this step`}
                                    >
                                        loop target
                                    </span>
                                )}
                                <select
                                    className="pipe-step-agent"
                                    value={st.agentId}
                                    onChange={(e) => updateStep(pi, si, { agentId: e.target.value })}
                                >
                                    {aiModeAgents(agents).map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}
                                        </option>
                                    ))}
                                </select>
                                <label className="pipe-fresh" data-tip="Start a new session for this step instead of reusing the agent's">
                                    <input
                                        type="checkbox"
                                        checked={st.fresh}
                                        onChange={(e) => updateStep(pi, si, { fresh: e.target.checked })}
                                    />
                                    fresh
                                </label>
                                <button className="btn-min" disabled={si === 0} onClick={() => moveStep(pi, si, -1)} data-tip="Move up">
                                    ↑
                                </button>
                                <button className="btn-min" disabled={si === p.steps.length - 1} onClick={() => moveStep(pi, si, 1)} data-tip="Move down">
                                    ↓
                                </button>
                                <button className="row-remove" data-tip="Remove step" onClick={() => removeStep(pi, si)}>
                                    ×
                                </button>
                            </div>
                            <textarea
                                className="pipe-step-prompt"
                                value={st.prompt}
                                placeholder="Prompt sent to the agent for this step"
                                onChange={(e) => updateStep(pi, si, { prompt: e.target.value })}
                            />
                            <GateEditor
                                gate={st.gate}
                                onChange={(gate) => updateStep(pi, si, { gate })}
                            />
                            <div className="pipe-step-adv">
                                <label className="pipe-adv-field" data-tip="Wait before running this step">
                                    delay
                                    <input
                                        type="number"
                                        min={0}
                                        className="pipe-adv-delay"
                                        value={st.delayMs ? Math.round(st.delayMs / 1000) : 0}
                                        onChange={(e) =>
                                            updateStep(pi, si, {
                                                delayMs: Math.max(0, Number(e.target.value)) * 1000
                                            })
                                        }
                                    />
                                    s
                                </label>
                                <label className="pipe-fresh" data-tip="Pause for manual Continue before this step runs">
                                    <input
                                        type="checkbox"
                                        checked={!!st.checkpoint}
                                        onChange={(e) => updateStep(pi, si, { checkpoint: e.target.checked })}
                                    />
                                    checkpoint
                                </label>
                            </div>
                            <div className="pipe-step-adv pipe-routing">
                                <span className="pipe-gate-label">routing</span>
                                <label className="pipe-adv-field" data-tip="Where the run goes when this step passes">
                                    on pass
                                    <select
                                        value={encodeTarget(st.onPass)}
                                        onChange={(e) => updateStep(pi, si, { onPass: decodeTarget(e.target.value) })}
                                    >
                                        <option value="">→ next</option>
                                        <option value="stop">⏹ stop</option>
                                        {p.steps
                                            .filter((s) => s.id !== st.id)
                                            .map((s) => (
                                                <option key={s.id} value={"goto:" + s.id}>
                                                    ↪ {s.title || "(untitled)"}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                                <label className="pipe-adv-field" data-tip="Where the run goes when the gate ultimately fails">
                                    on fail
                                    <select
                                        value={encodeTarget(st.onFail)}
                                        onChange={(e) => updateStep(pi, si, { onFail: decodeTarget(e.target.value) })}
                                    >
                                        <option value="">gate default (stop)</option>
                                        <option value="next">→ next</option>
                                        <option value="stop">⏹ stop</option>
                                        {p.steps
                                            .filter((s) => s.id !== st.id)
                                            .map((s) => (
                                                <option key={s.id} value={"goto:" + s.id}>
                                                    ↪ {s.title || "(untitled)"}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                            </div>
                        </div>
                        )
                    })}
                    <button className="btn-min" style={{ marginTop: 6 }} onClick={() => addStep(pi)}>
                        + Add step
                    </button>
                </div>
            ))}
            <button onClick={addPipe} style={{ marginTop: 10 }}>
                + Add pipeline
            </button>

            <TriggersEditor pipelines={pipelines} />
        </div>
    )
}

function AgentsSection(): JSX.Element {
    const agents = useSettings((s) => s.agents)
    // Fresh on mount, and again (debounced) whenever a command is edited - so a
    // mark can never describe a command line the field no longer holds.
    const { report, rechecking, recheck } = useProbe(agents)
    const setAgents = useSettings((s) => s.setAgents)
    const addRecommended = useSettings((s) => s.addRecommended)
    const agentIdleMs = useSettings((s) => s.agentIdleMs)
    const setAgentIdleMs = useSettings((s) => s.setAgentIdleMs)
    // The half-typed field, or null when it is not being edited. The stored
    // value is always clamped; the draft deliberately is not, so a value can be
    // typed a digit at a time (see idleFieldValue / commitIdleMs).
    const [idleDraft, setIdleDraft] = useState<string | null>(null)
    const [envSet, setEnvSet] = useState<Record<string, boolean>>({})

    // Which API-key env vars are present in the environment terminals inherit.
    const keyNames = useMemo(
        () => [...new Set(agents.map((a) => a.apiKeyEnv).filter(Boolean))],
        [agents]
    )
    useEffect(() => {
        if (keyNames.length) window.api.env.check(keyNames).then(setEnvSet)
        else setEnvSet({})
    }, [keyNames.join(",")])

    const update = (i: number, patch: Partial<AgentPreset>): void => {
        setAgents(agents.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
    }
    const remove = (i: number): void => setAgents(agents.filter((_, idx) => idx !== i))
    // Shared with the launcher, which offers the same action at the point where
    // someone actually asks "where are the starter commands?".
    const missing = missingRecommended(agents)
    const add = (mode: RunMode): void =>
        setAgents([
            ...agents,
            {
                id: crypto.randomUUID(),
                name: mode === "normal" ? "New command" : "New agent",
                command: "",
                resumeArgs: "",
                badge: mode === "normal" ? "" : "AGENT",
                apiKeyEnv: "",
                model: "",
                modelEnv: "",
                runMode: mode,
                icon: "",
                category: mode === "normal" ? "" : "AI Agents"
            }
        ])

    return (
        <div className="settings-section">
            <h3>Startup commands</h3>
            <p className="settings-hint" style={{ marginTop: -4 }}>
                A startup command opens a terminal and runs. In <b>AI agent</b> mode it's a CLI
                session with prompts, orchestration and idle detection; in <b>Normal</b> mode it's a
                plain shell that auto-runs the command (a dev server, a build…).
            </p>
            {/* Once, not per row - and keyed off `pathHydrated` rather than off
                "every result is unknown", because `unknown` has a second cause
                (a relative-path command) that this sentence would misreport. */}
            {pathUnreadable(report) && (
                <p className="settings-hint">
                    DevDeck couldn&rsquo;t read your shell&rsquo;s PATH, so none of these were
                    checked.
                </p>
            )}
            {agents.map((a, i) => {
                const overridden = !!a.apiKeyEnv && envSet[a.apiKeyEnv]
                const normal = a.runMode === "normal"
                const mark = rowMark(a, report)
                // A blank NORMAL preset is not this fault: "open a plain shell"
                // is a real thing to do. A blank agent card can run nothing.
                const blankAgent = !normal && isBlankCommand(a.command)
                return (
                    <div key={a.id} className="cmd-edit-card">
                        <div className="cmd-edit-top">
                            <div className="cmd-mode-toggle" role="group" aria-label="Run mode">
                                <button
                                    className={normal ? "" : "on"}
                                    onClick={() => update(i, { runMode: "agent" })}
                                >
                                    ✳ AI agent
                                </button>
                                <button
                                    className={normal ? "on" : ""}
                                    onClick={() => update(i, { runMode: "normal" })}
                                >
                                    ❯ Normal
                                </button>
                            </div>
                            <input
                                className="cmd-icon-input"
                                value={a.icon}
                                maxLength={2}
                                placeholder="◆"
                                data-tip="Icon (emoji or glyph, optional)"
                                onChange={(e) => update(i, { icon: e.target.value })}
                            />
                            <input
                                className="cmd-name-input"
                                value={a.name}
                                placeholder="Name"
                                onChange={(e) => update(i, { name: e.target.value })}
                            />
                            <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                                ×
                            </button>
                        </div>
                        <div className="cmd-edit-grid">
                            <label>Command</label>
                            <input
                                value={a.command}
                                placeholder={normal ? "npm run dev" : "claude"}
                                onChange={(e) => update(i, { command: e.target.value })}
                            />
                            <label>Category</label>
                            <input
                                value={a.category}
                                placeholder={normal ? "Dev Servers" : "AI Agents"}
                                onChange={(e) => update(i, { category: e.target.value })}
                            />
                            {/* The status, on the row it is about and right-aligned
                                in its own column - unpilled, because Settings is a
                                form and eight pills would compete with eight inputs.
                                Its own column rather than beside the field: sharing
                                the field's cell shrank the input a mark's width, so
                                the command you were editing got truncated on exactly
                                the rows that had something to say. Always rendered,
                                empty when there is nothing to say, so the cells that
                                follow keep their columns. A normal-mode preset never
                                gets a mark - a shell line has no binary to look up. */}
                            <span
                                className={
                                    "cmd-path-mark" + (mark?.qualified ? " qualified" : "")
                                }
                                data-tip={mark?.tip}
                            >
                                {mark?.text}
                            </span>
                            {!normal && (
                                <>
                                    <label>Resume</label>
                                    <input
                                        value={a.resumeArgs}
                                        placeholder="--continue"
                                        onChange={(e) => update(i, { resumeArgs: e.target.value })}
                                    />
                                    <label>Badge</label>
                                    <input
                                        value={a.badge}
                                        onChange={(e) =>
                                            update(i, { badge: e.target.value.toUpperCase() })
                                        }
                                    />
                                    <label>Key env var</label>
                                    <input
                                        value={a.apiKeyEnv}
                                        placeholder="ANTHROPIC_API_KEY"
                                        className={overridden ? "warn-field" : ""}
                                        onChange={(e) =>
                                            update(i, { apiKeyEnv: e.target.value.trim() })
                                        }
                                    />
                                </>
                            )}
                        </div>
                        {blankAgent && (
                            // No border on the input, ruled 2026-09-03: DESIGN.md
                            // forbids a warning colour, and a blank command makes a
                            // control inert rather than anything destructive.
                            // The sentence carries it.
                            <div className="agent-note">
                                This command is blank, so its launcher card can&rsquo;t run
                                anything.
                            </div>
                        )}
                        {!normal && overridden && (
                            <div className="agent-warn">
                                ⚠ <b>{a.apiKeyEnv}</b> is set - {a.name} will bill pay-as-you-go
                                <b> API usage</b> instead of a subscription login. Unset it (and
                                restart DevDeck) to use your subscription.
                            </div>
                        )}
                    </div>
                )
            })}
            <div className="cmd-add-row">
                <button onClick={() => add("agent")}>+ AI agent</button>
                <button onClick={() => add("normal")}>+ Terminal command</button>
                {/* Pending on the button, because this one re-spawns a login
                    shell - 188ms here, seconds with a heavy profile. */}
                <button
                    disabled={rechecking}
                    onClick={recheck}
                    data-tip="Read your shell's PATH again and re-check every AI-agent command against it"
                >
                    {rechecking ? "Re-checking PATH…" : "Re-check PATH"}
                </button>
                {missing.length > 0 && (
                    <button
                        onClick={addRecommended}
                        data-tip="Add the recommended starter commands you don't have yet (no duplicates)"
                    >
                        ↺ Add recommended ({missing.length})
                    </button>
                )}
            </div>
            <div className="setting-row" style={{ marginTop: 18 }}>
                <label>Quiet after (ms)</label>
                <input
                    type="number"
                    min={IDLE_MIN}
                    step={100}
                    value={idleFieldValue(idleDraft, agentIdleMs)}
                    onChange={(e) => setIdleDraft(e.target.value)}
                    onBlur={() => {
                        setAgentIdleMs(commitIdleMs(idleDraft, agentIdleMs))
                        setIdleDraft(null)
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur()
                    }}
                    // Escape while a draft is pending CANCELS the edit, and says
                    // so by repainting the stored value. Commit-on-blur made this
                    // the one field whose typing could vanish: the modal's Escape
                    // unmounts the input, and React fires no blur on unmount, so
                    // a typed number was silently dropped and Settings closed on
                    // top of it. Capture, not bubble, and stopPropagation - the
                    // same reasoning as the device-name input below: Modal.tsx
                    // renders children inline and its own Escape handler is a
                    // native bubble-phase listener on a real DOM ancestor, which
                    // therefore runs BEFORE React's bubble dispatch. Only the
                    // capture phase gets in front of it. Escape with no draft
                    // pending is left alone, so it still closes Settings.
                    onKeyDownCapture={(e) => {
                        if (e.key === "Escape" && idleDraft !== null) {
                            e.stopPropagation()
                            setIdleDraft(null)
                        }
                    }}
                />
            </div>
            <p className="settings-hint">
                The first AI agent is the one-click <b>+</b> button; the rest (and your terminal
                commands) are in the ▾ menu. "Key env var" is the API key that would override that
                CLI's subscription login - DevDeck warns when it's present in the environment.
            </p>
        </div>
    )
}

/**
 * Labels for the rule-kind picker. Matched, word for word, to the verbs
 * `describeRule` (TaskBoard.tsx) and `preview()` below use for the same kinds
 * ("contains" / "matches" / "is" / "always") and to the hint paragraph above
 * the rule list, which names "Title matches (glob)" explicitly - so the rule
 * reads the same way whether you're editing it here, reading the hint above,
 * or hovering its Dispatch button on the board. A dropdown option that used a
 * different word ("Title glob") than everywhere else describing the exact
 * same kind was the gap: the hint told you to look for a label that did not
 * exist anywhere in this dropdown.
 */
const RULE_KIND_LABEL: Record<RuleKind, string> = {
    title: "Title contains",
    titleGlob: "Title matches (glob)",
    project: "Project is",
    always: "Always"
}
const RULE_KINDS: RuleKind[] = ["title", "titleGlob", "project", "always"]

function newRoutingRule(agentId: string): RoutingRule {
    return { id: crypto.randomUUID(), enabled: true, kind: "title", pattern: "", agentId }
}

function RoutingSection(): JSX.Element {
    const routingRules = useSettings((s) => s.routingRules)
    const setRoutingRules = useSettings((s) => s.setRoutingRules)
    const defaultAgentId = useSettings((s) => s.defaultAgentId)
    const setDefaultAgentId = useSettings((s) => s.setDefaultAgentId)
    const agents = useSettings((s) => s.agents)
    const projects = useStore((s) => s.projects)
    // Only AI-mode presets can run a dispatched task - the same restriction
    // TaskBoard's override menu applies. Filtered here, in the render body,
    // NOT inside the useSettings selector above: a selector that filters or
    // maps returns a fresh array every render, which zustand reads as a
    // changed value and spins into an infinite render loop (see
    // TaskBoard.tsx:53-57, which documents the same trap for the same data).
    const aiAgents = useMemo(() => aiModeAgents(agents), [agents])
    const aiAgentIds = useMemo(() => new Set(aiAgents.map((a) => a.id)), [aiAgents])

    const updateRule = (i: number, patch: Partial<RoutingRule>): void =>
        setRoutingRules(routingRules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    const removeRule = (i: number): void =>
        setRoutingRules(routingRules.filter((_, idx) => idx !== i))
    const moveRule = (i: number, dir: -1 | 1): void =>
        setRoutingRules(moveItem(routingRules, i, i + dir))
    const addRule = (): void => setRoutingRules([...routingRules, newRoutingRule(aiAgents[0]?.id ?? "")])

    // Changing kind changes what the pattern field even means (free text vs.
    // a project id) - carrying the old value across the text/project boundary
    // would leave, say, a project id sitting in a "title" rule's pattern,
    // matching nothing forever with no sign why. Reset it there. But `title`
    // and `titleGlob` are BOTH free text over the same title - someone
    // converting `login` to `*login*` is mid-keystroke on that boundary, not
    // crossing it, and wiping the field back to "" there destroys exactly the
    // typing they're in the middle of doing. Only reset when the pattern's
    // *meaning* actually changes.
    const isFreeText = (kind: RuleKind): boolean => kind === "title" || kind === "titleGlob"
    const changeKind = (i: number, kind: RuleKind): void => {
        const cur = routingRules[i]
        const carriesOver = isFreeText(kind) && isFreeText(cur.kind)
        updateRule(i, {
            kind,
            pattern: carriesOver ? cur.pattern : kind === "project" ? (projects[0]?.id ?? "") : ""
        })
    }

    // The same sentence describeRule (TaskBoard.tsx) builds for the dispatch
    // tooltip, minus its "Routed by rule:" prefix - so the row's own caption
    // never diverges from what the board says once this rule actually fires.
    const preview = (r: RoutingRule): string => {
        switch (r.kind) {
            case "always":
                return "Always"
            case "title":
                return `Title contains "${r.pattern}"`
            case "titleGlob":
                return `Title matches "${r.pattern}"`
            case "project": {
                const name = projects.find((p) => p.id === r.pattern)?.name
                return `Project is ${name ?? "(deleted project)"}`
            }
            default:
                return ""
        }
    }

    return (
        <div className="settings-section">
            <h3>Routing rules</h3>
            <p className="settings-hint" style={{ marginTop: 0 }}>
                Picks which agent a task board's Dispatch button runs, without asking every time.
                Rules are tried top to bottom; the first <b>enabled</b> rule that matches - and
                whose agent still exists - wins. No match falls through to <b>Default agent</b>{" "}
                below, then to the first AI agent preset.
            </p>
            <p className="settings-hint" style={{ marginTop: 0 }}>
                <b>Title contains</b> matches anywhere in the title. <b>Title matches (glob)</b>{" "}
                is anchored to the <i>whole</i> title instead - a bare <code>login</code> only
                matches a card titled exactly "login"; wrap it as <code>*login*</code> to match
                anywhere.
            </p>
            <div className="rule-list">
                {routingRules.map((r, i) => {
                    const patternInert =
                        (r.kind === "title" || r.kind === "titleGlob") && !r.pattern.trim()
                    const projectMissing =
                        r.kind === "project" && !projects.some((p) => p.id === r.pattern)
                    // Checked against the AI-mode subset, same as the <select> below decides
                    // whether to render a disabled ghost option: routing only ever targets an
                    // AI-mode preset (see dispatchBoardTask), so a rule naming a "normal"
                    // (fixed-command) preset is exactly as dead as one naming a deleted agent -
                    // routeAgent skips both. Checking the full `agents` list here would let this
                    // marker disagree with the select right next to it the moment an existing
                    // rule's target agent is flipped to "normal" in the Agents section above.
                    const agentMissing = !aiAgentIds.has(r.agentId)
                    // Same distinction as the project note below: "deleted" is only true
                    // when the id no longer names any agent at all. A preset that still
                    // exists but was flipped to "normal" (fixed-command) mode wasn't
                    // deleted - it just can't run a routed dispatch anymore.
                    const agentGone = agentMissing && !agents.some((a) => a.id === r.agentId)
                    const broken = agentMissing || projectMissing
                    const notes: string[] = []
                    if (agentMissing)
                        notes.push(
                            agentGone
                                ? "its agent was deleted - this rule is skipped"
                                : "its agent is normal-mode (not AI) - this rule is skipped"
                        )
                    if (projectMissing)
                        notes.push(
                            r.pattern
                                ? "its project was deleted - this rule never matches"
                                : "no project assigned - this rule never matches"
                        )
                    if (patternInert) notes.push("empty pattern - this rule never matches")
                    // A glob with no `*` or `?` compiles and "works", but a glob is
                    // ANCHORED - it only fires on a card titled exactly this pattern,
                    // which reads as healthy in the editor while being dead in practice
                    // for almost every real title. "Title matches" scans as "contains"
                    // to most people, so the row needs to say otherwise rather than
                    // let this look identical to a working substring rule.
                    const globNeedsWildcard =
                        r.kind === "titleGlob" && !!r.pattern.trim() && !/[*?]/.test(r.pattern)
                    if (globNeedsWildcard)
                        notes.push(
                            `anchored - matches only a title that is exactly "${r.pattern.trim()}"; use "*${r.pattern.trim()}*" to match anywhere`
                        )

                    return (
                        <div
                            key={r.id}
                            className={
                                "rule-row" +
                                (broken ? " rule-broken" : patternInert ? " rule-inert" : "")
                            }
                        >
                            <div className="rule-row-grid">
                                <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={r.enabled}
                                    data-tip="Enabled"
                                    onChange={(e) => updateRule(i, { enabled: e.target.checked })}
                                />
                                <select
                                    className="rule-kind"
                                    value={r.kind}
                                    onChange={(e) => changeKind(i, e.target.value as RuleKind)}
                                >
                                    {RULE_KINDS.map((k) => (
                                        <option key={k} value={k}>
                                            {RULE_KIND_LABEL[k]}
                                        </option>
                                    ))}
                                </select>
                                {r.kind === "always" && (
                                    <span className="rule-pattern rule-pattern-fixed muted small">
                                        matches every card
                                    </span>
                                )}
                                {(r.kind === "title" || r.kind === "titleGlob") && (
                                    <input
                                        className="rule-pattern"
                                        value={r.pattern}
                                        placeholder={r.kind === "titleGlob" ? "*login*" : "login"}
                                        data-tip={
                                            r.kind === "titleGlob"
                                                ? "Anchored to the whole title - * matches any run of characters, ? matches one"
                                                : "Matches anywhere in the title, case-insensitive"
                                        }
                                        onChange={(e) => updateRule(i, { pattern: e.target.value })}
                                    />
                                )}
                                {r.kind === "project" && (
                                    <select
                                        className="rule-pattern"
                                        value={r.pattern}
                                        onChange={(e) => updateRule(i, { pattern: e.target.value })}
                                    >
                                        {projectMissing && (
                                            <option value={r.pattern} disabled>
                                                (deleted project)
                                            </option>
                                        )}
                                        {projects.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <select
                                    className="rule-agent"
                                    value={r.agentId}
                                    onChange={(e) => updateRule(i, { agentId: e.target.value })}
                                >
                                    {!aiAgentIds.has(r.agentId) && (
                                        <option value={r.agentId} disabled>
                                            {agents.find((a) => a.id === r.agentId)?.name ??
                                                "(deleted agent)"}
                                        </option>
                                    )}
                                    {aiAgents.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    className="btn-min"
                                    disabled={i === 0}
                                    onClick={() => moveRule(i, -1)}
                                    data-tip="Move up"
                                >
                                    ↑
                                </button>
                                <button
                                    className="btn-min"
                                    disabled={i === routingRules.length - 1}
                                    onClick={() => moveRule(i, 1)}
                                    data-tip="Move down"
                                >
                                    ↓
                                </button>
                                <button
                                    className="row-remove"
                                    data-tip="Remove"
                                    onClick={() => removeRule(i)}
                                >
                                    ×
                                </button>
                            </div>
                            {notes.length > 0 ? (
                                <div className="rule-note">{notes.join(" · ")}</div>
                            ) : (
                                <div className="rule-preview muted small">{preview(r)}</div>
                            )}
                        </div>
                    )
                })}
            </div>
            <button onClick={addRule} disabled={aiAgents.length === 0}>
                + Add rule
            </button>
            {routingRules.length === 0 && (
                <p className="muted small" style={{ marginTop: 8 }}>
                    No rules yet - every dispatch falls through to Default agent below.
                </p>
            )}

            <div className="setting-row" style={{ marginTop: 18 }}>
                <label>Default agent</label>
                <select value={defaultAgentId} onChange={(e) => setDefaultAgentId(e.target.value)}>
                    <option value="">First AI agent preset</option>
                    {defaultAgentId && !aiAgentIds.has(defaultAgentId) && (
                        <option value={defaultAgentId} disabled>
                            {agents.find((a) => a.id === defaultAgentId)?.name ?? "(deleted agent)"}
                        </option>
                    )}
                    {aiAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                            {a.name}
                        </option>
                    ))}
                </select>
            </div>
            {defaultAgentId && !aiAgentIds.has(defaultAgentId) && (
                <div className="rule-note">
                    {agents.some((a) => a.id === defaultAgentId)
                        ? "Default agent is normal-mode (not AI) - falling back to the first AI agent preset."
                        : "Default agent was deleted - falling back to the first AI agent preset."}
                </div>
            )}
            <p className="settings-hint">
                Used when no rule matches (or none is configured). "First AI agent preset" is
                today's original behavior - whichever AI-mode preset is first among the AI agents
                in Startup commands above (a normal-mode preset there, like a dev server or build,
                is never a candidate - routing only ever targets an AI-mode preset).
            </p>
        </div>
    )
}

function AISection(): JSX.Element {
    const agents = useSettings((s) => s.agents)
    const setAgents = useSettings((s) => s.setAgents)
    const [keySet, setKeySet] = useState<Record<string, boolean>>({})
    const [draft, setDraft] = useState<Record<string, string>>({})

    const refresh = (): void => {
        window.api.ai.status().then(setKeySet)
    }
    useEffect(refresh, [])

    const update = (i: number, patch: Partial<(typeof agents)[number]>): void =>
        setAgents(agents.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))

    const saveKey = async (id: string): Promise<void> => {
        const key = (draft[id] ?? "").trim()
        if (!key) return
        await window.api.ai.setKey(id, key)
        setDraft((d) => ({ ...d, [id]: "" }))
        refresh()
    }
    const clearKey = async (id: string): Promise<void> => {
        await window.api.ai.clearKey(id)
        refresh()
    }

    return (
        <div className="settings-section">
            <h3>AI</h3>
            <p className="settings-hint">
                Per-agent default <b>model</b> and <b>API key</b>. The key is encrypted on disk
                (DPAPI) and injected into that agent's terminal at launch - it never touches{" "}
                <code>settings.json</code> and is never sent back to the UI.
            </p>
            {agents.map((a, i) => (
                <div key={a.id} className="ai-agent">
                    <div className="ai-agent-head">
                        <span className="agent-badge">{a.badge}</span>
                        {a.name}
                    </div>
                    <div className="setting-row">
                        <label>Default model</label>
                        <input
                            value={a.model}
                            placeholder={a.id === "claude" ? "claude-opus-4-8" : "(provider model id)"}
                            onChange={(e) => update(i, { model: e.target.value.trim() })}
                        />
                    </div>
                    <div className="setting-row">
                        <label data-tip="Env var the model is passed through to the CLI">
                            Model env var
                        </label>
                        <input
                            value={a.modelEnv}
                            placeholder={a.id === "claude" ? "ANTHROPIC_MODEL" : "(model env var)"}
                            onChange={(e) => update(i, { modelEnv: e.target.value.trim() })}
                        />
                    </div>
                    <div className="setting-row">
                        <label>API key{a.apiKeyEnv ? ` (${a.apiKeyEnv})` : ""}</label>
                        {keySet[a.id] ? (
                            <span className="ai-key-set">
                                <span className="ai-key-dot" /> stored
                                <button className="ai-key-clear" onClick={() => clearKey(a.id)}>
                                    Clear
                                </button>
                            </span>
                        ) : (
                            <span className="ai-key-input">
                                <input
                                    type="password"
                                    value={draft[a.id] ?? ""}
                                    placeholder={a.apiKeyEnv ? "paste key…" : "set a key env var first"}
                                    disabled={!a.apiKeyEnv}
                                    onChange={(e) =>
                                        setDraft((d) => ({ ...d, [a.id]: e.target.value }))
                                    }
                                />
                                <button
                                    className="accent"
                                    disabled={!a.apiKeyEnv || !(draft[a.id] ?? "").trim()}
                                    onClick={() => saveKey(a.id)}
                                >
                                    Save
                                </button>
                            </span>
                        )}
                    </div>
                    {keySet[a.id] && (
                        <div className="agent-warn">
                            ⚠ A stored key makes <b>{a.name}</b> bill <b>pay-as-you-go API usage</b>{" "}
                            instead of a subscription login. Clear it to fall back to the CLI's own
                            auth.
                        </div>
                    )}
                </div>
            ))}
            <p className="settings-hint">
                Usage / quota display is planned but not built yet - it needs per-provider APIs.
            </p>
        </div>
    )
}

function AboutSection(): JSX.Element {
    const [version, setVersion] = useState("")
    const [status, setStatus] = useState<UpdateStatus | null>(null)
    const diag = useCopyDiagnostics("about")
    const [showRecord, setShowRecord] = useState(false)

    useEffect(() => {
        window.api.app.version().then(setVersion)
        return window.api.update.onStatus(setStatus)
    }, [])

    const runCheck = async (): Promise<void> => {
        setStatus({ state: "checking" })
        const r = await window.api.update.check()
        // In dev or on a private repo, check() reports via its return value rather
        // than the event stream - surface that so the button never looks dead.
        if (!r.ok) setStatus({ state: "error", error: r.error })
    }

    const busy = status?.state === "checking" || status?.state === "downloading"
    const statusLine = (): string => {
        switch (status?.state) {
            case "checking":
                return "Checking for updates…"
            case "available":
                return `Update available: ${status.version}`
            case "downloading":
                return `Downloading… ${status.percent ?? 0}%`
            case "ready":
                return `Ready to install: ${status.version}`
            case "current":
                return "You're on the latest version."
            case "error":
                return `Update check failed: ${status.error ?? "unknown"}`
            default:
                return ""
        }
    }

    return (
        <div className="settings-section">
            <h3>DevDeck</h3>
            <p className="settings-hint">
                A command deck for terminal-first, Claude-driven development - multiple
                terminals, agent sessions you can see the state of, fast project switching, an
                editor, git status and remote access in one window.
            </p>
            <p className="muted small">Version {version || "…"} · Electron + React</p>

            <div className="update-row">
                <button onClick={runCheck} disabled={busy}>
                    Check for updates
                </button>
                {status?.state === "available" && (
                    <button className="accent" onClick={() => window.api.update.download()}>
                        Download
                    </button>
                )}
                {status?.state === "ready" && (
                    <button className="accent" onClick={() => window.api.update.install()}>
                        Restart &amp; install
                    </button>
                )}
                {statusLine() && <span className="muted small">{statusLine()}</span>}
            </div>
            <p className="settings-hint">
                Updates are fetched from GitHub releases. They require the releases to be publicly
                readable; on a private repo the check fails and you can keep installing builds
                manually.
            </p>

            <h3>Diagnostics</h3>
            <div className="update-row">
                <button disabled={diag.disabled} onClick={diag.onClick}>
                    {diag.label}
                </button>
                {/* Disabled until a record exists to show: an empty <pre> under
                    "Show what's copied" would answer the question with nothing. */}
                <button
                    disabled={diag.text === null}
                    onClick={() => setShowRecord((v) => !v)}
                >
                    {showRecord ? "Hide what's copied" : "Show what's copied"}
                </button>
            </div>
            <DiagnosticsNote state={diag} className="settings-hint" />
            {showRecord && diag.text !== null && (
                <>
                    <pre className="diag-record">{diag.text}</pre>
                    {/* Showing the record IS the answer to "what does this blob
                        contain" - a paragraph describing it would be a second
                        thing that can drift from the first. */}
                    <p className="diag-caption">
                        This is the whole text, exactly as it will be copied. Long values are
                        truncated; whatever was left out is listed under Incomplete.
                    </p>
                </>
            )}
        </div>
    )
}

function NotificationsSection(): JSX.Element {
    const notifications = useSettings((s) => s.notifications)
    const setNotifications = useSettings((s) => s.setNotifications)
    // The capability, from main. Asked on mount rather than at launch: this is
    // the only surface that reads it, and it is a fact about the machine that
    // can change under a running app (a Windows notification setting).
    const notifyState = useStore((s) => s.notifyState)
    const refreshNotifyState = useStore((s) => s.refreshNotifyState)
    useEffect(() => {
        void refreshNotifyState()
    }, [refreshNotifyState])
    // Only an explicit `false` blocks. `null` is "not asked yet", which is not
    // evidence of anything and must not be rendered as a failure.
    const unavailable = notifyState !== null && !notifyState.supported
    return (
        <div className="settings-section">
            <h3>Attention notifications</h3>
            <p className="muted small">
                When an agent needs you (and its terminal isn&apos;t visible), how should DevDeck
                alert you? The loud tier is a bell / blocked prompt; the soft tier is an agent
                finishing a turn and waiting on you.
            </p>
            <div className="setting-row">
                <label>Desktop notification (loud)</label>
                {/* `checked` is the setting AND the capability, so this box
                    cannot read on while nothing is being delivered - which is
                    exactly what it did until 2026-09-10: the renderer's
                    notifications were denied by DevDeck's own permission
                    handler and dropped without an error anywhere. It is now
                    sent from main, and this is the honest reading of whether
                    that can work here. */}
                <input
                    type="checkbox"
                    className="checkbox"
                    checked={notifications.desktop && !unavailable}
                    disabled={unavailable}
                    onChange={(e) => setNotifications({ desktop: e.target.checked })}
                />
            </div>
            {/* What the toggle says when the capability is absent. Only what
                is actually known gets claimed: `Notification.isSupported()`
                says whether anything can be delivered here, and the OS's own
                `failed` event says Windows turned one down. Neither can tell us
                the user SAW a toast - Focus Assist and quiet hours are
                invisible to the app - so neither sentence says it did. */}
            {unavailable && (
                <p className="settings-hint warn">
                    Desktop notifications aren&apos;t available on this machine, so DevDeck is
                    delivering none and this box stays off. The flag count on the deck and the
                    sound below don&apos;t depend on it.
                </p>
            )}
            {!unavailable && notifyState?.error && (
                <p className="settings-hint warn">
                    Windows turned down the last desktop notification: {notifyState.error}. The
                    flag count on the deck doesn&apos;t depend on this one working.
                </p>
            )}
            <div className="setting-row">
                <label>Sound when an agent needs you (loud)</label>
                <input
                    type="checkbox"
                    className="checkbox"
                    checked={notifications.sound}
                    onChange={(e) => setNotifications({ sound: e.target.checked })}
                />
            </div>
            <div className="setting-row">
                <label>Sound when an agent finishes / is waiting (soft)</label>
                <input
                    type="checkbox"
                    className="checkbox"
                    checked={notifications.waitingSound}
                    onChange={(e) => setNotifications({ waitingSound: e.target.checked })}
                />
            </div>
        </div>
    )
}

/** Relative-time label for a device's last-seen timestamp. Devices can sit
 *  idle for weeks (or forever, under "Never"), so this needs day granularity
 *  beyond the minutes/hours the activity-panel's `ago()` covers. */
function relativeTime(ts: number): string {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
    if (s < 60) return "just now"
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.round(h / 24)
    return `${d}d ago`
}

/** Bind chooser: rendered as stacked option cards (not a compact pill row) so
 *  each option's consequence is readable on the option itself - "Local
 *  network"'s LAN-wide exposure has to be visible before it's picked, not
 *  discovered after. `warn` keeps that option's description at full text
 *  color instead of muted, since the two riskier choices shouldn't read as
 *  calmly as the safe one. */
const BIND_OPTIONS: { value: BindMode; title: string; desc: string; warn?: boolean }[] = [
    {
        value: "tailscale",
        title: "Tailscale / VPN",
        desc: "Reachable only over your Tailscale network, from anywhere - the safest choice."
    },
    {
        value: "lan",
        title: "Local network",
        // I6: this used to undersell the exposure as "this Wi-Fi/LAN" - the
        // actual bind is 0.0.0.0, every IPv4 interface on the machine, not
        // only the Wi-Fi adapter: any Tailscale/VPN peer if one is up, plus a
        // second NIC, a phone hotspot, a corporate VPN adapter, or a
        // WSL/Hyper-V virtual switch. Reuses the running-status line's wording
        // (below) rather than re-describing the same fact differently in two
        // places - this card is read BEFORE the exposure is accepted, so it's
        // the more important of the two to get right.
        desc: "Binds every network interface on this machine, not just this Wi-Fi - any Tailscale/VPN peer if one is up, plus a second NIC, a hotspot, or a WSL/Hyper-V virtual adapter. Any device reachable on any of those can reach a full terminal here. Only choose this on a network you trust.",
        warn: true
    },
    {
        value: "auto",
        title: "Auto (legacy)",
        // Inherits "lan"'s exposure by reference (see chooseBind in
        // guards.ts) whenever Tailscale isn't up, so it inherited the same
        // understatement - fixed the same way, for the same reason.
        desc: "Uses Tailscale when it's up, otherwise falls back to binding every interface on this machine automatically - the same exposure as Local network, reached without asking. Existing installs were migrated to this; it is not the safe default.",
        warn: true
    }
]

const EXPIRY_OPTIONS: { value: DeviceTtlDays; label: string }[] = [
    { value: 7, label: "7 days" },
    { value: 30, label: "30 days" },
    { value: 0, label: "Never" }
]

function RemoteSection(): JSX.Element {
    const remote = useSettings((s) => s.remote)
    const setRemote = useSettings((s) => s.setRemote)
    // The verbatim refusal reason from the last start attempt (e.g. no tailnet
    // address found) - null once a start has succeeded.
    const remoteBindError = useSettings((s) => s.remoteBindError)
    const storeRestartServer = useSettings((s) => s.restartServer)
    const [status, setStatus] = useState<ServerStatus | null>(null)
    const [qr, setQr] = useState<string>("")
    // The pairing token lives in main's encrypted device store, not in
    // settings — fetched over IPC rather than read off `remote`.
    const [pairingTok, setPairingTok] = useState<string>("")
    const [devices, setDevices] = useState<RemoteDevice[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState("")
    // Shared by rename and revoke: both are IPC round-trips that can reject,
    // and both need to surface that rather than fail silently.
    const [deviceActionError, setDeviceActionError] = useState<string | null>(null)

    // Derive the URL from what the server is actually bound to, not from what
    // happens to be available. 0.0.0.0 isn't dialable, so show the LAN address —
    // but say plainly that it *is* the LAN. Otherwise the panel can display a
    // private Tailscale address while the server is still listening on every
    // interface, which reads as "private" when it isn't.
    const bound = status?.boundHost ?? null
    // onTailnet/staleBind/unencryptedLan are pulled out into a pure function
    // (remoteBindView.ts) so they're unit-testable independent of the running
    // app - see that file's comment for why that matters here. A `boundWide`
    // field used to live on this view too, but nothing here ever consumed it
    // - `chooseBind` (guards.ts) only ever returns a tailnet address or
    // 0.0.0.0 (pinned by a test in tests/guards.test.ts), so whenever the
    // server is running and NOT on the tailnet, it is wide by construction;
    // there is no third "just this Wi-Fi" case to branch on, so it was
    // removed rather than left as a tested export nothing called.
    const { onTailnet, staleBind, unencryptedLan } = deriveRemoteBindView(status, remote.bind, remote.tls)
    const host = onTailnet ? bound : (status?.lan[0] ?? "")
    const scheme = remote.tls ? "https" : "http"
    const url = host && pairingTok ? `${scheme}://${host}:${remote.port}/?token=${pairingTok}` : ""

    // Routes through the store's restartServer so `remoteBindError` has
    // exactly one writer (setRemote's debounced apply is the other caller of
    // the same underlying function) rather than this button bypassing it with
    // its own separate stop/start that could leave the reason stale either way.
    const restartServer = async (): Promise<void> => {
        await storeRestartServer()
        setStatus(await window.api.server.status())
    }

    // I2: `regeneratePairingToken` now uses the throwing `writeStore`, not the
    // swallowing `save`, precisely so a failed write surfaces here instead of
    // the panel displaying (and QR-encoding) a "new" token while the store
    // still holds the old, possibly-leaked one live.
    const regenerateToken = async (): Promise<void> => {
        setDeviceActionError(null)
        try {
            setPairingTok(await window.api.devices.regeneratePairingToken())
        } catch (err) {
            setDeviceActionError(`Regenerate failed: ${(err as Error)?.message ?? String(err)}`)
        }
    }

    useEffect(() => {
        let on = true
        window.api.devices
            .pairingToken()
            .then((t) => on && setPairingTok(t))
            .catch(
                (err) =>
                    on &&
                    setDeviceActionError(
                        `Pairing token failed: ${(err as Error)?.message ?? String(err)}`
                    )
            )
        return () => {
            on = false
        }
    }, [])

    useEffect(() => {
        let on = true
        const tick = (): void => {
            window.api.server.status().then((s) => on && setStatus(s))
        }
        tick()
        const iv = setInterval(tick, 2000)
        return () => {
            on = false
            clearInterval(iv)
        }
    }, [])

    useEffect(() => {
        if (url) QRCode.toDataURL(url, { margin: 1, width: 190 }).then(setQr)
        else setQr("")
    }, [url])

    // The device list is the only mitigation against a leaked pairing token
    // (it never expires and regenerating it deliberately spares already-paired
    // devices), so it polls on its own rather than only refreshing after a
    // rename/revoke - a device idling out under the current TTL policy, or
    // enrolling from another window, should show up here without a reload.
    useEffect(() => {
        let on = true
        const tick = (): void => {
            window.api.devices.list(remote.deviceTtlDays).then((d) => on && setDevices(d))
        }
        tick()
        const iv = setInterval(tick, 5000)
        return () => {
            on = false
            clearInterval(iv)
        }
    }, [remote.deviceTtlDays])

    const refreshDevices = async (): Promise<void> => {
        setDevices(await window.api.devices.list(remote.deviceTtlDays))
    }

    const startRename = (d: RemoteDevice): void => {
        setEditingId(d.id)
        setEditingName(d.name)
    }

    const commitRename = async (id: string): Promise<void> => {
        const name = editingName.trim()
        setEditingId(null)
        // Clear any stale error BEFORE the empty-name early return - otherwise
        // cancelling a rename by blanking the field leaves a stale "Rename
        // failed…" from a previous attempt on screen with nothing to clear it.
        setDeviceActionError(null)
        if (!name) return
        try {
            await window.api.devices.rename(id, name)
            await refreshDevices()
        } catch (err) {
            // Unlike revoke, a failed rename isn't a security problem - but
            // swallowing it left the input silently reverting to the old
            // name on the next 5s poll with no explanation at all, which is
            // its own kind of confusing. Surface it the same way.
            setDeviceActionError(`Rename failed: ${(err as Error)?.message ?? String(err)}`)
        }
    }

    // Revoke is the one security promise this whole panel makes, and
    // `devices.revoke` throws on a write failure precisely so a caller doesn't
    // report success when the device is actually still paired - swallowing
    // that here would be the UI half of the exact bug the throw exists to
    // prevent, so a failed revoke surfaces verbatim instead.
    const revoke = async (id: string): Promise<void> => {
        setDeviceActionError(null)
        try {
            await window.api.devices.revoke(id)
            await refreshDevices()
        } catch (err) {
            setDeviceActionError(`Revoke failed: ${(err as Error)?.message ?? String(err)}`)
        }
    }

    return (
        <div className="settings-section">
            <h3>Remote access (mobile)</h3>
            <div className="setting-row">
                <label>Enable</label>
                <input
                    type="checkbox"
                    className="checkbox"
                    checked={remote.enabled}
                    onChange={(e) => setRemote({ enabled: e.target.checked })}
                />
            </div>

            {/* The single most consequential choice in this panel: which
                interface the server binds. Rendered as full option cards
                (not a compact pill row) so the exposure each one carries is
                readable before it's picked, not discovered after. */}
            <div className="remote-subhead">Network</div>
            <div className="bind-options">
                {BIND_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        className={
                            "bind-option" +
                            (remote.bind === opt.value ? " on" : "") +
                            (opt.warn ? " warn" : "")
                        }
                        onClick={() => setRemote({ bind: opt.value })}
                    >
                        <div className="bind-option-title">{opt.title}</div>
                        <div className="bind-option-desc">{opt.desc}</div>
                    </button>
                ))}
            </div>
            {/* Verbatim, unparaphrased — e.g. "No tailnet address found. Start
                Tailscale, or choose Local network." Shown right under the
                chooser that caused it, not buried in the status block below,
                so picking Tailscale with no tailnet up reads as a refusal
                and not as the panel silently doing nothing. */}
            {!status?.running && remoteBindError && (
                <div className="settings-hint warn" role="alert">
                    {remoteBindError}
                </div>
            )}

            <div className="remote-subhead">Device expiry</div>
            <div className="remote-seg">
                {EXPIRY_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        className={remote.deviceTtlDays === opt.value ? "on" : ""}
                        onClick={() => setRemote({ deviceTtlDays: opt.value })}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            <p className="muted small">
                How long a paired device can sit idle before it&apos;s dropped automatically -
                using it resets the window. Revoke a device by hand any time below.{" "}
                <b>Shortening this drops any device already idle past the new window within
                seconds</b> - re-pairing is the only way back, even while remote access is off.
            </p>

            <div className="setting-row">
                <label>Port</label>
                <input
                    type="number"
                    value={remote.port}
                    onChange={(e) => setRemote({ port: Number(e.target.value) })}
                />
            </div>
            <div className="setting-row">
                <label>Pairing token</label>
                <div className="accent-controls">
                    <code className="token">{pairingTok || "(loading…)"}</code>
                    <button onClick={() => void regenerateToken()}>Regenerate</button>
                </div>
            </div>
            <div className="setting-row">
                <label>HTTPS (self-signed)</label>
                <input
                    type="checkbox"
                    className="checkbox"
                    checked={remote.tls}
                    onChange={(e) => setRemote({ tls: e.target.checked })}
                />
            </div>

            {remote.enabled && (
                <div className="remote-connect">
                    <div className="remote-status">
                        Server: {status?.running ? "running" : "stopped"}
                        {/* Say what it's reachable on, not just that it's up.
                            Not on the tailnet means wide (0.0.0.0) - every
                            interface on this machine INCLUDING Tailscale if
                            it's up, not "just this Wi-Fi": with bind=lan/auto
                            and a tailnet present, any tailnet peer can reach
                            it too. There is no third, narrower case to state
                            here - chooseBind (guards.ts) never returns
                            anything but a tailnet address or 0.0.0.0 (pinned
                            by a test in tests/guards.test.ts), so "running and
                            not on the tailnet" only ever means wide. */}
                        {status?.running &&
                            (onTailnet
                                ? " · Tailscale only (reachable anywhere on your tailnet)"
                                : " · every interface on this machine (this Wi-Fi, and any tailnet peer if Tailscale is up)")}
                    </div>
                    {staleBind && (
                        <div className="settings-hint warn" role="alert">
                            ⚠ Tailscale came up after the server started, so it&apos;s still
                            listening on <b>every interface</b>, including this Wi-Fi — not just
                            your tailnet. Restart it to bind privately.
                            <div className="row-inline" style={{ marginTop: 6 }}>
                                <button onClick={() => void restartServer()}>Restart remote</button>
                            </div>
                        </div>
                    )}
                    {/* M8: gated on status?.running, not just `url` being
                        computable. `host` falls back to `status.lan[0]` -
                        physically-detected LAN addresses, which exist whether
                        or not anything is actually listening - so picking
                        Tailscale with the tailnet down used to show a red
                        refusal, "stopped", AND a scannable QR to an address
                        nothing was listening on. */}
                    {status?.running && url ? (
                        <div className="remote-url-block">
                            {qr && <img className="qr" src={qr} alt="connect QR" />}
                            <div>
                                <div className="muted small">Open on your phone:</div>
                                <code className="token url">{url}</code>
                                {/* unencryptedLan is keyed on what's actually BOUND
                                    (onTailnet), not on whether Tailscale merely happens to
                                    be installed - see remoteBindView.ts. The copy has to
                                    match: it fires just as correctly for someone who HAS
                                    Tailscale but chose Local network, so it must not claim
                                    no Tailscale address exists or tell them to install
                                    something they already have - the fix is to use it, via
                                    the chooser above, not install it again. */}
                                {unencryptedLan && (
                                    <div className="settings-hint warn" role="alert">
                                        ⚠ This link is not going over Tailscale - it&apos;s a plain-LAN{" "}
                                        <code>http://</code> link, so the token and everything you type
                                        travel <b>unencrypted</b> over Wi-Fi. Switch <b>Network</b> to{" "}
                                        <b>Tailscale / VPN</b> above, or turn on <b>HTTPS</b>.
                                    </div>
                                )}
                                {remote.tls && (
                                    <div className="settings-hint">
                                        Self-signed HTTPS: your phone will warn “connection not
                                        private” the first time - accept it once. The link (and token)
                                        are then encrypted even on plain LAN. Accepting the warning
                                        does <b>not</b> make the page a secure context, so browser
                                        notifications stay limited to a tab you have open.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : status?.running ? (
                        <div className="muted small">Detecting network address…</div>
                    ) : null}
                </div>
            )}

            {/* The pairing token never expires and enrols unlimited devices,
                and regenerating it deliberately spares already-paired
                devices - so anyone who ever learned it keeps a device that
                survives regeneration. Per-device revoke is the only real
                mitigation, which is why this list is here rather than being
                a convenience. */}
            <div className="remote-subhead">Paired devices</div>
            {deviceActionError && (
                <div className="settings-hint warn" role="alert">
                    {deviceActionError}
                </div>
            )}
            <div className="device-list">
                {devices.length === 0 ? (
                    <p className="muted small">
                        No devices are paired yet - turn on remote access and scan the QR code
                        above with your phone to pair one.
                    </p>
                ) : (
                    devices.map((d) => (
                        <div className="device-row" key={d.id}>
                            {editingId === d.id ? (
                                <input
                                    className="device-name-input"
                                    autoFocus
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onBlur={() => void commitRename(d.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") void commitRename(d.id)
                                    }}
                                    // Capture, not bubble: Modal.tsx renders its children
                                    // inline (no portal), and its own Escape handler is a
                                    // *native* bubble-phase listener on the modal div - a
                                    // real DOM ancestor of this input that sits between it
                                    // and React's root-delegated dispatcher. Real bubble
                                    // order reaches that listener before React's bubble
                                    // dispatch ever runs, so a same-phase stopPropagation
                                    // here (the LaunchOptions.tsx:128 pattern, which has no
                                    // competing Modal listener to race) would never even
                                    // fire. Capture runs first, so stopping it here is what
                                    // actually pre-empts Modal's handler, ejecting-from-
                                    // Settings only cancels the rename instead.
                                    onKeyDownCapture={(e) => {
                                        if (e.key === "Escape") {
                                            e.stopPropagation()
                                            setEditingId(null)
                                        }
                                    }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="device-name"
                                    onClick={() => startRename(d)}
                                    title="Click to rename"
                                >
                                    {d.name}
                                </button>
                            )}
                            <span className="device-lastseen muted small">
                                {relativeTime(d.lastSeenAt)}
                            </span>
                            {/* Neutral by design: five devices with an accent Revoke
                                each would be five accents on screen. Only the danger
                                semantic (on hover) marks this as destructive. */}
                            <button
                                type="button"
                                className="btn-min danger device-revoke"
                                onClick={() => void revoke(d.id)}
                            >
                                Revoke
                            </button>
                        </div>
                    ))
                )}
            </div>

            <p className="settings-hint">
                ⚠ A remote terminal can run commands on this machine. Keep the token private,
                prefer Tailscale (never expose the port publicly), and turn this off when not
                needed.
            </p>
        </div>
    )
}

function ProxySection(): JSX.Element {
    const proxy = useSettings((s) => s.proxy)
    const setProxy = useSettings((s) => s.setProxy)
    return (
        <div className="settings-section">
            <h3>Corporate proxy</h3>
            <div className="setting-row">
                <label>Enable</label>
                <input
                    type="checkbox"
                    className="checkbox"
                    checked={proxy.enabled}
                    onChange={(e) => setProxy({ enabled: e.target.checked })}
                />
            </div>
            <div className="setting-row">
                <label>Proxy URL</label>
                <input
                    type="text"
                    placeholder="http://proxy.corp:8080"
                    value={proxy.url}
                    onChange={(e) => setProxy({ url: e.target.value })}
                />
            </div>
            <div className="setting-row">
                <label>No-proxy hosts</label>
                <input
                    type="text"
                    placeholder="localhost,127.0.0.1,.internal"
                    value={proxy.noProxy}
                    onChange={(e) => setProxy({ noProxy: e.target.value })}
                />
            </div>
            <div className="setting-row">
                <label>Extra CA cert</label>
                <div className="accent-controls">
                    <input
                        type="text"
                        placeholder="C:\path\to\corp-ca.pem"
                        value={proxy.caPath}
                        onChange={(e) => setProxy({ caPath: e.target.value })}
                    />
                    <button
                        onClick={async () => {
                            const p = await window.api.fs.pickFile([
                                { name: "Certificates", extensions: ["pem", "crt", "cer", "ca"] },
                                { name: "All files", extensions: ["*"] }
                            ])
                            if (p) setProxy({ caPath: p })
                        }}
                    >
                        Browse…
                    </button>
                </div>
            </div>
            <p className="settings-hint">
                Sets <code>HTTP(S)_PROXY</code>, <code>NO_PROXY</code> and{" "}
                <code>NODE_EXTRA_CA_CERTS</code> for <b>newly-opened</b> terminals and the tools
                they run (npm, git, dotnet, gh). Existing terminals keep their old environment —
                reopen them to pick up a change. The updater isn't routed through the proxy yet.
            </p>
        </div>
    )
}

const ACCENT_PRESETS = ["#b8895c", "#8c9a68", "#7fa0a0", "#a98ba5", "#c4855d", "#9a8c98"]

/**
 * The shell picker, derived from `SHELL_LABELS` so a new `ShellKind` cannot be
 * added to the union and forgotten here - this was the third hand-kept copy of
 * the same list.
 *
 * `custom` keeps its own label: the record names a *running* shell ("Starting
 * Custom shell..."), while this is a menu entry whose ellipsis promises a text
 * field. Same value, two jobs, so the strings are deliberately not shared.
 */
const SHELL_PICKER_LABELS: Partial<Record<ShellKind, string>> = { custom: "Custom…" }
const SHELLS: { value: ShellKind; label: string }[] = (
    Object.keys(SHELL_LABELS) as ShellKind[]
).map((value) => ({ value, label: SHELL_PICKER_LABELS[value] ?? SHELL_LABELS[value] }))

// Same list the F1 overlay shows - see ../shortcuts.ts. This table used to be
// its own hand-kept array and had fallen ten bindings and one renamed feature
// behind it.
const SHORTCUTS = shortcutGroups(DECK_VIEWS.map((v) => v.name))

export function SettingsModal(): JSX.Element {
    const s = useSettings()
    const [section, setSection] = useState<Section>("appearance")

    // Honour a deep-link (e.g. the palette's "Edit pipelines…"), so a buried
    // section can be reached directly instead of hunting through the nav.
    const wanted = s.settingsSection
    useEffect(() => {
        if (wanted && SECTIONS.some((sec) => sec.key === wanted)) setSection(wanted as Section)
    }, [wanted])

    return (
        <Modal onClose={s.closeSettings} className="settings-modal" labelledBy="settings-modal-title">
                <div className="settings-nav">
                    <div className="settings-nav-title" id="settings-modal-title">
                        Settings
                    </div>
                    {SECTIONS.map((sec) => (
                        <button
                            type="button"
                            key={sec.key}
                            className={"settings-nav-item" + (section === sec.key ? " active" : "")}
                            onClick={() => setSection(sec.key)}
                        >
                            {sec.label}
                        </button>
                    ))}
                </div>

                <div className="settings-content">
                    <button className="settings-close" data-tip="Close" onClick={s.closeSettings}>
                        ×
                    </button>

                    {section === "appearance" && (
                        <div className="settings-section">
                            <h3>Appearance</h3>
                            <div className="setting-row">
                                <label>Theme</label>
                                <div className="theme-cards">
                                    {THEME_LIST.map((t) => (
                                        <button
                                            type="button"
                                            key={t.id}
                                            className={
                                                "theme-card" +
                                                (s.appearance.theme === t.id ? " on" : "")
                                            }
                                            onClick={() => s.setAppearance({ theme: t.id })}
                                        >
                                            <div
                                                className="theme-swatch"
                                                style={{ background: t.vars["--bg"] }}
                                            >
                                                <span style={{ background: t.vars["--bg-2"] }} />
                                                <span style={{ background: t.accent }} />
                                                <span style={{ background: t.vars["--text"] }} />
                                            </div>
                                            <span className="theme-name">{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="setting-row">
                                <label>Style</label>
                                <div className="style-cards">
                                    {STYLE_LIST.map((st) => (
                                        <button
                                            type="button"
                                            key={st.id}
                                            className={"style-card" + (s.appearance.style === st.id ? " on" : "")}
                                            onClick={() => s.setAppearance({ style: st.id })}
                                        >
                                            <span className="style-name">{st.label}</span>
                                            <span className="style-desc">{st.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="setting-row">
                                <label>Accent color</label>
                                <div className="accent-controls">
                                    <input
                                        type="color"
                                        value={s.appearance.accent}
                                        onChange={(e) =>
                                            s.setAppearance({ accent: e.target.value })
                                        }
                                    />
                                    <div className="swatches">
                                        {ACCENT_PRESETS.map((c) => (
                                            <button
                                                type="button"
                                                key={c}
                                                className="swatch"
                                                style={{ background: c }}
                                                aria-label={"Accent " + c}
                                                aria-pressed={s.appearance.accent === c}
                                                onClick={() => s.setAppearance({ accent: c })}
                                            />
                                        ))}
                                    </div>
                                    <button
                                        onClick={() =>
                                            s.setAppearance({
                                                accent: THEMES[s.appearance.theme].accent
                                            })
                                        }
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                            <p className="settings-hint">
                                Three themes - Slate and Sumi (dark) and Washi (light) - each
                                applied across the UI, terminal, and editor. A style sets shape
                                and depth on top of any theme. Accent tints the one highlight
                                color.
                            </p>
                        </div>
                    )}

                    {section === "terminal" && (
                        <div className="settings-section">
                            <h3>Terminal</h3>
                            <div className="setting-row">
                                <label>Default shell</label>
                                <select
                                    value={s.terminal.shell}
                                    onChange={(e) =>
                                        s.setTerminal({ shell: e.target.value as ShellKind })
                                    }
                                >
                                    {SHELLS.map((sh) => (
                                        <option key={sh.value} value={sh.value}>
                                            {sh.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {(s.terminal.shell === "custom" || s.terminal.shell === "gitbash") && (
                                <div className="setting-row">
                                    <label>Shell path</label>
                                    <input
                                        value={s.terminal.customShellPath}
                                        placeholder="C:\\path\\to\\shell.exe"
                                        onChange={(e) =>
                                            s.setTerminal({ customShellPath: e.target.value })
                                        }
                                    />
                                </div>
                            )}
                            <div className="setting-row">
                                <label>Font family</label>
                                <input
                                    value={s.terminal.fontFamily}
                                    onChange={(e) =>
                                        s.setTerminal({ fontFamily: e.target.value })
                                    }
                                />
                            </div>
                            <div className="setting-row">
                                <label>Font size</label>
                                <input
                                    type="number"
                                    min={8}
                                    max={28}
                                    value={s.terminal.fontSize}
                                    onChange={(e) =>
                                        s.setTerminal({ fontSize: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <p className="settings-hint">
                                Shell changes apply to newly opened terminals.
                            </p>
                        </div>
                    )}

                    {section === "editor" && (
                        <div className="settings-section">
                            <h3>Editor</h3>
                            <div className="setting-row">
                                <label>Font size</label>
                                <input
                                    type="number"
                                    min={8}
                                    max={28}
                                    value={s.editor.fontSize}
                                    onChange={(e) =>
                                        s.setEditor({ fontSize: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <div className="setting-row">
                                <label>Tab size</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={8}
                                    value={s.editor.tabSize}
                                    onChange={(e) =>
                                        s.setEditor({ tabSize: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <div className="setting-row">
                                <label>Word wrap</label>
                                <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={s.editor.wordWrap}
                                    onChange={(e) => s.setEditor({ wordWrap: e.target.checked })}
                                />
                            </div>
                            <div className="setting-row">
                                <label>Minimap</label>
                                <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={s.editor.minimap}
                                    onChange={(e) => s.setEditor({ minimap: e.target.checked })}
                                />
                            </div>
                        </div>
                    )}

                    {section === "agents" && (
                        <>
                            <AgentsSection />
                            <RoutingSection />
                        </>
                    )}

                    {section === "ai" && <AISection />}

                    {section === "snippets" && <SnippetsSection />}

                    {section === "pipelines" && <PipelinesSection />}

                    {section === "git" && <GitSection />}

                    {section === "ssh" && <SshSection />}

                    {section === "mcp" && <McpSection />}

                    {section === "remote" && <RemoteSection />}
                    {section === "proxy" && <ProxySection />}
                    {section === "notifications" && <NotificationsSection />}

                    {section === "shortcuts" && (
                        <div className="settings-section">
                            <h3>Keyboard shortcuts</h3>
                            {SHORTCUTS.map((g) => (
                                <div key={g.title}>
                                    <h4>{g.title}</h4>
                                    <table className="shortcuts-table">
                                        <tbody>
                                            {g.items.map(([k, v]) => (
                                                <tr key={k}>
                                                    <td>
                                                        <kbd>{k}</kbd>
                                                    </td>
                                                    <td>{v}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>
                    )}

                    {section === "about" && <AboutSection />}
                </div>
        </Modal>
    )
}
