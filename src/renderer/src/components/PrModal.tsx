import { useEffect, useState } from "react"
import { useStore } from "../store"
import type { RemoteInfo } from "../../../preload/index"

/**
 * Pull-request composer — pushes the current branch and opens a PR. On Azure
 * DevOps it creates the PR via the API (using the stored Work PAT) and opens it;
 * on GitHub/other it pushes, then opens the host's "create PR" page. Completes
 * the ticket → branch → review → PR loop.
 */
export function PrModal(): JSX.Element | null {
    const target = useStore((s) => s.prTarget)
    const close = useStore((s) => s.closePr)
    const aiOnDiff = useStore((s) => s.aiOnDiff)

    const [info, setInfo] = useState<RemoteInfo | null>(null)
    const [targetBranch, setTargetBranch] = useState("main")
    const [title, setTitle] = useState("")
    const [desc, setDesc] = useState("")
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState("")

    const cwd = target?.cwd

    useEffect(() => {
        if (!cwd) return
        window.api.pr.remoteInfo(cwd, targetBranch).then((r) => {
            setInfo(r)
            // Prettify the branch into a default title.
            const t = r.branch.replace(/^(feature|fix|bugfix|chore)\//i, "").replace(/[-_]/g, " ").trim()
            setTitle(t.charAt(0).toUpperCase() + t.slice(1))
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cwd])

    if (!target || !cwd) return null

    const go = async (): Promise<void> => {
        if (!info || busy) return
        setBusy(true)
        setMsg("Pushing branch…")
        const pushed = await window.api.pr.push(cwd, info.branch)
        if (!pushed.ok) {
            setMsg("✗ push failed: " + pushed.error)
            setBusy(false)
            return
        }
        if (info.host === "azure" && info.orgUrl && info.project && info.repo) {
            setMsg("Creating pull request…")
            const res = await window.api.pr.createAzure({
                orgUrl: info.orgUrl,
                project: info.project,
                repo: info.repo,
                source: info.branch,
                target: targetBranch,
                title: title.trim() || info.branch,
                description: desc
            })
            setBusy(false)
            if (res.ok && res.url) {
                window.api.shell.open(res.url)
                setMsg("✓ PR created — opening in browser")
                setTimeout(close, 1200)
            } else {
                setMsg("✗ " + (res.error ?? "failed"))
            }
        } else if (info.webCreateUrl) {
            // GitHub / other: branch is pushed; open the host's create-PR page.
            window.api.shell.open(info.webCreateUrl)
            setBusy(false)
            setMsg("Branch pushed — opening the create-PR page")
            setTimeout(close, 1200)
        } else {
            setBusy(false)
            setMsg("Branch pushed, but couldn't detect the remote host to open a PR.")
        }
    }

    const hostLabel =
        info?.host === "azure"
            ? `Azure DevOps · ${info.project}/${info.repo}`
            : info?.host === "github"
              ? `GitHub · ${info.owner}/${info.repo}`
              : info
                ? "Unknown remote"
                : "…"

    return (
        <div className="modal-backdrop" onMouseDown={() => close()}>
            <div className="modal pr-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <span>Open pull request</span>
                    <button className="btn-min" onClick={() => close()}>×</button>
                </div>
                <div className="modal-body pr-body">
                    <div className="pr-route">
                        <span className="pr-branch">{info?.branch || "…"}</span>
                        <span className="pr-arrow">→</span>
                        <input
                            className="pr-target"
                            value={targetBranch}
                            onChange={(e) => setTargetBranch(e.target.value)}
                            title="Target branch"
                        />
                        <span className="pr-host">{hostLabel}</span>
                    </div>
                    <input
                        className="pr-title"
                        value={title}
                        placeholder="Pull request title"
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <textarea
                        className="pr-desc"
                        value={desc}
                        placeholder="Description (markdown). Tip: use “PR description” in Review changes to draft this with an agent, then paste."
                        onChange={(e) => setDesc(e.target.value)}
                    />
                    <div className="pr-actions">
                        <button className="btn-min" onClick={() => aiOnDiff(cwd, "pr")} title="Draft a description with an agent (opens a terminal)">
                            ✎ Draft with AI
                        </button>
                        <span style={{ flex: 1 }} />
                        {msg && <span className="pr-msg">{msg}</span>}
                        <button className="accent" disabled={busy || !info} onClick={go}>
                            {info?.host === "azure" ? "Push & create PR" : "Push & open PR page"}
                        </button>
                    </div>
                    <p className="settings-hint">
                        Azure DevOps PRs are created via the API using your Work PAT (needs
                        <code> Code: read &amp; write</code>). Other hosts: DevDeck pushes the branch
                        and opens the create-PR page.
                    </p>
                </div>
            </div>
        </div>
    )
}
