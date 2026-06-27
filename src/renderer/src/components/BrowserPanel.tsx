import { useEffect, useRef, useState } from "react"
import { useStore } from "../store"

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wvRef = useRef<any>(null)
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
            }
        }
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

    const sendToAI = (): void => {
        if (!comments.length || !lastAgent) return
        const byUrl: Record<string, PageComment[]> = {}
        for (const c of comments) (byUrl[c.url] = byUrl[c.url] ?? []).push(c)
        let text = "Feedback from the browser:\n"
        for (const [url, list] of Object.entries(byUrl)) {
            text += `\nPage: ${url}\n`
            list.forEach((c, i) => {
                text += `  ${i + 1}. [${c.selector}] "${c.text}"${c.note ? " — " + c.note : ""}\n`
            })
        }
        sendToAgent(text + "\n")
        setSent(true)
        setTimeout(() => setSent(false), 1500)
        setComments([])
    }

    return (
        <div className="browser-panel">
            <div className="browser-bar">
                <button className="icon-action" title="Back" onClick={() => wvRef.current?.goBack()}>
                    ‹
                </button>
                <button
                    className="icon-action"
                    title="Forward"
                    onClick={() => wvRef.current?.goForward()}
                >
                    ›
                </button>
                <button
                    className="icon-action"
                    title="Reload"
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
                    title="Comment mode — click elements to annotate"
                >
                    💬
                </button>
                <button
                    className="accent"
                    onClick={sendToAI}
                    disabled={!comments.length || !lastAgent}
                    title={lastAgent ? "Send comments to the agent" : "No agent session yet"}
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
                        Comment mode on — click any element on the page to annotate it.
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
                <div className="modal-backdrop" onMouseDown={() => setPending(null)}>
                    <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="modal-title">Comment on element</div>
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
                    </div>
                </div>
            )}
        </div>
    )
}
