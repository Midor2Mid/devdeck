import { useEffect, useState } from "react"
import { useStore } from "../store"
import type { CatalogEntry, DiscoveredItem, InstalledItem, ItemKind, ExtendScope } from "../../../preload/index"

type Tab = "skill" | "agent"

export function ExtendAgentModal(): JSX.Element {
    const close = useStore((s) => s.setExtendOpen)
    const project = useStore((s) => s.activeProject())
    const projectPath = project?.path ?? ""

    const [tab, setTab] = useState<Tab>("skill")
    const [catalog, setCatalog] = useState<CatalogEntry[]>([])
    const [url, setUrl] = useState("")
    const [items, setItems] = useState<DiscoveredItem[]>([])
    const [sourceRepo, setSourceRepo] = useState("")
    const [vetted, setVetted] = useState(false)
    const [scope, setScope] = useState<ExtendScope>("project")
    const [installed, setInstalled] = useState<{ global: InstalledItem[]; project: InstalledItem[] }>({ global: [], project: [] })
    const [busy, setBusy] = useState<string>("")
    const [error, setError] = useState("")

    const refreshInstalled = (): void => {
        window.api.extend.list(projectPath).then(setInstalled).catch(() => {})
    }
    useEffect(() => {
        window.api.extend.catalog().then(setCatalog).catch(() => {})
        refreshInstalled()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const loadPreview = async (repo: string, ref: string | undefined, isVetted: boolean): Promise<void> => {
        setError("")
        setBusy("preview")
        setSourceRepo(repo)
        setVetted(isVetted)
        try {
            setItems(await window.api.extend.preview(repo, ref))
        } catch (e) {
            setItems([])
            setError((e as Error).message || "Failed to load repository.")
        } finally {
            setBusy("")
        }
    }

    const doInstall = async (item: DiscoveredItem): Promise<void> => {
        setBusy(item.sourcePath)
        setError("")
        try {
            await window.api.extend.install(sourceRepo, undefined, { kind: item.kind, name: item.name, sourcePath: item.sourcePath }, scope, projectPath)
            refreshInstalled()
        } catch (e) {
            setError((e as Error).message || "Install failed.")
        } finally {
            setBusy("")
        }
    }

    const doRemove = async (item: InstalledItem): Promise<void> => {
        setBusy(item.path)
        try {
            await window.api.extend.remove(item)
            refreshInstalled()
        } finally {
            setBusy("")
        }
    }

    const shownItems = items.filter((i) => i.kind === (tab as ItemKind))
    const shownCatalog = catalog.filter((c) => c.kinds.includes(tab as ItemKind))
    const shownInstalled = [...installed.project, ...installed.global].filter((i) => i.kind === (tab as ItemKind))

    return (
        <div className="switcher-backdrop" onMouseDown={() => close(false)}>
            <div className="modal extend-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head extend-head">
                    <h3>Extend agent</h3>
                    <div className="extend-tabs">
                        <button className={"extend-tab" + (tab === "skill" ? " on" : "")} onClick={() => setTab("skill")}>Skills</button>
                        <button className={"extend-tab" + (tab === "agent" ? " on" : "")} onClick={() => setTab("agent")}>Agents</button>
                    </div>
                    <button onClick={() => close(false)}>Close</button>
                </div>

                <div className="extend-body">
                    <div className="extend-browse">
                        <div className="extend-catalog">
                            {shownCatalog.map((c) => (
                                <button key={c.id} className="extend-cat-card" onClick={() => loadPreview(c.repo, c.ref, true)}>
                                    <div className="extend-cat-name">{c.name} <span className="extend-badge vetted">Vetted</span></div>
                                    <div className="muted small">{c.description}</div>
                                    <div className="extend-cat-repo">{c.repo}</div>
                                </button>
                            ))}
                            {shownCatalog.length === 0 && <div className="muted small">No catalog entries for this type.</div>}
                        </div>
                        <div className="extend-url">
                            <input
                                className="switcher-search"
                                placeholder="owner/repo or GitHub URL…"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) loadPreview(url.trim(), undefined, false) }}
                            />
                            <button className="extend-add" disabled={!url.trim()} onClick={() => loadPreview(url.trim(), undefined, false)}>Preview</button>
                        </div>
                    </div>

                    <div className="extend-preview">
                        {busy === "preview" && <div className="muted">Fetching {sourceRepo}…</div>}
                        {error && <div className="extend-error">{error}</div>}
                        {sourceRepo && busy !== "preview" && !error && (
                            <>
                                <div className="extend-preview-head">
                                    <span>{sourceRepo}</span>
                                    <span className={"extend-badge " + (vetted ? "vetted" : "unverified")}>{vetted ? "Vetted" : "Unverified — review before installing"}</span>
                                </div>
                                <div className="extend-scope">
                                    <span className="muted small">Install to</span>
                                    <button className={"extend-scope-btn" + (scope === "project" ? " on" : "")} onClick={() => setScope("project")} disabled={!projectPath}>This project</button>
                                    <button className={"extend-scope-btn" + (scope === "global" ? " on" : "")} onClick={() => setScope("global")}>Global</button>
                                    {scope === "global" && <span className="muted small">affects every project</span>}
                                </div>
                                {shownItems.map((it) => (
                                    <div key={it.sourcePath} className="extend-item">
                                        <div className="extend-item-head">
                                            <b>{it.name}</b>
                                            <button className="extend-install" disabled={busy === it.sourcePath} onClick={() => doInstall(it)}>Install</button>
                                        </div>
                                        <div className="muted small">{it.description}</div>
                                        <details>
                                            <summary className="muted small">{it.files.length} file(s) · read {it.kind === "skill" ? "SKILL.md" : "agent"}</summary>
                                            <pre className="extend-content">{it.content}</pre>
                                        </details>
                                    </div>
                                ))}
                                {shownItems.length === 0 && <div className="muted small">No {tab}s found in this repo.</div>}
                            </>
                        )}
                    </div>

                    <div className="extend-installed">
                        <div className="muted small">Installed</div>
                        {shownInstalled.map((it) => (
                            <div key={it.path} className="extend-installed-row">
                                <span>{it.name}</span>
                                <span className={"extend-badge scope-" + it.scope}>{it.scope}</span>
                                <button className="extend-remove" disabled={busy === it.path} onClick={() => doRemove(it)}>Remove</button>
                            </div>
                        ))}
                        {shownInstalled.length === 0 && <div className="muted small">None installed.</div>}
                    </div>
                </div>
            </div>
        </div>
    )
}
