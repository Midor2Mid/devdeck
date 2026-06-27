import { useEffect, useState } from "react"
import { useStore } from "../store"
import type { WorkConfigPublic, WorkItem } from "../../../preload/index"

/**
 * "Work" drawer — lists the developer's assigned Jira / Azure DevOps items and
 * starts a session straight from a ticket (optionally in a fresh worktree),
 * pre-seeding the agent with the ticket brief. First run shows a setup form;
 * tokens are stored encrypted in main and never read back here.
 */
export function WorkPanel(): JSX.Element {
    const close = useStore((s) => s.setWorkOpen)
    const startWork = useStore((s) => s.startWork)
    const project = useStore((s) => s.activeProject())

    const [cfg, setCfg] = useState<WorkConfigPublic | null>(null)
    const [items, setItems] = useState<WorkItem[]>([])
    const [errors, setErrors] = useState<{ provider: string; message: string }[]>([])
    const [loading, setLoading] = useState(false)
    const [setup, setSetup] = useState(false)
    const [useWorktree, setUseWorktree] = useState(false)

    const anyEnabled = !!cfg && (cfg.jira.enabled || cfg.azure.enabled)

    const refresh = async (): Promise<void> => {
        setLoading(true)
        const res = await window.api.work.items()
        setItems(res.items)
        setErrors(res.errors)
        setLoading(false)
    }

    useEffect(() => {
        window.api.work.getConfig().then((c) => {
            setCfg(c)
            const on = c.jira.enabled || c.azure.enabled
            setSetup(!on)
            if (on) refresh()
        })
    }, [])

    const start = (item: WorkItem): void => {
        startWork(item, { worktree: useWorktree })
    }

    return (
        <div className="drawer-backdrop" onMouseDown={() => close(false)}>
            <div className="drawer work-drawer" onMouseDown={(e) => e.stopPropagation()}>
                <div className="drawer-head">
                    <span>Work {project ? `· → ${project.name}` : ""}</span>
                    <div>
                        {!setup && (
                            <button className="btn-min" onClick={refresh} title="Refresh">
                                refresh
                            </button>
                        )}
                        <button className="btn-min" onClick={() => setSetup((v) => !v)} title="Connections">
                            {setup ? "done" : "⚙"}
                        </button>
                        <button className="btn-min" onClick={() => close(false)}>
                            ×
                        </button>
                    </div>
                </div>

                {setup ? (
                    <SetupForm cfg={cfg} onSaved={(c) => { setCfg(c); if (c.jira.enabled || c.azure.enabled) { setSetup(false); refresh() } }} />
                ) : (
                    <div className="drawer-body">
                        {!project && (
                            <div className="work-warn">Pick a project first — "Start work" opens a session in the active project.</div>
                        )}
                        <label className="work-wt-toggle">
                            <input type="checkbox" checked={useWorktree} onChange={(e) => setUseWorktree(e.target.checked)} />
                            Start in a new git worktree
                        </label>

                        {errors.map((e) => (
                            <div key={e.provider} className="work-err">{e.provider}: {e.message}</div>
                        ))}

                        {loading ? (
                            <div className="muted sidebar-empty">Loading your items…</div>
                        ) : !anyEnabled ? (
                            <div className="muted sidebar-empty">
                                No provider connected. Hit ⚙ to connect Jira or Azure DevOps.
                            </div>
                        ) : items.length === 0 && errors.length === 0 ? (
                            <div className="muted sidebar-empty">No assigned items. 🎉</div>
                        ) : (
                            items.map((it) => (
                                <div key={it.provider + it.key} className="work-item">
                                    <div className="work-item-top">
                                        <span className={"work-key p-" + it.provider}>{it.key}</span>
                                        <span className="work-type">{it.type}</span>
                                        {it.status && <span className="work-status">{it.status}</span>}
                                    </div>
                                    <div className="work-title">{it.title}</div>
                                    <div className="work-actions">
                                        <button className="accent" disabled={!project} onClick={() => start(it)}>
                                            ▸ Start work
                                        </button>
                                        <button className="btn-min" onClick={() => window.api.shell.open(it.url)}>
                                            open ↗
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function SetupForm({
    cfg,
    onSaved
}: {
    cfg: WorkConfigPublic | null
    onSaved: (c: WorkConfigPublic) => void
}): JSX.Element {
    const [j, setJ] = useState(() => ({
        enabled: cfg?.jira.enabled ?? false,
        baseUrl: cfg?.jira.baseUrl ?? "",
        email: cfg?.jira.email ?? "",
        jql: cfg?.jira.jql ?? "",
        insecureTLS: cfg?.jira.insecureTLS ?? false,
        token: "",
        hasToken: cfg?.jira.hasToken ?? false
    }))
    const [a, setA] = useState(() => ({
        enabled: cfg?.azure.enabled ?? false,
        orgUrl: cfg?.azure.orgUrl ?? "",
        project: cfg?.azure.project ?? "",
        wiql: cfg?.azure.wiql ?? "",
        insecureTLS: cfg?.azure.insecureTLS ?? false,
        pat: "",
        hasToken: cfg?.azure.hasToken ?? false
    }))
    const [proxy, setProxy] = useState(cfg?.proxy ?? "")
    const [msg, setMsg] = useState("")

    const save = async (): Promise<WorkConfigPublic> => {
        const c = await window.api.work.saveConfig({
            jira: { enabled: j.enabled, baseUrl: j.baseUrl, email: j.email, jql: j.jql, insecureTLS: j.insecureTLS, token: j.token || undefined },
            azure: { enabled: a.enabled, orgUrl: a.orgUrl, project: a.project, wiql: a.wiql, insecureTLS: a.insecureTLS, pat: a.pat || undefined },
            proxy
        })
        return c
    }
    const test = async (provider: "jira" | "azure"): Promise<void> => {
        setMsg("Saving + testing…")
        await save()
        const r = await window.api.work.test(provider)
        setMsg(r.ok ? `✓ ${provider}: ${r.count} item(s) found` : `✗ ${provider}: ${r.error}`)
    }

    return (
        <div className="drawer-body work-setup">
            <h3>Jira</h3>
            <label className="work-en"><input type="checkbox" checked={j.enabled} onChange={(e) => setJ({ ...j, enabled: e.target.checked })} /> Enable Jira</label>
            <input placeholder="https://yourco.atlassian.net" value={j.baseUrl} onChange={(e) => setJ({ ...j, baseUrl: e.target.value })} />
            <input placeholder="you@company.com" value={j.email} onChange={(e) => setJ({ ...j, email: e.target.value })} />
            <input type="password" placeholder={j.hasToken ? "API token saved — leave blank to keep" : "API token"} value={j.token} onChange={(e) => setJ({ ...j, token: e.target.value })} />
            <textarea className="work-jql" placeholder="JQL" value={j.jql} onChange={(e) => setJ({ ...j, jql: e.target.value })} />
            <label className="work-en"><input type="checkbox" checked={j.insecureTLS} onChange={(e) => setJ({ ...j, insecureTLS: e.target.checked })} /> Ignore TLS errors (corporate proxy)</label>
            <button className="btn-min" onClick={() => test("jira")}>Test Jira</button>

            <h3 style={{ marginTop: 20 }}>Azure DevOps</h3>
            <label className="work-en"><input type="checkbox" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} /> Enable Azure DevOps</label>
            <input placeholder="https://dev.azure.com/yourorg" value={a.orgUrl} onChange={(e) => setA({ ...a, orgUrl: e.target.value })} />
            <input placeholder="Project name" value={a.project} onChange={(e) => setA({ ...a, project: e.target.value })} />
            <input type="password" placeholder={a.hasToken ? "PAT saved — leave blank to keep" : "Personal Access Token"} value={a.pat} onChange={(e) => setA({ ...a, pat: e.target.value })} />
            <textarea className="work-jql" placeholder="WIQL" value={a.wiql} onChange={(e) => setA({ ...a, wiql: e.target.value })} />
            <label className="work-en"><input type="checkbox" checked={a.insecureTLS} onChange={(e) => setA({ ...a, insecureTLS: e.target.checked })} /> Ignore TLS errors (corporate proxy)</label>
            <button className="btn-min" onClick={() => test("azure")}>Test Azure</button>

            <h3 style={{ marginTop: 20 }}>Proxy (optional)</h3>
            <input placeholder="http://user:pass@proxy.corp:8080" value={proxy} onChange={(e) => setProxy(e.target.value)} />
            <p className="settings-hint" style={{ marginTop: 0 }}>
                Leave blank to use the system <code>HTTPS_PROXY</code> environment variable.
                {cfg?.effectiveProxy ? ` In effect: ${cfg.effectiveProxy.replace(/\/\/[^@]*@/, "//***@")}` : ""}
            </p>

            {msg && <p className="work-msg">{msg}</p>}
            <button className="accent work-save" onClick={async () => { const c = await save(); setMsg("Saved."); onSaved(c) }}>
                Save connections
            </button>
            <p className="settings-hint">
                Tokens are encrypted on this machine and never leave it except to call your
                Jira / Azure host directly. Jira: create an API token at id.atlassian.com.
                Azure: a PAT with <code>Work Items (read)</code> scope.
            </p>
        </div>
    )
}
