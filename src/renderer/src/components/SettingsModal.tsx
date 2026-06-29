import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { useSettings, type ShellKind } from "../settings"
import { useStore } from "../store"
import { THEMES, STYLES } from "../themes"
import type { McpServer } from "../../../preload/index"
import { type Pipeline, type PipelineStep, type PipelineTrigger, isRunnable, moveItem } from "../pipeline"
import { type GateMode, type StepGate, DEFAULT_GATE } from "../gate"

const THEME_LIST = Object.values(THEMES)
const STYLE_LIST = Object.values(STYLES)
import type { ServerStatus } from "../../../preload/index"

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
    { key: "shortcuts", label: "Shortcuts" },
    { key: "about", label: "About" }
]

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
                <p className="muted">Select a project first - MCP servers are per-project.</p>
            </div>
        )
    }

    return (
        <div className="settings-section">
            <h3>MCP servers · {project.name}</h3>
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

    const update = (i: number, patch: Record<string, string>): void =>
        setGitAccounts(accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
    const remove = (i: number): void => setGitAccounts(accounts.filter((_, idx) => idx !== i))
    const add = (): void =>
        setGitAccounts([
            ...accounts,
            { id: crypto.randomUUID(), label: "New account", name: "", email: "", sshCommand: "" }
        ])

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
                    </div>
                </div>
            ))}
            <button onClick={add} style={{ marginTop: 8 }}>
                + Add account
            </button>
            <p className="settings-hint">
                Apply an account to the active project from the <b>status bar</b> (click the
                identity next to the branch). It writes the project's local <code>git config</code>{" "}
                (name, email, and optional <code>core.sshCommand</code>) - so each repo can use a
                different identity/key. Tokens (PAT) aren't stored yet.
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
    regex: "Output matches /regex/"
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
                        className="pipe-gate-pattern"
                        value={g.pattern}
                        placeholder={g.mode === "regex" ? "e.g. \\b0 errors?\\b" : "e.g. All tests passed"}
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
                    {p.steps.map((st, si) => (
                        <div key={st.id} className="pipe-step">
                            <div className="pipe-step-head">
                                <span className="pipe-step-num">{si + 1}</span>
                                <input
                                    className="pipe-step-title"
                                    value={st.title}
                                    placeholder="Step title"
                                    onChange={(e) => updateStep(pi, si, { title: e.target.value })}
                                />
                                <select
                                    className="pipe-step-agent"
                                    value={st.agentId}
                                    onChange={(e) => updateStep(pi, si, { agentId: e.target.value })}
                                >
                                    {agents.map((a) => (
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
                        </div>
                    ))}
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
    const setAgents = useSettings((s) => s.setAgents)
    const agentIdleMs = useSettings((s) => s.agentIdleMs)
    const setAgentIdleMs = useSettings((s) => s.setAgentIdleMs)
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

    const update = (i: number, patch: Record<string, string>): void => {
        setAgents(agents.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
    }
    const remove = (i: number): void => setAgents(agents.filter((_, idx) => idx !== i))
    const add = (): void =>
        setAgents([
            ...agents,
            {
                id: crypto.randomUUID(),
                name: "New agent",
                command: "",
                resumeArgs: "",
                badge: "AGENT",
                apiKeyEnv: "",
                model: "",
                modelEnv: ""
            }
        ])

    return (
        <div className="settings-section">
            <h3>AI agents</h3>
            <div className="agents-head">
                <span>Name</span>
                <span>Command</span>
                <span>Resume</span>
                <span>Badge</span>
                <span>Key env var</span>
                <span />
            </div>
            {agents.map((a, i) => {
                const overridden = !!a.apiKeyEnv && envSet[a.apiKeyEnv]
                return (
                    <div key={a.id}>
                        <div className="agent-edit-row">
                            <input
                                value={a.name}
                                onChange={(e) => update(i, { name: e.target.value })}
                            />
                            <input
                                value={a.command}
                                placeholder="claude"
                                onChange={(e) => update(i, { command: e.target.value })}
                            />
                            <input
                                value={a.resumeArgs}
                                placeholder="--continue"
                                onChange={(e) => update(i, { resumeArgs: e.target.value })}
                            />
                            <input
                                value={a.badge}
                                onChange={(e) => update(i, { badge: e.target.value.toUpperCase() })}
                            />
                            <input
                                value={a.apiKeyEnv}
                                placeholder="ANTHROPIC_API_KEY"
                                className={overridden ? "warn-field" : ""}
                                onChange={(e) => update(i, { apiKeyEnv: e.target.value.trim() })}
                            />
                            <button className="row-remove" data-tip="Remove" onClick={() => remove(i)}>
                                ×
                            </button>
                        </div>
                        {overridden && (
                            <div className="agent-warn">
                                ⚠ <b>{a.apiKeyEnv}</b> is set - {a.name} will bill pay-as-you-go
                                <b> API usage</b> instead of a subscription login. Unset it (and
                                restart DevDeck) to use your subscription.
                            </div>
                        )}
                    </div>
                )
            })}
            <button onClick={add} style={{ marginTop: 8 }}>
                + Add agent
            </button>
            <div className="setting-row" style={{ marginTop: 18 }}>
                <label>Idle → attention (ms)</label>
                <input
                    type="number"
                    min={300}
                    max={5000}
                    step={100}
                    value={agentIdleMs}
                    onChange={(e) => setAgentIdleMs(Number(e.target.value))}
                />
            </div>
            <p className="settings-hint">
                Each agent is a CLI launched in a terminal. The first is the one-click <b>+</b>{" "}
                button; the rest are in the ▾ menu. "Key env var" is the API key that would
                override that CLI's subscription login - DevDeck warns when it's present in the
                environment.
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
                            placeholder="ANTHROPIC_MODEL"
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

function RemoteSection(): JSX.Element {
    const remote = useSettings((s) => s.remote)
    const setRemote = useSettings((s) => s.setRemote)
    const regenerateToken = useSettings((s) => s.regenerateToken)
    const [status, setStatus] = useState<ServerStatus | null>(null)
    const [qr, setQr] = useState<string>("")

    const host = status?.tailscale[0] ?? status?.lan[0] ?? ""
    const url = host ? `http://${host}:${remote.port}/?token=${remote.token}` : ""

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
            <div className="setting-row">
                <label>Port</label>
                <input
                    type="number"
                    value={remote.port}
                    onChange={(e) => setRemote({ port: Number(e.target.value) })}
                />
            </div>
            <div className="setting-row">
                <label>Access token</label>
                <div className="accent-controls">
                    <code className="token">{remote.token || "(generated when enabled)"}</code>
                    <button onClick={regenerateToken}>Regenerate</button>
                </div>
            </div>

            {remote.enabled && (
                <div className="remote-connect">
                    <div className="remote-status">
                        Server: {status?.running ? "running" : "stopped"}
                        {status?.tailscale.length ? " · Tailscale detected" : ""}
                    </div>
                    {url ? (
                        <div className="remote-url-block">
                            {qr && <img className="qr" src={qr} alt="connect QR" />}
                            <div>
                                <div className="muted small">Open on your phone:</div>
                                <code className="token url">{url}</code>
                                {status && status.tailscale.length === 0 && (
                                    <div className="settings-hint">
                                        No Tailscale address found - this URL is LAN-only (same
                                        Wi-Fi). Install Tailscale on this PC and your phone to
                                        reach it from anywhere.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="muted small">Detecting network address…</div>
                    )}
                </div>
            )}

            <p className="settings-hint">
                ⚠ A remote terminal can run commands on this machine. Keep the token private,
                prefer Tailscale (never expose the port publicly), and turn this off when not
                needed.
            </p>
        </div>
    )
}

const ACCENT_PRESETS = ["#b8895c", "#8c9a68", "#7fa0a0", "#a98ba5", "#c4855d", "#9a8c98"]

const SHELLS: { value: ShellKind; label: string }[] = [
    { value: "powershell", label: "PowerShell" },
    { value: "cmd", label: "Command Prompt" },
    { value: "gitbash", label: "Git Bash" },
    { value: "wsl", label: "WSL" },
    { value: "custom", label: "Custom…" }
]

const SHORTCUTS: [string, string][] = [
    ["Ctrl+Shift+T", "New shell tab"],
    ["Ctrl+Shift+Enter", "New Claude session"],
    ["Ctrl+Shift+W", "Close focused pane"],
    ["Ctrl+Shift+\\", "Split right"],
    ["Ctrl+Shift+-", "Split down"],
    ["Ctrl+Shift+] / [", "Next / previous tab"],
    ["Ctrl+Shift+F", "Find in terminal"],
    ["Ctrl+S", "Save file (editor)"],
    ["Ctrl+Enter", "Run query (database)"]
]

export function SettingsModal(): JSX.Element {
    const s = useSettings()
    const [section, setSection] = useState<Section>("appearance")

    return (
        <div className="modal-backdrop" onMouseDown={s.closeSettings}>
            <div
                className="modal settings-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="settings-nav">
                    <div className="settings-nav-title">Settings</div>
                    {SECTIONS.map((sec) => (
                        <div
                            key={sec.key}
                            className={"settings-nav-item" + (section === sec.key ? " active" : "")}
                            onClick={() => setSection(sec.key)}
                        >
                            {sec.label}
                        </div>
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
                                        <div
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
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="setting-row">
                                <label>Style</label>
                                <div className="style-cards">
                                    {STYLE_LIST.map((st) => (
                                        <div
                                            key={st.id}
                                            className={"style-card" + (s.appearance.style === st.id ? " on" : "")}
                                            onClick={() => s.setAppearance({ style: st.id })}
                                        >
                                            <span className="style-name">{st.label}</span>
                                            <span className="style-desc">{st.description}</span>
                                        </div>
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
                                            <span
                                                key={c}
                                                className="swatch"
                                                style={{ background: c }}
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
                                Three wabi-sabi themes - Sumi &amp; Zen (dark), Washi (light) -
                                applied across the UI, terminal, and editor. Accent tints the one
                                highlight color.
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

                    {section === "agents" && <AgentsSection />}

                    {section === "ai" && <AISection />}

                    {section === "snippets" && <SnippetsSection />}

                    {section === "pipelines" && <PipelinesSection />}

                    {section === "git" && <GitSection />}

                    {section === "ssh" && <SshSection />}

                    {section === "mcp" && <McpSection />}

                    {section === "remote" && <RemoteSection />}

                    {section === "shortcuts" && (
                        <div className="settings-section">
                            <h3>Keyboard shortcuts</h3>
                            <table className="shortcuts-table">
                                <tbody>
                                    {SHORTCUTS.map(([k, v]) => (
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
                    )}

                    {section === "about" && (
                        <div className="settings-section">
                            <h3>DevDeck</h3>
                            <p className="settings-hint">
                                A command deck for terminal-first, Claude-driven development -
                                multiple terminals, fast project switching, editor, API client,
                                and database in one window.
                            </p>
                            <p className="muted small">Version 0.1.0 · Electron + React</p>
                            <p className="muted small">
                                Sections like Git accounts, SSH, MCP and Remote access are on the
                                roadmap.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
