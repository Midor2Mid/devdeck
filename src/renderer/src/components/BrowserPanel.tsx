import { useEffect, useRef, useState } from "react"
import { useStore } from "../store"
import { Modal } from "./Modal"
import { Icon } from "./Icon"

interface PageComment {
    id: string
    selector: string
    tag: string
    text: string
    url: string
    note: string
}

// Injected into every page; gated by window.__ddCommentOn so normal browsing
// works when comment mode is off. Reports clicks via console-message.
const INJECT = `(function(){
  if(window.__ddInit) return; window.__ddInit=true; window.__ddCommentOn=false;
  var hl=document.createElement('div');
  hl.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #b8895c;background:rgba(184,137,92,.12);display:none;border-radius:3px';
  document.documentElement.appendChild(hl);
  function sel(el){ if(el.id) return '#'+el.id; var path=[]; while(el&&el.nodeType===1&&path.length<5){ var n=el.tagName.toLowerCase(); if(typeof el.className==='string'&&el.className.trim()){ var c=el.className.trim().split(/\\s+/)[0]; if(c) n+='.'+c; } var p=el.parentNode; if(p&&p.children){ var sibs=[].filter.call(p.children,function(s){return s.tagName===el.tagName;}); if(sibs.length>1) n+=':nth-of-type('+(sibs.indexOf(el)+1)+')'; } path.unshift(n); el=p; } return path.join(' > '); }
  document.addEventListener('mousemove',function(e){ if(!window.__ddCommentOn){hl.style.display='none';return;} var el=e.target; if(!el||el===hl) return; var r=el.getBoundingClientRect(); hl.style.display='block'; hl.style.left=r.left+'px'; hl.style.top=r.top+'px'; hl.style.width=r.width+'px'; hl.style.height=r.height+'px'; },true);
  document.addEventListener('click',function(e){ if(!window.__ddCommentOn) return; e.preventDefault(); e.stopPropagation(); var el=e.target; var payload={selector:sel(el),tag:el.tagName.toLowerCase(),text:(el.innerText||'').trim().slice(0,120),url:location.href}; console.log('DDCOMMENT:'+JSON.stringify(payload)); },true);
})();`

function normalizeUrl(input: string): string {
    const u = input.trim()
    if (!u) return ""
    if (/^https?:\/\//i.test(u)) return u
    if (/^localhost|^\d+\.\d+\.\d+\.\d+/.test(u)) return "http://" + u
    return "https://" + u
}

export function BrowserPanel(): JSX.Element {
    const sendToAgent = useStore((s) => s.sendToAgent)
    const lastAgent = useStore((s) => s.lastAgentTermId)
    const projectPath = useStore((s) => s.activeProject()?.path ?? "")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wvRef = useRef<any>(null)
    const consoleRef = useRef<{ level: number; message: string }[]>([])
    const [address, setAddress] = useState("https://")
    const [commentMode, setCommentMode] = useState(false)
    const [comments, setComments] = useState<PageComment[]>([])
    const [pending, setPending] = useState<Omit<PageComment, "id" | "note"> | null>(null)
    const [note, setNote] = useState("")
    const [sent, setSent] = useState(false)

    useEffect(() => {
        const wv = wvRef.current
        if (!wv) return
        const onDom = (): void => {
            wv.executeJavaScript(INJECT).catch(() => undefined)
            wv.executeJavaScript(`window.__ddCommentOn=${commentMode}`).catch(() => undefined)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onConsole = (e: any): void => {
            if (typeof e.message === "string" && e.message.startsWith("DDCOMMENT:")) {
                try {
                    setPending(JSON.parse(e.message.slice("DDCOMMENT:".length)))
                    setNote("")
                } catch {
                    /* ignore */
                }
                return
            }
            // Collect page console output (capped) for the AI payload.
            consoleRef.current.push({ level: e.level ?? 0, message: String(e.message ?? "") })
            if (consoleRef.current.length > 80) consoleRef.current.shift()
        }
        let netId = -1
        const onDomOnce = (): void => {
            try {
                netId = wv.getWebContentsId()
                window.api.browser.netAttach(netId)
            } catch {
                /* ignore */
            }
        }
        wv.addEventListener("dom-ready", onDomOnce, { once: true })
        const onNav = (): void => setAddress(wv.getURL())
        wv.addEventListener("dom-ready", onDom)
        wv.addEventListener("console-message", onConsole)
        wv.addEventListener("did-navigate", onNav)
        wv.addEventListener("did-navigate-in-page", onNav)
        return () => {
            wv.removeEventListener("dom-ready", onDom)
            wv.removeEventListener("console-message", onConsole)
            wv.removeEventListener("did-navigate", onNav)
            wv.removeEventListener("did-navigate-in-page", onNav)
            if (netId >= 0) window.api.browser.netDetach(netId)
        }
    }, [commentMode])

    const toggleComment = (): void => {
        const next = !commentMode
        setCommentMode(next)
        wvRef.current?.executeJavaScript(`window.__ddCommentOn=${next}`).catch(() => undefined)
    }

    const go = (target?: string): void => {
        const u = normalizeUrl(target ?? address)
        if (!u) return
        setAddress(u)
        wvRef.current?.loadURL(u)
    }

    const addComment = (): void => {
        if (!pending) return
        setComments((c) => [...c, { ...pending, id: crypto.randomUUID(), note: note.trim() }])
        setPending(null)
        setNote("")
    }

    const sendToAI = async (): Promise<void> => {
        if (!comments.length || !lastAgent) return
        const byUrl: Record<string, PageComment[]> = {}
        for (const c of comments) (byUrl[c.url] = byUrl[c.url] ?? []).push(c)
        let text = "Feedback from the browser:\n"
        for (const [url, list] of Object.entries(byUrl)) {
            text += `\nPage: ${url}\n`
            list.forEach((c, i) => {
                text += `  ${i + 1}. [${c.selector}] "${c.text}"${c.note ? " - " + c.note : ""}\n`
            })
        }

        // Recent console errors/warnings (level >= 2).
        const problems = consoleRef.current.filter((l) => l.level >= 2).slice(-15)
        if (problems.length) {
            text += "\nConsole errors/warnings:\n"
            problems.forEach((l) => (text += `  - ${l.message}\n`))
        }

        // Network: summary + any failed / non-2xx requests.
        try {
            const id = wvRef.current?.getWebContentsId()
            if (id >= 0) {
                const net = await window.api.browser.netGet(id)
                const bad = net.filter((r) => r.failed || r.status >= 400)
                if (net.length) {
                    text += `\nNetwork: ${net.length} requests, ${bad.length} failed/4xx/5xx\n`
                    bad.slice(-15).forEach((r) => {
                        text += `  - ${r.method} ${r.failed ? "FAILED" : r.status} ${r.url}\n`
                    })
                }
            }
        } catch {
            /* network capture is best-effort */
        }

        // Capture a screenshot, save it into the project, reference its path.
        try {
            const img = await wvRef.current?.capturePage()
            if (img) {
                const path = await window.api.browser.saveShot(projectPath, img.toDataURL())
                if (path) text += `\nScreenshot: ${path}\n`
            }
        } catch {
            /* screenshot is best-effort */
        }

        // sendToAgent returns false when there is no agent session to send to.
        // Ignoring it cleared the user's typed comments into the void and showed
        // "sent" — ApiPanel gets this right one file over.
        if (!sendToAgent(text + "\n")) return
        setSent(true)
        setTimeout(() => setSent(false), 1500)
        setComments([])
    }

    return (
        <div className="browser-panel">
            <div className="browser-bar">
                <button className="icon-action" data-tip="Back" onClick={() => wvRef.current?.goBack()}>
                    ‹
                </button>
                <button
                    className="icon-action"
                    data-tip="Forward"
                    onClick={() => wvRef.current?.goForward()}
                >
                    ›
                </button>
                <button
                    className="icon-action"
                    data-tip="Reload"
                    onClick={() => wvRef.current?.reload()}
                >
                    ↻
                </button>
                <input
                    className="browser-url"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") go()
                    }}
                    placeholder="https://…"
                />
                <button onClick={() => go()}>Go</button>
                <button
                    className={"icon-action" + (commentMode ? " on" : "")}
                    onClick={toggleComment}
                    data-tip="Comment mode - click elements to annotate"
                    aria-label="Comment mode"
                >
                    <Icon name="pencil" size={14} />
                </button>
                <button
                    className="accent"
                    onClick={sendToAI}
                    disabled={!comments.length || !lastAgent}
                    data-tip={lastAgent ? "Send comments to the agent" : "No agent session yet"}
                >
                    {sent ? "Sent ✓" : `→ Agent (${comments.length})`}
                </button>
            </div>

            <div className="browser-stage">
                <webview
                    ref={wvRef}
                    src="https://www.google.com"
                    style={{ width: "100%", height: "100%" }}
                />
                {commentMode && (
                    <div className="comment-hint">
                        Comment mode on - click any element on the page to annotate it.
                    </div>
                )}
            </div>

            {comments.length > 0 && (
                <div className="comment-list">
                    {comments.map((c) => (
                        <div key={c.id} className="comment-row">
                            <code className="comment-sel">{c.selector}</code>
                            <span className="comment-note">{c.note || c.text}</span>
                            <span
                                className="tab-close"
                                onClick={() => setComments((cs) => cs.filter((x) => x.id !== c.id))}
                            >
                                ×
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {pending && (
                <Modal onClose={() => setPending(null)} labelledBy="comment-modal-title">
                    <div className="modal-title" id="comment-modal-title">Comment on element</div>
                    <code className="token">{pending.selector}</code>
                    {pending.text && <p className="muted small">"{pending.text}"</p>}
                    <textarea
                        className="code-area"
                        autoFocus
                        placeholder="What should change here?"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addComment()
                        }}
                    />
                    <div className="modal-actions">
                        <span className="spacer" />
                        <button onClick={() => setPending(null)}>Cancel</button>
                        <button className="accent" onClick={addComment}>
                            Add comment
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    )
}
